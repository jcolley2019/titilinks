/**
 * TL.BLOCK.1 — the default-block seeder, made idempotent and race-safe.
 *
 * WHY THIS MODULE EXISTS
 * `ensureDefaultBlocks` used to live inline in Editor.tsx as a read-then-blind-
 * INSERT with no lock, called unconditionally from `fetchBlocks`, whose effect
 * deps change identity on every fetch. Two overlapping fetches for the same mode
 * both observed the same missing defaults and both inserted them — and `blocks`
 * had no unique constraint to catch it. Field result: 32 duplicate empty blocks
 * on one page, in 8 batches of 4 with twin timestamps 5–15ms apart. The
 * duplicates then broke panel opening, because `resolveBlockId`'s `.maybeSingle()`
 * throws PGRST116 the moment a type has two rows.
 *
 * There are two independent triggers, both reachable by a real user:
 *   1. Two concurrent `fetchBlocks` for the same mode (re-render, refresh(),
 *      panel close, mode switch — several fire in quick succession).
 *   2. A fetch that lands INSIDE another writer's delete-then-insert window.
 *      `applyPreset`, `applyTplPreset` and `restoreSnapshot` all delete every
 *      block before re-inserting; a fetch in that gap sees an empty mode and
 *      seeds a full default set on top of the composition about to land.
 *
 * THE FIX IS THREE LAYERS, and this module is the middle one:
 *   • DB floor — a partial unique index on blocks(mode_id, type) excluding
 *     'text' (see supabase/migrations/20260819120000_blocks_singleton_type.sql).
 *   • This module — one seed at a time per mode, an authoritative read inside
 *     the critical section, no insert on an empty/failed read, and a graceful
 *     retry when the index catches a cross-tab race.
 *   • `resolveBlockId` (ProfileDashboard) — picks a winner instead of throwing,
 *     so a duplicate that predates the index can never wedge a panel shut.
 *
 * Testability follows the tpl-apply.ts precedent: the supabase client is an
 * injectable dep whose production default is a LAZY dynamic import, so importing
 * this module under `tsx` never evaluates client.ts (which reads
 * import.meta.env / browser globals at top level).
 */
import type { Database } from '@/integrations/supabase/types';

type BlockType = Database['public']['Enums']['block_type'];
type DbClient = typeof import('@/integrations/supabase/client').supabase;

/** Default blocks every mode should have. Verbatim from the old Editor.tsx
 *  constant — English-canonical titles, translated at render via content-i18n. */
export const DEFAULT_BLOCK_TYPES: ReadonlyArray<{ type: BlockType; title: string }> = [
  { type: 'primary_cta', title: 'Primary CTA' },
  { type: 'product_cards', title: 'Products' },
  { type: 'social_links', title: 'Social Links' },
  { type: 'links', title: 'Links' },
  { type: 'gallery', title: 'Gallery' },
];

/**
 * Block types a mode may legitimately hold MORE THAN ONE of.
 *
 * Audited against every block-creating path (TL.BLOCK.1): onboarding's preset
 * seed, `ensureSecondPage`, `applyPreset`, `applyTplPreset`, `restoreSnapshot`,
 * `SuggestLinksDialog`, and `resolveBlockId` — all of which create at most one
 * block per type per mode. `text` is the sole exception: TextBlocksPanel's "Add"
 * mints an unbounded number of them, each its own text box on the page.
 *
 * THIS SET IS THE MIRROR OF THE DB INDEX PREDICATE. Adding a type here means
 * changing `WHERE type <> 'text'` in the migration to match, or the index will
 * reject the second one at runtime.
 */
export const MANY_PER_MODE_TYPES: ReadonlySet<BlockType> = new Set<BlockType>(['text']);

/** True when a mode may hold at most one block of this type. */
export const isSingletonBlockType = (type: BlockType): boolean => !MANY_PER_MODE_TYPES.has(type);

/** Postgres unique_violation. PostgREST surfaces it verbatim as `error.code`. */
const UNIQUE_VIOLATION = '23505';

const isUniqueViolation = (err: unknown): boolean =>
  !!err && typeof err === 'object' && (err as { code?: string }).code === UNIQUE_VIOLATION;

/**
 * In-flight seeds, keyed by mode — the tpl-apply.ts `inFlightModes` precedent,
 * with one deliberate difference: tpl-apply THROWS at the loser (an apply is a
 * user gesture, and a rejected second tap should surface). Here the loser is a
 * routine re-fetch, so throwing would spam the console on every render race.
 * Instead we hand the loser the WINNER'S promise: both callers await the same
 * seed and both get the same truthful "did anything get created" answer, so the
 * loser's `fetchBlocks` still refreshes if the winner created something.
 */
const inFlightModes = new Map<string, Promise<boolean>>();

export interface EnsureDefaultBlocksDeps {
  client?: DbClient;
}

/**
 * Create any missing default blocks for `modeId`. Returns true when this call
 * (or the concurrent call it joined) created something, i.e. the caller should
 * re-read its block list.
 *
 * Safe to call unconditionally and concurrently: never inserts twice, never
 * inserts on a failed or empty read, and absorbs the unique-index violation
 * raised when another TAB wins the race (the in-flight map is per-document).
 */
