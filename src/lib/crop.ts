// Shared crop engine utilities — the ONE output path for every crop surface
// (onboarding + editor). Extracted verbatim from StepYourProfile (CROP.2a).
import type { Area } from 'react-easy-crop';

// CROP.3a — error truth: map a thrown crop/detect error to a concise i18n
// cause-hint key so the generic toasts can tell a SecurityError (tainted
// canvas), a not-yet-loaded face model, and a decode failure apart. Callers
// render t(cropErrorCauseKey(err)); keys live in both en/es dictionaries.
export const cropErrorCauseKey = (err: unknown): string => {
  const e = err as { name?: string; message?: string } | undefined;
  const name = e?.name || '';
  const msg = (e?.message || '').toLowerCase();
  if (name === 'SecurityError' || msg.includes('tainted') || msg.includes('cross-origin'))
    return 'editor.crop.causeTainted';
  if (msg.includes('model') || msg.includes('loadfromuri') || msg.includes('weights') || msg.includes('not loaded') || msg.includes('/models'))
    return 'editor.crop.causeModel';
  if (name === 'EncodingError' || msg.includes('decode') || msg.includes('image load') || msg.includes('load failed'))
    return 'editor.crop.causeDecode';
  return 'editor.crop.causeUnknown';
};

/** TL.CROP.QUAL.1 — the hero's longest edge after crop. The hero paints at
 *  full viewport width × 50 vh with object-fit: cover; on a 390 px @3× phone
 *  that is ~1170 × 1266 device pixels, so the old 800 px cap was upscaled
 *  ~1.5× on screen. 1440 covers 3× with headroom. */
export const HERO_MAX_PX = 1440;

/** Load + decode an image for canvas work. crossOrigin BEFORE src
 *  (FIX.MEDIA.1); real decode() wait with an onload fallback (CROP.3a). */
const loadHeroImage = async (imageSrc: string): Promise<HTMLImageElement> => {
  const image = new Image();
  // FIX.MEDIA.1 — tainted canvas: editing an EXISTING photo feeds this a remote
  // Supabase storage URL (avatar_original_url), not a local data URL. Without a
  // CORS request the canvas is tainted and toBlob throws SecurityError, so
  // "Crop failed — image is cross-origin protected" was the guaranteed outcome
  // of every re-crop. Must be set BEFORE .src or it does not apply.
  image.crossOrigin = 'anonymous';
  image.src = imageSrc;
  // CROP.3a — readiness: wait on a real decode before reading pixels so Apply
  // Crop can never race an undecoded image. Fall back to onload for engines
  // whose decode() rejects a valid data URL; a genuine failure throws so the
  // caller's catch can surface a decode cause hint (error truth).
  try {
    await image.decode();
  } catch {
    await new Promise<void>((resolve, reject) => {
      if (image.complete) {
        image.naturalWidth ? resolve() : reject(new Error('Image decode failed'));
        return;
      }
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Image decode failed'));
    });
  }
  return image;
};

/** TL.CROP.QUAL.1 — encode a hero canvas: WebP 0.85 (≈ half the bytes of JPEG
 *  at equal quality), falling back to JPEG 0.85 where canvas cannot encode
 *  WebP (blob null or the browser silently substituted another type). The
 *  file is named by the type it actually is — handlePhotoSave derives the
 *  storage extension from the name. */
const encodeHero = (canvas: HTMLCanvasElement): Promise<File> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (webp) => {
        if (webp && webp.type === 'image/webp') {
          resolve(new File([webp], 'avatar.webp', { type: 'image/webp' }));
          return;
        }
        canvas.toBlob(
          (jpeg) => {
            if (!jpeg) { reject(new Error('Crop failed')); return; }
            resolve(new File([jpeg], 'avatar.jpg', { type: 'image/jpeg' }));
          },
          'image/jpeg',
          0.85,
        );
      },
      'image/webp',
      0.85,
    );
  });

/** Draw pixelCrop (natural pixels) onto a canvas no larger than HERO_MAX_PX on
 *  its longest edge, never upscaling. Pure geometry; shared by both exports. */
const renderCrop = (image: HTMLImageElement, pixelCrop: Area): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  const scaleX = image.naturalWidth / image.width || 1;
  const scaleY = image.naturalHeight / image.height || 1;
  let cropWidth = pixelCrop.width;
  let cropHeight = pixelCrop.height;
  if (cropWidth > HERO_MAX_PX || cropHeight > HERO_MAX_PX) {
    const ratio = Math.min(HERO_MAX_PX / cropWidth, HERO_MAX_PX / cropHeight);
    cropWidth = Math.round(cropWidth * ratio);
    cropHeight = Math.round(cropHeight * ratio);
  }
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(
    image,
    pixelCrop.x * scaleX,
    pixelCrop.y * scaleY,
    pixelCrop.width * scaleX,
    pixelCrop.height * scaleY,
    0, 0,
    cropWidth,
    cropHeight
  );
  return canvas;
};

export const getCroppedImage = async (imageSrc: string, pixelCrop: Area): Promise<File> => {
  const image = await loadHeroImage(imageSrc);
  return encodeHero(renderCrop(image, pixelCrop));
};

/** TL.CROP.QUAL.1 — the same cap + encoding for an image that is NOT being
 *  cropped: a full-frame identity crop. Used by the AI-accept path (the model
 *  returns a full-resolution PNG) and by "Save" with no crop (the raw pick).
 *  One output path, so a hero can never be uploaded uncapped or mis-typed. */
export const boundHeroImage = async (imageSrc: string): Promise<File> => {
  const image = await loadHeroImage(imageSrc);
  return encodeHero(
    renderCrop(image, { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight }),
  );
};

/**
 * TL.AI.COST.1 — bound an image for the AI-enhance request. Replicate bills
 * crystal-upscaler by OUTPUT megapixels and we always ask for 2×, so the input
 * decides the price: ≤1024 px in → ≤2048 px out (≈4.2 MP, the cheapest tier)
 * versus a native-resolution phone crop (3000 px → 36 MP, 16× the price and
 * far slower). Nothing above ~1500 px is visible on the hero. Never upscales;
 * a source already within the bound is re-encoded at the same size.
 */
export const AI_INPUT_MAX_PX = 1024;

export const boundForAi = (
  source: HTMLCanvasElement,
  maxPx: number = AI_INPUT_MAX_PX,
): { dataUrl: string; width: number; height: number } => {
  const sw = source.width;
  const sh = source.height;
  const ratio = Math.min(1, maxPx / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * ratio));
  const height = Math.max(1, Math.round(sh * ratio));
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('No canvas context');
  ctx.drawImage(source, 0, 0, sw, sh, 0, 0, width, height);
  return { dataUrl: out.toDataURL('image/jpeg', 0.9), width, height };
};

export type { Area };
