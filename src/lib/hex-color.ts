/**
 * FRAGILE.COLOR.1 (audit S2) — the one place a typed colour becomes a stored
 * colour. The hero fade and the content panel under it are painted with
 * `background.solid_color`; anything that is not an opaque, valid colour there
 * (`FFC0CB`, `#ff`, `#ffffff80`, `rgba(…)`) renders as invalid or see-through
 * CSS — the fade dies and the page shows a stripe or the dark wrapper.
 *
 * normalizeHexColor returns an opaque `#rrggbb`, or null when the input is not
 * a hex colour at all:
 * - `#` + exactly six hex digits → returned UNCHANGED, letter case kept
 *   (presets are matched by string equality, so `#FFC0CB` must stay `#FFC0CB`).
 * - `rgb` / `#rgb` → expanded; `rrggbb` → `#` added; four- and eight-digit
 *   forms (with or without `#`) → alpha dropped. These come back lowercase.
 * - Anything else (`#ff`, `rgba(…)`, names, gradients, empty, non-strings) → null.
 */
const SIX_DIGIT = /^#[0-9a-fA-F]{6}$/;
const BARE_HEX = /^#?([0-9a-fA-F]+)$/;

export function normalizeHexColor(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (SIX_DIGIT.test(s)) return s;
  const m = BARE_HEX.exec(s);
  if (!m) return null;
  const d = m[1].toLowerCase();
  switch (d.length) {
    case 3:
    case 4:
      return `#${d[0]}${d[0]}${d[1]}${d[1]}${d[2]}${d[2]}`;
    case 6:
    case 8:
      return `#${d.slice(0, 6)}`;
    default:
      return null;
  }
}
