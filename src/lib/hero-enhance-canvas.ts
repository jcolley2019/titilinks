/**
 * PHOTO.POLISH.2 — Auto enhance's canvas work, in a chunk of its own.
 *
 * The half of the hero's Auto enhance that touches pixels: reading a picture
 * off a canvas for the analysis, and painting the params back onto it. It
 * brings the heavy half of src/lib/auto-enhance.ts (analyzePhoto, applyEnhance)
 * with it. Nothing on the public page's path may import this file statically:
 * src/lib/hero-enhance.ts holds the ONE cached dynamic import of it
 * (loadHeroEnhanceCanvas), and the guard's BUNDLE-SPLIT invariant fails the
 * build if this chunk ever lands in the entry's static closure.
 *
 * analyzeForEnhance reads the FRAMED area only (the margin a display file keeps
 * for other screen shapes can hold a wall or a sky the creator did not frame,
 * and it must not steer the exposure), box-averages it down to about 256 px on
 * the long side, and hands that to analyzePhoto. enhanceCanvas paints params at
 * a strength onto a canvas in place. Both take anything canvas-shaped, so the
 * unit test (scripts/hero-enhance.test.mjs) runs them with no browser.
 */
import { analyzePhoto, applyEnhance, isIdentity, scaleParams, IDENTITY_PARAMS, type EnhanceParams } from './auto-enhance';
import type { HeroEnhance, HeroEnhanceRect } from './hero-enhance';

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

/** A framed window, in percent of the picture it lies over (what heroDisplayRegion returns). */
export interface EnhanceWindow {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What a bake or a preview is asked for. */
export interface EnhanceRequest {
  /** Above 0, up to 1. */
  strength: number;
  /** The numbers to paint. Absent: the canvas is analysed. */
  params?: EnhanceParams | null;
  /** With no params: the framed window to analyse, over the canvas. Absent: the whole picture. */
  framed?: EnhanceWindow | null;
}

/** A framed window as a rectangle in a canvas's pixels. */
const windowOnCanvas = (
  canvas: { width: number; height: number },
  win: EnhanceWindow | null | undefined,
): HeroEnhanceRect | null =>
  win
    ? {
        x: (win.x / 100) * canvas.width,
        y: (win.y / 100) * canvas.height,
        width: (win.w / 100) * canvas.width,
        height: (win.h / 100) * canvas.height,
      }
    : null;

/**
 * Enhance a display canvas in place, as a bake does, and return the value to
 * store beside it. Given `params`, those numbers are painted (a re-bake of the
 * same picture must not shift its colour); without them the canvas is analysed
 * on its framed window — never the margin — or whole when there is no window.
 */
export function bakeEnhance(canvas: PixelCanvas, request: EnhanceRequest): HeroEnhance {
  const params = request.params ?? analyzeForEnhance(canvas, windowOnCanvas(canvas, request.framed));
  enhanceCanvas(canvas, params, request.strength);
  return { strength: request.strength, params };
}

/** The long side of a preview copy. */
export const ENHANCE_PREVIEW_PX = 800;

/** A canvas as an object URL (the caller revokes it). */
const canvasObjectUrl = (canvas: HTMLCanvasElement): Promise<string> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('Preview failed'))),
      'image/jpeg',
      0.92,
    );
  });

/**
 * The preview copies of `region` of a decoded picture, at most ENHANCE_PREVIEW_PX
 * on the long side: as it is (`plain`), and — when asked — enhanced the way a
 * bake would (`enhanced`, with the `params` it was painted with). Object URLs;
 * the caller revokes them. Null when the browser gives no 2D canvas.
 */
export async function enhancePreviewCopies(
  image: CanvasImageSource,
  region: { x: number; y: number; width: number; height: number },
  request: EnhanceRequest | null,
): Promise<{ plain: string; enhanced: string | null; params: EnhanceParams | null } | null> {
  const scale = Math.min(1, ENHANCE_PREVIEW_PX / Math.max(region.width, region.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(region.width * scale));
  canvas.height = Math.max(1, Math.round(region.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
  const plain = await canvasObjectUrl(canvas);
  if (!request) return { plain, enhanced: null, params: null };
  try {
    const { params } = bakeEnhance(canvas, request);
    return { plain, enhanced: await canvasObjectUrl(canvas), params };
  } catch (err) {
    URL.revokeObjectURL(plain);
    throw err;
  }
}
