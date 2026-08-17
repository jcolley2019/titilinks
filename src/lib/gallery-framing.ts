/**
 * TL.GAL.3 — gallery framing resolver.
 *
 * Per-photo zoom/pan for gallery tiles, the way `hero-framing.ts` is per-hero
 * framing: ONE pure function owns the geometry, every surface paints from it.
 * The cropper that writes these numbers is PhotoCropSheet; a photo that has
 * never been framed carries nothing here and falls through to the null path.
 *
 * ## What is stored
 *
 * `block_items.style_json.crop = { x, y, w, h }` — react-easy-crop's
 * `croppedArea` verbatim: PERCENTAGES of the source image, not pixels. Pixels
 * would rot the moment a photo is re-encoded at another size; percentages are
 * resolution-independent and survive any later CDN transform.
 *
 *   w / h  — how much of the image the crop window spans. 75 = three quarters.
 *            Never more than 100: the window may not reach past the photo.
 *   x / y  — the window's top-left corner. Never negative, and never so far
 *            right/down that the window's far edge leaves the photo.
 *
 * ## The geometry
 *
 * The tile is the crop window. So paint the WHOLE image, scaled so its cropped
 * region measures exactly one tile, then shift it so the region's corner lands
 * on the tile's corner:
 *
 *   width  = 100 / (w/100) %      the image is 1/w of the tile, so blow it up
 *   height = 100 / (h/100) %
 *   left   = -100 * (x/100) / (w/100) %    slide the corner into place: the
 *   top    = -100 * (y/100) / (h/100) %    excluded part hangs off the tile
 *
 * Expressed purely as percentages of the tile — no transforms — so the result
 * is a plain rectangle a unit test can assert and any surface can reproduce.
 *
 * ## The fill floor (TL.GAL.3b.1)
 *
 * A crop may never show tile background. The window stays inside the photo, so
 * the photo always covers the tile — zooming out below cover produced a tiny
 * floating picture and was withdrawn after hands-on use. That makes the four
 * inequalities below the whole contract, and `clampToFill` enforces them:
 *
 *   x >= 0        y >= 0        x + w <= 100        y + h <= 100
 *
 * They are exactly equivalent to the geometry covering the tile: `widthPct` and
 * `heightPct` land at or above 100, `leftPct` and `topPct` at or below 0, and
 * the far edges at or beyond 100. TL.GAL.2 removed the full carousel's black
 * matte on purpose; nothing here may reintroduce a gap for one to fill.
 */
import type { CSSProperties } from 'react';

/** A stored crop window, in percentages of the source image. */
export interface GalleryCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The image rectangle, in percentages of the tile box. */
export interface GalleryGeometry {
  widthPct: number;
  heightPct: number;
  leftPct: number;
  topPct: number;
}

/**
 * Floor of the crop zoom range.
 *
 * 1 is COVER-FIT: react-easy-crop inscribes its crop area in the media, so at
 * zoom 1 the photo exactly covers the frame on both axes — a 9:16 photo
 * width-fills the square and pans vertically only, a wide photo height-fills
 * and pans horizontally. Below 1 the photo would shrink inside the frame and
 * the tile would show through, which the fill floor above forbids.
 *
 * INVARIANT: this single constant must feed BOTH the Cropper's `minZoom` and
 * the zoom slider's `min` in PhotoCropSheet. If the two ever disagree, the
 * slider can dial a zoom the cropper refuses — or vice versa — and the stored
 * crop stops matching what the user was shown.
 */
export const GALLERY_MIN_ZOOM = 1;

const isFiniteNumber = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * The nearest crop that fills the tile — the fill floor, applied to numbers
 * that predate it.
 *
 * Rows written before TL.GAL.3b.1 can carry a zoomed-out letterbox (w/h above
 * 100, x/y below 0). Those must not paint a floating photo now that the rule
 * is gone, so they are pulled back to the closest legal window instead:
 *
 *   1. shrink the window until it fits inside the photo — by ONE factor on
 *      both axes, because the window is square in PIXELS and independent
 *      clamping would skew it into a rectangle the tile then stretches;
 *   2. keep its centre, so the framing the user chose is preserved as far as
 *      the photo's edges allow;
 *   3. slide it back inside those edges.
 *
 * A crop already inside the photo returns untouched — the same object, not a
 * recomputed copy, so the common path cannot drift by a float.
 */
