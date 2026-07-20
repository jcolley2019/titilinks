/**
 * FIX.MEDIA.1 — hero framing resolver.
 *
 * THIS FUNCTION IS THE DEFINITION OF HERO FRAMING. Every surface that paints
 * hero media — the live page (hero + full_bleed, photo + video), the Video
 * Profile panel preview, and the Edit Photo dialog — resolves its CSS through
 * `resolveHeroMediaStyle`. Nothing else is allowed to hardcode `object-fit` or
 * re-derive a transform: the ratified contract is that a preview shows EXACTLY
 * what publishes, and that only holds while one function owns the geometry.
 *
 * ## The model
 *
 * The media is laid out at COVER size against the container, then scaled about
 * its centre, then panned. Expressed purely as percentages of the container —
 * no transforms — so the result is a plain rectangle that unit tests can assert
 * and two different DOM surfaces can reproduce byte-identically.
 *
 *   scale = 1  → cover: fills the container edge-to-edge, overflow cropped
 *   scale < 1  → shrinks from cover, REVEALING more of the clip; the backdrop
 *                shows as slim edges (this is why callers paint brand-dark
 *                behind the media, never transparent)
 *   scale > 1  → zooms in
 *   posX/posY  → 0..100 pan across whatever overflow exists, exactly like
 *                `object-position`: 0 = flush left/top, 100 = flush right/
 *                bottom, 50 = centred. Self-clamping — an axis with no
 *                overflow simply centres, so a slider can never push the
 *                media off its own frame.
 *   fit: 'fit' → letterbox (contain) instead of cover. Images only today;
 *                hero videos are always 'fill'.
 *
 * ## Aspect-unknown fallback
 *
 * `mediaAspect` is only known once the browser has decoded the image
 * (`naturalWidth/Height`) or the video's metadata (`videoWidth/Height`). Until
 * then the resolver returns an equivalent style built from the browser's own
 * `object-fit`, so first paint is correct rather than blank and simply sharpens
 * when the real aspect arrives. Both paths agree at scale 1 / pos 50.
 */
import { useLayoutEffect, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';

export type HeroFit = 'fill' | 'fit';

/** Stored framing. Every field optional — legacy media carries none of it. */
export interface HeroFraming {
  scale?: number | null;
  posX?: number | null;
  posY?: number | null;
  fit?: HeroFit | string | null;
}

/** Framing with every default filled in and every value clamped to range. */
export interface ResolvedHeroFraming {
  scale: number;
  posX: number;
  posY: number;
  fit: HeroFit;
}

/** The media rectangle, in percentages of the container box. */
export interface HeroGeometry {
  widthPct: number;
  heightPct: number;
  leftPct: number;
  topPct: number;
}

export interface HeroMediaStyleInput {
  /** width / height of the media itself. Null until decoded — see fallback. */
  mediaAspect?: number | null;
  /** width / height of the box the media paints into. */
  containerAspect?: number | null;
  framing?: HeroFraming | null;
}

/** Centred, unzoomed, cover — what absent/partial framing resolves to. */
export const HERO_FRAMING_DEFAULTS: ResolvedHeroFraming = {
  scale: 1,
  posX: 50,
  posY: 50,
  fit: 'fill',
};

/** Slider range, mirrored by the Video Profile panel's zoom control. */
export const HERO_SCALE_MIN = 0.5;
export const HERO_SCALE_MAX = 2.5;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isFiniteNumber = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);

/**
 * Fill in defaults and clamp to legal range. Callers persist whatever the user
 * dialled in; this is where a stale/absent/out-of-range value becomes safe.
 */
export function resolveHeroFraming(framing?: HeroFraming | null): ResolvedHeroFraming {
  const f = framing || {};
  return {
    scale: isFiniteNumber(f.scale) ? clamp(f.scale, HERO_SCALE_MIN, HERO_SCALE_MAX) : HERO_FRAMING_DEFAULTS.scale,
    posX: isFiniteNumber(f.posX) ? clamp(f.posX, 0, 100) : HERO_FRAMING_DEFAULTS.posX,
    posY: isFiniteNumber(f.posY) ? clamp(f.posY, 0, 100) : HERO_FRAMING_DEFAULTS.posY,
    fit: f.fit === 'fit' ? 'fit' : 'fill',
  };
}

/**
 * The geometry itself — the whole of hero framing in eight lines of arithmetic.
 * Returns null when the media aspect is not yet known (see the fallback note in
 * the file header); callers that need a rectangle should wait for decode.
 */
