// FS.SURFACE — Full Screen premium surface system (shared primitives).

import type { CSSProperties } from 'react';
import type { ThemeJson } from './theme-defaults';

/** Button variant union — mirrors ThemeJson buttons.variant. */
export type ButtonVariant = 'filled' | 'outline' | 'glass' | 'minimal';

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
