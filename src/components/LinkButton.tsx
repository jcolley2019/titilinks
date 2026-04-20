import React from 'react';
import type { ThemeJson, BlockStyleConfig } from '@/lib/theme-defaults';
import { DEFAULT_BLOCK_STYLE } from '@/lib/theme-defaults';
import { triggerHaptic } from '@/hooks/useHapticFeedback';
import { MediaThumb } from './MediaThumb';

type Media = { kind: 'image' | 'video'; src?: string; poster?: string; youtubeId?: string };

interface BaseLinkButtonProps {
  title: string;
  subtitle?: string;
  meta?: string;
  media?: Media;
  thumbnail?: string;
  socialIcon?: React.ReactNode;
  theme?: ThemeJson;
  blockStyle?: Partial<BlockStyleConfig>;
  size?: 'big' | 'medium' | 'small' | 'button';
  span?: 'full' | 'half';
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}

interface ButtonLinkButtonProps extends BaseLinkButtonProps {
  as?: 'button';
  type?: 'button' | 'submit' | 'reset';
  href?: never;
  target?: never;
  rel?: never;
}

interface AnchorLinkButtonProps extends BaseLinkButtonProps {
  as: 'a';
  href: string;
  target?: React.HTMLAttributeAnchorTarget;
  rel?: string;
  type?: never;
}

export type LinkButtonProps = ButtonLinkButtonProps | AnchorLinkButtonProps;

type CSSVarStyle = React.CSSProperties & Record<`--${string}`, string>;

function fontFamilyFor(fontStyle: BlockStyleConfig['font_style'] | undefined): string {
  switch (fontStyle) {
    case 'mono':
      return 'var(--font-mono)';
    case 'serif':
      return 'var(--font-display)';
    default:
      return 'var(--font-body)';
  }
}

function radiusFor(shape: string | undefined, fallback: string): string {
  switch (shape) {
    case 'pill':
      return '9999px';
    case 'square':
      return '6px';
    case 'rounded':
      return fallback;
    default:
      return fallback;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  if (!hex || !hex.startsWith('#')) return { r: 255, g: 255, b: 255 };
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbaStr(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function Arrow() {
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function LinkRow({ children }: { children: React.ReactNode }) {
  return <div className="lb-row">{children}</div>;
}

export function LinkButton(props: LinkButtonProps) {
  const {
    title,
    subtitle,
    meta,
    media,
    thumbnail,
    socialIcon,
    theme,
    blockStyle,
    size = 'medium',
    span = 'full',
    onClick,
    className,
  } = props;

  const effectiveMedia: Media | null =
    media || (thumbnail ? { kind: 'image', src: thumbnail } : null);

  const bs = { ...DEFAULT_BLOCK_STYLE, ...(blockStyle || {}) };

  const buttons = theme?.buttons;
  const shape = buttons?.shape || 'rounded';
  const variant = bs.variant || 'glass';
  const opacity = bs.background_opacity ?? 1;
  const fillColor = buttons?.fill_color || '#ffffff';
  const textColor = buttons?.text_color || '#ffffff';
  const borderEnabled = buttons?.border_enabled ?? false;
  const borderColor = bs.border_color || buttons?.border_color;
  const borderWidth = bs.border_width ?? 1;
  const shadowEnabled = buttons?.shadow_enabled ?? false;

  const style: CSSVarStyle = {
    borderRadius: radiusFor(shape, size === 'big' ? '16px' : '14px'),
    fontFamily: fontFamilyFor(bs.font_style),
    letterSpacing: bs.letter_spacing ? `${bs.letter_spacing}em` : undefined,
    color: textColor,
    '--lb-accent': fillColor,
    '--lb-accent-soft': rgbaStr(fillColor, 0.22),
  };

  if (variant === 'glass') {
    style.background = rgbaStr(fillColor, Math.max(0.03, opacity * 0.05));
    style.backdropFilter = 'blur(14px) saturate(1.3)';
    style.WebkitBackdropFilter = 'blur(14px) saturate(1.3)';
    style.border = `${borderWidth}px solid ${
      borderColor ? rgbaStr(borderColor, 0.35) : rgbaStr(fillColor, 0.12)
    }`;
  } else if (variant === 'filled') {
    style.background = rgbaStr(fillColor, opacity);
    style.border = borderEnabled
      ? `${borderWidth}px solid ${borderColor || fillColor}`
      : '1px solid transparent';
  } else if (variant === 'outline') {
    style.background = 'transparent';
    style.border = `${Math.max(borderWidth, 1)}px solid ${borderColor || fillColor}`;
  } else if (variant === 'minimal') {
    style.background = 'transparent';
    style.border = 'none';
    style.boxShadow = 'none';
  }

  if (shadowEnabled && variant !== 'minimal') {
    style.boxShadow = `${style.boxShadow || ''}${style.boxShadow ? ', ' : ''}0 8px 24px -10px rgba(0,0,0,0.55)`;
  }

  const cls = [
    'lb-reset',
    'lb-velvet',
    `lb-size-${size}`,
    `lb-span-${span}`,
    effectiveMedia ? 'has-media' : socialIcon ? 'has-social' : 'no-thumb',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleTouchStart = () => {
    triggerHaptic('light');
  };

  const content = (
    <>
      {size === 'big' && effectiveMedia && (
        <MediaThumb media={effectiveMedia} className="lb-cover" />
      )}

      {size !== 'big' && effectiveMedia && <MediaThumb media={effectiveMedia} />}
      {size !== 'big' && !effectiveMedia && socialIcon && (
        <span className="lb-social" aria-hidden="true" style={{ color: fillColor }}>
          {socialIcon}
        </span>
      )}

      <span className="lb-text">
        <span className="lb-title">{title}</span>
        {subtitle && size !== 'button' && <span className="lb-subtitle">{subtitle}</span>}
      </span>

      {meta && size !== 'big' && size !== 'button' && <span className="lb-meta">{meta}</span>}
      {size !== 'button' && (
        <span
          className="lb-arrow"
          aria-hidden="true"
          style={size === 'big' ? { color: fillColor } : undefined}
        >
          <Arrow />
        </span>
      )}
    </>
  );

  if (props.as === 'a') {
    return (
      <a
        href={props.href}
        target={props.target}
        rel={props.rel}
        onClick={onClick}
        onTouchStart={handleTouchStart}
        className={cls}
        style={style}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type={props.type ?? 'button'}
      onClick={onClick}
      onTouchStart={handleTouchStart}
      className={cls}
      style={style}
    >
      {content}
    </button>
  );
}
