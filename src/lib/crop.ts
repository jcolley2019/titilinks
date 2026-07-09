// Shared crop engine utilities — the ONE output path for every crop surface
// (onboarding + editor). Extracted verbatim from StepYourProfile (CROP.2a).
import type { Area } from 'react-easy-crop';

export const getCroppedImage = async (imageSrc: string, pixelCrop: Area): Promise<File> => {
  const image = new Image();
  image.src = imageSrc;
  await new Promise((resolve) => { image.onload = resolve; });
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
