// FS.SURFACE — Full Screen premium surface system (shared primitives).

import type { CSSProperties } from 'react';
import type { ThemeJson, PageId, PageStyle, PagesConfig, HeroConfig } from './theme-defaults';
import { DEFAULT_BLOCK_STYLE } from './theme-defaults';

/** Button variant union — mirrors ThemeJson buttons.variant. */
export type ButtonVariant = 'filled' | 'outline' | 'glass' | 'minimal' | 'fade';

/**
 * PAGES.STYLE.1 — THE one derivation of a page's effective layout style.
 * Everything downstream (page render, every editor menu's option set, every
 * default) keys off this, so switching the edited page re-derives the whole
 * app in one hop and a menu can never offer a look the active page won't
 * render.
 *
 * Takes the RAW theme_json, not a normalized ThemeJson: getThemeWithDefaults
 * drops the `pages` key by design (the theme editor never writes it), so a
 * normalized theme has no per-page style to find and would silently always
 * resolve to the profile fallback.
 *
 * Resolution order: the page's own `pages.<id>.style` → the profile-level
 * `pageStyle` → hero. A row saved before PAGES.STYLE.1 has no per-page value
 * at all, so it lands on the profile fallback = exactly its old behavior.
 * That's why this ships without a migration.
 */
export function resolveEffectivePageStyle(themeJson: unknown, activePageId: PageId): PageStyle {
  const t = (themeJson && typeof themeJson === 'object' ? themeJson : {}) as {
    pages?: PagesConfig;
    pageStyle?: PageStyle;
  };
  const own = t.pages?.[activePageId]?.style;
  if (own === 'full_bleed' || own === 'hero') return own;
  return t.pageStyle === 'full_bleed' ? 'full_bleed' : 'hero';
}

/**
 * PAGES.STYLE.1 — the swap. Returns a RENDER-ONLY theme whose `pageStyle` is
 * the ACTIVE page's effective style, so every existing `theme.pageStyle`
 * consumer (resolveButtonSurface, the full-bleed predicates, the Buttons-tab
 * option set) follows the edited page with no call-site of its own.
 *
 * NEVER persist the result. `pageStyle` on a stored theme is the profile-level
 * DEFAULT; this overwrites that slot with a resolved value. Writing one back
 * (DesignEditor.saveTheme spreads its theme over the raw json) would burn Page
 * 2's resolved style in as the profile default and flip Page 1. Writers keep
 * using the raw theme_json — see savePageStyle.
 */
export function withEffectivePageStyle<T extends ThemeJson>(
  theme: T,
  themeJson: unknown,
  activePageId: PageId
): T {
  return { ...theme, pageStyle: resolveEffectivePageStyle(themeJson, activePageId) };
}

/**
 * HERO.DEFAULTS.1 — THE one canonical dialed-in hero default set. Derived from
 * what the app's happy path actually produces, not invented: onboarding writes
 * no hero config, and BOTH seed sites (savePageStyle's entering-hero seed and
 * setPageEnabled's born-Page-2 seed) write exactly `{ fit: 'fill', posY: 25 }`.
 * Fill covers the hero window; posY 25 frames the crop to the top third so
 * faces live in the upper half and the standard dark card area + seam fade sit
 * below. Everything else (video/audio/playback/posX) is opt-in and never
 * defaulted here — posX stays center via each reader's own `?? 50`.
 */
export const HERO_DEFAULTS: HeroConfig = { fit: 'fill', posY: 25 };

