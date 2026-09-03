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
 */
export async function sampleHeroBand(src: string): Promise<number | null> {
  try {
    if (!src || typeof document === 'undefined') return null;
    const img = await loadCorsImage(src);
    if (!img || !img.naturalWidth || !img.naturalHeight) return null;
    const w = SAMPLE_WIDTH;
    const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const bx = Math.floor(w * BAND_LEFT_FRACTION);
    const bw = Math.max(1, Math.round(w * BAND_WIDTH_FRACTION));
    const by = Math.floor(h * BAND_TOP_FRACTION);
    const bh = Math.max(1, h - by);
    // getImageData throws SecurityError on a tainted canvas — caught below.
    const { data } = ctx.getImageData(bx, by, bw, bh);
    return meanLuminance(data);
  } catch {
    return null;
  }
}
