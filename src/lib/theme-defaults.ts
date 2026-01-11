// Default theme structure for pages.theme_json

export interface ThemeBackground {
  type: 'solid' | 'gradient' | 'image';
  solid_color: string;
  gradient_css: string;
  image_url: string;
  overlay_color: string;
  overlay_opacity: number;
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
  font: 'inter' | 'system' | 'serif' | 'mono';
  text_color: string;
}

export interface ThemeJson {
  background: ThemeBackground;
  buttons: ThemeButtons;
  typography: ThemeTypography;
}

export const DEFAULT_THEME: ThemeJson = {
  background: {
    type: 'solid',
    solid_color: '#1a1a2e',
    gradient_css: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    image_url: '',
    overlay_color: '#000000',
    overlay_opacity: 0.5,
  },
  buttons: {
    shape: 'rounded',
    fill_color: '#f97316',
    text_color: '#ffffff',
    border_enabled: false,
    border_color: '#f97316',
    shadow_enabled: true,
    density: 'normal',
  },
  typography: {
    font: 'inter',
    text_color: '#ffffff',
  },
};

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
  };
}
