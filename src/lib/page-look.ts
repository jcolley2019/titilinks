// TP.F0 (THEME.PREMIUM.3 plan, sections B and I) — the page LOOK: one record,
// one reader, one gate.
//
// A premium theme's choices live in ONE optional key on pages.theme_json:
//
//   theme_json.look = {
//     v: 1,
//     theme:   'hoja' | 'cartel' | 'pase' | 'creditos' | 'vitrina' | 'mostrador',
//     palette: '<the theme's colour pair, where it has several>',
//     options: { ...only the option values that differ from today's... },
//   }
//
// Absent means today. A page with no `look` key — every page that exists now —
// resolves to today's value for every option and renders exactly as it does.
// That is the rule `pages.<id>.style` and `heroConfig` already follow, so no
// migration is needed. A record whose `v` is not 1, an unknown theme, and an
// unknown or wrongly typed option value all resolve as absent.
//
// This module is the ONLY reader of theme_json.look (guard LOOK-ONE-READER),
// and writeLookOptions below is its only writer (TP.F4).
// Render, editor, gate and fallback all go through resolveLook (page-level
// options) or resolveLookOption (an option stored on a block or a link). It
// reads the RAW theme_json: getThemeWithDefaults drops keys it does not know,
// exactly as it does `pages` and `heroConfig`.
//
// Plan rule (ruling 4; every Pro choice hangs on the one `premiumThemes`
// entitlement):
//   • no plan (the owner's edit canvas) → what is saved;
//   • a plan (the public page, the editor's Visitor toggle) → every Pro value
//     the plan lacks resolves to its free value from LOOK_OPTIONS. The saved
//     record is never changed, so re-upgrading restores everything;
//   • a null or unreadable plan is Free — the visitor side refuses, the same
//     as src/lib/plan-gate.ts. The owner-side lock (isLookOptionLocked, bound
//     by src/hooks/usePlanLock.ts) shows nothing while the plan loads and
//     refuses once a read has failed.
//
// No React, no network. Unit-tested by scripts/page-look.test.mjs.

import { can } from '@/lib/entitlements';
import { FONT_OPTIONS } from '@/lib/fonts';
import { resolveEffectivePageStyle } from '@/lib/surface';
import type { PageId, PageStyle, StoredPageStyle } from '@/lib/theme-defaults';

type PlanLike = string | null | undefined;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** The record version this module reads. Any other `v` resolves as absent. */
export const LOOK_VERSION = 1;

/** The six premium themes. */
export const LOOK_THEMES = ['hoja', 'cartel', 'pase', 'creditos', 'vitrina', 'mostrador'] as const;
export type LookThemeId = (typeof LOOK_THEMES)[number];

// ── Choice lists (section I) ────────────────────────────────────────────────

const PAGE_STYLES = ['hero', 'full_bleed', 'sheet', 'band'] as const satisfies readonly StoredPageStyle[];
const PHOTO_TREATMENTS = ['fade', 'clean', 'shade', 'twoTone'] as const;
const NAME_PLACEMENTS = ['page', 'below', 'photo'] as const;
const NAME_ALIGNS = ['left', 'center'] as const;
const NAME_SCALES = ['normal', 'wordmark', 'large', 'poster'] as const;
const LETTERINGS = ['normal', 'caps', 'wide'] as const;
const ROLE_LINES = ['off', 'above', 'beside'] as const;
const ON_OFF = ['on', 'off'] as const;
const HANDLE_POSITIONS = ['under', 'beside'] as const;
const TAGLINE_SIZES = ['small', 'normal', 'large', 'headline'] as const;
const STATUS_PILLS = ['off', 'text', 'openNow'] as const;
const ICON_STYLES = ['plain', 'outlined', 'tiles'] as const;
const ICON_ALIGNS = ['left', 'center', 'right'] as const;
const ICON_PLACEMENTS = ['under', 'beside', 'band'] as const;
const EMAIL_FIELDS = ['boxed', 'underline'] as const;
const MEDIA_FRAMES = ['standard', 'wide'] as const; // standard = 16:9
const LINK_CARDS = ['buttons', 'grouped', 'index', 'wallet', 'credits', 'menu'] as const;
const ITEM_CARDS = ['same', 'featured', ...LINK_CARDS] as const;
const EVENTS_DISPLAYS = ['cards', 'ledger', 'stub'] as const;
const TEXT_DISPLAYS = ['text', 'ticker', 'billing', 'hours'] as const;
const PRODUCT_LAYOUTS = ['full', 'filmstrip', 'grid', 'mosaic'] as const;

