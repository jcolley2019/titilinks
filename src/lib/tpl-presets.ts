// TPL.1 — Preset schema + data module.
//
// Presets here are full PAGE COMPOSITIONS (theme + block arrangement + seeded
// demo content), NOT bare color schemes like template-gallery.ts. An applied
// preset should look ALIVE immediately.
//
// This module is FOUNDATION ONLY (TPL.1): the schema, one reference preset
// ('actriz'), and the pure `resolveTplVariant` resolver. Nothing imports it
// yet — the apply engine + gallery wiring are TPL.2/TPL.3 scope, so the app's
// runtime behavior is byte-identical while this lands.
//
// i18n conventions (mirrors template-gallery.ts + block-presets.ts):
//   • preset `name`  — English product name, by ruling (never a key).
//   • preset `description` — an i18n KEY ('tpl.desc.<id>'), resolved via t()
//     at the render sites TPL.2/3 add.
//   • TPL_CATEGORIES `label` — an i18n KEY ('tpl.category.<id>').
//   • seeded block `title` / item `label` / `subtitle` / `cta_label` — ENGLISH-
//     CANONICAL strings registered in src/lib/content-i18n.ts CONTENT_MAP and
//     translated at render time via translateContent(). Every new one is
//     registered there + in BOTH EN/ES dicts (useLanguage.tsx, guard 9 parity).

import type { ThemeJson, BlockStyleConfig } from './theme-defaults';
import type { PresetBlockType } from './block-presets';

export type TplCategory =
  | 'creator' | 'booking' | 'store' | 'music'
  | 'fitness' | 'local_business' | 'media' | 'minimal';

export interface TplItemSeed {
  label: string;              // English-canonical → CONTENT_MAP
  subtitle?: string;          // English-canonical → CONTENT_MAP
  url?: string;               // real placeholder URL ('' if none)
  badge?: string;
  cta_label?: string;
  image_url?: string;         // '' for now; preview assets are TPL.4 scope
}

export interface TplBlockSeed {
  type: PresetBlockType;
  title: string;              // English-canonical → content-i18n
  items?: TplItemSeed[];
}

export interface TplStyleVariant {
  /** Theme overrides applied on top of the base theme when the target page
   *  is this style. Partial deep-merge semantics, same as template apply.
   *
   *  NOTE (TPL.1 self-flag): `Partial<ThemeJson>` is a ONE-LEVEL partial — its
   *  section values (`buttons`, `typography`, …) are still the FULL section
   *  interfaces. So an override that touches one section supplies that whole
   *  section (spread from the base section). This is exactly how the app's own
   *  `getThemeWithDefaults` layers overrides — whole-section spread merge, not
   *  a per-field DeepPartial — so no new merge semantics are invented here. */
  theme?: Partial<ThemeJson>;
  blockStyles?: Partial<BlockStyleConfig>;
}

export interface TplPreset {
  id: string;
  name: string;               // English product name
  category: TplCategory;
  description: string;        // i18n key: 'tpl.desc.<id>'
  theme: ThemeJson;           // base theme (both variants share it)
  blockStyles: Partial<BlockStyleConfig>;
  variants: { hero: TplStyleVariant; full_bleed: TplStyleVariant };
  composition: TplBlockSeed[];
}

// label = i18n key 'tpl.category.<id>', registered EN+ES in useLanguage.tsx.
export const TPL_CATEGORIES: { id: TplCategory; label: string }[] = [
  { id: 'creator', label: 'tpl.category.creator' },
  { id: 'booking', label: 'tpl.category.booking' },
  { id: 'store', label: 'tpl.category.store' },
  { id: 'music', label: 'tpl.category.music' },
  { id: 'fitness', label: 'tpl.category.fitness' },
  { id: 'local_business', label: 'tpl.category.local_business' },
  { id: 'media', label: 'tpl.category.media' },
  { id: 'minimal', label: 'tpl.category.minimal' },
];

