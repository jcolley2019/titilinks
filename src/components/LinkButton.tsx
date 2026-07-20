import React from 'react';
import type { ThemeJson, BlockStyleConfig } from '@/lib/theme-defaults';
import { DEFAULT_BLOCK_STYLE } from '@/lib/theme-defaults';
import { relativeLuminance } from '@/lib/contrast';
import { resolveButtonSurface } from '@/lib/surface';
import { animationClass } from '@/lib/animations';
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
  /** Per-link button shape override (pill | rounded | sharp | ticket | cut | slant).
   *  Wins over the theme-level button shape. */
  buttonShape?: string;
  /** Per-link gradient fill (a CSS `linear-gradient(...)` string). When set on a
   *  filled button it paints the background instead of the solid fill color. */
  fillGradient?: string;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  /** Per-item title color override. Applied inline to the title so it wins over
   *  the hardcoded white on image-card (.lb-size-big/.lb-size-small) titles. */
  titleColor?: string;
  /** ANIM.1: per-link motion effect id (none|pulse|shimmer|bounce|glow|shake).
   *  Resolves to a `.lb-anim-<id>` class on the button root so the WHOLE button
   *  (frame + fill) moves as one; inert under prefers-reduced-motion. Sourced
   *  from block_items.style_json.animation (links) or the CTA's style config. */
  animation?: string;
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
  /** Optional so an 18+ gated item can render its anchor with no href at all
   *  (ADULT.2a) — React omits the attribute entirely when this is undefined,
   *  which is the point: the URL must not reach the DOM. The card still looks
   *  exactly like any other; tapping it raises the 18+ modal, which forwards
   *  through the /go hop by id (ADULT.2b/2c). */
  href?: string;
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
    case 'sharp':
      return '0px';
    case 'ticket':
      return '8px';
    case 'cut':
    case 'torn':
    case 'rounded':
      return fallback;
    default:
      return fallback;
  }
}