/** Every option's value type, by option key. */
export interface LookValues {
  pageStyle: StoredPageStyle;
  photoTreatment: (typeof PHOTO_TREATMENTS)[number];
  namePlacement: (typeof NAME_PLACEMENTS)[number];
  nameAlign: (typeof NAME_ALIGNS)[number];
  nameScale: (typeof NAME_SCALES)[number];
  lettering: (typeof LETTERINGS)[number];
  roleLine: (typeof ROLE_LINES)[number];
  showHandle: (typeof ON_OFF)[number];
  handlePosition: (typeof HANDLE_POSITIONS)[number];
  taglineSize: (typeof TAGLINE_SIZES)[number];
  followButton: (typeof ON_OFF)[number];
  statusPill: (typeof STATUS_PILLS)[number];
  /** 'same' = the page's font; otherwise a catalog FontKey. */
  nameFont: string;
  iconsStyle: (typeof ICON_STYLES)[number];
  iconsAlign: (typeof ICON_ALIGNS)[number];
  iconsPlacement: (typeof ICON_PLACEMENTS)[number];
  /** 'off', or the id of the links item the docked bar carries. */
  dockedLink: string;
  emailField: (typeof EMAIL_FIELDS)[number];
  mediaFrame: (typeof MEDIA_FRAMES)[number];
  linkCard: (typeof LINK_CARDS)[number];
  itemCard: (typeof ITEM_CARDS)[number];
  eventsDisplay: (typeof EVENTS_DISPLAYS)[number];
  textDisplay: (typeof TEXT_DISPLAYS)[number];
  productLayout: (typeof PRODUCT_LAYOUTS)[number];
}
export type LookOptionKey = keyof LookValues;

/** Where an option's saved value lives. */
export type LookHome =
  /** theme_json.pages.<id>.style → profile `pageStyle` (PAGES.STYLE.1). */
  | { at: 'pageStyle' }
  /** theme_json.look.options.<key>. */
  | { at: 'look' }
  /** theme_json.typography.<field>. */
  | { at: 'typography'; field: 'display_font' }
  /** The `<field>` of a block's JSON-in-title config. */
  | { at: 'block'; blockType: 'links' | 'events' | 'text' | 'product_cards'; field: 'display' | 'layout' }
  /** block_items.style_json.<field>. */
  | { at: 'item'; field: 'card' };

export interface LookOptionDef {
  home: LookHome;
  /** Every listed choice. */
  choices: readonly string[];
  /** A value outside `choices` that is still valid (a catalog font key, a
   *  link id). Every such value is Pro. */
  accepts?: (value: string) => boolean;
  /** What every existing page has; an absent or unknown value resolves here. */
  today: string;
  /** The Pro (★) choices. Every other choice is free. */
  pro: readonly string[];
  /** A Pro value's free value, where it is not `today` ("Free fallback for a
   *  downgraded owner", section B). */
  fallback?: Readonly<Record<string, string>>;
  /** Where the creator edits it, and the brick that builds it (section I). */
  panel: string;
  brick: string;
}

const isCatalogFont = (v: string) => FONT_OPTIONS.some((o) => o.value === v);
const isItemId = (v: string) => v.trim().length > 0 && v.length <= 64;

/**
 * THE option table — section I of the plan, row for row (Free/Pro marks as
 * approved). Two catalogue rows are not here because they already have a home
 * and a gate: the page font (typography.font; catalog fonts are free, an
 * uploaded `custom:` font is gated by customFonts in plan-gate.ts) and the
 * colour pair (look.palette below; colours are free).
 */
