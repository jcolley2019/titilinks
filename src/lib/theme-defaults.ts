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
    solid_color: '#1a1a2e',
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
    id: 'clean-light',
    name: 'Clean Light',
    description: 'Minimal white background with subtle styling',
    theme: {
      background: {
        type: 'solid',
        solid_color: '#f8fafc',
        gradient_css: '',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0,
        source: null,
      },
      buttons: {
        shape: 'rounded',
        fill_color: '#0f172a',
        text_color: '#ffffff',
        border_enabled: false,
        border_color: '#0f172a',
        shadow_enabled: false,
        density: 'normal',
      },
      typography: {
        font: 'inter',
        text_color: '#0f172a',
      },
      motion: {
        enabled: true,
      },
    },
  },
  {
    id: 'clean-dark',
    name: 'Clean Dark',
    description: 'Sleek dark theme with high contrast',
    theme: {
      background: {
        type: 'solid',
        solid_color: '#0f0f0f',
        gradient_css: '',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0,
        source: null,
      },
      buttons: {
        shape: 'pill',
        fill_color: '#ffffff',
        text_color: '#0f0f0f',
        border_enabled: false,
        border_color: '#ffffff',
        shadow_enabled: false,
        density: 'normal',
      },
      typography: {
        font: 'inter',
        text_color: '#ffffff',
      },
      motion: {
        enabled: true,
      },
    },
  },
  {
    id: 'gradient-pop',
    name: 'Gradient Pop',
    description: 'Vibrant gradient with bold colors',
    theme: {
      background: {
        type: 'gradient',
        solid_color: '#1a1a2e',
        gradient_css: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0.2,
        source: null,
      },
      buttons: {
        shape: 'pill',
        fill_color: '#ffffff',
        text_color: '#764ba2',
        border_enabled: false,
        border_color: '#ffffff',
        shadow_enabled: true,
        density: 'roomy',
      },
      typography: {
        font: 'inter',
        text_color: '#ffffff',
      },
      motion: {
        enabled: true,
      },
    },
  },
  {
    id: 'photo-background',
    name: 'Photo Background',
    description: 'Ready for your background image',
    theme: {
      background: {
        type: 'image',
        solid_color: '#1a1a2e',
        gradient_css: '',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0.5,
        source: null,
      },
      buttons: {
        shape: 'rounded',
        fill_color: 'rgba(255,255,255,0.15)',
        text_color: '#ffffff',
        border_enabled: true,
        border_color: 'rgba(255,255,255,0.3)',
        shadow_enabled: false,
        density: 'normal',
      },
      typography: {
        font: 'inter',
        text_color: '#ffffff',
      },
      motion: {
        enabled: true,
      },
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
