/**
 * MEDIA.PHOTO.1 — responsive images off one stored master.
 *
 * Creators upload ONE file; the site keeps it untouched and serves each screen
 * the size it can show, through Supabase Storage image transforms:
 *
 *   /storage/v1/object/public/<bucket>/<path>          the master (never changes)
 *   /storage/v1/render/image/public/<bucket>/<path>    a resized rendition
 *       ?width=…&height=…&resize=cover|contain&quality=…
 *
 * Pure and dependency-free so scripts/media-url.test.mjs can run it under tsx.
 *
 * ## What the transform endpoint does (probed on prod, MEDIA.AUDIT.1 + re-probed
 * at the start of MEDIA.PHOTO.1) — the rules below are built around these:
 *
 *   - Format is negotiated from `Accept`: a browser <img> gets WebP, a bare
 *     client gets JPEG. We never pass `format`.
 *   - It never upscales. Asking for 2000 px of a 600 px master returns 600 px,
 *     and a request that exceeds the master on BOTH axes comes back at the
 *     master's own size and aspect (not cropped to the asked ratio). So a
 *     candidate wider than the master is wasted bytes on a duplicate URL —
 *     `maxWidth` exists to stop us asking, and the CSS object-fit still does the
 *     final crop either way.
 *   - `width` alone with the default `resize=cover` keeps the SOURCE height
 *     (a 200 px-wide, 600 px-tall sliver of a square). So a missing height
 *     ALWAYS goes out as `resize=contain` (aspect-preserving fit).
 *   - Hard ceiling of 2500 px per side.
 *   - Output is cached by the CDN for an hour (`max-age=3600`), same as the
 *     master; we add no cache-busting parameter.
 *   - GIFs lose their animation and SVGs are vectors: both bypass the builder.
 */

/** Supabase Storage's per-side limit for transforms. */
export const MAX_TRANSFORM_PX = 2500;
/** Cap used when the caller does not know the master's natural width. */
export const DEFAULT_MAX_WIDTH = 2048;
export const DEFAULT_QUALITY = 80;
export const DEFAULT_DENSITIES: readonly number[] = [1, 2, 3];

/** The page column's width cap on narrow viewports (EPV root `max-w-[640px]`). */
export const PAGE_COLUMN_MAX_PX = 640;
/** DesktopStage turns on at this viewport width; the page then lives in a phone-shaped column. */
export const STAGE_MIN_VIEWPORT_PX = 768;

const OBJECT_MARKER = '/storage/v1/object/public/';
const RENDER_MARKER = '/storage/v1/render/image/public/';

/** The project origin, read once. Absent under Node/tsx, where tests pass `origin`. */
const ENV_ORIGIN: string = (() => {
  try {
    const v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SUPABASE_URL;
    return typeof v === 'string' ? v.replace(/\/+$/, '') : '';
  } catch {
    return '';
  }
})();

const normalizeOrigin = (origin: string | undefined): string =>
  (origin ?? ENV_ORIGIN).replace(/\/+$/, '');

/** True only for `${VITE_SUPABASE_URL}/storage/v1/object/public/…`. */
export function isSupabasePublicUrl(url: string | null | undefined, origin?: string): boolean {
  if (typeof url !== 'string' || !url) return false;
  const base = normalizeOrigin(origin);
  if (!base) return false;
  const prefix = base + OBJECT_MARKER;
  return url.length > prefix.length && url.startsWith(prefix);
}