// Per-link shapes whose silhouette comes from clip-path/mask (not border-radius)
// — see the .lb-shape-* rules in index.css.
const CLIPPED_SHAPES = ['ticket', 'cut', 'torn'];

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

  const hasImage = !!effectiveMedia;
  const effectiveSize =
    (size === 'big' || size === 'small') && !hasImage ? 'button' : size;

  const bs = { ...DEFAULT_BLOCK_STYLE, ...(blockStyle || {}) };

  const buttons = theme?.buttons;
  // Profile-level (1b): font_style/letter_spacing/background_opacity/variant
  // can live on the page theme (stashed in theme.buttons / theme.typography).
  // Read theme FIRST, fall back to the block-level blockStyle so existing
  // profiles (no theme-level values) render identically.
  const themeButtons = buttons as Record<string, any> | undefined;
  const themeTypography = theme?.typography as Record<string, any> | undefined;
  const shape = props.buttonShape || buttons?.shape || 'rounded';
  // FS.SURFACE.2d: variant/outline/shadow come from the shared resolver
  // (full-bleed coercion included) so render and editor cannot disagree.
  const surface = resolveButtonSurface(theme, bs);
  const variant = surface.variant;
  const opacity = themeButtons?.background_opacity ?? bs.background_opacity ?? 1;
  const fontStyle = themeTypography?.font_style ?? bs.font_style;
  const letterSpacing = themeTypography?.letter_spacing ?? bs.letter_spacing;
  const fillColor = buttons?.fill_color || '#ffffff';
  const textColor = buttons?.text_color || '#ffffff';
  const borderEnabled = buttons?.border_enabled ?? false;
  const borderColor = bs.border_color || buttons?.border_color;
  const borderWidth = bs.border_width ?? 1;

  // Contrast guard: if the stored label color is unreadable on the surface it
  // actually sits on (filled => the fill; glass/outline/minimal => the page bg),
  // flip it to whichever of dark/light measures better. Protects templates AND
  // custom themes from invisible button text. Threshold 3.2 rescues the truly
  // unreadable cases without overriding intentional white-on-saturated looks.
  const pageBg = theme?.background?.solid_color || '#0e0c09';
  const labelSurface = variant === 'filled' && opacity >= 0.5 ? fillColor : pageBg;
  const wcagRatio = (a: string, b: string): number => {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const safeTextColor =
    wcagRatio(textColor, labelSurface) >= 3.2
      ? textColor
      : wcagRatio('#0e0c09', labelSurface) >= wcagRatio('#ffffff', labelSurface)
        ? '#0e0c09'
        : '#ffffff';

  const style: CSSVarStyle = {
    borderRadius:
      shape === 'pill' && (effectiveSize === 'big' || effectiveSize === 'small')
        ? '20px'
        : radiusFor(shape, effectiveSize === 'big' ? '16px' : '14px'),
    fontFamily: fontFamilyFor(fontStyle),
    letterSpacing: letterSpacing ? `${letterSpacing}em` : undefined,
    color: safeTextColor,
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
    style.background = props.fillGradient || rgbaStr(fillColor, opacity);
    style.border = borderEnabled
      ? `${borderWidth}px solid ${borderColor || fillColor}`
      : '1px solid transparent';
  } else if (variant === 'outline') {
    style.background = 'transparent';
    // Border is drawn by the unified outline pass below (surface.outlineWidth).
  } else if (variant === 'minimal') {
    style.background = 'transparent';
    style.border = 'none';
    style.boxShadow = 'none';
  } else if (variant === 'fade') {
    // FS.SURFACE.2a/2e: tint dissolving to nothing — glass blur for
    // legibility, no border so the edge stays soft. Direction comes
    // from the resolver: 'bottom' (default) anchors the tint at the
    // base like a product-tile scrim; 'top' is the inversion.
    const fadeCss = surface.fadeDirection === 'top' ? 'to bottom' : 'to top';
    // 2e.1: product-tile strength (tiles run black/80 → transparent).
    style.background = `linear-gradient(${fadeCss}, ${rgbaStr(fillColor, Math.max(0.25, opacity * 0.8))} 0%, ${rgbaStr(fillColor, 0)} 100%)`;
    style.backdropFilter = 'blur(14px) saturate(1.3)';
    style.WebkitBackdropFilter = 'blur(14px) saturate(1.3)';
    style.border = 'none';
  }

  // FS.SURFACE.2d unified outline pass: draws whenever the resolver
  // says so — an explicit positive outline_width, or a legacy variant
  // 'outline' whose border now renders here instead of in its branch.
  // 0 = intrinsic skins stand (glass hairline is material, not outline).
  if (surface.outlineWidth > 0) {
    style.border = `${surface.outlineWidth}px solid ${borderColor || fillColor}`;
  }

  if (surface.shadow) {
    style.boxShadow = `${style.boxShadow || ''}${style.boxShadow ? ', ' : ''}0 8px 24px -10px rgba(0,0,0,0.55)`;
  }

  const cls = [
    'lb-reset',
    'lb-velvet',
    `lb-size-${effectiveSize}`,
    `lb-span-${span}`,
    effectiveMedia ? 'has-media' : socialIcon ? 'has-social' : 'no-thumb',
    CLIPPED_SHAPES.includes(shape) ? `lb-shape-${shape}` : '',
    // ANIM.1: a per-link motion class on the root moves the whole button as one.
    animationClass(props.animation),
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleTouchStart = () => {
    triggerHaptic('light');
  };

  const content = (
    <>
      {(effectiveSize === 'big' || effectiveSize === 'small') && effectiveMedia && (
        <MediaThumb media={effectiveMedia} className="lb-cover" />
      )}
      {(effectiveSize === 'big' || effectiveSize === 'small') && effectiveMedia && socialIcon && (
        <span
          className={`absolute z-[1] rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center text-white ${
            effectiveSize === 'big' ? 'top-2.5 left-2.5 h-7 w-7' : 'top-2 left-2 h-6 w-6'
          }`}
          aria-hidden="true"
        >
          {socialIcon}
        </span>
      )}

      {effectiveSize !== 'big' && effectiveSize !== 'small' && effectiveMedia && (
        <MediaThumb media={effectiveMedia} />
      )}
      {effectiveSize !== 'big' && !effectiveMedia && socialIcon && (
        <span className="lb-social" aria-hidden="true" style={{ color: variant === 'filled' ? safeTextColor : fillColor }}>
          {socialIcon}
        </span>
      )}

      {(title || (subtitle && effectiveSize !== 'button')) && (
        <span className="lb-text">
          {title && <span className="lb-title" style={props.titleColor ? { color: props.titleColor } : undefined}>{title}</span>}
          {subtitle && effectiveSize !== 'button' && <span className="lb-subtitle">{subtitle}</span>}
        </span>
      )}

      {meta && effectiveSize !== 'big' && effectiveSize !== 'button' && <span className="lb-meta">{meta}</span>}
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
