import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useResponsiveSrc, type ResponsiveSpec } from '@/hooks/useResponsiveSrc';

interface ThumbnailImageProps extends ResponsiveSpec {
  src: string;
  alt?: string;
  className?: string;
  containerClassName?: string;
}

export function ThumbnailImage({
  src,
  alt = '',
  className,
  containerClassName,
  cssWidth,
  sizes,
  maxWidth,
  aspect,
  densities,
}: ThumbnailImageProps) {
  // MEDIA.PHOTO.1: renditions via srcset; `src` below stays the master.
  const responsive = useResponsiveSrc(src, { cssWidth, sizes, maxWidth, aspect, densities });
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
    setIsLoaded(true);
  };

  if (hasError) {
    return (
      <div 
        className={cn(
          'w-full h-full bg-white/10 flex items-center justify-center',
          containerClassName
        )}
      >
        <span className="text-xs opacity-40">?</span>
      </div>
    );
  }

  return (
    <div className={cn('relative w-full h-full overflow-hidden', containerClassName)}>
      {/* Skeleton placeholder - visible while loading */}
      {!isLoaded && (
        <Skeleton 
          className="absolute inset-0 w-full h-full rounded-none bg-white/10"
          aria-hidden="true"
        />
      )}
      
      {/* Actual image with fade-in */}
      <img
        src={src}
        srcSet={responsive.srcSet}
        sizes={responsive.sizes}
        alt={alt}
        onLoad={handleLoad}
        onError={handleError}
        loading="lazy"
        decoding="async"
        className={cn(
          'w-full h-full object-cover',
          // Fade transition
          'transition-opacity duration-300 ease-out',
          // Start invisible, become visible when loaded
          isLoaded ? 'opacity-100' : 'opacity-0',
          // Respect reduced motion - skip animation
          'motion-reduce:transition-none motion-reduce:opacity-100',
          className
        )}
      />
    </div>
  );
}