export function ensureDefaultBlocks(
  modeId: string,
  deps: EnsureDefaultBlocksDeps = {},
): Promise<boolean> {
  if (!modeId) return Promise.resolve(false);

  // Synchronous check-and-set: it must complete before the first await, or two
  // callers in the same tick both miss the entry and both seed.
  const running = inFlightModes.get(modeId);
  if (running) return running;

  const run = seed(modeId, deps).finally(() => {
    inFlightModes.delete(modeId);
  });
  inFlightModes.set(modeId, run);
  return run;
}

async function seed(modeId: string, deps: EnsureDefaultBlocksDeps): Promise<boolean> {
  const client = deps.client ?? (await import('@/integrations/supabase/client')).supabase;

  // Attempt 1, then ONE retry. The retry exists for the cross-tab race: tab B's
  // insert is rejected wholesale by the unique index (a multi-row INSERT is one
  // statement — one conflicting row rejects all of them), so tab B re-reads and
  // inserts only what tab A left missing. Without it, a partially-overlapping
  // race would leave a legitimately missing default uncreated.
  for (let attempt = 0; attempt < 2; attempt++) {
    // Authoritative read INSIDE the critical section. The caller's block list is
    // already stale by the time it reaches us (it was fetched before the guard),
    // and re-reading here is what closes the delete-then-insert window: a
    // composition replace that has finished by now shows its real block set.
    const { data, error } = await client
      .from('blocks')
      .select('id, type')
      .eq('mode_id', modeId);

    // Never seed off a read we do not trust.
    if (error) {
      console.error('ensureDefaultBlocks: block read failed, not seeding', error);
      return attempt > 0;
    }

    const rows = data ?? [];

    // SANITY CHECK — a zero-row read is never a licence to seed. Every path that
    // creates a mode seeds it in the same breath (onboarding, ensureSecondPage),
    // so a mode with no blocks at all is either mid-replace (applyPreset /
    // applyTplPreset / restoreSnapshot have deleted and not yet re-inserted) or
    // a read that silently returned nothing. Seeding here is precisely how a
    // full default set lands on top of a composition. Bail; the writer's own
    // refresh re-runs this against the settled row set.
    if (rows.length === 0) return attempt > 0;

    const existing = new Set(rows.map((r) => r.type));
    const missing = DEFAULT_BLOCK_TYPES.filter((d) => !existing.has(d.type));
    if (missing.length === 0) return attempt > 0;

    const maxOrder = rows.length;
    const inserts = missing.map((d, i) => ({
      mode_id: modeId,
      type: d.type,
      title: d.title,
      is_enabled: true,
      order_index: maxOrder + i,
    }));

    const { error: insErr } = await client.from('blocks').insert(inserts);
    if (!insErr) return true;

    if (isUniqueViolation(insErr)) {
      // Another tab seeded between our read and our insert. The blocks exist —
      // loop once to fill any gap it did not cover, then report "created" either
      // way so the caller re-reads and sees the winner's rows.
      if (attempt === 0) continue;
      return true;
    }

    console.error('ensureDefaultBlocks: insert failed', insErr);
    return false;
  }

  return true;
}

/**
 * Drop duplicate singleton-type blocks from a block list, keeping ONE of each.
 *
 * Used by `restoreSnapshot`: a restore is delete-every-block-then-re-insert-from-
 * payload, and snapshots captured BEFORE the singleton index existed can carry
 * duplicates. Re-inserting those now raises 23505 AFTER the delete has run,
 * aborting the restore with the page's blocks gone — and the safety-net auto
 * snapshot carries the same duplicates. So the payload is filtered, not trusted.
 *
 * Keeps, per singleton type, the copy with the most items; ties go to the lowest
 * order_index (the one that rendered highest on the page). `text` and anything
 * else in MANY_PER_MODE_TYPES passes through untouched. Output is ordered by
 * order_index, matching the order the page renders in.
 *
 * Structural over its element type (rather than importing SnapshotBlock) so this
 * module stays free of any import that would drag in the supabase client — the
 * lazy-import discipline the tsx unit test depends on.
 */
export function dedupeSingletonBlocks<
  T extends { type: BlockType; order_index: number; items: unknown[] },
>(blocks: T[]): T[] {
  const bestByType = new Map<BlockType, T>();
  const out: T[] = [];

  for (const b of blocks) {
    if (!isSingletonBlockType(b.type)) {
      out.push(b);
      continue;
    }
    const held = bestByType.get(b.type);
    if (!held) {
      bestByType.set(b.type, b);
      continue;
    }
    const better =
      b.items.length > held.items.length ||
      (b.items.length === held.items.length && b.order_index < held.order_index);
    if (better) bestByType.set(b.type, b);
  }

  out.push(...bestByType.values());
  return out.sort((a, b) => a.order_index - b.order_index);
}

/** Test seam — clears the in-flight map between cases. Not used by the app. */
export function __resetInFlightForTests(): void {
  inFlightModes.clear();
}