export const LOOK_OPTIONS: { readonly [K in LookOptionKey]: LookOptionDef } = {
  pageStyle: {
    home: { at: 'pageStyle' }, choices: PAGE_STYLES, today: 'hero', pro: ['sheet', 'band'],
    fallback: { sheet: 'full_bleed', band: 'hero' }, panel: 'Pages', brick: 'F7, M1',
  },
  photoTreatment: {
    home: { at: 'look' }, choices: PHOTO_TREATMENTS, today: 'fade', pro: ['shade', 'twoTone'],
    panel: 'Pages', brick: 'F2, F8',
  },
  namePlacement: {
    home: { at: 'look' }, choices: NAME_PLACEMENTS, today: 'page', pro: ['photo'],
    panel: 'Name & Handle → Layout', brick: 'F4, F8',
  },
  nameAlign: {
    home: { at: 'look' }, choices: NAME_ALIGNS, today: 'center', pro: [],
    panel: 'Layout', brick: 'F4',
  },
  nameScale: {
    home: { at: 'look' }, choices: NAME_SCALES, today: 'normal', pro: ['wordmark', 'large', 'poster'],
    panel: 'Layout', brick: 'F5',
  },
  lettering: {
    home: { at: 'look' }, choices: LETTERINGS, today: 'normal', pro: ['caps', 'wide'],
    panel: 'Layout', brick: 'F5',
  },
  roleLine: {
    home: { at: 'look' }, choices: ROLE_LINES, today: 'off', pro: ['above', 'beside'],
    panel: 'Layout', brick: 'F5',
  },
  showHandle: {
    home: { at: 'look' }, choices: ON_OFF, today: 'on', pro: [],
    panel: 'Layout', brick: 'F4',
  },
  handlePosition: {
    home: { at: 'look' }, choices: HANDLE_POSITIONS, today: 'under', pro: [],
    panel: 'Layout', brick: 'F4',
  },
  taglineSize: {
    home: { at: 'look' }, choices: TAGLINE_SIZES, today: 'normal', pro: [],
    panel: 'Bio editor', brick: 'F5',
  },
  followButton: {
    home: { at: 'look' }, choices: ON_OFF, today: 'off', pro: ['on'],
    panel: 'Layout', brick: 'H1',
  },
  statusPill: {
    home: { at: 'look' }, choices: STATUS_PILLS, today: 'off', pro: ['text', 'openNow'],
    panel: 'Layout', brick: 'F8, M2',
  },
  nameFont: {
    home: { at: 'typography', field: 'display_font' }, choices: ['same'], accepts: isCatalogFont,
    today: 'same', pro: [], panel: 'Font tab', brick: 'F3',
  },
  iconsStyle: {
    home: { at: 'look' }, choices: ICON_STYLES, today: 'plain', pro: ['outlined', 'tiles'],
    panel: 'Social Platforms', brick: 'S1',
  },
  iconsAlign: {
    home: { at: 'look' }, choices: ICON_ALIGNS, today: 'center', pro: [],
    panel: 'Social Platforms', brick: 'F4',
  },
  iconsPlacement: {
    home: { at: 'look' }, choices: ICON_PLACEMENTS, today: 'under', pro: ['beside', 'band'],
    panel: 'Social Platforms', brick: 'S1, M1',
  },
  dockedLink: {
    home: { at: 'look' }, choices: ['off'], accepts: isItemId, today: 'off', pro: [],
    panel: 'Docked button', brick: 'D1',
  },
  emailField: {
    home: { at: 'look' }, choices: EMAIL_FIELDS, today: 'boxed', pro: ['underline'],
    panel: 'Email editor', brick: 'V2',
  },
  mediaFrame: {
    home: { at: 'look' }, choices: MEDIA_FRAMES, today: 'standard', pro: ['wide'],
    panel: 'Media and Gallery editors', brick: 'K1',
  },
  linkCard: {
    home: { at: 'block', blockType: 'links', field: 'display' }, choices: LINK_CARDS, today: 'buttons',
    pro: ['grouped', 'index', 'wallet', 'credits', 'menu'],
    panel: 'Featured Links', brick: 'F6, L3, L4, L5, M3',
  },
  itemCard: {
    home: { at: 'item', field: 'card' }, choices: ITEM_CARDS, today: 'same',
    pro: ['featured', ...LINK_CARDS], panel: 'Link detail', brick: 'F6, L2',
  },
  eventsDisplay: {
    home: { at: 'block', blockType: 'events', field: 'display' }, choices: EVENTS_DISPLAYS, today: 'cards',
    pro: ['ledger', 'stub'], panel: 'Events', brick: 'E1, E2',
  },
  textDisplay: {
    home: { at: 'block', blockType: 'text', field: 'display' }, choices: TEXT_DISPLAYS, today: 'text',
    pro: ['ticker', 'billing'], panel: 'Text box editor', brick: 'C1, K2, M2',
  },
  productLayout: {
    home: { at: 'block', blockType: 'product_cards', field: 'layout' }, choices: PRODUCT_LAYOUTS,
    today: 'grid', pro: ['mosaic'], panel: 'Product editor', brick: 'V1',
  },
};

