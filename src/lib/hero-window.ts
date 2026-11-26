/**
 * HERO.FIT.1 — the hero window converter. Pure: no React, no DOM.
 *
 * HERO.FIT.0 measured that the hero crop is exact but BAKED: it cannot be
 * reopened, and on a screen of another shape it is cut. The fix stores the
 * framed WINDOW over the kept original, exactly as link cards do (the picture
 * fitter's window: x, y, w, h in percent of the SOURCE, plus the aspect of the
 * frame it was made in), and paints it through the hero's existing resolver,
 * `resolveHeroGeometry`, which does not change. This file is only the maths
 * between the two: a window in, the `{ scale, posX, posY }` that resolver
 * already understands out, and back again.
 *
 * ## Storage (read here; written by the next brick)
 *
 * The hero's window lives in its own small object, `heroConfig.window`, holding
 * exactly what `writePictureFit(…, { mode: 'crop', crop, aspect })` produces.
 * It is NOT merged into `heroConfig` itself, because `heroConfig.fit` already
 * means something else there ('fill' | 'fit'). Only picture-fit.ts may name the
 * stored keys (guard PICTURE-FIT-ONE-MODULE), so this file reads through
 * `pictureFitSeed` and never spells them.
 *
 * ## The maths
 *
 * The resolver lays the photo at COVER against the box, scales it about its
 * centre, then pans it across the overflow. The window it shows is therefore
 * always of the box's shape: the cover window (the largest of that shape that
 * fits the photo) divided by `scale`, sitting `pos` percent of the way along
 * its travel. With `wide = mediaAspect >= containerAspect`:
 *
 *   scale = 100 / (wide ? h : w)
 *   posX  = w >= 100 ? 50 : 100 · x / (100 − w)        (posY: the same with y, h)
 *
 * An axis with no overflow is 50 — the resolver centres it whatever it says.
 *
 * A window can arrive a hair off the box's shape (`adaptCrop` leaves anything
 * within 0.5% untouched). Rather than let one axis decide, the scale is the
 * SMALLEST window of the box's shape that still contains it, and its position
 * is taken from its centre. For a window of the box's shape both are exactly
 * the formula above; for a near-miss, the box still shows all of what was
 * framed.
 *
 * ## The cap
 *
 * The resolver clamps scale to HERO_SCALE_MAX. A window tighter than that is
 * painted AT the cap, centred on the framed centre, slid back inside the photo
 * — it shows a little more around what was framed, never less, and never a
 * gap. HERO_WINDOW_MAX_ZOOM is that cap, and it is the ONE constant a hero
 * cropper must use as its max zoom (both the cropper and its slider), so a
 * creator can never dial a zoom the page cannot paint — the gallery's
 * GALLERY_MIN_ZOOM rule, applied to the ceiling. The scale is never under 1:
 * a window is always inside the photo, so the box never shows past its edge.
 *
 * ## Null
 *
 * Every function returns null when either aspect is unknown or the window is
 * unusable. Null means "paint as today" — the hero's stored scale/pos.
 */
import { HERO_SCALE_MAX, resolveHeroFraming } from './hero-framing';
import type { HeroFraming, ResolvedHeroFraming } from './hero-framing';
import { pictureFitSeed } from './picture-fit';
import type { GalleryCrop } from './gallery-framing';

/** A window over the source photo, in percent of it (the picture fitter's contract). */
export type HeroWindow = GalleryCrop;

/** The resolver's framing numbers for a window. */
export interface HeroWindowFraming {
  scale: number;
  posX: number;
  posY: number;
}

/**
 * The hero cropper's max zoom. It IS the resolver's max scale: zoom 1 in the
 * cropper is the cover window, as scale 1 is in the resolver, so the two
 * ranges are the same numbers.
 */
export const HERO_WINDOW_MAX_ZOOM = HERO_SCALE_MAX;

/** Below this much travel an axis has none: it is centred, posX/posY 50. */
const NO_TRAVEL = 1e-9;

const isAspect = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;

const isFiniteNumber = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function usableWindow(win: unknown): win is HeroWindow {
  if (!win || typeof win !== 'object' || Array.isArray(win)) return false;
  const { x, y, w, h } = win as Record<string, unknown>;
  return isFiniteNumber(x) && isFiniteNumber(y) && isFiniteNumber(w) && isFiniteNumber(h) && w > 0 && h > 0;
}

