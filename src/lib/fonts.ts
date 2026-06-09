// Shared font definitions for per-block typography controls.
// Single source of truth for the font-key -> CSS family mapping and the
// picker option list used by block editors (Text, Bio).

export type FontKey =
  | 'inter' | 'system' | 'serif' | 'mono'
  | 'playfair' | 'bebas' | 'abril' | 'pacifico'
  | 'orbitron' | 'caveat' | 'archivo' | 'lora'
  | 'patrick' | 'space';

export interface FontOption {
  value: FontKey;
  label: string;
  fontFamily: string;
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
export function resolveFontFamily(key: string | undefined | null): string | undefined {
  if (!key) return undefined;
  return FONT_OPTIONS.find((o) => o.value === key)?.fontFamily;
}
