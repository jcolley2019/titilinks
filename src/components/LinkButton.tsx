import React from 'react';
import { cn } from '@/lib/utils';
import type { ThemeJson, BlockStyleConfig } from '@/lib/theme-defaults';
import { DEFAULT_BLOCK_STYLE } from '@/lib/theme-defaults';
import { ThumbnailImage } from '@/components/ThumbnailImage';
import { triggerHaptic } from '@/hooks/useHapticFeedback';

interface LinkButtonProps {
  children: React.ReactNode;
  leftIcon?: React.ReactNode;
  leftThumbnail?: string;
  theme?: ThemeJson;
  blockStyle?: Partial<BlockStyleConfig>;
  className?: string;
  as?: 'button' | 'div';
  onClick?: (e: React.MouseEvent) => void;
}

export function LinkButton({
  children,
  leftIcon,
  leftThumbnail,
  theme,
  blockStyle,
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

  // Merge block style with defaults
  const style: BlockStyleConfig = {
    ...DEFAULT_BLOCK_STYLE,
    ...blockStyle,
  };

  // Use theme if provided, otherwise use defaults
  const baseFillColor = theme?.buttons?.fill_color || defaultStyles.fillColor;
  const textColor = theme?.buttons?.text_color || defaultStyles.textColor;
  const shape = theme?.buttons?.shape || defaultStyles.shape;
  const themeBorderEnabled = theme?.buttons?.border_enabled ?? defaultStyles.borderEnabled;
  const themeBorderColor = theme?.buttons?.border_color || defaultStyles.borderColor;
  const shadowEnabled = theme?.buttons?.shadow_enabled ?? defaultStyles.shadowEnabled;
  const motionEnabled = theme?.motion?.enabled ?? true;

  // Calculate styles based on variant
  const getVariantStyles = (): React.CSSProperties => {
    const opacity = style.background_opacity;
    const borderWidth = style.border_width || (themeBorderEnabled ? 2 : 0);
    const borderColor = style.border_color || themeBorderColor;

    switch (style.variant) {
      case 'outline':
        return {
          backgroundColor: 'transparent',
          border: `${Math.max(borderWidth, 1)}px solid ${borderColor || baseFillColor}`,
          color: textColor,
        };
      case 'glass':
        return {
          backgroundColor: `${baseFillColor}${Math.round(opacity * 0.15 * 255).toString(16).padStart(2, '0')}`,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor || `${baseFillColor}40`}` : `1px solid ${baseFillColor}30`,
          color: textColor,
        };
      case 'minimal':
        return {
          backgroundColor: 'transparent',
          border: 'none',
          color: textColor,
          boxShadow: 'none',
        };
      case 'filled':
      default:
        // Apply opacity to fill color
        const fillWithOpacity = opacity < 1 
          ? `${baseFillColor}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`
          : baseFillColor;
        return {
          backgroundColor: fillWithOpacity,
          border: borderWidth > 0 ? `${borderWidth}px solid ${borderColor}` : (themeBorderEnabled ? `2px solid ${themeBorderColor}` : 'none'),
          color: textColor,
        };
    }
  };

  // Get font family based on block style
  const getFontFamily = (): string => {
    switch (style.font_style) {
      case 'mono':
        return 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
      case 'serif':
        return 'Georgia, Cambria, "Times New Roman", Times, serif';
      case 'normal':
      default:
        return 'inherit';
    }
  };

  const getButtonRadius = () => {
    switch (shape) {
      case 'pill': return '9999px';
      case 'rounded': return '16px';
      case 'square': return '6px';
      default: return '9999px';
    }
  };

  const hasLeftContent = leftIcon || leftThumbnail;
  const variantStyles = getVariantStyles();

  const handleTouchStart = () => {
    triggerHaptic('light');
  };

  return (
    <Component
      onClick={onClick}
      onTouchStart={handleTouchStart}
      className={cn(
        // Layout
        'w-full flex items-center gap-3',
        // Pill by default
        'rounded-full',
        // Focus ring (always on)
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40',
        // Prevent layout shift
        'transform-gpu will-change-transform',
        // Glass variant gets stronger blur
        style.variant === 'glass' && 'backdrop-blur-md',
        // Microinteractions (when motion enabled)
        motionEnabled && [
          'active:scale-[0.99] transition-transform duration-100 ease-out',
          style.variant !== 'minimal' && 'hover:shadow-md hover:-translate-y-[1px]',
        ],
        // Reduced motion: always disable animations regardless of theme setting
        'motion-reduce:transition-none motion-reduce:transform-none',
        'motion-reduce:hover:transform-none motion-reduce:active:transform-none',
        className
      )}
      style={{
        ...variantStyles,
        borderRadius: getButtonRadius(),
        padding: hasLeftContent ? '0.5rem 1rem 0.5rem 0.5rem' : '1rem 1.25rem',
        boxShadow: style.variant === 'minimal' ? 'none' : (shadowEnabled ? '0 4px 14px rgba(0,0,0,0.15)' : variantStyles.boxShadow),
        fontFamily: getFontFamily(),
        letterSpacing: style.letter_spacing ? `${style.letter_spacing}em` : undefined,
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
