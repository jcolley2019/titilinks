/**
 * IMG.FIT.1 — the shared picture fitter.
 *
 * ONE module for "how does a picture sit in its box": Fill (cover, optionally
 * zoomed and panned) or Fit (the whole picture on a background). It knows
 * nothing about what box it serves — a link card, a product tile — it takes a
 * `style_json` and the box's aspect, nothing else. This file is the only one
 * that reads or writes the stored keys (guard PICTURE-FIT-ONE-MODULE).
 *
 * ## What is stored, on `block_items.style_json`
 *
 *   crop         { x, y, w, h } — the gallery contract unchanged: percentages
 *                of the SOURCE image, read through resolveGalleryCrop.
 *   crop_aspect  width / height of the frame the crop was made in.
 *   fit          'contain' = show the whole picture. Absent = fill.
 *   fit_bg       the colour behind a fitted picture (#rrggbb). Optional.
 *
 * Fill with the suggested framing stores NOTHING, exactly like the gallery: a
 * row with none of these keys paints today's cover, byte-identical. The writer
 * never leaves `fit` and `crop` together; if a row has both, `fit` wins.
 *
 * ## The method
 *
 * The gallery's: a stored rectangle over the untouched original — no canvas,
 * no re-encode, no second file. A box can change shape after framing (a Small
 * card with no partner renders as a Large; a pair half is 4:3, a Large 16:10),
 * so a stored window is RE-SHAPED for the box it paints into (adaptCrop), never
 * stretched and never dropped.
 *
 * ## The text under a fitted picture (IMG.FIT.3)
 *
 * When a background is stored, the text block below the picture (a card's
 * title strip, a product's label / price block) paints on that same colour, so
 * picture and text read as one tile — fittedTextLook. With none stored the
 * box keeps its own surface and colour, exactly as before.
 */
import type { CSSProperties } from 'react';
import { resolveGalleryCrop, resolveGalleryMediaStyle, type GalleryCrop } from './gallery-framing';
import { normalizeHexColor } from './hex-color';
import { contrastRatio } from './contrast';

/** How a picture paints, resolved from stored data. */
export type PictureFit =
  /** Today's element, untouched. */
  | { mode: 'cover' }
  /** The gallery rectangle; `zoom` = how many box-widths wide the image paints. */
  | { mode: 'crop'; style: CSSProperties; zoom: number }
  /** The whole picture; `bg` = the colour behind it, or null for none stored. */
  | { mode: 'fit'; bg: string | null };

/** What a framing sheet hands back. */
export type PictureFitChoice =
  | { mode: 'cover' }
  | { mode: 'crop'; crop: GalleryCrop; aspect: number }
  | { mode: 'fit'; bg?: string | null };

/** What a framing sheet opens on. */
export interface PictureFitSeed {
  mode: 'fill' | 'fit';
  /** The window to seed the cropper with (already re-shaped for the box), or null. */
  crop: GalleryCrop | null;
  bg: string | null;
}

const COVER: PictureFit = { mode: 'cover' };

/** Two aspects within this ratio of each other are the same box shape. */
const SAME_SHAPE = 0.005;
/** Renditions never ask for more than this many box widths (GalleryPhoto's cap). */
const MAX_ZOOM = 4;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const isAspect = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;

const sameShape = (a: number, b: number) => Math.abs(a / b - 1) <= SAME_SHAPE;

/**
 * Re-shape a crop window made in a frame of `fromAspect` for a box of
 * `toAspect`. Pure.
 *
 * The source's own aspect falls out of the window: a window w × h percent of
 * an SW × SH photo is (w·SW) × (h·SH) pixels, and that is `fromAspect`, so
 * S = SW/SH = fromAspect · h / w. The new window keeps the centre and is the
 * SMALLEST of the new shape that still contains the old one:
 *
 *   h2 = max(h, w · S / toAspect)      w2 = toAspect · h2 / S
 *
 * then goes through the gallery's fill clamp, which shrinks it by one factor
 * (keeping its shape) and slides it back inside the photo when it overhangs.
 * Same shape (within 0.5%) → the crop untouched, the same object.
 */
export function adaptCrop(crop: GalleryCrop, fromAspect: number, toAspect: number): GalleryCrop {
  if (!isAspect(fromAspect) || !isAspect(toAspect)) return crop;
  if (sameShape(fromAspect, toAspect)) return crop;
  if (!(crop.w > 0) || !(crop.h > 0)) return crop;
  const S = (fromAspect * crop.h) / crop.w;
  const h = Math.max(crop.h, (crop.w * S) / toAspect);
  const w = (toAspect * h) / S;
  const cx = crop.x + crop.w / 2;
  const cy = crop.y + crop.h / 2;
  return resolveGalleryCrop({ crop: { x: cx - w / 2, y: cy - h / 2, w, h } }) ?? crop;
}