export function resolveHeroGeometry(
  mediaAspect: number | null | undefined,
  containerAspect: number | null | undefined,
  framing?: HeroFraming | null,
): HeroGeometry | null {
  if (!isFiniteNumber(mediaAspect) || mediaAspect <= 0) return null;
  if (!isFiniteNumber(containerAspect) || containerAspect <= 0) return null;
  const { scale, posX, posY, fit } = resolveHeroFraming(framing);

  // Cover: the axis that would leave a gap is the one pinned to 100%.
  // Contain ('fit') is the same comparison inverted — the axis that would
  // overflow is the one pinned instead, so the whole frame stays visible.
  const wide = mediaAspect >= containerAspect;
  const pinWidth = fit === 'fit' ? wide : !wide;
  const widthPct = (pinWidth ? 100 : (mediaAspect / containerAspect) * 100) * scale;
  const heightPct = (pinWidth ? (containerAspect / mediaAspect) * 100 : 100) * scale;

  // Pan across the real overflow; an axis with none is centred instead, which
  // is what makes posX/posY self-clamping and 'fit' immune to panning.
  const overflowX = widthPct - 100;
  const overflowY = heightPct - 100;
  const leftPct = overflowX > 0 ? -(posX / 100) * overflowX : (100 - widthPct) / 2;
  const topPct = overflowY > 0 ? -(posY / 100) * overflowY : (100 - heightPct) / 2;

  return { widthPct, heightPct, leftPct, topPct };
}

/**
 * The CSS every hero-media surface applies. The element must be positioned
 * inside a `position: relative; overflow: hidden` box that IS the container
 * whose aspect was passed in — otherwise the percentages describe the wrong
 * rectangle and preview stops equalling live.
 */
export function resolveHeroMediaStyle({
  mediaAspect,
  containerAspect,
  framing,
}: HeroMediaStyleInput): CSSProperties {
  const resolved = resolveHeroFraming(framing);
  const geo = resolveHeroGeometry(mediaAspect, containerAspect, framing);

  if (!geo) {
    // Aspect not yet known — let the browser compute cover/contain for us. The
    // scale transform still applies, so a zoomed page never flashes unzoomed.
    return {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: resolved.fit === 'fit' ? 'contain' : 'cover',
      objectPosition: `${resolved.posX}% ${resolved.posY}%`,
      transform: resolved.scale === 1 ? undefined : `scale(${resolved.scale})`,
      transformOrigin: 'center',
    };
  }

  return {
    position: 'absolute',
    left: `${geo.leftPct}%`,
    top: `${geo.topPct}%`,
    width: `${geo.widthPct}%`,
    height: `${geo.heightPct}%`,
    maxWidth: 'none',
    // The rectangle already IS the cover/contain box, so the media must fill it
    // exactly — any object-fit here would re-letterbox inside our own maths.
    objectFit: 'fill',
  };
}

/**
 * Value for the `data-hero-framing` attribute. Exposes the RESOLVED framing and
 * the resolved rectangle, so a test can assert preview == live by string
 * equality instead of screenshotting two surfaces.
 */
export function heroFramingAttr(input: HeroMediaStyleInput): string {
  const { scale, posX, posY, fit } = resolveHeroFraming(input.framing);
  const geo = resolveHeroGeometry(input.mediaAspect, input.containerAspect, input.framing);
  const box = geo
    ? `${geo.widthPct.toFixed(1)},${geo.heightPct.toFixed(1)},${geo.leftPct.toFixed(1)},${geo.topPct.toFixed(1)}`
    : 'pending';
  return `${scale.toFixed(2)};${posX.toFixed(0)};${posY.toFixed(0)};${fit};${box}`;
}

/**
 * Live aspect of the box the media paints into.
 *
 * MEASURED, never assumed. The resolver emits an explicit percentage rectangle,
 * so feeding it a container aspect that differs from the real box would stretch
 * the media — every surface must report its own true shape. This is also what
 * makes preview == live testable: two surfaces built at the same aspect resolve
 * to the same rectangle, and a surface built at the WRONG aspect visibly can't.
 */
export function useElementAspect(ref: RefObject<HTMLElement | null>): number | null {
  const [aspect, setAspect] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      setAspect(width > 0 && height > 0 ? width / height : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return aspect;
}

/** Media aspect from a decoded <img>. Null while it is still loading. */
export function imageAspect(el: HTMLImageElement | null | undefined): number | null {
  if (!el || !el.naturalWidth || !el.naturalHeight) return null;
  return el.naturalWidth / el.naturalHeight;
}

/** Media aspect from a <video> that has reached metadata. Null before that. */
export function videoAspect(el: HTMLVideoElement | null | undefined): number | null {
  if (!el || !el.videoWidth || !el.videoHeight) return null;
  return el.videoWidth / el.videoHeight;
}
