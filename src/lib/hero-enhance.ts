/**
 * PHOTO.POLISH.1 — Auto enhance on the hero picture.
 *
 * The free, in-browser enhancement (src/lib/auto-enhance.ts) applied to the
 * hero's DISPLAY file when it is baked. The kept original is never changed, so
 * the public page, `pages_public` and hero-framing.ts know nothing about this:
 * a page simply shows the file it was given.
 *
 * ## What is stored
 *
 * One object in the hero config slot (`heroConfig` / `heroConfig_page2`), beside
 * the window: `{ strength, params }`. `strength` is above 0 up to 1; `params`
 * is what `analyzePhoto` returned for the picture. Absent means off. This file
 * is the ONLY place that names the stored key — everything else goes through
 * readHeroEnhance / writeHeroEnhance.
 *
 * The params are stored, not only the strength, so a later bake of the same
 * picture (a nudged crop, a strength change) re-uses the SAME numbers: the
 * colour does not shift because the frame moved. Turning the switch off and on
 * analyses again.
 *
 * ## Canvas work
 *
 * analyzeForEnhance reads the FRAMED area only (the margin a display file keeps
 * for other screen shapes can hold a wall or a sky the creator did not frame,
 * and it must not steer the exposure), box-averages it down to about 256 px on
 * the long side, and hands that to analyzePhoto. enhanceCanvas paints params at
 * a strength onto a canvas in place. Both take anything canvas-shaped, so the
 * unit test (scripts/hero-enhance.test.mjs) runs them with no browser.
 */
import {
  analyzePhoto,
  applyEnhance,
  isIdentity,
  sanitizeParams,
  scaleParams,
  IDENTITY_PARAMS,
  type EnhanceParams,
} from './auto-enhance';

/** The stored value: how strongly, and with which numbers. */
export interface HeroEnhance {
  /** Above 0, up to 1. */
  strength: number;
  params: EnhanceParams;
}

/** A rectangle in canvas pixels. */
export interface HeroEnhanceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PixelImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
interface PixelContext {
  getImageData(x: number, y: number, w: number, h: number): PixelImage;
  putImageData(image: PixelImage, x: number, y: number): void;
}
/** What the canvas functions need of a canvas (an HTMLCanvasElement is one). */
export interface PixelCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): PixelContext | null;
}

/** The long side of the downsample the analysis reads. */
export const ENHANCE_ANALYSIS_PX = 256;

const KEY = 'enhance';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const usableStrength = (s: unknown): s is number =>
  typeof s === 'number' && Number.isFinite(s) && s > 0;

/**
 * The enhancement stored in a hero config slot, or null: no slot, no key, a
 * strength that is not above 0, or params that are not an object. A strength
 * over 1 reads as 1; the params come back inside every cap (sanitizeParams).
 */
export function readHeroEnhance(slot: unknown): HeroEnhance | null {
  if (!isRecord(slot)) return null;
  const raw = slot[KEY];
  if (!isRecord(raw) || !usableStrength(raw.strength) || !isRecord(raw.params)) return null;
  return {
    strength: Math.min(1, raw.strength),
    params: sanitizeParams(raw.params as Partial<EnhanceParams>),
  };
}

/**
 * The slot with the enhancement written, or removed when `value` is null or
 * unusable. Every other key is kept; the input is never mutated.
 */
export function writeHeroEnhance(slot: unknown, value: HeroEnhance | null | undefined): Record<string, unknown> {
  const next: Record<string, unknown> = isRecord(slot) ? { ...slot } : {};
  delete next[KEY];
  if (isRecord(value) && usableStrength(value.strength) && isRecord(value.params)) {
    next[KEY] = {
      strength: Math.min(1, value.strength),
      params: sanitizeParams(value.params as Partial<EnhanceParams>),
    };
  }
  return next;
}

