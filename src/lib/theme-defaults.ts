// Default theme structure for pages.theme_json

export interface ThemeBackground {
  type: 'solid' | 'gradient' | 'image';
  solid_color: string;
  gradient_css: string;
  image_url: string;
  overlay_color: string;
  overlay_opacity: number;
  source: 'upload' | 'canva' | null;
}

export type HeaderLayout = 'overlay' | 'card' | 'split' | 'cinematic' | 'immersive';

export interface CanvaImportMetadata {
  design_id: string;
  title: string;
  thumbnail_url: string | null;
  target: 'header' | 'background';
  imported_at: string;
}

export interface ThemeHeader {
  image_url: string;
  enabled: boolean;
  source: 'upload' | 'canva' | null;
  layout: HeaderLayout;
}

export interface ThemeButtons {
  shape: 'pill' | 'rounded' | 'square';
  fill_color: string;
  text_color: string;
  border_enabled: boolean;
  border_color: string;
  shadow_enabled: boolean;
  density: 'compact' | 'normal' | 'roomy';
  // Reserved slot for the LinkButton visual direction (Phase 2 wires this up).
  // 'velvet' = frosted glass w/ gold hairline. 'obelisk' will be added later.
  variant_style?: 'velvet';
}

export interface ThemeTypography {
  font: 'inter' | 'system' | 'serif' | 'mono' |
        'playfair' | 'bebas' | 'abril' | 'pacifico' |
        'orbitron' | 'caveat' | 'archivo' | 'lora' |
        'patrick' | 'space';
  text_color: string;
}

export interface ThemeMotion {
  enabled: boolean;
}

// Per-block style variants for link/button blocks
export interface BlockStyleConfig {
  variant: 'filled' | 'outline' | 'glass' | 'minimal';
  border_width: number;
  border_color: string;
  background_opacity: number;
  font_style: 'normal' | 'mono' | 'serif';
  letter_spacing: number;
  // Velvet Link.me-style size + row layout (Phase 2 wires these up in LinkButton).
  // 'size' is per-block and distinct from ThemeButtons.density (which is global spacing).
  // When either is undefined, LinkButton renders at its current default (full-width, default height).
  size?: 'big' | 'medium' | 'small' | 'button';
  span?: 'full' | 'half';
}

export const DEFAULT_BLOCK_STYLE: BlockStyleConfig = {
  variant: 'filled',
  border_width: 0,
  border_color: '',
  background_opacity: 1,
  font_style: 'normal',
  letter_spacing: 0,
};

export interface ThemeJson {
  background: ThemeBackground;
  buttons: ThemeButtons;
  typography: ThemeTypography;
  motion: ThemeMotion;
  header?: ThemeHeader;
  auto_contrast?: boolean;
  online_indicator?: boolean;
  canva_last_import?: CanvaImportMetadata;
}

export const DEFAULT_HEADER: ThemeHeader = {
  image_url: '',
  enabled: false,
  source: null,
  layout: 'overlay',
};

