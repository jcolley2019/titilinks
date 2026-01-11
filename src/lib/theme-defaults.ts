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
  };
}
