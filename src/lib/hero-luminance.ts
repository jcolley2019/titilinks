// TL.POLISH.1a — hero name legibility.
//
// The public page paints the display name and handle in white with NO text
// shadow by design (dark photo heroes read cleanly and a shadow would muddy
// them). A LIGHT hero — a white logo, a pale product shot — makes that same
// white text vanish (the /mecivietnam specimen, AUDIT_rev6 §8.2). The fix is
// conditional: sample the band of the hero the name actually sits over and
// switch a legibility scrim on only when that band is light.
//
// Pure maths lives here so it can be unit-tested without a browser
// (scripts/hero-luminance.test.mjs); sampleHeroBand is the one DOM-touching
// entry point and never throws — any failure (CORS taint, decode error,
// no document) resolves to null and the caller keeps the default (no scrim).

/**
 * Mean relative luminance (0..1) over RGBA pixel data:
 * (0.2126 R + 0.7152 G + 0.0722 B) / 255, averaged per pixel. Alpha is
 * ignored — a transparent hero is composited onto the page background by the
 * browser, not by us, so the opaque assumption is the honest one here.
 */
export function meanLuminance(rgba: Uint8ClampedArray): number {
  const n = Math.floor(rgba.length / 4);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n * 4; i += 4) {
    sum += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
  }
  return sum / 255 / n;
}

/** True when the sampled band is light enough that white text needs a scrim. */
export function needsNameScrim(lum: number, threshold = 0.55): boolean {
  return lum > threshold;
}

// The band the name rides over: bottom 35% of the hero, middle 60% of its
// width (the name is centered and HEADER_OFFSET_Y lifts it into the lower
// part of the image). Sampled at 32 px wide — enough for a mean, cheap enough
// to run on every public page load.
const SAMPLE_WIDTH = 32;
const BAND_TOP_FRACTION = 0.65;
const BAND_LEFT_FRACTION = 0.2;
const BAND_WIDTH_FRACTION = 0.6;

/** A rectangle in whole pixels. */
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The name band of a w × h sample: its bottom 35%, the middle 60% of its
 * width, in whole pixels and never empty. Pure.
 */
export function nameBandRect(w: number, h: number): PixelRect {
  const x = Math.floor(w * BAND_LEFT_FRACTION);
  const width = Math.max(1, Math.round(w * BAND_WIDTH_FRACTION));
  const y = Math.floor(h * BAND_TOP_FRACTION);
  const height = Math.max(1, h - y);
  return { x, y, width, height };
}

/**
 * HERO.FIT.2 — the part of a naturalWidth × naturalHeight picture a window
 * (percent of it) covers, in pixels, clamped inside the picture. Null when the
 * window is unusable — the caller then samples the whole picture, as before.
 */
export function windowSourceRect(
  naturalWidth: number,
  naturalHeight: number,
  win: { x: number; y: number; w: number; h: number } | null | undefined,
): PixelRect | null {
  if (!win || !(naturalWidth > 0) || !(naturalHeight > 0)) return null;
  const { x, y, w, h } = win;
  if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  if (!(w > 0) || !(h > 0)) return null;
  const x0 = Math.min(100, Math.max(0, x));
  const y0 = Math.min(100, Math.max(0, y));
  const x1 = Math.min(100, Math.max(0, x + w));
  const y1 = Math.min(100, Math.max(0, y + h));
  if (!(x1 > x0) || !(y1 > y0)) return null;
  return {
    x: (x0 / 100) * naturalWidth,
    y: (y0 / 100) * naturalHeight,
    width: ((x1 - x0) / 100) * naturalWidth,
    height: ((y1 - y0) / 100) * naturalHeight,
  };
}

/**
 * Loads `src` with CORS so a canvas can read it back. Resolves null on any
 * failure; never throws. Shared with logo-detect.ts (TL.POLISH.1b).
 */
export function loadCorsImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise<HTMLImageElement | null>((resolve) => {
    try {
      if (!src || typeof Image === 'undefined') { resolve(null); return; }
      const el = new Image();
      // Must be set BEFORE .src or the browser ignores it (same trap as crop.ts).
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = src;
    } catch {
      resolve(null);
    }
  });
}

/**
 * Loads `src` with CORS, draws it to an offscreen canvas 32 px wide and returns
 * the mean luminance of the name band, or null on ANY failure. Never throws.
 *
 * HERO.FIT.2: with a `window` (percent of the picture — the part the hero box
 * shows), only that part is drawn, so the band is the band of what is on
 * screen. Without one the whole picture is sampled, exactly as before.
 */
export async function sampleHeroBand(
  src: string,
  window?: { x: number; y: number; w: number; h: number } | null,
): Promise<number | null> {
  try {
    if (!src || typeof document === 'undefined') return null;
    const img = await loadCorsImage(src);
    if (!img || !img.naturalWidth || !img.naturalHeight) return null;
    const part = windowSourceRect(img.naturalWidth, img.naturalHeight, window);
    const w = SAMPLE_WIDTH;
    const h = Math.max(1, Math.round(((part ? part.height : img.naturalHeight) / (part ? part.width : img.naturalWidth)) * w));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    if (part) ctx.drawImage(img, part.x, part.y, part.width, part.height, 0, 0, w, h);
    else ctx.drawImage(img, 0, 0, w, h);
    const band = nameBandRect(w, h);
    // getImageData throws SecurityError on a tainted canvas — caught below.
    const { data } = ctx.getImageData(band.x, band.y, band.width, band.height);
    return meanLuminance(data);
  } catch {
    return null;
  }
}
