// BRAND.2 — the Brand Kit: brand colors + font choices on profiles.brand_json,
// and the one-tap apply that maps them onto the CURRENT page's theme.
//
// brandToThemePatch is a PURE mapping (unit-tested in scripts/brand.test.mjs):
// only the fields present in the kit produce patch keys, so a partial kit
// leaves every unmapped theme field untouched. applyBrandToPage runs the
// existing snapshot-guarded apply convention (SNAP.1c): auto safety-net
// capture FIRST, a capture failure aborts before any mutation — reusing
// captureSnapshot and the tpl-apply injectable-deps shape, not forking them.

import { contrastTextFor } from '@/lib/contrast';
import type { UserFont } from '@/lib/fonts';
import { fontsFromBrandJson } from '@/lib/user-fonts';
import type { ThemeBackground, ThemeButtons, ThemeTypography } from '@/lib/theme-defaults';

export interface BrandColors {
  primary?: string;
  accent?: string;
  background?: string;
}

export interface BrandKit {
  colors?: BrandColors;
  heading_font?: string;
  body_font?: string;
  /** BRAND.1 uploaded fonts — owned by useUserFonts, carried here so brand
   *  writes can preserve it (read-modify-write over the fresh row). */
  fonts?: UserFont[];
}

const isNonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/** Tolerant parse of profiles.brand_json — malformed values are dropped. */
export function parseBrandJson(raw: unknown): BrandKit {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const colorsRaw = (obj.colors && typeof obj.colors === 'object' && !Array.isArray(obj.colors))
    ? obj.colors as Record<string, unknown>
    : {};
  const colors: BrandColors = {};
  if (isNonEmpty(colorsRaw.primary)) colors.primary = colorsRaw.primary;
  if (isNonEmpty(colorsRaw.accent)) colors.accent = colorsRaw.accent;
  if (isNonEmpty(colorsRaw.background)) colors.background = colorsRaw.background;
  const kit: BrandKit = {};
  if (Object.keys(colors).length) kit.colors = colors;
  if (isNonEmpty(obj.heading_font)) kit.heading_font = obj.heading_font;
  if (isNonEmpty(obj.body_font)) kit.body_font = obj.body_font;
  const fonts = fontsFromBrandJson(obj.fonts);
  if (fonts.length) kit.fonts = fonts;
  return kit;
}

export interface BrandThemePatch {
  background?: Partial<ThemeBackground>;
  buttons?: Partial<ThemeButtons>;
  typography?: Partial<ThemeTypography>;
}

/**
 * Map a brand kit to a theme patch — only present fields map:
 * - primary   → buttons.fill_color, with the designed-pair legible text color
 *               (contrastTextFor — same convention the render layer coerces by)
 * - accent    → buttons.border_color (+ border_enabled), the only accent
 *               surface the theme models
 * - background→ background solid color
 * - fonts     → typography.font. The theme models ONE page font, so the
 *               heading font wins when both are set (it carries the name/
 *               heading identity); body_font maps when it's the only one.
 */
export function brandToThemePatch(brand: BrandKit): BrandThemePatch {
  const patch: BrandThemePatch = {};
  const { primary, accent, background } = brand.colors ?? {};
  if (isNonEmpty(primary)) {
    patch.buttons = { ...patch.buttons, fill_color: primary, text_color: contrastTextFor(primary) };
  }
  if (isNonEmpty(accent)) {
    patch.buttons = { ...patch.buttons, border_color: accent, border_enabled: true };
  }
  if (isNonEmpty(background)) {
    patch.background = { type: 'solid', solid_color: background };
  }
  const font = isNonEmpty(brand.heading_font) ? brand.heading_font
    : isNonEmpty(brand.body_font) ? brand.body_font
    : undefined;
  if (font) patch.typography = { font };
  return patch;
}

/** Spread-merge the patch over the RAW existing theme_json, section by
 *  section — the repo-wide theme-write rule: keys the patch doesn't carry
 *  (headerConfig, avatar_url_page2, pages, per-section leftovers) survive. */
export function mergeBrandPatch(existingThemeJson: unknown, patch: BrandThemePatch): Record<string, unknown> {
  const existing = (existingThemeJson && typeof existingThemeJson === 'object' && !Array.isArray(existingThemeJson))
    ? existingThemeJson as Record<string, unknown>
    : {};
  const merged: Record<string, unknown> = { ...existing };
  for (const section of ['background', 'buttons', 'typography'] as const) {
    const sectionPatch = patch[section];
    if (!sectionPatch) continue;
    const current = (existing[section] && typeof existing[section] === 'object')
      ? existing[section] as Record<string, unknown>
      : {};
    merged[section] = { ...current, ...sectionPatch };
  }
  return merged;
}

export interface BrandApplyOptions {
  pageId: string;
  brand: BrandKit;
  /** Localized auto-snapshot name; falls back to an English default. */
  autoSnapshotName?: string;
}

/** Injectable for unit tests — mirrors TplApplyDeps. */
export interface BrandApplyDeps {
  client?: unknown;
  capture?: (pageId: string, name: string, kind: 'auto') => Promise<unknown>;
}

/**
 * Apply the brand to the page. Returns false (a no-op, nothing captured or
 * written) for an empty kit; true after a successful write. Steps run in this
 * exact order; each throws on failure, and the capture failing ABORTS the
 * apply — we never mutate without the safety net first (SNAP.1c ruling).
 */
export async function applyBrandToPage(opts: BrandApplyOptions, deps: BrandApplyDeps = {}): Promise<boolean> {
  const patch = brandToThemePatch(opts.brand);
  if (!patch.background && !patch.buttons && !patch.typography) return false;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const client: any = deps.client ?? (await import('@/integrations/supabase/client')).supabase;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const capture = deps.capture ?? (await import('@/lib/snapshots')).captureSnapshot;

  // 1) Auto safety-net FIRST — a capture failure aborts everything below.
  await capture(opts.pageId, opts.autoSnapshotName ?? 'Before brand apply', 'auto');

  // 2) Read the raw theme, merge the patch over it, write it back whole.
  const { data, error } = await client
    .from('pages')
    .select('theme_json')
    .eq('id', opts.pageId)
    .single();
  if (error) throw error;

  const merged = mergeBrandPatch(data?.theme_json, patch);
  const { error: writeError } = await client
    .from('pages')
    .update({ theme_json: merged })
    .eq('id', opts.pageId);
  if (writeError) throw writeError;
  return true;
}
