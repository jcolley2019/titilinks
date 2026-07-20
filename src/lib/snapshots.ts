/**
 * SNAP.1 — Profile Snapshots engine.
 *
 * A snapshot is a named restore point capturing a page's THEME + BLOCK
 * LAYOUT/CONTENT. Page identity (display_name, handle, bio, avatar_*, goal_*)
 * is explicitly OUT of scope — snapshots never capture or restore it.
 *
 * Two kinds:
 *  - 'manual' — user-created named restore points, quota-limited per plan
 *               (entitlements.maxSnapshots).
 *  - 'auto'   — the safety net taken automatically before a destructive action
 *               (template apply, Default reset, and restore itself). Exempt
 *               from quota, ring-buffered to the newest `AUTO_KEEP` per page.
 *
 * All DB access is owner-scoped: profile_snapshots is owner-only under RLS, and
 * the pages/modes/blocks/block_items writes ride the caller's own row policies.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import { getEntitlements } from '@/lib/entitlements';
import { getThemeWithDefaults } from '@/lib/theme-defaults';

type ModeType = Database['public']['Enums']['mode_type'];
type BlockType = Database['public']['Enums']['block_type'];
type ThemeJson = Database['public']['Tables']['pages']['Row']['theme_json'];
type StyleJson = Database['public']['Tables']['block_items']['Row']['style_json'];
type BlockItemInsert = Database['public']['Tables']['block_items']['Insert'];
export type SnapshotRow = Database['public']['Tables']['profile_snapshots']['Row'];

export type SnapshotKind = 'manual' | 'auto';

/** The block_item columns a snapshot carries — every column EXCEPT the identity
 *  / FK / audit fields (id, block_id, created_at, updated_at), which are
 *  re-minted on restore. Keep in sync with ITEM_SELECT below. */
export interface SnapshotItem {
  badge: string | null;
  bg_color: string | null;
  compare_at_price: number | null;
  cta_label: string | null;
  currency: string | null;
  image_url: string | null;
  is_adult: boolean | null;
  label: string;
  order_index: number;
  price: number | null;
  size: string | null;
  style_json: StyleJson;
  subtitle: string | null;
  title_color: string | null;
  url: string;
}

export interface SnapshotBlock {
  title: string | null;
  type: BlockType;
  is_enabled: boolean;
  order_index: number;
  items: SnapshotItem[];
}

export interface SnapshotMode {
  type: ModeType;
  sticky_cta_enabled: boolean;
  blocks: SnapshotBlock[];
}

/** Payload format v1. */
export interface SnapshotPayloadV1 {
  v: 1;
  theme_json: ThemeJson;
  modes: SnapshotMode[];
}

/** Literal select for the snapshotted block_item columns (order = SnapshotItem
 *  fields, plus block_id which is stripped when assembling the payload). A
 *  literal string keeps supabase-js type inference exact. */
const ITEM_SELECT =
  'block_id, badge, bg_color, compare_at_price, cta_label, currency, image_url, is_adult, label, order_index, price, size, style_json, subtitle, title_color, url';

/** Ring-buffer depth for kind='auto' per page. */
const AUTO_KEEP = 3;

/** Thrown by captureSnapshot when a MANUAL capture would exceed the plan quota.
 *  The UI turns this into an upsell rather than a generic error. */
export class SnapshotQuotaError extends Error {
  readonly limit: number;
  constructor(limit: number) {
    super(`Snapshot quota reached (${limit}).`);
    this.name = 'SnapshotQuotaError';
    this.limit = limit;
  }
}

/** Read the page theme + full block tree into a v1 payload. */
async function buildPayload(pageId: string, themeJson: ThemeJson): Promise<SnapshotPayloadV1> {
  const { data: modeRows, error: mErr } = await supabase
    .from('modes')
    .select('id, type, sticky_cta_enabled')
    .eq('page_id', pageId);
  if (mErr) throw mErr;
  const modeIds = (modeRows ?? []).map((m) => m.id);

  const { data: blockRows, error: bErr } = await supabase
    .from('blocks')
    .select('id, mode_id, title, type, is_enabled, order_index')
    .in('mode_id', modeIds);
  if (bErr) throw bErr;
  const blockIds = (blockRows ?? []).map((b) => b.id);

  const { data: itemRows, error: iErr } = await supabase
    .from('block_items')
    .select(ITEM_SELECT)
    .in('block_id', blockIds);
  if (iErr) throw iErr;

  const itemsByBlock = new Map<string, SnapshotItem[]>();
  for (const it of itemRows ?? []) {
    const { block_id, ...rest } = it;
    const list = itemsByBlock.get(block_id) ?? [];
    list.push(rest);
    itemsByBlock.set(block_id, list);
  }

  const blocksByMode = new Map<string, SnapshotBlock[]>();
  for (const b of blockRows ?? []) {
    const list = blocksByMode.get(b.mode_id) ?? [];
    list.push({
      title: b.title,
      type: b.type,
      is_enabled: b.is_enabled,
      order_index: b.order_index,
      items: (itemsByBlock.get(b.id) ?? []).sort((x, y) => x.order_index - y.order_index),
    });
    blocksByMode.set(b.mode_id, list);
  }

  const modes: SnapshotMode[] = (modeRows ?? []).map((m) => ({
    type: m.type,
    sticky_cta_enabled: m.sticky_cta_enabled,
    blocks: (blocksByMode.get(m.id) ?? []).sort((x, y) => x.order_index - y.order_index),
  }));

  return { v: 1, theme_json: themeJson, modes };
}

