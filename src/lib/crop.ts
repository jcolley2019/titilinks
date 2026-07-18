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

export const getCroppedImage = async (imageSrc: string, pixelCrop: Area): Promise<File> => {
  const image = new Image();
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
  const canvas = document.createElement('canvas');
  const maxSize = 800;
  const scaleX = image.naturalWidth / image.width || 1;
  const scaleY = image.naturalHeight / image.height || 1;
  let cropWidth = pixelCrop.width;
  let cropHeight = pixelCrop.height;
  if (cropWidth > maxSize || cropHeight > maxSize) {
    const ratio = Math.min(maxSize / cropWidth, maxSize / cropHeight);
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
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error('Crop failed')); return; }
        resolve(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.8
    );
  });
};

export type { Area };