/**
 * The window the resolver shows at `scale`, in percent of the photo: the cover
 * window of the box's shape, divided by the scale.
 */
function windowSize(scale: number, mediaAspect: number, containerAspect: number) {
  const wide = mediaAspect >= containerAspect;
  const coverW = wide ? (100 * containerAspect) / mediaAspect : 100;
  const coverH = wide ? 100 : (100 * mediaAspect) / containerAspect;
  return { w: coverW / scale, h: coverH / scale };
}

/** Where a window of `size` starting at `start` sits along its travel, 0..100. */
const panOf = (start: number, size: number) =>
  100 - size <= NO_TRAVEL ? 50 : clamp((100 * start) / (100 - size), 0, 100);

/**
 * The resolver's framing for a window over a photo of `mediaAspect`, painted
 * into a box of `containerAspect`. Capped at HERO_WINDOW_MAX_ZOOM, never under 1.
 */
export function windowToHeroFraming(
  win: HeroWindow | null | undefined,
  mediaAspect: number | null | undefined,
  containerAspect: number | null | undefined,
): HeroWindowFraming | null {
  if (!isAspect(mediaAspect) || !isAspect(containerAspect) || !usableWindow(win)) return null;
  const cover = windowSize(1, mediaAspect, containerAspect);
  // The smallest window of the box's shape that contains this one. For a
  // window of the box's shape the two terms are equal: 100 / (wide ? h : w).
  const needed = Math.min(cover.w / win.w, cover.h / win.h);
  const scale = clamp(needed, 1, HERO_WINDOW_MAX_ZOOM);
  const size = windowSize(scale, mediaAspect, containerAspect);
  // Keep the framed centre; slide back inside the photo where the cap (or a
  // window that overhung) would hang the painted one off an edge.
  const cx = win.x + win.w / 2;
  const cy = win.y + win.h / 2;
  const x = clamp(cx - size.w / 2, 0, Math.max(0, 100 - size.w));
  const y = clamp(cy - size.h / 2, 0, Math.max(0, 100 - size.h));
  return { scale, posX: panOf(x, size.w), posY: panOf(y, size.h) };
}

/**
 * The window the resolver shows for stored framing numbers — the exact inverse
 * of windowToHeroFraming, for seeding a cropper. Absent fields take the
 * resolver's defaults; a scale under 1 (a revealed edge) seeds the cover
 * window, since a window cannot reach past the photo. `fit` is not part of a
 * window: the fill window at the same numbers comes back either way.
 */
export function heroFramingToWindow(
  framing: HeroFraming | null | undefined,
  mediaAspect: number | null | undefined,
  containerAspect: number | null | undefined,
): HeroWindow | null {
  if (!isAspect(mediaAspect) || !isAspect(containerAspect)) return null;
  const f = resolveHeroFraming(framing);
  const scale = clamp(f.scale, 1, HERO_WINDOW_MAX_ZOOM);
  const { w, h } = windowSize(scale, mediaAspect, containerAspect);
  return {
    x: (f.posX / 100) * Math.max(0, 100 - w),
    y: (f.posY / 100) * Math.max(0, 100 - h),
    w,
    h,
  };
}

/**
 * The hero framing for a stored window object (`heroConfig.window`), for a box
 * of `containerAspect`. The window is read through `pictureFitSeed`, so it
 * arrives already re-shaped for THIS box, then converted. Null when there is no
 * usable window or either aspect is unknown: null means "paint as today".
 */
export function resolveHeroWindowFraming(
  windowJson: unknown,
  mediaAspect: number | null | undefined,
  containerAspect: number | null | undefined,
): ResolvedHeroFraming | null {
  if (!isAspect(mediaAspect) || !isAspect(containerAspect)) return null;
  const seed = pictureFitSeed(windowJson, containerAspect);
  if (seed.mode !== 'fill' || !seed.crop) return null;
  const framing = windowToHeroFraming(seed.crop, mediaAspect, containerAspect);
  return framing ? { ...framing, fit: 'fill' } : null;
}
