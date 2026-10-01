import { forwardRef } from 'react';
import type { ImgHTMLAttributes } from 'react';
import { useResponsiveSrc, type ResponsiveSpec } from '@/hooks/useResponsiveSrc';
import { transformUrl } from '@/lib/media-url';

type ResponsiveImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'sizes'> &
  ResponsiveSpec & {
    src?: string;
    /**
     * For an <img> whose LAYOUT comes from the file's own pixel size (`w-auto`,
     * no box): a srcset would hijack that size — the browser divides the natural
     * size by the declared density, and a master smaller than a candidate makes
     * the declaration a lie. Such an image gets ONE fixed-width rendition as its
     * `src` instead. A master narrower than this comes back unscaled.
     */
    renditionWidth?: number;
  };

/**
 * MEDIA.PHOTO.1 — a plain <img> that serves right-sized renditions of a
 * creator's stored master. `src` is left exactly as given; `srcSet` + `sizes`
 * carry the renditions (see useResponsiveSrc). Without `cssWidth`, or for a
 * URL that is not ours / is a GIF or SVG, it is a plain <img>.
 *
 * For blocks that render a bare <img>. SmoothImage and ThumbnailImage take the
 * same props and own their skeleton/fade wrappers.
 */
export const ResponsiveImg = forwardRef<HTMLImageElement, ResponsiveImgProps>(function ResponsiveImg(
  { src, cssWidth, sizes, maxWidth, aspect, densities, renditionWidth, ...rest },
  ref,
) {
  const attrs = useResponsiveSrc(src, { cssWidth: renditionWidth ? undefined : cssWidth, sizes, maxWidth, aspect, densities });
  const shown = renditionWidth && src ? transformUrl(src, { width: renditionWidth, maxWidth }) : src;
  return <img ref={ref} {...rest} src={shown} srcSet={attrs.srcSet} sizes={attrs.sizes} />;
});
