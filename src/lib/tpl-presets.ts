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
// Editorial near-black base (serif, pure #0a0a0a) — the strongest elegant/dark
// canvas for an ES-primary, agency-managed creator/actress page whose hero photos
// need high contrast and an editorial voice.
//
// TPL.3c: buttons are gold-FRAMED, not vogue-noir white. The frame is the brand
// gold #C9A55C — sourced from surface.ts ACTION_ACCENT (== midnight-gold /
// DEFAULT_THEME buttons; NOT invented). A SOLID 2px frame comes from
// theme.buttons.outline_width:2, which LinkButton's unified outline pass renders
// as `2px solid border_color` in EVERY variant — a glass hairline (0.12/0.35
// alpha) could not, which is the "not glass-faded" requirement. Hero renders the
// filled rendition (solid-leaning dark fill under the frame); full_bleed
// pre-declares glass (translucent frosted fill under the same frame) because
// coerceFullBleedVariant forbids solids there.
//   Self-flag: hero fill is opaque #141008 (a warm near-black from the gold family
//   — golden-hour's bg — so the button reads as a subtly-raised card, not dead
//   black; "solid-leaning" per the field report); full_bleed fill is translucent
//   (background_opacity 0.65, cooperating with FULLBLEED_BUTTON_OPACITY=0.65).
//   White serif text stays legible on the dark card AND over frosted/scrimmed
//   photos (LinkButton's contrast guard measures white on the near-black page bg).

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
    fill_color: '#141008',      // warm near-black dark fill (gold family — golden-hour's bg)
    text_color: '#ffffff',      // white serif — legible on the dark card AND over hero/full-bleed photos
    border_enabled: true,
    border_color: '#C9A55C',    // BRAND GOLD — surface.ts ACTION_ACCENT / midnight-gold / DEFAULT_THEME
    shadow_enabled: false,      // hero variant turns this on to lift the card
    density: 'roomy',
    outline_width: 2,           // the gold frame: unified outline pass draws a SOLID 2px border in every variant
  },
  typography: {
    font: 'serif',
    text_color: '#ffffff',
  },
  motion: { enabled: true },
};

const ACTRIZ_BLOCK_STYLES: Partial<BlockStyleConfig> = {
  variant: 'filled',            // hero rendition (solid-leaning gold-framed dark button)
  font_style: 'serif',
  letter_spacing: 0.05,
  background_opacity: 1,
  border_width: 2,             // gold frame weight — aligns with the Buttons-tab 0/1/2/3 chips
  border_color: '#C9A55C',     // gold — bs.border_color feeds LinkButton's unified outline pass first
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
      // Hero page: a solid-leaning gold-framed dark button on the dark card below
      // the hero photo — the opaque #141008 fill + the 2px gold frame + a soft
      // shadow that lifts it. filled is NOT full-bleed-coerced here, so the fill
      // stays solid. Complete `buttons` section (spread from base) because
      // Partial<ThemeJson> is one-level.
      hero: {
        theme: { buttons: { ...ACTRIZ_THEME.buttons, shadow_enabled: true } },
      },
      // Full-bleed page: solid card surfaces are forbidden (coerceFullBleedVariant),
      // so the preset pre-declares glass — the applied look matches what full-bleed
      // renders instead of relying on runtime coercion. The gold frame still draws
      // (outline_width:2 → unified pass) over a frosted translucent fill. Opacity
      // 0.65 (cooperating with FULLBLEED_BUTTON_OPACITY) rides blockStyles, not
      // theme.buttons — ThemeButtons has no background_opacity slot, and LinkButton
      // reads bs.background_opacity when the theme has none. blockStyles.variant
      // follows so the Buttons-tab chip can't lie about the surface.
      full_bleed: {
        theme: {
          buttons: { ...ACTRIZ_THEME.buttons, variant: 'glass' },
        },
        blockStyles: { variant: 'glass', background_opacity: 0.65 },
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
