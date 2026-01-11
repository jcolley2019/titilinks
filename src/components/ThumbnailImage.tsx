import React, { useState } from 'react';
import { cn } from '@/lib/utils';

interface ThumbnailImageProps {
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
}: ThumbnailImageProps) {
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
    <div className={cn('relative w-full h-full', containerClassName)}>
      {/* Skeleton placeholder - visible while loading */}
      <div 
        className={cn(
          'absolute inset-0 bg-white/10 animate-pulse',
          isLoaded && 'hidden'
        )}
        aria-hidden="true"
      />
      
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
          'transition-opacity duration-200 ease-out',
          // Start invisible, become visible when loaded
          isLoaded ? 'opacity-100' : 'opacity-0',
          // Respect reduced motion
          'motion-reduce:transition-none motion-reduce:opacity-100',
          className
        )}
      />
    </div>
  );
}
