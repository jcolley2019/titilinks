import type { SizesBox } from '@/lib/media-url';

/** The box a LinkButton thumbnail paints into — what ResponsiveImg needs to size it. */
export interface MediaThumbBox {
  cssWidth: number;
  sizes: SizesBox;
  aspect: number;
}

/**
 * MEDIA.PHOTO.1: the CSS box a LinkButton thumbnail fills, at the 402px
 * reference phone (370px content column). Big/small cards are a full-width (or
 * half-width, 10px pair gap) cover at the card's aspect — see .lb-cover in
 * index.css; Medium is the 48px square. Centred object-cover throughout, so
 * the rendition is cropped server-side to exactly the box.
 */
export function linkThumbBox(size: string, span: string): MediaThumbBox {
  if (size === 'big' || size === 'small') {
    const half = span === 'half';
    return {
      cssWidth: half ? 180 : 370,
      sizes: half ? { column: 0.5, insetPx: 42 } : { column: 1, insetPx: 32 },
      aspect: size === 'big' ? (half ? 1 : 16 / 10) : (half ? 4 / 3 : 16 / 7),
    };
  }
  return { cssWidth: 48, sizes: { px: 48 }, aspect: 1 };
}