/** The stored crop and the frame it was made in, or null when either is unusable. */
function storedCrop(sj: Record<string, unknown>): { crop: GalleryCrop; aspect: number } | null {
  const crop = resolveGalleryCrop(sj);
  const aspect = sj.crop_aspect;
  if (!crop || !isAspect(aspect)) return null;
  return { crop, aspect };
}

/**
 * How the picture in a box of `boxAspect` paints. Anything missing or junk
 * resolves to cover; a crop without a usable `crop_aspect` resolves to cover.
 */
export function resolvePictureFit(styleJson: unknown, boxAspect: number): PictureFit {
  if (!isRecord(styleJson)) return COVER;
  if (styleJson.fit === 'contain') return { mode: 'fit', bg: normalizeHexColor(styleJson.fit_bg) };
  const stored = storedCrop(styleJson);
  if (!stored || !isAspect(boxAspect)) return COVER;
  const window = adaptCrop(stored.crop, stored.aspect, boxAspect);
  const style = resolveGalleryMediaStyle({ crop: window });
  if (!style) return COVER;
  return { mode: 'crop', style, zoom: Math.min(MAX_ZOOM, 100 / window.w) };
}

/** IMG.FIT.3 — how the text block under a fitted picture paints. */
export interface FittedTextLook {
  /** The picture's stored background, behind the text too. */
  background: string;
  /** The text colour (title, subtitle, price) on that background. */
  color: string;
}

/** The ratio LinkButton's label guard uses: rescues the truly unreadable only. */
const READABLE = 3.2;
const INK_DARK = '#0e0c09';
const INK_LIGHT = '#ffffff';

/**
 * The text block under a fitted picture, or null when it keeps the box's own
 * surface and colour (not Fit, or Fit with no background stored — today's
 * paint). With a background: `preferred` (the creator's own title colour) when
 * it reads on it at 3.2 or better, else whichever of #0e0c09 / #ffffff reads
 * better. A `preferred` that is not a hex colour cannot be measured, so the
 * better of the two is used.
 */
export function fittedTextLook(fit: PictureFit, preferred: string | null | undefined): FittedTextLook | null {
  if (fit.mode !== 'fit' || !fit.bg) return null;
  const bg = fit.bg;
  const own = normalizeHexColor(preferred);
  if (own && contrastRatio(own, bg) >= READABLE) return { background: bg, color: own };
  const color = contrastRatio(INK_DARK, bg) >= contrastRatio(INK_LIGHT, bg) ? INK_DARK : INK_LIGHT;
  return { background: bg, color };
}

/** What a framing sheet opens on, for a box of `boxAspect`. Mirrors the render. */
export function pictureFitSeed(styleJson: unknown, boxAspect: number): PictureFitSeed {
  if (!isRecord(styleJson)) return { mode: 'fill', crop: null, bg: null };
  if (styleJson.fit === 'contain') return { mode: 'fit', crop: null, bg: normalizeHexColor(styleJson.fit_bg) };
  const stored = storedCrop(styleJson);
  if (!stored || !isAspect(boxAspect)) return { mode: 'fill', crop: null, bg: null };
  return { mode: 'fill', crop: adaptCrop(stored.crop, stored.aspect, boxAspect), bg: null };
}

/**
 * The next `style_json` after a framing choice: every other key kept
 * (`animation`, `icon_*`, `bg_gradient`, `border_*` …), the picture keys
 * replaced, null when nothing is left. Never mutates the input. A crop choice
 * that is not a usable window in a usable frame stores no picture keys.
 */
export function writePictureFit(styleJson: unknown, choice: PictureFitChoice): Record<string, unknown> | null {
  const next: Record<string, unknown> = isRecord(styleJson) ? { ...styleJson } : {};
  delete next.crop;
  delete next.crop_aspect;
  delete next.fit;
  delete next.fit_bg;
  if (choice.mode === 'crop') {
    const usable = resolveGalleryCrop({ crop: choice.crop });
    if (usable && isAspect(choice.aspect)) {
      next.crop = { x: choice.crop.x, y: choice.crop.y, w: choice.crop.w, h: choice.crop.h };
      next.crop_aspect = choice.aspect;
    }
  } else if (choice.mode === 'fit') {
    next.fit = 'contain';
    const bg = normalizeHexColor(choice.bg);
    if (bg) next.fit_bg = bg;
  }
  return Object.keys(next).length ? next : null;
}
