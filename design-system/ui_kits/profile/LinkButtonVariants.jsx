// LinkButtonVariants.jsx — two visual directions for TitiLinks link/button blocks.
//
// Directions (user picked Velvet as primary; Obelisk as alternate):
//   "velvet"  — frosted glass w/ gold hairline ribbon; clean editorial
//   "obelisk" — sculpted gold plate w/ inner highlight + soft glow
//
// Every variant supports the Link.me size system + layout system:
//   size: "big" | "medium" | "small" | "button"
//   span: "full" | "half"     (half = two cards side-by-side in a row)
//   media: { kind: "image" | "video", src, poster, youtubeId }
//   socialIcon: react node (rendered on medium/small/button if no thumbnail)
//
// It also respects every option in theme-defaults.ts (ThemeButtons + BlockStyleConfig):
//   shape, variant, fill_color, text_color, border_enabled, border_color,
//   border_width, background_opacity, shadow_enabled, font_style, letter_spacing
//
// Users can set ANY fill_color / text_color — gold is only the default.

const { useState: _us } = React;

// -------- helpers ---------------------------------------------------------
function hexWithOpacity(hex, opacity) {
  if (!hex || opacity >= 1) return hex;
  if (!hex.startsWith('#')) return hex;
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0');
  return `${hex}${alpha}`;
}

function fontFamilyFor(fontStyle) {
  switch (fontStyle) {
    case 'mono':   return 'var(--font-mono)';
    case 'serif':  return 'var(--font-display)';
    default:       return 'var(--font-body)';
  }
}

function radiusFor(shape, fallback) {
  switch (shape) {
    case 'pill':    return '9999px';
    case 'square':  return '6px';
    case 'rounded': return fallback || '14px';
    default:        return fallback || '14px';
  }
}

// Returns { r, g, b } from hex, for mixing. Tiny but reliable.
function hexToRgb(hex) {
  if (!hex || !hex.startsWith('#')) return { r: 255, g: 255, b: 255 };
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const rgbaStr = (hex, a) => { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

// -------- icons -----------------------------------------------------------
function Arrow() {
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function LinkGlyph() {
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1" />
    </svg>
  );
}
function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="currentColor">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.73l-11-6.5A1 1 0 0 0 8 5.5z" />
    </svg>
  );
}

// -------- Shared media thumb ----------------------------------------------
// Picks image, video element, or YouTube poster; shows play button on video.
function MediaThumb({ media, fallbackIcon, className = '' }) {
  if (!media) {
    return <span className={`lb-thumb ${className}`} aria-hidden="true">{fallbackIcon || <LinkGlyph />}</span>;
  }
  if (media.kind === 'video' && media.src) {
    return (
      <span className={`lb-thumb lb-thumb-video ${className}`} aria-hidden="true">
        <video src={media.src} poster={media.poster} autoPlay muted loop playsInline />
        <span className="lb-play"><PlayGlyph /></span>
      </span>
    );
  }
  if (media.kind === 'video' && media.youtubeId) {
    // Use YT's native poster — much cheaper than embedding an iframe and matches link.me Pro preview.
    const src = `https://img.youtube.com/vi/${media.youtubeId}/maxresdefault.jpg`;
    return (
      <span className={`lb-thumb lb-thumb-video ${className}`} aria-hidden="true">
        <img src={src} alt="" />
        <span className="lb-play"><PlayGlyph /></span>
      </span>
    );
  }
  // image
  return (
    <span className={`lb-thumb ${className}`} aria-hidden="true">
      <img src={media.src} alt="" />
    </span>
  );
}