/** True when two stored values would bake the same picture. */
export function sameHeroEnhance(a: HeroEnhance | null | undefined, b: HeroEnhance | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  if (Math.abs(a.strength - b.strength) > 1e-9) return false;
  const pa = sanitizeParams(a.params);
  const pb = sanitizeParams(b.params);
  return (Object.keys(pa) as (keyof EnhanceParams)[]).every((k) => Math.abs(pa[k] - pb[k]) < 1e-9);
}

/**
 * Box-average an RGBA picture down so its long side is at most `maxSide`.
 * Never upscales: a picture already inside the bound comes back as it is.
 */
export function downsampleRgba(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  maxSide: number = ENHANCE_ANALYSIS_PX,
): { data: Uint8ClampedArray; width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const dw = Math.max(1, Math.round(w * scale));
  const dh = Math.max(1, Math.round(h * scale));
  if (dw >= w && dh >= h) return { data: rgba, width: w, height: h };
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    const y0 = Math.floor((dy * h) / dh);
    const y1 = Math.max(y0 + 1, Math.floor(((dy + 1) * h) / dh));
    for (let dx = 0; dx < dw; dx++) {
      const x0 = Math.floor((dx * w) / dw);
      const x1 = Math.max(x0 + 1, Math.floor(((dx + 1) * w) / dw));
      let r = 0, g = 0, b = 0, a = 0;
      for (let y = y0; y < y1; y++) {
        let i = (y * w + x0) * 4;
        for (let x = x0; x < x1; x++, i += 4) {
          r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; a += rgba[i + 3];
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const o = (dy * dw + dx) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return { data: out, width: dw, height: dh };
}

/** `rect` in whole pixels inside a w × h canvas, or the whole canvas when it is absent or unusable. */
function insideCanvas(rect: HeroEnhanceRect | null | undefined, w: number, h: number): HeroEnhanceRect {
  const whole = { x: 0, y: 0, width: w, height: h };
  if (!rect) return whole;
  const nums = [rect.x, rect.y, rect.width, rect.height];
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return whole;
  const x0 = Math.min(w, Math.max(0, Math.round(rect.x)));
  const y0 = Math.min(h, Math.max(0, Math.round(rect.y)));
  const x1 = Math.min(w, Math.max(0, Math.round(rect.x + rect.width)));
  const y1 = Math.min(h, Math.max(0, Math.round(rect.y + rect.height)));
  if (x1 - x0 < 1 || y1 - y0 < 1) return whole;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * The Auto params for the picture on a canvas, read off the FRAMED area only
 * (`framed`, in canvas pixels) — never the margin around it. With no framed
 * rectangle the whole picture is read. Identity when the canvas has no pixels.
 */
export function analyzeForEnhance(canvas: PixelCanvas, framed?: HeroEnhanceRect | null): EnhanceParams {
  const w = Math.floor(canvas.width);
  const h = Math.floor(canvas.height);
  const ctx = w > 0 && h > 0 ? canvas.getContext('2d') : null;
  if (!ctx) return { ...IDENTITY_PARAMS };
  const r = insideCanvas(framed, w, h);
  const img = ctx.getImageData(r.x, r.y, r.width, r.height);
  const small = downsampleRgba(img.data, r.width, r.height, ENHANCE_ANALYSIS_PX);
  return analyzePhoto(small.data, small.width, small.height);
}

/**
 * Paint `params` at `strength` (0..1) onto a canvas, in place. Strength 0, or
 * params that change nothing, leave every pixel exactly as it was.
 */
export function enhanceCanvas(
  canvas: PixelCanvas,
  params: Partial<EnhanceParams> | null | undefined,
  strength: number,
): void {
  const p = scaleParams(params, strength);
  if (isIdentity(p)) return;
  const w = Math.floor(canvas.width);
  const h = Math.floor(canvas.height);
  const ctx = w > 0 && h > 0 ? canvas.getContext('2d') : null;
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, w, h);
  img.data.set(applyEnhance(img.data, w, h, p));
  ctx.putImageData(img, 0, 0);
}