/** Animated (GIF) and vector (SVG) files must be served as uploaded. */
function isAnimatedOrVector(url: string): boolean {
  return /\.(?:gif|svg)(?:$|[?#])/i.test(url);
}

/** A comma or whitespace in a URL would corrupt a `srcset` list. */
function isSrcSetSafe(url: string): boolean {
  return !/[,\s]/.test(url);
}

/** Can this URL be rewritten to a rendition at all? */
export function isTransformable(url: string | null | undefined, origin?: string): url is string {
  return isSupabasePublicUrl(url, origin) && !isAnimatedOrVector(url as string);
}

export interface TransformOptions {
  /** Requested width in px. Clamped to `maxWidth` (or 2048 when unknown) and 2500. */
  width: number;
  /** Requested height in px. Scaled with `width` if `width` is clamped. */
  height?: number;
  /** `cover` crops to exactly width×height; `contain` fits inside. Default: cover with a height, contain without. */
  resize?: 'cover' | 'contain';
  /** 1–100. Default 80. */
  quality?: number;
  /** The master's natural width, when the caller knows it. Never request more. */
  maxWidth?: number;
  /** Project origin. Defaults to VITE_SUPABASE_URL; tests pass their own. */
  origin?: string;
}

const clampInt = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

function widthCap(maxWidth: number | undefined): number {
  const cap = typeof maxWidth === 'number' && Number.isFinite(maxWidth) && maxWidth >= 1 ? maxWidth : DEFAULT_MAX_WIDTH;
  return Math.min(MAX_TRANSFORM_PX, Math.floor(cap));
}

/**
 * Rewrite a master URL to a rendition URL. Anything that is not a Supabase
 * public object, and any GIF/SVG, comes back unchanged (same string).
 */
export function transformUrl(url: string, opts: TransformOptions): string {
  if (!isTransformable(url, opts.origin)) return url;
  if (!(typeof opts.width === 'number' && Number.isFinite(opts.width) && opts.width > 0)) return url;

  const cap = widthCap(opts.maxWidth);
  const wantW = Math.round(opts.width);
  const width = Math.min(wantW, cap);
  const height =
    typeof opts.height === 'number' && Number.isFinite(opts.height) && opts.height > 0
      ? Math.max(1, Math.round((opts.height * width) / wantW))
      : undefined;
  const resize = opts.resize ?? (height ? 'cover' : 'contain');
  const quality = clampInt(opts.quality ?? DEFAULT_QUALITY, 1, 100);

  const base = normalizeOrigin(opts.origin);
  const rewritten = base + RENDER_MARKER + url.slice((base + OBJECT_MARKER).length);
  const params = [`width=${width}`];
  if (height) params.push(`height=${height}`);
  params.push(`resize=${resize}`, `quality=${quality}`);
  return rewritten + (rewritten.includes('?') ? '&' : '?') + params.join('&');
}

export interface SrcSetOptions {
  /** Pixel densities to emit. Default [1, 2, 3]. */
  densities?: readonly number[];
  /** The master's natural width, when known. Candidates never exceed it. */
  maxWidth?: number;
  /**
   * The box's width ÷ height when the image paints `object-fit: cover` into a
   * box of known aspect, centred. Candidates are then cropped server-side to
   * exactly that box (`height` + `resize=cover`). Omit for anything framed by
   * pan/zoom maths that needs the WHOLE image (hero, gallery crops): those get
   * an aspect-preserving `contain`.
   */
  aspect?: number;
  quality?: number;
  origin?: string;
}

/**
 * A `srcset` of renditions at `cssWidth × density` px, each with its `w`
 * descriptor. Undefined when the URL cannot be transformed (external, GIF,
 * SVG, or unsafe for a srcset list) — callers then render a plain <img>.
 */
export function srcSetFor(url: string | null | undefined, cssWidth: number, opts: SrcSetOptions = {}): string | undefined {
  if (!isTransformable(url, opts.origin) || !isSrcSetSafe(url)) return undefined;
  if (!(typeof cssWidth === 'number' && Number.isFinite(cssWidth) && cssWidth > 0)) return undefined;

  const cap = widthCap(opts.maxWidth);
  const densities = [...(opts.densities ?? DEFAULT_DENSITIES)].filter((d) => d > 0).sort((a, b) => a - b);
  const aspect = typeof opts.aspect === 'number' && Number.isFinite(opts.aspect) && opts.aspect > 0 ? opts.aspect : undefined;

  const seen = new Set<number>();
  const parts: string[] = [];
  for (const d of densities) {
    const w = Math.min(Math.max(1, Math.round(cssWidth * d)), cap);
    if (seen.has(w)) continue; // clamped to the master: one candidate, not three copies
    seen.add(w);
    const href = transformUrl(url, {
      width: w,
      height: aspect ? Math.max(1, Math.round(w / aspect)) : undefined,
      resize: aspect ? 'cover' : 'contain',
      quality: opts.quality,
      maxWidth: cap,
      origin: opts.origin,
    });
    parts.push(`${href} ${w}w`);
  }
  return parts.length ? parts.join(', ') : undefined;
}

/** The CSS box an image paints into, as far as `sizes` needs to know. */
export type SizesBox =
  /** A fixed-size box: `48px`. */
  | { px: number }
  /** Edge to edge of the viewport (or of the stage). `scale` > 1 for a cover layer taller than it is wide. */
  | { fullBleed: true; scale?: number }
  /** A fluid box inside the page column: `fraction` of (column − `insetPx`). */
  | { column: number; insetPx?: number };

/**
 * How many times wider than its box an `object-fit: cover` image paints: cover
 * scales the media until BOTH axes are filled, so media wider than the box
 * (aspect above the box's) is pinned by height and overflows sideways by
 * `mediaAspect / boxAspect`; media narrower than the box is pinned by width
 * (1). `fallback` while either aspect is still unknown. Capped at 3.
 */
export function coverOverflow(
  mediaAspect: number | null | undefined,
  boxAspect: number | null | undefined,
  fallback = 1,
): number {
  if (!(typeof mediaAspect === 'number' && mediaAspect > 0 && Number.isFinite(mediaAspect))) return fallback;
  if (!(typeof boxAspect === 'number' && boxAspect > 0 && Number.isFinite(boxAspect))) return fallback;
  return Math.min(3, Math.max(1, mediaAspect / boxAspect));
}

/**
 * The same box blown up (or shrunk) by `k` — for an image painted `k` times
 * wider than the box it sits in, as a zoomed gallery/poster crop is.
 */
export function scaleBox(box: SizesBox, k: number): SizesBox {
  if ('px' in box) return { px: box.px * k };
  if ('fullBleed' in box) return { fullBleed: true, scale: (box.scale ?? 1) * k };
  return { column: box.column * k, insetPx: box.insetPx };
}

const trimNum = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * The `sizes` attribute for a box. With `stagePx` it prepends the desktop-stage
 * clause: at ≥ 768 px viewport the page is a phone-shaped column of exactly the
 * stage's width, whatever the window is, so the viewport tells the browser
 * nothing there. Without it the box is described against the viewport alone.
 */
export function sizesFor(box: SizesBox, stagePx: number | null = null): string {
  if ('px' in box) return `${trimNum(box.px)}px`;

  let wide: number;
  let narrow: string;
  if ('fullBleed' in box) {
    const scale = box.scale ?? 1;
    wide = (stagePx ?? 0) * scale;
    narrow = scale === 1 ? '100vw' : `calc(100vw * ${trimNum(scale)})`;
  } else {
    const inset = box.insetPx ?? 0;
    const f = box.column;
    wide = ((stagePx ?? 0) - inset) * f;
    const col = `min(100vw, ${PAGE_COLUMN_MAX_PX}px)`;
    narrow =
      inset === 0 && f === 1 ? col
      : inset === 0 ? `calc(${col} * ${trimNum(f)})`
      : `calc((${col} - ${trimNum(inset)}px) * ${trimNum(f)})`;
  }
  return stagePx
    ? `(min-width: ${STAGE_MIN_VIEWPORT_PX}px) ${Math.max(1, Math.round(wide))}px, ${narrow}`
    : narrow;
}
