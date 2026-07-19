// TPL.2 — Preset apply engine.
//
// Writes a TplPreset onto a page as ONE designed unit: theme + block
// composition + seeded demo content + block styles. Snapshot-guarded — an auto
// safety-net is captured FIRST, and a capture failure aborts the whole apply so
// the page is never mutated without an undo point.
//
// This module is the ENGINE ONLY (TPL.2): no UI references it yet. TPL.3 wires
// the gallery and supplies `modeId` via the FIX.P2 race-safe resolution. Until
// then the app's runtime behavior is unchanged.
//
// The step semantics here are REPLICATED (not reinvented) from the app's three
// existing surfaces, so an applied preset behaves exactly like the hand-paths:
//   • theme merge         → TemplateGallery.applyTemplate (BUG.THEME.1 ruling:
//                           visual theme only; merge over existing raw
//                           theme_json; pageStyle stripped from the incoming
//                           payload so a preset can never flip hero<->full_bleed).
//   • composition replace → ProfileDashboard.applyPreset (preserve the header
//                           social blocks; delete removable items then blocks;
//                           insert the new set at order_index i from 0).
//   • item seeding        → OnboardingFlow.prefillBlockContent (batch-insert
//                           block_items linked to the freshly-inserted blocks).
//   • block styles        → TemplateGallery.applyTemplate applyBlockStyles path
//                           (the "JSON-in-title" surface: primary_cta / links
//                           blocks store `{ ...cfg, style }` in their `title`
//                           column; LinksBlock/PrimaryCtaBlock read `.style`
//                           back off it). ALWAYS on for a TPL apply.
//
// Self-flags (see brick notes):
//  • order_index — the inserted composition blocks number from 0, exactly like
//    applyPreset, so they collide numerically with the preserved header blocks
//    (social_links=0, social_icon_row=1). Harmless: header social blocks render
//    in the header region, ordered among themselves; content blocks are ordered
//    among themselves. Matching applyPreset's indexing is the ruling.
//  • block-style surface — the style write targets primary_cta / links ONLY
//    (applyTemplate's `.in('type', ['primary_cta','links'])`). It overwrites
//    those blocks' `title` with the style JSON; for those two types `title` is
//    the JSON-config store, NOT a display heading, so the composition title
//    ('Booking' / 'Links') is intentionally superseded — identical to what
//    applyTemplate does to existing primary_cta/links blocks. We source the
//    block ids from our own insert().select() (race-free) rather than re-fetching.

import type { Database } from '@/integrations/supabase/types';
import { resolveTplVariant, type TplPreset } from '@/lib/tpl-presets';

type BlocksInsert = Database['public']['Tables']['blocks']['Insert'];
type BlockItemsInsert = Database['public']['Tables']['block_items']['Insert'];

/** The block types whose look is driven by the "JSON-in-title" style config, and
 *  the only types applyTemplate's block-style pass touches. Header social blocks
 *  that survive a composition replace. */
const STYLEABLE_TYPES: ReadonlySet<string> = new Set(['primary_cta', 'links']);
const HEADER_TYPES: ReadonlySet<string> = new Set(['social_links', 'social_icon_row']);

/** Type-only module queries — erased at runtime, so importing this engine never
 *  eagerly evaluates the supabase client module (client.ts reads import.meta.env
 *  + browser globals at top level and would crash under a bare node/tsx import).
 *  Production defaults are loaded LAZILY inside the function via dynamic import;
 *  the unit test injects fakes and never reaches that path. ESM module caching
 *  makes the lazily-imported singleton identical to the app-wide one. */
type DbClient = typeof import('@/integrations/supabase/client').supabase;
type CaptureFn = typeof import('@/lib/snapshots').captureSnapshot;

export interface TplApplyOptions {
  pageId: string;
  modeId: string;              // caller resolves (TPL.3 reuses the FIX.P2 race-safe resolution)
  pageStyle: 'hero' | 'full_bleed';
  preset: TplPreset;
  /** Localized auto-snapshot name; defaults English-canonical from preset.name,
   *  same pattern as restoreSnapshot's autoName. */
  autoSnapshotName?: string;
}

/** Injectable dependencies. Defaults preserve production behavior: the app's
 *  singleton supabase client and the real captureSnapshot (which uses its own
 *  singleton by design — the client is NOT threaded into snapshots.ts). */
export interface TplApplyDeps {
  client?: DbClient;
  capture?: CaptureFn;
}

/**
 * Apply `opts.preset` to the page. Steps run in this exact order; each throws on
 * failure. Step 1 failing ABORTS the apply — we never mutate without the safety
 * net first (SNAP.1c ruling).
 */