function clampToFill(c: GalleryCrop): GalleryCrop {
  if (c.x >= 0 && c.y >= 0 && c.x + c.w <= 100 && c.y + c.h <= 100) return c;
  // Scale by the binding dimension rather than by (1 / oversize): dividing last
  // keeps the exact answers exact — 150 of a 200-tall window really is 75.
  const bound = Math.max(100, c.w, c.h);
  const w = (c.w * 100) / bound;
  const h = (c.h * 100) / bound;
  return {
    w,
    h,
    x: clamp(c.x + (c.w - w) / 2, 0, Math.max(0, 100 - w)),
    y: clamp(c.y + (c.h - h) / 2, 0, Math.max(0, 100 - h)),
  };
}

/**
 * Pull a usable crop out of an item's `style_json`, or null.
 *
 * Defensive by design: `style_json` is a free-form Supabase JSON column that
 * other features already write to (border_color, animation, …), and a legacy
 * or hand-edited row may hold anything at all. Anything that would produce NaN
 * or a divide-by-zero resolves to null, and null means "no crop" — the caller
 * keeps TL.GAL.2's plain object-cover, which is always a safe picture.
 *
 * Numbers that ARE usable but sit outside the fill floor come back clamped
 * rather than rejected: the framing is honoured as far as it legally can be.
 * Every consumer reads the crop through here — including PhotoCropSheet, which
 * seeds the cropper from it — so a legacy row opens on the same window it
 * paints.
 */
export function resolveGalleryCrop(styleJson: unknown): GalleryCrop | null {
  if (!styleJson || typeof styleJson !== 'object' || Array.isArray(styleJson)) return null;
  const raw = (styleJson as Record<string, unknown>).crop;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { x, y, w, h } = raw as Record<string, unknown>;
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  if (!isFiniteNumber(w) || !isFiniteNumber(h)) return null;
  // A zero/negative window has no geometry — it would divide by zero or mirror
  // the image. Out-of-range x/y/w/h are recoverable, so they are clamped, not
  // rejected: rejecting would silently drop a framing the user did choose.
  if (w <= 0 || h <= 0) return null;
  return clampToFill({ x, y, w, h });
}

/**
 * The geometry itself — the whole of gallery framing in four lines of
 * arithmetic. Null when the item carries no valid crop.
 */
export function resolveGalleryGeometry(styleJson: unknown): GalleryGeometry | null {
  const crop = resolveGalleryCrop(styleJson);
  if (!crop) return null;
  const fx = crop.x / 100;
  const fy = crop.y / 100;
  const fw = crop.w / 100;
  const fh = crop.h / 100;
  return {
    widthPct: 100 / fw,
    heightPct: 100 / fh,
    leftPct: (-100 * fx) / fw,
    topPct: (-100 * fy) / fh,
  };
}

/**
 * The CSS a gallery tile applies to its <img>, or NULL when the item has no
 * crop — in which case the caller must keep its existing object-cover classes
 * byte-identical. Null is not an error state; it is the overwhelmingly common
 * one, and it must stay indistinguishable from pre-TL.GAL.3 rendering.
 *
 * The <img> must sit inside the tile's `position: relative; overflow: hidden`
 * box — the square the percentages are measured against.
 */
export function resolveGalleryMediaStyle(styleJson: unknown): CSSProperties | null {
  const geo = resolveGalleryGeometry(styleJson);
  if (!geo) return null;
  return {
    position: 'absolute',
    left: `${geo.leftPct}%`,
    top: `${geo.topPct}%`,
    width: `${geo.widthPct}%`,
    height: `${geo.heightPct}%`,
    // Nothing inherited may shrink the rectangle we just computed.
    maxWidth: 'none',
    // The rectangle already IS the crop box, so the image fills it exactly —
    // any re-fit here would crop inside our own maths. Callers additionally
    // keep the `object-cover` class on the element; it is inert while this
    // property is present, and stands as the fallback if it ever is not.
    objectFit: 'fill',
  };
}
