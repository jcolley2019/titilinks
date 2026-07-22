// Shared font definitions for per-block typography controls.
// Single source of truth for the font-key -> CSS family mapping and the
// picker option list used by block editors (Text, Bio) AND both page-level
// pickers (Name & Handle hub Font tab, DesignEditor Font tab).
//
// BRAND.1: besides the catalog keys below, a font key may be an uploaded
// user font of the form `custom:<Family Name>` — metadata lives in
// profiles.brand_json.fonts[] and the @font-face registration is handled by
// src/lib/user-fonts.ts. resolveFontFamily resolves both kinds.

export type FontKey =
  | 'inter' | 'system' | 'serif' | 'mono'
  | 'playfair' | 'bebas' | 'abril' | 'pacifico'
  | 'orbitron' | 'caveat' | 'archivo' | 'lora'
  | 'patrick' | 'space';

export interface FontOption {
  // Catalog FontKey, or a `custom:<family>` key for an uploaded font.
  value: FontKey | (string & {});
  label: string;
  fontFamily: string;
}

// ── BRAND.1: uploaded user fonts ────────────────────────────────────────────

/** One uploaded font: display family name + public storage URL. */
export interface UserFont {
  family: string;
  url: string;
}

export const CUSTOM_FONT_PREFIX = 'custom:';

export function isCustomFontKey(key: string | undefined | null): boolean {
  return !!key && key.startsWith(CUSTOM_FONT_PREFIX);
}

/** Font key for an uploaded family (`custom:<family>`). */
export function customFontKey(family: string): string {
  return `${CUSTOM_FONT_PREFIX}${family}`;
}

/** The family name inside a `custom:` key ('' for non-custom keys). */
export function customFontFamily(key: string): string {
  return isCustomFontKey(key) ? key.slice(CUSTOM_FONT_PREFIX.length).trim() : '';
}

/** CSS family for an uploaded family name (quotes stripped — they would
 *  break the quoted CSS string). */
function customCssFamily(family: string): string {
  return `'${family.replace(/['"]/g, '')}', sans-serif`;
}

/** Picker options for uploaded fonts — the "Your fonts" group both page-level
 *  pickers render above the catalog. */
export function userFontOptions(fonts: UserFont[]): FontOption[] {
  return fonts.map((f) => ({
    value: customFontKey(f.family),
    label: f.family,
    fontFamily: customCssFamily(f.family),
  }));
}

export const FONT_OPTIONS: FontOption[] = [
  { value: 'inter', label: 'Inter', fontFamily: "'Inter', sans-serif" },
  { value: 'system', label: 'System Default', fontFamily: 'system-ui, sans-serif' },
  { value: 'playfair', label: 'Playfair Display', fontFamily: "'Playfair Display', serif" },
  { value: 'bebas', label: 'Bebas Neue', fontFamily: "'Bebas Neue', cursive" },
  { value: 'abril', label: 'Abril Fatface', fontFamily: "'Abril Fatface', cursive" },
  { value: 'pacifico', label: 'Pacifico', fontFamily: "'Pacifico', cursive" },
  { value: 'orbitron', label: 'Orbitron', fontFamily: "'Orbitron', sans-serif" },
  { value: 'caveat', label: 'Caveat', fontFamily: "'Caveat', cursive" },
  { value: 'archivo', label: 'Archivo Black', fontFamily: "'Archivo Black', sans-serif" },
  { value: 'lora', label: 'Lora', fontFamily: "'Lora', serif" },
  { value: 'patrick', label: 'Patrick Hand', fontFamily: "'Patrick Hand', cursive" },
  { value: 'space', label: 'Space Grotesk', fontFamily: "'Space Grotesk', sans-serif" },
  { value: 'serif', label: 'Georgia (Serif)', fontFamily: 'Georgia, serif' },
  { value: 'mono', label: 'Monospace', fontFamily: 'monospace' },
];

// Resolve a font key to a CSS font-family.
// Returns undefined for empty/unknown keys, so the block inherits the page's global font.
// BRAND.1: `custom:<family>` keys resolve to the uploaded family (its
// @font-face is registered separately by src/lib/user-fonts.ts).
export function resolveFontFamily(key: string | undefined | null): string | undefined {
  if (!key) return undefined;
  if (isCustomFontKey(key)) {
    const family = customFontFamily(key);
    return family ? customCssFamily(family) : undefined;
  }
  return FONT_OPTIONS.find((o) => o.value === key)?.fontFamily;
}