/** The options resolveLook returns: the ones stored on theme_json (home
 *  pageStyle, look or typography). The rest live on a block or a link and
 *  resolve through resolveLookOption. */
export const PAGE_LOOK_KEYS = [
  'pageStyle', 'photoTreatment', 'namePlacement', 'nameAlign', 'nameScale', 'lettering',
  'roleLine', 'showHandle', 'handlePosition', 'taglineSize', 'followButton', 'statusPill',
  'nameFont', 'iconsStyle', 'iconsAlign', 'iconsPlacement', 'dockedLink', 'emailField',
  'mediaFrame',
] as const satisfies readonly LookOptionKey[];
type PageLookKey = (typeof PAGE_LOOK_KEYS)[number];

/** One flat object with every page-level option filled in. */
export type ResolvedLook = Omit<Pick<LookValues, PageLookKey>, 'pageStyle'> & {
  /** null = no premium theme. */
  theme: LookThemeId | null;
  palette: string | null;
  /** The page style that RENDERS — resolveEffectivePageStyle's answer, gated. */
  pageStyle: PageStyle;
};

// ── Value rules ─────────────────────────────────────────────────────────────

function readValue(def: LookOptionDef, raw: unknown): string {
  if (typeof raw !== 'string') return def.today;
  if (def.choices.includes(raw)) return raw;
  return def.accepts?.(raw) ? raw : def.today;
}

function isProIn(def: LookOptionDef, value: string): boolean {
  if (def.pro.includes(value)) return true;
  return !def.choices.includes(value) && !!def.accepts?.(value);
}

/** True when `value` is one of `key`'s Pro (★) choices. Unknown keys and
 *  values are never Pro (they resolve to today). */
export function isLookProValue(key: LookOptionKey, value: unknown): boolean {
  const def = LOOK_OPTIONS[key];
  return !!def && typeof value === 'string' && isProIn(def, value);
}

/** `value` itself, or — when `gated` (a plan without premiumThemes) and the
 *  value is Pro — its free value. */
function gateValue(def: LookOptionDef, value: string, gated: boolean): string {
  if (!gated || !isProIn(def, value)) return value;
  return def.fallback?.[value] ?? def.today;
}

/**
 * One option's value from what is saved where it lives: absent, unknown or
 * wrongly typed → today; a Pro value under a plan without premiumThemes → its
 * free value. `plan` undefined = the owner's edit canvas (what is saved);
 * null = an unreadable plan = Free.
 *
 * For the page style call resolveLook instead: it also knows which styles are
 * built (resolveEffectivePageStyle), which this table-level rule does not.
 */
export function resolveLookOption<K extends LookOptionKey>(
  key: K,
  saved: unknown,
  plan?: string | null,
): LookValues[K] {
  const def = LOOK_OPTIONS[key];
  const gated = plan !== undefined && !can(plan, 'premiumThemes');
  return gateValue(def, readValue(def, saved), gated) as LookValues[K];
}

/**
 * A page's look, every page-level option filled in. `activePageId` picks the
 * page style (pages.<id>.style → profile pageStyle → hero). Without `plan` it
 * returns what is saved; with a plan (null included) every Pro value the plan
 * lacks is replaced by its free value. Never mutates `themeJson`.
 *
 * The page style is resolveEffectivePageStyle's answer, so a stored style it
 * does not render yet ('sheet', 'band') keeps falling back exactly as it does
 * today, on every plan.
 */
