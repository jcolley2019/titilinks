// Automatic chrome contrast derived from the page background.
// Single source of truth: chrome (name, handle, icons, section labels,
// card surfaces, hairlines) derives from theme.typography.text_color —
// the one color each theme sets to contrast its background — as alpha
// variants. Dark chrome on light backgrounds, light chrome on dark,
// by construction, for presets AND custom themes.

import type { ThemeJson } from './theme-defaults';

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return null;
  const h = hex.slice(1);
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (s.length !== 6) return null;
  const n = parseInt(s, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

export function isLightBackground(theme: ThemeJson): boolean {
  const bg = theme.background;
  if (bg?.type === 'image') return false;
  return relativeLuminance(bg?.solid_color || '#0e0c09') > 0.55;
}

function withAlpha(base: string, alpha: number): string {
  const rgb = parseHex(base);
  if (!rgb) return base;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

export interface ChromeTokens {
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  surface: string;
  surfaceStrong: string;
  iconColor: string;
  iconBg: string;
  isLight: boolean;
}

export function getChromeTokens(theme: ThemeJson): ChromeTokens {
  const base = theme.typography?.text_color || '#ffffff';
  const hasHex = parseHex(base) !== null;
  return {
    text: base,
    textMuted: hasHex ? withAlpha(base, 0.72) : base,
    textFaint: hasHex ? withAlpha(base, 0.45) : base,
    border: hasHex ? withAlpha(base, 0.14) : 'rgba(255,255,255,0.1)',
    surface: hasHex ? withAlpha(base, 0.05) : 'rgba(255,255,255,0.03)',
    surfaceStrong: hasHex ? withAlpha(base, 0.09) : 'rgba(255,255,255,0.06)',
    iconColor: base,
    iconBg: hasHex ? withAlpha(base, 0.12) : 'rgba(255,255,255,0.12)',
    isLight: isLightBackground(theme),
  };
}

export function contrastTextFor(fill: string): '#0e0c09' | '#ffffff' {
  return relativeLuminance(fill) > 0.5 ? '#0e0c09' : '#ffffff';
}
