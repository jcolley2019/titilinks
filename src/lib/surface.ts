// FS.SURFACE — Full Screen premium surface system (shared primitives).

import type { ThemeJson } from './theme-defaults';

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
export function coerceFullBleedVariant(theme: ThemeJson | undefined, variant: string): string {
  return theme?.pageStyle === 'full_bleed' && variant === 'filled' ? 'glass' : variant;
}