export const DEFAULT_THEME: ThemeJson = {
  background: {
    type: 'solid',
    solid_color: '#0e0c09',
    gradient_css: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    image_url: '',
    overlay_color: '#000000',
    overlay_opacity: 0.5,
    source: null,
  },
  buttons: {
    shape: 'rounded',
    fill_color: '#C9A55C',
    text_color: '#ffffff',
    border_enabled: false,
    border_color: '#C9A55C',
    shadow_enabled: true,
    density: 'normal',
  },
  typography: {
    font: 'inter',
    text_color: '#ffffff',
  },
  motion: {
    enabled: true,
  },
  header: DEFAULT_HEADER,
  auto_contrast: false,
};

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  theme: ThemeJson;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'midnight-gold',
    name: 'Midnight Gold',
    description: 'Premium near-black with gold buttons',
    theme: {
      background: { type: 'solid', solid_color: '#0e0c09', gradient_css: '', image_url: '', overlay_color: '#000000', overlay_opacity: 0.5, source: null },
      buttons: { shape: 'rounded', fill_color: '#C9A55C', text_color: '#0e0c09', border_enabled: false, border_color: '#C9A55C', shadow_enabled: true, density: 'normal' },
      typography: { font: 'inter', text_color: '#ffffff' },
      motion: { enabled: true },
    },
  },
  {
    id: 'ivory',
    name: 'Ivory',
    description: 'Minimalist warm white',
    theme: {
      background: { type: 'solid', solid_color: '#faf9f6', gradient_css: '', image_url: '', overlay_color: '#000000', overlay_opacity: 0, source: null },
      buttons: { shape: 'pill', fill_color: '#1a1a1a', text_color: '#ffffff', border_enabled: false, border_color: '#1a1a1a', shadow_enabled: false, density: 'normal' },
      typography: { font: 'inter', text_color: '#1a1a1a' },
      motion: { enabled: true },
    },
  },
  {
    id: 'noir',
    name: 'Noir',
    description: 'High-contrast black with outline buttons',
    theme: {
      background: { type: 'solid', solid_color: '#000000', gradient_css: '', image_url: '', overlay_color: '#000000', overlay_opacity: 0, source: null },
      buttons: { shape: 'square', fill_color: '#ffffff', text_color: '#000000', border_enabled: false, border_color: '#ffffff', shadow_enabled: false, density: 'normal' },
      typography: { font: 'bebas', text_color: '#ffffff' },
      motion: { enabled: true },
    },
  },
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Cream paper with serif type',
    theme: {
      background: { type: 'solid', solid_color: '#f3efe7', gradient_css: '', image_url: '', overlay_color: '#000000', overlay_opacity: 0, source: null },
      buttons: { shape: 'rounded', fill_color: '#2b2b2b', text_color: '#ffffff', border_enabled: false, border_color: '#2b2b2b', shadow_enabled: false, density: 'normal' },
      typography: { font: 'playfair', text_color: '#2b2b2b' },
      motion: { enabled: true },
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm gradient with glass buttons',
    theme: {
      background: { type: 'gradient', solid_color: '#f7971e', gradient_css: 'linear-gradient(to bottom, #f7971e 0%, #ec5f7a 55%, #b24592 100%)', image_url: '', overlay_color: '#000000', overlay_opacity: 0.15, source: null },
      buttons: { shape: 'pill', fill_color: '#ffffff', text_color: '#b24592', border_enabled: false, border_color: 'rgba(255,255,255,0.35)', shadow_enabled: false, density: 'normal' },
      typography: { font: 'space', text_color: '#ffffff' },
      motion: { enabled: true },
    },
  },
  {
    id: 'velvet',
    name: 'Velvet',
    description: 'Deep plum with warm gold accents',
    theme: {
      background: { type: 'solid', solid_color: '#1a0f1f', gradient_css: '', image_url: '', overlay_color: '#000000', overlay_opacity: 0.5, source: null },
      buttons: { shape: 'rounded', fill_color: '#C9A55C', text_color: '#1a0f1f', border_enabled: false, border_color: '#C9A55C', shadow_enabled: true, density: 'normal' },
      typography: { font: 'lora', text_color: '#f5e9d0' },
      motion: { enabled: true },
    },
  },
  {
    id: 'studio',
    name: 'Studio',
    description: 'Your photo as a full background',
    theme: {
      background: { type: 'image', solid_color: '#1a1a1a', gradient_css: '', image_url: '', overlay_color: '#000000', overlay_opacity: 0.4, source: null },
      buttons: { shape: 'rounded', fill_color: '#ffffff', text_color: '#1a1a1a', border_enabled: true, border_color: 'rgba(255,255,255,0.3)', shadow_enabled: false, density: 'normal' },
      typography: { font: 'inter', text_color: '#ffffff' },
      motion: { enabled: true },
    },
  },
];

export function getThemeWithDefaults(themeJson: unknown): ThemeJson {
  if (!themeJson || typeof themeJson !== 'object') {
    return { ...DEFAULT_THEME };
  }

  const parsed = themeJson as Partial<ThemeJson>;

  return {
    background: {
      ...DEFAULT_THEME.background,
      ...(parsed.background || {}),
    },
    buttons: {
      ...DEFAULT_THEME.buttons,
      ...(parsed.buttons || {}),
    },
    typography: {
      ...DEFAULT_THEME.typography,
      ...(parsed.typography || {}),
    },
    motion: {
      ...DEFAULT_THEME.motion,
      ...(parsed.motion || {}),
    },
    header: {
      ...DEFAULT_HEADER,
      ...(parsed.header || {}),
    },
    auto_contrast: parsed.auto_contrast ?? DEFAULT_THEME.auto_contrast,
    canva_last_import: parsed.canva_last_import,
  };
}

/**
 * Applies auto-contrast adjustments to a theme when enabled.
 * - If background is image and overlay_opacity < 0.25, set overlay_opacity to 0.35
 * - Ensure typography text_color is white for readability
 */
export function applyAutoContrast(theme: ThemeJson): ThemeJson {
  if (!theme.auto_contrast) {
    return theme;
  }

  const adjustedTheme = { ...theme };

  // If background is image type
  if (theme.background.type === 'image') {
    // Ensure minimum overlay opacity for readability
    if (theme.background.overlay_opacity < 0.25) {
      adjustedTheme.background = {
        ...theme.background,
        overlay_opacity: 0.35,
      };
    }

    // Ensure text is white for contrast on image backgrounds
    adjustedTheme.typography = {
      ...theme.typography,
      text_color: '#ffffff',
    };
  }

  return adjustedTheme;
}