/**
 * HERO.DEFAULTS.1 — read-time resolution of a page's effective hero config, the
 * exact sibling of resolveEffectivePageStyle: readers resolve, writers persist
 * only explicit choices. Stored fields win one-by-one; every ABSENT field fills
 * from HERO_DEFAULTS. So a page with NO stored hero config renders the full
 * dialed-in treatment with zero user action — this is what heals legacy /
 * pre-seed pages (Joey's Page 2) at read time, no migration — while a page
 * where the user tuned only posY keeps that posY and still inherits Fill.
 *
 * `pageId` selects the slot: page1 → `heroConfig`, page2 → `heroConfig_page2`.
 * An inheriting Page 2 mirrors Page 1's hero, so its call site passes 'page1'
 * (there is no separate inherit branch in here — the caller already owns that).
 *
 * Takes the RAW theme_json, not a normalized ThemeJson — same trap as
 * resolveEffectivePageStyle: getThemeWithDefaults drops these keys, so a
 * normalized theme would carry no stored hero config and silently always
 * resolve to the bare defaults.
 */
export function resolveHeroConfig(themeJson: unknown, pageId: PageId): HeroConfig {
  const t = (themeJson && typeof themeJson === 'object' ? themeJson : {}) as {
    heroConfig?: HeroConfig;
    heroConfig_page2?: HeroConfig;
  };
  const stored = (pageId === 'page2' ? t.heroConfig_page2 : t.heroConfig) || {};
  return { ...HERO_DEFAULTS, ...stored };
}

/**
 * Brand-gold action accent — the one sanctioned solid fill for action
 * buttons (email Subscribe, form submits) on ANY page style. A constant,
 * always-legible pair: ~7.9:1 contrast, no runtime coercion needed.
 */
export const ACTION_ACCENT = '#C9A55C';
export const ACTION_ACCENT_TEXT = '#0e0c09';

/** True when the page renders as a full-bleed photo layout. */
export function isFullBleedTheme(theme: ThemeJson): boolean {
  return theme.pageStyle === 'full_bleed';
}

/**
 * FS.SURFACE spec 3b: full_bleed never renders a solid card surface.
 * Coerces a saved 'filled' variant to 'glass' at render so old data or
 * a hero→full_bleed style switch can never leak a solid. Hero pages
 * pass through untouched.
 */
export function coerceFullBleedVariant(theme: ThemeJson | undefined, variant: ButtonVariant): ButtonVariant {
  return theme?.pageStyle === 'full_bleed' && variant === 'filled' ? 'glass' : variant;
}

/**
 * FS.SURFACE.1d: the shared glass edit-affordance skin (dashed gold on
 * white glass). Call sites prepend their own width/rounding/margins.
 */
export const GLASS_AFFORDANCE =
  'border border-dashed border-[#C9A55C]/40 bg-white/10 backdrop-blur-md py-3 text-xs font-semibold text-[#C9A55C] hover:bg-[#C9A55C]/15 transition-colors';

/** FS.SURFACE.1d: the glass add-tile surface (gallery "+" tile). */
export const GLASS_TILE: CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.08)',
  backdropFilter: 'blur(12px)',
  border: '2px dashed rgba(201,165,92,0.45)',
};

/**
 * FS.SURFACE.1d: full-bleed-safe text style. A full-bleed photo isn't
 * guaranteed dark — the theme's text_color can be anything. Force
 * white + a soft shadow over photos; hero pages keep the fallback.
 */
export function fullBleedText(theme: ThemeJson, fallback: string): CSSProperties {
  return isFullBleedTheme(theme)
    ? { color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }
    : { color: fallback };
}

/**
 * FS.SURFACE.2d — THE one derivation of effective button-surface state.
 * LinkButton renders from it and the Buttons-tab editor reads chip
 * state from it. Anywhere the two would diverge is a chip that lies or
 * a tap that silently mutates the design — deriving both from here
 * makes parity structural instead of hand-maintained.
 */