export async function applyTplPreset(opts: TplApplyOptions, deps: TplApplyDeps = {}): Promise<void> {
  const client = deps.client ?? (await import('@/integrations/supabase/client')).supabase;
  const capture = deps.capture ?? (await import('@/lib/snapshots')).captureSnapshot;
  const { pageId, modeId, pageStyle, preset } = opts;

  // 1) Auto safety-net FIRST — a capture failure aborts everything below.
  //    captureSnapshot rides the app singleton by design; do not thread `client`.
  await capture(pageId, opts.autoSnapshotName ?? `Before template: ${preset.name}`, 'auto');

  // 2) Resolve the effective theme + block styles for this page style (pure).
  const { theme, blockStyles } = resolveTplVariant(preset, pageStyle);

  // 3) Theme write — merge over the page's EXISTING raw theme_json so structural
  //    keys survive; strip pageStyle from the incoming payload defensively
  //    (JSON round-trip drops undefined). Single update. Mirrors applyTemplate.
  const { data: pageRow, error: pageErr } = await client
    .from('pages')
    .select('theme_json')
    .eq('id', pageId)
    .single();
  if (pageErr) throw pageErr;
  const existing = (pageRow?.theme_json && typeof pageRow.theme_json === 'object')
    ? (pageRow.theme_json as Record<string, unknown>)
    : {};
  const { error: themeErr } = await client
    .from('pages')
    .update({ theme_json: { ...existing, ...JSON.parse(JSON.stringify({ ...theme, pageStyle: undefined })) } })
    .eq('id', pageId);
  if (themeErr) throw themeErr;

  // 4) Composition replace — preserve the header social blocks, delete the
  //    removable blocks' items then the blocks, insert the preset set at
  //    order_index i from 0 (matches applyPreset's indexing). Mirrors applyPreset.
  const { data: existingBlocks, error: exErr } = await client
    .from('blocks')
    .select('id, type')
    .eq('mode_id', modeId);
  if (exErr) throw exErr;
  const removableIds = (existingBlocks ?? [])
    .filter((b) => !HEADER_TYPES.has(b.type))
    .map((b) => b.id);
  if (removableIds.length) {
    const { error: delItemsErr } = await client.from('block_items').delete().in('block_id', removableIds);
    if (delItemsErr) throw delItemsErr;
    const { error: delBlocksErr } = await client.from('blocks').delete().in('id', removableIds);
    if (delBlocksErr) throw delBlocksErr;
  }
  const blockInserts: BlocksInsert[] = preset.composition.map((b, i) => ({
    mode_id: modeId,
    type: b.type,
    title: b.title,
    is_enabled: true,
    order_index: i,
  }));
  const { data: inserted, error: insErr } = await client
    .from('blocks')
    .insert(blockInserts)
    .select('id, type, order_index, title');
  if (insErr) throw insErr;

  // 5) Item seeding — link each preset block's items to the block just inserted
  //    at the same order_index, batch-insert every TplItemSeed. Blocks with no
  //    items are skipped. Mirrors OnboardingFlow.prefillBlockContent.
  const idByOrder = new Map<number, string>();
  for (const b of inserted ?? []) idByOrder.set(b.order_index, b.id);
  const itemInserts: BlockItemsInsert[] = [];
  preset.composition.forEach((block, i) => {
    const blockId = idByOrder.get(i);
    if (!blockId || !block.items?.length) return;
    block.items.forEach((it, idx) => {
      itemInserts.push({
        block_id: blockId,
        label: it.label,
        url: it.url ?? '',
        order_index: idx,
        ...(it.subtitle !== undefined ? { subtitle: it.subtitle } : {}),
        ...(it.badge !== undefined ? { badge: it.badge } : {}),
        ...(it.cta_label !== undefined ? { cta_label: it.cta_label } : {}),
        ...(it.image_url ? { image_url: it.image_url } : {}),
      });
    });
  });
  if (itemInserts.length) {
    const { error: itemErr } = await client.from('block_items').insert(itemInserts);
    if (itemErr) throw itemErr;
  }

  // 6) Block styles — ALWAYS on for a TPL apply (composition + style are one
  //    designed unit). Replicates applyTemplate's applyBlockStyles write: merge
  //    `{ ...existingConfig, style }` into the block's `title` (JSON-in-title),
  //    for primary_cta / links only. Sourced from our own inserted rows.
  for (const b of inserted ?? []) {
    if (!STYLEABLE_TYPES.has(b.type)) continue;
    let existingConfig: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(b.title || '{}');
      if (parsed && typeof parsed === 'object') existingConfig = parsed as Record<string, unknown>;
    } catch {
      existingConfig = {};
    }
    const { error: styleErr } = await client
      .from('blocks')
      .update({ title: JSON.stringify({ ...existingConfig, style: blockStyles }) })
      .eq('id', b.id);
    if (styleErr) throw styleErr;
  }
}
