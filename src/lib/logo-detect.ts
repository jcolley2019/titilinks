// TL.POLISH.1b — logo-like hero detection.
//
// A page whose hero is a LOGO (the /mecivietnam specimen: a 140 px square
// wordmark on a white field) looks wrong in the Fill default — the circle is
// cropped top and bottom and the name sits over raw white. Joey's ruling:
// logo-like hero + the user NEVER chose a display mode → render Fit. Explicit
// choices (fit: 'fill' included) are never overridden, and nothing is written;
// this is render-time only. The never-chose test lives at the call site
// (EditableProfileView reads the RAW theme_json slot — resolveHeroConfig merges
// HERO_DEFAULTS in and loses the distinction).
//
// Signals, all from one 32×32 downsample (recon 1b.0, 2026-09-02):
//   distinct colours (4 bits/channel)   logo 64    photos 197 / 199
//   border pixels in ONE flat colour     logo 0.645 photos 0.21 / 0.105
//   aspect near square (0.8..1.25)       logo yes   photos no / yes
// Rule: 2 of 3. Aspect alone is weak (square avatars are common), which is why
// it can never carry a verdict by itself.
//
// Pure maths lives here so it can be unit-tested without a browser
// (scripts/logo-detect.test.mjs); analyzeImageForLogo is the one DOM-touching
// entry point and never throws — any failure (CORS taint, decode error, no
// document) resolves to null and the caller keeps the default (Fill).
//
// NO face-api on this path: it runs on every public page load and the model is
// a 190 KB download plus a CPU/WebGL warm-up. A face VETO ("a face means a
// photo, whatever the colours say") is a future EDITOR-side add, where the
// crop path already has TinyFaceDetector loaded. Recon note: the crop path's
// settings (416 px / 0.4) MISSED a real face on the battery avatar; a veto
// would need the looser 512 px / 0.2 pass.

import { loadCorsImage } from './hero-luminance';

export interface LogoSignals {
  /** Distinct colours on the 32 px downsample, quantised to 4 bits/channel. */
  colors: number;
  /** Share (0..1) of border pixels equal to the most common border colour. */
  borderFlat: number;
  /** Natural aspect within 0.8..1.25. */
  nearSquare: boolean;
}

export const LOGO_MAX_COLORS = 96;
export const LOGO_MIN_BORDER_FLAT = 0.5;
export const LOGO_ASPECT_MIN = 0.8;
export const LOGO_ASPECT_MAX = 1.25;
/** Edge length of the analysis downsample. Square, whatever the source aspect. */
export const LOGO_SAMPLE_SIZE = 32;

/** One integer key per pixel after dropping the low bits of each channel. */
function quantKey(rgba: Uint8ClampedArray, i: number, bitsPerChannel: number): number {
  const shift = 8 - bitsPerChannel;
  return (
    ((rgba[i] >> shift) << (2 * bitsPerChannel)) |
    ((rgba[i + 1] >> shift) << bitsPerChannel) |
    (rgba[i + 2] >> shift)
  );
}

/** Number of distinct colours in RGBA pixel data after quantisation. Alpha ignored. */
export function distinctColorCount(rgba: Uint8ClampedArray, bitsPerChannel = 4): number {
  const n = Math.floor(rgba.length / 4);
  const seen = new Set<number>();
  for (let i = 0; i < n * 4; i += 4) seen.add(quantKey(rgba, i, bitsPerChannel));
  return seen.size;
}

/**
 * Share of the border pixels (outermost ring of a w×h RGBA image) that are the
 * most common border colour, after the same quantisation. 1 = perfectly flat
 * field, ~1/k = k unrelated colours. 0 for an empty image.
 */
export function borderFlatShare(rgba: Uint8ClampedArray, w: number, h: number, bitsPerChannel = 4): number {
  if (w <= 0 || h <= 0 || rgba.length < w * h * 4) return 0;
  const counts = new Map<number, number>();
  let total = 0;
  let top = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x !== 0 && y !== 0 && x !== w - 1 && y !== h - 1) continue;
      const key = quantKey(rgba, (y * w + x) * 4, bitsPerChannel);
      const c = (counts.get(key) || 0) + 1;
      counts.set(key, c);
      if (c > top) top = c;
      total++;
    }
  }
  return total === 0 ? 0 : top / total;
}

/** True when w/h is within LOGO_ASPECT_MIN..LOGO_ASPECT_MAX (inclusive). */
export function aspectNearSquare(w: number, h: number): boolean {
  if (!(w > 0) || !(h > 0)) return false;
  const a = w / h;
  return a >= LOGO_ASPECT_MIN && a <= LOGO_ASPECT_MAX;
}

/** 2 of 3: colours <= 96, border flat >= 0.5, near-square. */
export function classifyLogo(sig: LogoSignals): boolean {
  let votes = 0;
  if (sig.colors <= LOGO_MAX_COLORS) votes++;
  if (sig.borderFlat >= LOGO_MIN_BORDER_FLAT) votes++;
  if (sig.nearSquare) votes++;
  return votes >= 2;
}

/**
 * Signals from an RGBA sample of size w×h plus the media's NATURAL dimensions
 * (aspect must come from the source, not the square downsample).
 */
export function logoSignals(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  naturalW: number,
  naturalH: number,
): LogoSignals {
  return {
    colors: distinctColorCount(rgba),
    borderFlat: borderFlatShare(rgba, w, h),
    nearSquare: aspectNearSquare(naturalW, naturalH),
  };
}

/**
 * Loads `src` with CORS, draws it to a 32×32 offscreen canvas and returns the
 * three signals, or null on ANY failure. Never throws.
 */
export async function analyzeLogoSignals(src: string): Promise<LogoSignals | null> {
  try {
    if (!src || typeof document === 'undefined') return null;
    const img = await loadCorsImage(src);
    if (!img || !img.naturalWidth || !img.naturalHeight) return null;
    const s = LOGO_SAMPLE_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = s;
    canvas.height = s;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, s, s);
    // getImageData throws SecurityError on a tainted canvas — caught below.
    const { data } = ctx.getImageData(0, 0, s, s);
    return logoSignals(data, s, s, img.naturalWidth, img.naturalHeight);
  } catch {
    return null;
  }
}

/** True = logo-like, false = photo-like, null = could not analyse (keep default). */
export async function analyzeImageForLogo(src: string): Promise<boolean | null> {
  const sig = await analyzeLogoSignals(src);
  return sig ? classifyLogo(sig) : null;
}
