/**
 * MEDIA.PHOTO.2 — the ONE prepare step every creator image goes through before
 * it reaches Storage.
 *
 *   pick → gate (type / size) → [HEIC → JPEG on non-iOS] → decode with EXIF
 *   orientation baked in → scale to the master bounds → re-encode WebP q0.9
 *   (JPEG q0.92 where canvas cannot write WebP) → upload with a 1-year cache.
 *
 * What this buys, by construction rather than by a metadata library:
 *   - EXIF / GPS are gone: a canvas re-encode carries pixels only (gap #5).
 *   - Orientation is correct everywhere: `imageOrientation: 'from-image'`
 *     rotates the pixels at decode, so a sideways phone photo never depends
 *     on the viewer honouring the tag.
 *   - One master size for every site: the per-site byte caps (2 MB thumbs,
 *     5 MB everything else) are replaced by a 40 MB INPUT gate — the output is
 *     bounded in pixels, not bytes, because that is what a re-crop later needs.
 *   - HEIC in, on the platforms that need it: iOS already transcodes HEIC to
 *     JPEG inside the picker when the accept list omits HEIC, so the decoder is
 *     only ever loaded (lazily) on Android / desktop. NEVER add image/heic to an
 *     accept list — on iOS that switches the free transcode off.
 *
 * Product rulings (final, MEDIA.PHOTO.2): the master is the creator's full-size
 * upload re-encoded (not kept byte-for-byte); GIFs pass through untouched
 * (transforms and a canvas re-encode both drop animation) under the old 5 MB
 * cap; SVG stays rejected everywhere.
 */
import { validateImageFile, IMAGE_SIZE_LIMITS, type ImageValidationResult } from '@/lib/validation';

/** Anything larger than this is refused BEFORE decoding (a 48 MP HEIC is ~10 MB). */
export const INPUT_MAX_BYTES = 40 * 1024 * 1024;
/** GIFs are uploaded as picked, so their cap is still a byte cap. */
export const GIF_MAX_BYTES = IMAGE_SIZE_LIMITS.gif;
/** The master's longest edge. Supabase transforms stop at 2500/side; 4096 leaves re-crop room. */
export const MASTER_MAX_EDGE = 4096;
/**
 * The master's pixel area. iOS Safari refuses a canvas above 16,777,216 px
 * (4096²), so a 4096 × 4096 square has to come down a little; 16 MP is under
 * the ceiling on every engine we ship to.
 */
export const MASTER_MAX_AREA = 16_000_000;
export const WEBP_QUALITY = 0.9;
export const JPEG_FALLBACK_QUALITY = 0.92;

export interface PreparedImage {
  /** The file to upload — `<stem>.webp` (or `.jpg`), or the GIF as picked. */
  file: File;
  width: number;
  height: number;
  /** True when the file was not re-encoded (GIF). */
  passthrough: boolean;
}

export interface PrepareImageOptions {
  /** Longest-edge bound for this site. Default MASTER_MAX_EDGE; never upscales. */
  maxEdge?: number;
}

/** A refusal the caller can toast verbatim: `message` is the user-facing text. */
export class PrepareImageError extends Error {
  readonly code: 'type' | 'size' | 'decode' | 'encode';
  constructor(code: PrepareImageError['code'], message: string) {
    super(message);
    this.name = 'PrepareImageError';
    this.code = code;
  }
}

/**
 * iOS (every browser there is WebKit) transcodes HEIC → JPEG in the picker. On
 * iPadOS 13+ Safari claims to be a Mac, so the touch-point check is what tells
 * an iPad from a MacBook.
 */
export function isIOS(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> | undefined = typeof navigator !== 'undefined' ? navigator : undefined): boolean {
  if (!nav) return false;
  const ua = nav.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
}

const HEIC_EXT = /\.(heic|heif)$/i;

/** Detect by MIME OR extension — Android often reports an empty `type` for HEIC. */
export function isHeicFile(file: Pick<File, 'type' | 'name'>): boolean {
  const t = (file.type || '').toLowerCase();
  return t === 'image/heic' || t === 'image/heif' || t === 'image/heic-sequence' || t === 'image/heif-sequence'
    || HEIC_EXT.test(file.name || '');
}

/**
 * The synchronous input gate, for the pick handler (immediate feedback, no
 * decode). prepareImage runs it again, so a caller may skip it and just catch.
 * HEIC is admitted only where this code will decode it (non-iOS).
 */