export function resolveLook(themeJson: unknown, activePageId: PageId, plan?: string | null): ResolvedLook {
  const raw = isObj(themeJson) ? themeJson : {};
  const record = isObj(raw.look) && raw.look.v === LOOK_VERSION ? raw.look : null;
  const options = record && isObj(record.options) ? record.options : {};
  const typography = isObj(raw.typography) ? raw.typography : {};
  const gated = plan !== undefined && !can(plan, 'premiumThemes');

  const out: Record<string, unknown> = {
    theme: record && (LOOK_THEMES as readonly unknown[]).includes(record.theme) ? record.theme : null,
    palette: record && typeof record.palette === 'string' && record.palette.trim() ? record.palette : null,
  };
  for (const key of PAGE_LOOK_KEYS) {
    const def = LOOK_OPTIONS[key];
    const home = def.home;
    const saved =
      home.at === 'pageStyle' ? resolveEffectivePageStyle(themeJson, activePageId)
      : home.at === 'typography' ? typography[home.field]
      : options[key];
    out[key] = gateValue(def, readValue(def, saved), gated);
  }
  return out as ResolvedLook;
}

// ── The writer (TP.F4) ──────────────────────────────────────────────────────

/** A set of look option values to store: option key → value. Only keys whose
 *  home is `{ at: 'look' }` and values the table allows are written; anything
 *  else is ignored. */
export type LookOptionsPatch = Readonly<Record<string, unknown>>;

const ownsOption = (key: string): key is LookOptionKey =>
  Object.prototype.hasOwnProperty.call(LOOK_OPTIONS, key);

/**
 * The ONE writer of theme_json.look. Returns a NEW theme_json with `patch`
 * applied to look.options; `themeJson` is never mutated.
 *
 *   • only keys whose home is `{ at: 'look' }`, and only values the table
 *     allows (a listed choice, or one `accepts` takes), are written — the rest
 *     of the patch is ignored;
 *   • a value equal to the option's `today` deletes the key (today is never
 *     stored);
 *   • the record is written as `{ v: 1, theme?, palette?, options }`, keeping
 *     an existing theme and palette; a record with another `v` is replaced;
 *   • when options ends empty and there is no theme and no palette, the `look`
 *     key is removed;
 *   • every other theme_json key is carried over untouched.
 */
export function writeLookOptions(themeJson: unknown, patch: LookOptionsPatch | null | undefined): Obj {
  const { look: prior, ...rest } = isObj(themeJson) ? themeJson : {};
  const record = isObj(prior) && prior.v === LOOK_VERSION ? prior : null;
  const options: Obj = record && isObj(record.options) ? { ...record.options } : {};

  for (const [key, value] of Object.entries(patch ?? {})) {
    if (!ownsOption(key)) continue;
    const def = LOOK_OPTIONS[key];
    if (def.home.at !== 'look' || typeof value !== 'string') continue;
    if (!def.choices.includes(value) && !def.accepts?.(value)) continue;
    if (value === def.today) delete options[key];
    else options[key] = value;
  }

  const keep = (field: 'theme' | 'palette') =>
    record && record[field] !== undefined ? { [field]: record[field] } : {};
  const next: Obj = { ...rest };
  const kept = { ...keep('theme'), ...keep('palette') };
  if (Object.keys(options).length > 0 || Object.keys(kept).length > 0) {
    next.look = { v: LOOK_VERSION, ...kept, options };
  }
  return next;
}

/**
 * resolveLook with an unsaved editor draft over what is saved: the draft's
 * look options (a HeaderDraft carries them as `look`) are written over
 * `themeJson` with writeLookOptions first, so a draft and a saved value take
 * one path. No draft = resolveLook(themeJson, …).
 */
export function resolveLookWithDraft(
  themeJson: unknown,
  draft: { look?: LookOptionsPatch | null } | null | undefined,
  activePageId: PageId,
  plan?: string | null,
): ResolvedLook {
  const pending = draft?.look;
  return resolveLook(pending ? writeLookOptions(themeJson, pending) : themeJson, activePageId, plan);
}

// ── Owner side ──────────────────────────────────────────────────────────────

/**
 * A saved look value visitors don't get: a Pro choice on a plan without
 * premiumThemes (null / unreadable = Free = locked). The same rule as the
 * visitor gate above, so a value is locked for the owner exactly when a
 * visitor is served its free value. usePlanLock adds the "not while the plan
 * is loading" half.
 */
export function isLookOptionLocked(plan: PlanLike, key: LookOptionKey, value: unknown): boolean {
  return isLookProValue(key, value) && !can(plan, 'premiumThemes');
}
