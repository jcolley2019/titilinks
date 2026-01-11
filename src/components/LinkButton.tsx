import React from 'react';
import { cn } from '@/lib/utils';
import type { ThemeJson } from '@/lib/theme-defaults';
import { ThumbnailImage } from '@/components/ThumbnailImage';

interface LinkButtonProps {
  children: React.ReactNode;
  leftIcon?: React.ReactNode;
  leftThumbnail?: string;
  theme?: ThemeJson;
  className?: string;
  as?: 'button' | 'div';
  onClick?: (e: React.MouseEvent) => void;
}

export function LinkButton({
  children,
  leftIcon,
  leftThumbnail,
  theme,
  className,
  as: Component = 'div',
  onClick,
}: LinkButtonProps) {
  // Default styles (white button with black text - classic look)
  const defaultStyles = {
    fillColor: 'rgba(255, 255, 255, 0.9)',
    textColor: '#000000',
    shape: 'pill' as const,
    borderEnabled: false,
    borderColor: '#ffffff',
    shadowEnabled: false,
  };

  // Use theme if provided, otherwise use defaults
  const fillColor = theme?.buttons?.fill_color || defaultStyles.fillColor;
  const textColor = theme?.buttons?.text_color || defaultStyles.textColor;
  const shape = theme?.buttons?.shape || defaultStyles.shape;
  const borderEnabled = theme?.buttons?.border_enabled ?? defaultStyles.borderEnabled;
  const borderColor = theme?.buttons?.border_color || defaultStyles.borderColor;
  const shadowEnabled = theme?.buttons?.shadow_enabled ?? defaultStyles.shadowEnabled;

  const getButtonRadius = () => {
    switch (shape) {
      case 'pill': return '9999px';
      case 'rounded': return '16px';
      case 'square': return '6px';
      default: return '9999px';
    }
  };

  const hasLeftContent = leftIcon || leftThumbnail;

  return (
    <Component
      onClick={onClick}
      className={cn(
        // Layout
        'w-full flex items-center gap-3',
        // Pill by default
        'rounded-full',
        // Press/tap feedback
        'active:scale-[0.99] transition-transform duration-100 ease-out',
        // Hover state for desktop
        'hover:shadow-md hover:-translate-y-[1px]',
        // Focus ring
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
        // Prevent layout shift
        'transform-gpu will-change-transform',
        // Backdrop blur for glass effect
        'backdrop-blur-sm',
        // Reduced motion: disable animations
        'motion-reduce:transition-none motion-reduce:transform-none',
        'motion-reduce:hover:transform-none motion-reduce:active:transform-none',
        className
      )}
      style={{
        backgroundColor: fillColor,
        color: textColor,
        borderRadius: getButtonRadius(),
        padding: hasLeftContent ? '0.5rem 1rem 0.5rem 0.5rem' : '1rem 1.25rem',
        border: borderEnabled ? `2px solid ${borderColor}` : 'none',
        boxShadow: shadowEnabled ? '0 4px 14px rgba(0,0,0,0.15)' : 'none',
      }}
    >
      {/* Left content: icon or thumbnail - fixed h-12 w-12 to prevent CLS */}
      {hasLeftContent && (
        <div 
          className="flex-shrink-0 h-12 w-12 rounded-full overflow-hidden flex items-center justify-center"
          style={{
            backgroundColor: leftThumbnail ? 'transparent' : `${textColor}10`,
          }}
        >
          {leftThumbnail ? (
            <ThumbnailImage 
              src={leftThumbnail} 
              alt="" 
              className="rounded-full"
            />
          ) : (
            leftIcon
          )}
        </div>
      )}

      {/* Main content */}
      <div className={cn(
        'flex-1 min-w-0',
        !hasLeftContent && 'text-center'
      )}>
        {children}
      </div>
    </Component>
  );
}