// ── merge primitive ────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Recursive, non-mutating partial deep-merge: for every key in `override`, a
 * nested plain object recurses (cloning as it goes); anything else replaces.
 * Keys absent from `override` are inherited from `base`.
 *
 * ThemeJson is only two levels deep (section → scalars), so this is provably
 * identical to the app's per-section shallow spread (`{...base.buttons,
 * ...override.buttons}` in getThemeWithDefaults) — recursion just makes it
 * robust to shape and keeps inputs frozen-safe (no key of `base` or `override`
 * is ever written).
 */
function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(override)) return base;
  const out: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(override)) {
    out[k] = isPlainObject(v)
      ? deepMerge(isPlainObject(out[k]) ? out[k] : {}, v)
      : v;
  }
  return out as T;
}

/**
 * Resolves a preset to its effective theme + blockStyles for a page style by
 * deep-merging the style variant's overrides on top of the shared base. Pure:
 * never mutates the preset. Mirrors the app's read-time resolvers
 * (resolveHeroConfig / resolveEffectivePageStyle) — readers resolve, the base
 * data stays canonical.
 */
export function resolveTplVariant(
  preset: TplPreset,
  pageStyle: 'hero' | 'full_bleed'
): { theme: ThemeJson; blockStyles: Partial<BlockStyleConfig> } {
  const variant = preset.variants[pageStyle];
  return {
    theme: deepMerge<ThemeJson>(preset.theme, variant.theme ?? {}),
    blockStyles: deepMerge<Partial<BlockStyleConfig>>(
      preset.blockStyles,
      variant.blockStyles ?? {}
    ),
  };
}

// ── reference preset: 'actriz' ──────────────────────────────────────────────
//
// Base theme is copied VERBATIM from template-gallery.ts's `vogue-noir` (the
// fashion/editorial flagship): pure editorial black, serif type, roomy white
// buttons. Chosen as the strongest elegant/dark base for an ES-primary,
// agency-managed creator/actress page whose hero photos need high contrast and
// an editorial voice. (Runner-up: `golden-hour` — warm gold-on-near-black — but
// vogue-noir's neutral black reads more editorial and sits cleaner over varied
// hero photography.) template-gallery.ts is NOT edited; this is an independent copy.

const ACTRIZ_THEME: ThemeJson = {
  background: {
    type: 'solid',
    solid_color: '#0a0a0a',
    gradient_css: '',
    image_url: '',
    overlay_color: '#000000',
    overlay_opacity: 0,
    source: null,
  },
  buttons: {
    shape: 'square',
    fill_color: '#ffffff',
    text_color: '#0a0a0a',
    border_enabled: false,
    border_color: '#ffffff',
    shadow_enabled: false,
    density: 'roomy',
  },
  typography: {
    font: 'serif',
    text_color: '#ffffff',
  },
  motion: { enabled: true },
};

const ACTRIZ_BLOCK_STYLES: Partial<BlockStyleConfig> = {
  variant: 'filled',
  font_style: 'serif',
  letter_spacing: 0.05,
  background_opacity: 1,
};

export const TPL_PRESETS: TplPreset[] = [
  {
    id: 'actriz',
    name: 'Actriz',
    category: 'creator',
    description: 'tpl.desc.actriz',
    theme: ACTRIZ_THEME,
    blockStyles: ACTRIZ_BLOCK_STYLES,
    variants: {
      // Hero page: the filled white CTA sits on the dark card area below the
      // hero photo — a soft shadow lifts it off the imagery. Complete `buttons`
      // section (spread from base) because Partial<ThemeJson> is one-level.
      hero: {
        theme: { buttons: { ...ACTRIZ_THEME.buttons, shadow_enabled: true } },
      },
      // Full-bleed page: solid card surfaces are forbidden (coerceFullBleedVariant),
      // so the preset pre-declares glass — the applied look matches what full-bleed
      // renders instead of relying on runtime coercion. blockStyles.variant follows
      // so the Buttons-tab chip can't lie about the surface.
      full_bleed: {
        theme: {
          buttons: { ...ACTRIZ_THEME.buttons, variant: 'glass', outline_width: 0 },
        },
        blockStyles: { variant: 'glass' },
      },
    },
    composition: [
      {
        type: 'primary_cta',
        title: 'Booking',
        items: [
          {
            label: 'Book Me',
            subtitle: 'Collabs & appearances',
            cta_label: 'Contact',
            url: '',
          },
        ],
      },
      {
        type: 'links',
        title: 'Links',
        items: [
          { label: 'My Website', subtitle: 'Check out my website', url: '' },
          { label: 'Press Kit', subtitle: 'Media resources', url: '' },
          { label: 'WhatsApp', subtitle: 'Message me directly', url: 'https://wa.me/' },
        ],
      },
      { type: 'gallery', title: 'Gallery' },
      { type: 'video_feed', title: 'Videos' },
      { type: 'bio', title: 'About' },
    ],
  },
];