/** Ring-buffer: after an auto capture, keep only the newest AUTO_KEEP per page. */
async function pruneAuto(pageId: string): Promise<void> {
  const { data: autos, error } = await supabase
    .from('profile_snapshots')
    .select('id')
    .eq('page_id', pageId)
    .eq('kind', 'auto')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const stale = (autos ?? []).slice(AUTO_KEEP).map((r) => r.id);
  if (stale.length) {
    const { error: delErr } = await supabase.from('profile_snapshots').delete().in('id', stale);
    if (delErr) throw delErr;
  }
}

/**
 * Capture the current theme + block tree of `pageId` as one snapshot row.
 * Manual captures are quota-enforced (throws SnapshotQuotaError at the cap);
 * auto captures skip the quota and prune the ring buffer afterwards.
 */
export async function captureSnapshot(
  pageId: string,
  name: string,
  kind: SnapshotKind = 'manual',
): Promise<SnapshotRow> {
  // Owner + theme in one read (RLS guarantees the page belongs to the caller).
  const { data: page, error: pageErr } = await supabase
    .from('pages')
    .select('user_id, theme_json')
    .eq('id', pageId)
    .single();
  if (pageErr) throw pageErr;
  const userId = page.user_id;

  // Quota is enforced on MANUAL snapshots only; auto is the exempt safety net.
  if (kind === 'manual') {
    const { data: planRow, error: planErr } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', userId)
      .single();
    if (planErr) throw planErr;
    const limit = getEntitlements(planRow.plan).maxSnapshots;
    const { count, error: countErr } = await supabase
      .from('profile_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('page_id', pageId)
      .eq('kind', 'manual');
    if (countErr) throw countErr;
    if ((count ?? 0) >= limit) throw new SnapshotQuotaError(limit);
  }

  const payload = await buildPayload(pageId, page.theme_json);

  const { data: row, error: insErr } = await supabase
    .from('profile_snapshots')
    .insert({ user_id: userId, page_id: pageId, name, kind, payload: payload as unknown as Json })
    .select()
    .single();
  if (insErr) throw insErr;

  if (kind === 'auto') await pruneAuto(pageId);

  return row;
}

/** All snapshots for a page, newest first. */
export async function listSnapshots(pageId: string): Promise<SnapshotRow[]> {
  const { data, error } = await supabase
    .from('profile_snapshots')
    .select('*')
    .eq('page_id', pageId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Delete one snapshot by id. */
export async function deleteSnapshot(snapshotId: string): Promise<void> {
  const { error } = await supabase.from('profile_snapshots').delete().eq('id', snapshotId);
  if (error) throw error;
}

/**
 * SNAP.2 — rename a MANUAL snapshot. Auto snapshots stay immutable: the
 * `.eq('kind','manual')` guard makes an auto id a no-op even if one reached
 * here, matching the row-level RLS added by the SNAP.2 migration
 * (profile_snapshots shipped immutable in SNAP.1). Only the `name` column is
 * ever written.
 */
export async function renameSnapshot(snapshotId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Snapshot name cannot be empty.');
  const { error } = await supabase
    .from('profile_snapshots')
    .update({ name: trimmed })
    .eq('id', snapshotId)
    .eq('kind', 'manual');
  if (error) throw error;
}

/** A snapshot's 3-chip theme swatch — background, button fill, accent. */
export interface SnapshotSwatch {
  background: string;
  button: string;
  accent: string;
}

/**
 * SNAP.2 — derive a 3-chip swatch straight from a stored payload's theme_json
 * (pure; no schema change, no images). Background reads the effective fill for
 * the background type (solid color / gradient CSS / image overlay), the button
 * chip is the button fill, and the accent chip is the theme's text color — the
 * app has no dedicated "accent" field (its brand gold IS the button fill), so
 * text color is the most informative third cue for "which look was this?".
 * Missing/partial themes normalize through getThemeWithDefaults, so this always
 * returns three valid CSS colors.
 */
export function deriveSnapshotSwatch(themeJson: unknown): SnapshotSwatch {
  const theme = getThemeWithDefaults(themeJson);
  const bg =
    theme.background.type === 'gradient'
      ? theme.background.gradient_css || theme.background.solid_color
      : theme.background.type === 'image'
        ? theme.background.overlay_color || theme.background.solid_color
        : theme.background.solid_color;
  return {
    background: bg,
    button: theme.buttons.fill_color,
    accent: theme.typography.text_color,
  };
}

/**
 * Restore a snapshot onto its page. Takes an auto safety-net FIRST, then
 * replaces the page's blocks/block_items (matched to the existing modes by
 * type) and writes theme_json LAST. On any failure mid-restore the error is
 * surfaced (never swallowed) — the safety-net auto-snapshot guarantees the
 * pre-restore state is recoverable.
 */
export async function restoreSnapshot(snapshotId: string, autoName = 'Before restore'): Promise<void> {
  const { data: snap, error: snapErr } = await supabase
    .from('profile_snapshots')
    .select('page_id, payload')
    .eq('id', snapshotId)
    .single();
  if (snapErr) throw snapErr;

  const pageId = snap.page_id;
  const payload = snap.payload as unknown as SnapshotPayloadV1 | null;
  if (!payload || payload.v !== 1) {
    throw new Error('Unsupported snapshot payload version.');
  }

  // (a) Safety net FIRST — captured before we mutate anything. Auto is exempt
  // from quota and ring-buffered, so this can never itself fail on quota.
  await captureSnapshot(pageId, autoName, 'auto');

  // (b) Replace blocks/items under the page's existing modes, matched by type.
  const { data: modeRows, error: mErr } = await supabase
    .from('modes')
    .select('id, type')
    .eq('page_id', pageId);
  if (mErr) throw mErr;
  const modeByType = new Map<ModeType, string>();
  for (const m of modeRows ?? []) modeByType.set(m.type, m.id);
  const modeIds = (modeRows ?? []).map((m) => m.id);

  const { data: blockRows, error: bErr } = await supabase
    .from('blocks')
    .select('id')
    .in('mode_id', modeIds);
  if (bErr) throw bErr;
  const blockIds = (blockRows ?? []).map((b) => b.id);
  if (blockIds.length) {
    const { error: diErr } = await supabase.from('block_items').delete().in('block_id', blockIds);
    if (diErr) throw diErr;
    const { error: dbErr } = await supabase.from('blocks').delete().in('id', blockIds);
    if (dbErr) throw dbErr;
  }

  // Re-insert blocks + items per payload mode (preserving order_index).
  for (const mode of payload.modes) {
    let modeId = modeByType.get(mode.type);
    if (!modeId) {
      // A payload mode with no surviving mode on the page — recreate it.
      const { data: newMode, error: nmErr } = await supabase
        .from('modes')
        .insert({ page_id: pageId, type: mode.type, sticky_cta_enabled: mode.sticky_cta_enabled })
        .select('id')
        .single();
      if (nmErr) throw nmErr;
      modeId = newMode.id;
      modeByType.set(mode.type, modeId);
    } else {
      const { error: umErr } = await supabase
        .from('modes')
        .update({ sticky_cta_enabled: mode.sticky_cta_enabled })
        .eq('id', modeId);
      if (umErr) throw umErr;
    }

    for (const block of mode.blocks) {
      const { data: newBlock, error: nbErr } = await supabase
        .from('blocks')
        .insert({
          mode_id: modeId,
          title: block.title,
          type: block.type,
          is_enabled: block.is_enabled,
          order_index: block.order_index,
        })
        .select('id')
        .single();
      if (nbErr) throw nbErr;

      if (block.items.length) {
        const rows: BlockItemInsert[] = block.items.map((it) => ({ ...it, block_id: newBlock.id }));
        const { error: iErr } = await supabase.from('block_items').insert(rows);
        if (iErr) throw iErr;
      }
    }
  }

  // (c) Theme LAST — mirrors the capture order and the app's own write order.
  const { error: tErr } = await supabase
    .from('pages')
    .update({ theme_json: payload.theme_json })
    .eq('id', pageId);
  if (tErr) throw tErr;
}