export function validateImageInput(file: File): ImageValidationResult {
  if (file.type === 'image/gif') return validateImageFile(file, GIF_MAX_BYTES);
  return validateImageFile(file, INPUT_MAX_BYTES, { allowHeic: !isIOS() });
}

/** Lazy: ~1–2 MB of WASM that only Android / desktop HEIC picks ever pay for. */
async function heicToJpeg(file: File): Promise<File> {
  const { default: heic2any } = await import('heic2any');
  let out: Blob | Blob[];
  try {
    out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 });
  } catch {
    throw new PrepareImageError('decode', 'Could not read this HEIC photo. Try exporting it as JPEG.');
  }
  const blob = Array.isArray(out) ? out[0] : out;
  if (!blob) throw new PrepareImageError('decode', 'Could not read this HEIC photo. Try exporting it as JPEG.');
  return new File([blob], stemOf(file.name) + '.jpg', { type: 'image/jpeg' });
}

function stemOf(name: string): string {
  const base = (name || 'image').split(/[\\/]/).pop() || 'image';
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem || 'image';
}

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

/**
 * Decode with EXIF orientation applied. `createImageBitmap` is the primary
 * path (off-main-thread, `imageOrientation: 'from-image'` is explicit); the
 * `<img>` fallback relies on the browser default `image-orientation: from-image`,
 * which every engine without createImageBitmap also applies to drawImage.
 */
async function decodeOriented(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
    } catch {
      // fall through to the <img> path (Safari < 15 rejects the options bag)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      await new Promise<void>((resolve, reject) => {
        if (img.complete) { img.naturalWidth ? resolve() : reject(new Error('decode')); return; }
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('decode'));
      });
    }
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('decode');
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new PrepareImageError('decode', 'Could not read this image. Try a JPEG, PNG or WebP.');
  }
}

/** Fit (w, h) inside maxEdge on the long side AND maxArea in total. Never upscales. */
export function fitMaster(width: number, height: number, maxEdge: number = MASTER_MAX_EDGE, maxArea: number = MASTER_MAX_AREA): { width: number; height: number } {
  const edgeRatio = Math.min(1, maxEdge / Math.max(width, height));
  const areaRatio = Math.min(1, Math.sqrt(maxArea / (width * height)));
  const ratio = Math.min(edgeRatio, areaRatio);
  if (ratio >= 1) return { width, height };
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/** WebP q0.9, else JPEG q0.92 where the canvas returns null or substitutes a type (old Safari). */
function encode(canvas: HTMLCanvasElement, stem: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (webp) => {
        if (webp && webp.type === 'image/webp') {
          resolve(new File([webp], `${stem}.webp`, { type: 'image/webp' }));
          return;
        }
        canvas.toBlob(
          (jpeg) => {
            if (!jpeg) { reject(new PrepareImageError('encode', 'Could not process this image.')); return; }
            resolve(new File([jpeg], `${stem}.jpg`, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          JPEG_FALLBACK_QUALITY,
        );
      },
      'image/webp',
      WEBP_QUALITY,
    );
  });
}

/**
 * Gate → (HEIC→JPEG) → decode oriented → bound → re-encode. Throws
 * PrepareImageError with a user-facing message; callers toast `err.message`.
 */
export async function prepareImage(file: File, opts: PrepareImageOptions = {}): Promise<PreparedImage> {
  const gate = validateImageInput(file);
  if (!gate.valid) {
    const oversize = file.size > INPUT_MAX_BYTES || (file.type === 'image/gif' && file.size > GIF_MAX_BYTES);
    throw new PrepareImageError(oversize ? 'size' : 'type', gate.error || 'Invalid image');
  }

  if (file.type === 'image/gif') {
    // Animation survives only as the original bytes; dimensions are not read
    // (no decode), and the 5 MB cap above bounds the upload.
    return { file, width: 0, height: 0, passthrough: true };
  }

  const source = isHeicFile(file) ? await heicToJpeg(file) : file;
  const decoded = await decodeOriented(source);
  try {
    const maxEdge = typeof opts.maxEdge === 'number' && opts.maxEdge > 0 ? Math.floor(opts.maxEdge) : MASTER_MAX_EDGE;
    const { width, height } = fitMaster(decoded.width, decoded.height, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PrepareImageError('encode', 'Could not process this image.');
    ctx.drawImage(decoded.source, 0, 0, decoded.width, decoded.height, 0, 0, width, height);
    const out = await encode(canvas, stemOf(file.name));
    return { file: out, width, height, passthrough: false };
  } finally {
    decoded.release();
  }
}