// =========================================================================
// VELVET (primary direction)
// =========================================================================
function VelvetButton({
  title,
  subtitle,
  thumbnail,         // legacy convenience: treated as media:{kind:'image',src}
  media,             // new: { kind, src, poster, youtubeId }
  socialIcon,        // react node shown in small/medium/button when no thumb
  meta,
  theme = {},
  blockStyle = {},
  size = 'medium',
  span = 'full',
  onClick,
}) {
  const effectiveMedia = media || (thumbnail ? { kind: 'image', src: thumbnail } : null);

  const shape = theme.shape || 'rounded';
  const variant = blockStyle.variant || 'glass';
  const opacity = blockStyle.background_opacity ?? 1;
  const fillColor = theme.fill_color || '#ffffff';
  const textColor = theme.text_color || '#ffffff';
  const borderEnabled = theme.border_enabled ?? false;
  const borderColor = blockStyle.border_color || theme.border_color;
  const borderWidth = blockStyle.border_width ?? 1;
  const shadowEnabled = theme.shadow_enabled ?? false;

  const style = {
    borderRadius: radiusFor(shape, size === 'big' ? '16px' : '14px'),
    fontFamily: fontFamilyFor(blockStyle.font_style),
    letterSpacing: blockStyle.letter_spacing ? `${blockStyle.letter_spacing}em` : undefined,
    color: textColor,
    ['--lb-accent']: fillColor,
    ['--lb-accent-soft']: rgbaStr(fillColor, 0.22),
  };

  if (variant === 'glass') {
    style.background = rgbaStr(fillColor, Math.max(0.03, opacity * 0.05));
    style.backdropFilter = 'blur(14px) saturate(1.3)';
    style.WebkitBackdropFilter = 'blur(14px) saturate(1.3)';
    style.border = `${borderWidth}px solid ${borderColor ? rgbaStr(borderColor, 0.35) : rgbaStr(fillColor, 0.12)}`;
  } else if (variant === 'filled') {
    style.background = rgbaStr(fillColor, opacity);
    style.border = borderEnabled ? `${borderWidth}px solid ${borderColor || fillColor}` : '1px solid transparent';
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
    'lb-reset', 'lb-velvet',
    `lb-size-${size}`,
    `lb-span-${span}`,
    effectiveMedia ? 'has-media' : (socialIcon ? 'has-social' : 'no-thumb'),
  ].join(' ');

  return (
    <button onClick={onClick} className={cls} style={style}>
      {/* Photo-first layouts (big): cover image/video first */}
      {size === 'big' && effectiveMedia && (
        <MediaThumb media={effectiveMedia} className="lb-cover" />
      )}

      {/* Inline thumb (medium/small): leading square image OR social icon */}
      {size !== 'big' && effectiveMedia && <MediaThumb media={effectiveMedia} />}
      {size !== 'big' && !effectiveMedia && socialIcon && (
        <span className="lb-social" aria-hidden="true" style={{ color: fillColor }}>{socialIcon}</span>
      )}

      <span className="lb-text">
        <span className="lb-title">{title}</span>
        {subtitle && size !== 'button' && <span className="lb-subtitle">{subtitle}</span>}
      </span>

      {meta && size !== 'big' && size !== 'button' && (
        <span className="lb-meta">{meta}</span>
      )}
      {size !== 'button' && (
        <span className="lb-arrow" aria-hidden="true" style={size === 'big' ? { color: fillColor } : undefined}>
          <Arrow />
        </span>
      )}
    </button>
  );
}

