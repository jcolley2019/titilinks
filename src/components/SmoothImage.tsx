import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface SmoothImageProps {
  src: string;
  alt?: string;
  className?: string;
  containerClassName?: string;
  skeletonClassName?: string;
  aspectRatio?: 'video' | 'square' | 'banner' | 'auto';
  fallback?: React.ReactNode;
}

/**
 * SmoothImage - Image component with skeleton loading and fade-in animation
 * - Fixed-size containers prevent layout shift
 * - Skeleton placeholder while loading
 * - Fade-in animation on load (respects prefers-reduced-motion)
 */
export function SmoothImage({
  src,
  alt = '',
  className,
  containerClassName,
  skeletonClassName,
  aspectRatio = 'auto',
  fallback,
}: SmoothImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
    setIsLoaded(true);
  };

  // Aspect ratio classes
  const aspectClasses = {
    video: 'aspect-video',
    square: 'aspect-square',
    banner: 'aspect-[3/1]',
    auto: '',
  };

  if (hasError) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <div 
        className={cn(
          'w-full h-full bg-muted/50 flex items-center justify-center',
          aspectClasses[aspectRatio],
          containerClassName
        )}
      >
        <span className="text-xs text-muted-foreground opacity-40">Failed to load</span>
      </div>
    );
  }

  return (
    <div 
      className={cn(
        'relative overflow-hidden',
        aspectClasses[aspectRatio],
        containerClassName
      )}
    >
      {/* Skeleton placeholder - visible while loading */}
      {!isLoaded && (
        <Skeleton 
          className={cn(
            'absolute inset-0 w-full h-full rounded-none',
            skeletonClassName
          )}
        />
      )}
      
      {/* Actual image with fade-in */}
      <img
        src={src}
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
