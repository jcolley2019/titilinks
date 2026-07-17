// FS.SURFACE — Full Screen premium surface system (shared primitives).

import type { CSSProperties } from 'react';
import type { ThemeJson, PageId, PageStyle, PagesConfig } from './theme-defaults';
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
