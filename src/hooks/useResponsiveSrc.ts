// MEDIA.PHOTO.1 — the one React-side door to src/lib/media-url.ts.
//
// SmoothImage, ThumbnailImage and ResponsiveImg all turn a stored master URL
// into `srcSet` + `sizes` through this hook, so a box is described once and the
// stage-aware `sizes` maths lives in exactly one place.
//
// `src` is NEVER rewritten: it stays the master URL (the fallback every browser
// ignores once it has a `w`-descriptor srcset, and what the existing gallery
// specs locate tiles by). Only srcset/sizes carry the renditions.

import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_DEVICE_ID, resolveDevicePreset } from '@/lib/device-presets';
import { sizesFor, srcSetFor, type SizesBox } from '@/lib/media-url';

/**
 * Width in CSS px of the desktop stage's phone-shaped column, provided by
 * DesktopStage while it is staged. Null elsewhere → the default preset, which
 * is what the editor's device frame is on first open.
 */
export const MediaStageContext = createContext<number | null>(null);

const DEFAULT_STAGE_PX = resolveDevicePreset(DEFAULT_DEVICE_ID).width;

export interface ResponsiveSpec {
  /**
   * Nominal width in CSS px of the box on the reference phone; candidates are
   * cssWidth × densities. Absent → the image renders untouched (owner-side
   * surfaces whose maths needs the master's own pixels pass nothing).
   */
  cssWidth?: number;
  /** A box description (stage-aware) or a literal `sizes` string. Default: the cssWidth in px. */
  sizes?: SizesBox | string;
  /** The master's natural width when known (hero: HERO_MAX_PX). */
  maxWidth?: number;
  /** Box width ÷ height for a centred object-fit: cover box → server-side crop. */
  aspect?: number;
  /** Default [1, 2, 3]. */
  densities?: readonly number[];
}

export interface ResponsiveAttrs {
  srcSet?: string;
  sizes?: string;
}

export function useResponsiveSrc(src: string | null | undefined, spec: ResponsiveSpec): ResponsiveAttrs {
  const stagePx = useContext(MediaStageContext) ?? DEFAULT_STAGE_PX;
  const { cssWidth, sizes, maxWidth, aspect, densities } = spec;
  // Boxes arrive as fresh object literals; key on their content, not identity.
  const sizesKey = typeof sizes === 'object' && sizes ? JSON.stringify(sizes) : sizes;
  const densitiesKey = densities ? densities.join(',') : '';
  return useMemo<ResponsiveAttrs>(() => {
    if (!cssWidth) return {};
    const srcSet = srcSetFor(src, cssWidth, { maxWidth, aspect, densities });
    if (!srcSet) return {};
    const box: SizesBox | string = sizes ?? { px: cssWidth };
    return { srcSet, sizes: typeof box === 'string' ? box : sizesFor(box, stagePx) };
    // `sizes` and `densities` are covered by their content keys above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, cssWidth, sizesKey, maxWidth, aspect, densitiesKey, stagePx]);
}