export interface ButtonSurface {
  /** Effective variant after full-bleed coercion. */
  variant: ButtonVariant;
  /** Outline the unified render pass draws. >0 = an explicit positive
   *  outline_width, or a legacy 'outline' variant's implied border.
   *  0 = the unified pass draws nothing; intrinsic variant skins
   *  (glass hairline, filled decor) still apply — material, not
   *  outline. */
  outlineWidth: number;
  /** Whether the drop shadow renders (theme flag gated by variant). */
  shadow: boolean;
  /** FS.SURFACE.2e: fade anchor. 'bottom' = tint pools at the base and
   *  dissolves upward (default); 'top' = inverted. Only meaningful when
   *  variant === 'fade'. */
  fadeDirection: 'bottom' | 'top';
}

export function resolveButtonSurface(
  theme: ThemeJson | undefined,
  blockStyle?: { variant?: ButtonVariant; border_width?: number }
): ButtonSurface {
  const buttons = theme?.buttons as
    | (ThemeJson['buttons'] & { outline_width?: number })
    | undefined;
  const raw: ButtonVariant =
    (buttons?.variant as ButtonVariant | undefined) ??
    blockStyle?.variant ??
    DEFAULT_BLOCK_STYLE.variant;
  const variant = coerceFullBleedVariant(theme, raw);
  const explicit = buttons?.outline_width;
  const outlineWidth =
    explicit !== undefined && explicit > 0
      ? explicit
      : variant === 'outline'
        ? Math.max(blockStyle?.border_width ?? 1, 1)
        : 0;
  const shadow =
    (buttons?.shadow_enabled ?? false) &&
    variant !== 'minimal' &&
    variant !== 'fade';
  const fadeDirection: 'bottom' | 'top' =
    buttons?.fade_direction === 'top' ? 'top' : 'bottom';
  return { variant, outlineWidth, shadow, fadeDirection };
}

/** Local hex → {r,g,b}. Mirrors contrast.ts's private parseHex (kept local so
 *  surface.ts stays free of a cross-module color dependency); non-hex returns
 *  null so callers fall back to a neutral surface. */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return null;
  const h = hex.slice(1);
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (s.length !== 6) return null;
  const n = parseInt(s, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * TPL.5 — THE one content-card surface derivation. An applied layout owns the
 * look of EVERY content block, not just the button blocks (primary_cta / links,
 * which go through resolveButtonSurface). The card blocks — featured_media,
 * product_cards, video_feed — read their tint + hairline from here, so the
 * layout's brand fill (theme.buttons.fill_color) visibly reaches them from ONE
 * derivation, no per-preset data, matching how resolveButtonSurface centralizes
 * the button look.
 *
 *   hero       → a visible wash of the fill + a stronger same-color hairline;
 *                the layout's signature color reads as the card surface.
 *   full_bleed → a WHITE glass wash (a solid fill would hide the photo — the same
 *                rule coerceFullBleedVariant enforces for buttons) BUT a colored
 *                hairline, so the layout color still reads as a frame over the photo.
 *
 * A non-hex `fill_color` (gradient / keyword) can't be alpha-composited, so it
 * falls back to a neutral white glass — a card never renders opaque or broken.
 */
export interface CardSurface {
  /** Card background: a fill wash on hero, white glass on full_bleed. */
  background: string;
  /** Hairline/border color — always carries the layout fill when it's a hex. */
  borderColor: string;
}

export function cardSurface(theme: ThemeJson | undefined): CardSurface {
  const rgb = hexToRgb(theme?.buttons?.fill_color ?? '');
  const tint = (a: number) => (rgb ? `rgba(${rgb.r},${rgb.g},${rgb.b},${a})` : `rgba(255,255,255,${a})`);
  // full_bleed (or an unparseable fill): white glass body so the photo reads,
  // colored hairline so the layout still frames the card.
  if (theme?.pageStyle === 'full_bleed' || !rgb) {
    return { background: 'rgba(255,255,255,0.10)', borderColor: rgb ? tint(0.55) : 'rgba(255,255,255,0.22)' };
  }
  // hero: a genuine wash of the layout fill + a same-color hairline.
  return { background: tint(0.16), borderColor: tint(0.42) };
}