// =========================================================================
// OBELISK (alternate direction — sculpted plate, works best filled)
// =========================================================================
function ObeliskButton({
  title,
  subtitle,
  thumbnail,
  media,
  socialIcon,
  meta,
  theme = {},
  blockStyle = {},
  size = 'medium',
  span = 'full',
  onClick,
}) {
  const effectiveMedia = media || (thumbnail ? { kind: 'image', src: thumbnail } : null);

  const shape = theme.shape || 'rounded';
  const variant = blockStyle.variant || 'filled';
  const opacity = blockStyle.background_opacity ?? 1;
  const fillColor = theme.fill_color || '#C9A55C';
  const textColor = theme.text_color || '#1a1209';
  const borderEnabled = theme.border_enabled ?? false;
  const borderColor = blockStyle.border_color || theme.border_color;
  const borderWidth = blockStyle.border_width ?? (borderEnabled ? 1 : 0);
  const shadowEnabled = theme.shadow_enabled ?? true;

  const style = {
    borderRadius: radiusFor(shape, size === 'big' ? '20px' : '16px'),
    fontFamily: fontFamilyFor(blockStyle.font_style),
    letterSpacing: blockStyle.letter_spacing ? `${blockStyle.letter_spacing}em` : undefined,
    color: textColor,
    ['--lb-accent']: fillColor,
  };

  if (variant === 'filled') {
    const base = rgbaStr(fillColor, opacity);
    style.background = `linear-gradient(180deg, ${base} 0%, color-mix(in oklab, ${base} 78%, black) 100%)`;
    if (borderWidth > 0) style.border = `${borderWidth}px solid ${borderColor || fillColor}`;
    if (!shadowEnabled) style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.15)';
  } else if (variant === 'outline') {
    // In outline mode on a dark canvas, default text to the fill color (not the dark plate text).
    style.background = 'transparent';
    style.border = `${Math.max(borderWidth, 1)}px solid ${borderColor || fillColor}`;
    style.color = textColor && textColor !== '#1a1209' ? textColor : fillColor;
    style.boxShadow = 'none';
  } else if (variant === 'glass') {
    style.background = rgbaStr(fillColor, opacity * 0.18);
    style.backdropFilter = 'blur(14px) saturate(1.4)';
    style.WebkitBackdropFilter = 'blur(14px) saturate(1.4)';
    style.border = `1px solid ${rgbaStr(fillColor, 0.4)}`;
    style.color = textColor && textColor !== '#1a1209' ? textColor : fillColor;
    style.boxShadow = 'none';
  } else if (variant === 'minimal') {
    style.background = 'transparent';
    style.border = 'none';
    style.boxShadow = 'none';
    style.color = textColor && textColor !== '#1a1209' ? textColor : fillColor;
  }

  const cls = [
    'lb-reset', 'lb-obelisk',
    `lb-variant-${variant}`,
    `lb-size-${size}`,
    `lb-span-${span}`,
    effectiveMedia ? 'has-media' : (socialIcon ? 'has-social' : 'no-thumb'),
  ].join(' ');

  return (
    <button onClick={onClick} className={cls} style={style}>
      {size === 'big' && effectiveMedia && <MediaThumb media={effectiveMedia} className="lb-cover" />}
      {size !== 'big' && effectiveMedia && <MediaThumb media={effectiveMedia} />}
      {size !== 'big' && !effectiveMedia && socialIcon && (
        <span className="lb-social" aria-hidden="true">{socialIcon}</span>
      )}
      <span className="lb-text">
        <span className="lb-title">{title}</span>
        {subtitle && size !== 'button' && <span className="lb-subtitle">{subtitle}</span>}
      </span>
      {meta && size !== 'big' && size !== 'button' && (<span className="lb-meta">{meta}</span>)}
      {size !== 'button' && size !== 'big' && (<span className="lb-arrow" aria-hidden="true"><Arrow /></span>)}
    </button>
  );
}

// =========================================================================
// Router
// =========================================================================
function LinkButton({ variantStyle = 'velvet', ...rest }) {
  if (variantStyle === 'obelisk') return <ObeliskButton {...rest} />;
  return <VelvetButton {...rest} />;
}

// Row wrapper — lets you put two half-span cards side-by-side.
// Pattern: <LinkRow><LinkButton span="half" .../><LinkButton span="half" .../></LinkRow>
function LinkRow({ children }) {
  return <div className="lb-row">{children}</div>;
}

Object.assign(window, {
  LinkButton, VelvetButton, ObeliskButton, LinkRow,
  Arrow, LinkGlyph, PlayGlyph, MediaThumb,
});
