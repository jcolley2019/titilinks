// Template Gallery Data - Linktree-style templates with categories and presets

import { type ThemeJson, type BlockStyleConfig, DEFAULT_BLOCK_STYLE } from './theme-defaults';

export interface TemplateDefinition {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  theme: ThemeJson;
  blockStyles: Partial<BlockStyleConfig>;
  previewImage?: string; // Optional static preview image URL
}

export type TemplateCategory = 
  | 'all'
  | 'fashion'
  | 'influencer'
  | 'health'
  | 'marketing'
  | 'social'
  | 'music'
  | 'business'
  | 'minimal'
  | 'bold';

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string; emoji: string }[] = [
  { id: 'all', label: 'All', emoji: '✨' },
  { id: 'fashion', label: 'Fashion', emoji: '👗' },
  { id: 'influencer', label: 'Influencer', emoji: '⭐' },
  { id: 'health', label: 'Health & Fitness', emoji: '💪' },
  { id: 'marketing', label: 'Marketing', emoji: '📈' },
  { id: 'social', label: 'Social Media', emoji: '📱' },
  { id: 'music', label: 'Music', emoji: '🎵' },
  { id: 'business', label: 'Small Business', emoji: '🏪' },
  { id: 'minimal', label: 'Minimal', emoji: '◻️' },
  { id: 'bold', label: 'Bold', emoji: '🔥' },
];

export const TEMPLATES: TemplateDefinition[] = [
  // Fashion Templates
  {
    id: 'vogue-noir',
    name: 'Vogue Noir',
    category: 'fashion',
    description: 'Elegant dark theme with serif typography',
    theme: {
      background: {
        type: 'solid',
        solid_color: '#0a0a0a',
        gradient_css: '',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0,
        source: null,
      },
      buttons: {
        shape: 'square',
        fill_color: '#ffffff',
        text_color: '#0a0a0a',
        border_enabled: false,
        border_color: '#ffffff',
        shadow_enabled: false,
        density: 'roomy',
      },
      typography: {
        font: 'serif',
        text_color: '#ffffff',
      },
      motion: { enabled: true },
    },
    blockStyles: {
      variant: 'filled',
      font_style: 'serif',
      letter_spacing: 0.05,
      background_opacity: 1,
    },
  },
  {
    id: 'blush-boutique',
    name: 'Blush Boutique',
    category: 'fashion',
    description: 'Soft pink tones with glass effect',
    theme: {
      background: {
        type: 'gradient',
        solid_color: '#fdf2f8',
        gradient_css: 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 50%, #fbcfe8 100%)',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0,
        source: null,
      },
      buttons: {
        shape: 'pill',
        fill_color: '#be185d',
        text_color: '#ffffff',
        border_enabled: false,
        border_color: '#be185d',
        shadow_enabled: true,
        density: 'normal',
      },
      typography: {
        font: 'inter',
        text_color: '#831843',
      },
      motion: { enabled: true },
    },
    blockStyles: {
      variant: 'filled',
      font_style: 'normal',
      letter_spacing: 0,
      background_opacity: 1,
    },
  },

  // Influencer Templates
  {
    id: 'creator-gradient',
    name: 'Creator Gradient',
    category: 'influencer',
    description: 'Vibrant gradient with bold CTAs',
    theme: {
      background: {
        type: 'gradient',
        solid_color: '#1a1a2e',
        gradient_css: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0.1,
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
      motion: { enabled: true },
    },
    blockStyles: {
      variant: 'filled',
      font_style: 'normal',
      letter_spacing: 0,
      background_opacity: 1,
    },
  },
  {
    id: 'neon-nights',
    name: 'Neon Nights',
    category: 'influencer',
    description: 'Dark with neon accents and glass buttons',
    theme: {
      background: {
        type: 'solid',
        solid_color: '#0f0f1a',
        gradient_css: '',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0,
        source: null,
      },
      buttons: {
        shape: 'rounded',
        fill_color: '#00ff88',
        text_color: '#0f0f1a',
        border_enabled: true,
        border_color: '#00ff8840',
        shadow_enabled: true,
        density: 'normal',
      },
      typography: {
        font: 'mono',
        text_color: '#ffffff',
      },
      motion: { enabled: true },
    },
    blockStyles: {
      variant: 'glass',
      font_style: 'mono',
      letter_spacing: 0.02,
      background_opacity: 0.15,
      border_width: 1,
      border_color: '#00ff8830',
    },
  },

  // Health & Fitness Templates
  {
    id: 'zen-wellness',
    name: 'Zen Wellness',
    category: 'health',
    description: 'Calm earthy tones for wellness brands',
    theme: {
      background: {
        type: 'gradient',
        solid_color: '#f5f5f4',
        gradient_css: 'linear-gradient(180deg, #f5f5f4 0%, #e7e5e4 100%)',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0,
        source: null,
      },
      buttons: {
        shape: 'rounded',
        fill_color: '#57534e',
        text_color: '#fafaf9',
        border_enabled: false,
        border_color: '#57534e',
        shadow_enabled: false,
        density: 'normal',
      },
      typography: {
        font: 'serif',
        text_color: '#292524',
      },
      motion: { enabled: true },
    },
    blockStyles: {
      variant: 'filled',
      font_style: 'serif',
      letter_spacing: 0.01,
      background_opacity: 1,
    },
  },
  {
    id: 'energy-boost',
    name: 'Energy Boost',
    category: 'health',
    description: 'High-energy orange with bold typography',
    theme: {
      background: {
        type: 'solid',
        solid_color: '#0c0c0c',
        gradient_css: '',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0,
        source: null,
      },
      buttons: {
        shape: 'square',
        fill_color: '#f97316',
        text_color: '#ffffff',
        border_enabled: false,
        border_color: '#f97316',
        shadow_enabled: true,
        density: 'roomy',
      },
      typography: {
        font: 'inter',
        text_color: '#ffffff',
      },
      motion: { enabled: true },
    },
    blockStyles: {
      variant: 'filled',
      font_style: 'normal',
      letter_spacing: 0.03,
      background_opacity: 1,
    },
  },

  // Marketing Templates
  {
    id: 'growth-pro',
    name: 'Growth Pro',
    category: 'marketing',
    description: 'Professional blue with clean lines',
    theme: {
      background: {
        type: 'solid',
        solid_color: '#0f172a',
        gradient_css: '',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0,
        source: null,
      },
      buttons: {
        shape: 'rounded',
        fill_color: '#3b82f6',
        text_color: '#ffffff',
        border_enabled: false,
        border_color: '#3b82f6',
        shadow_enabled: true,
        density: 'normal',
      },
      typography: {
        font: 'inter',
        text_color: '#f8fafc',
      },
      motion: { enabled: true },
    },
    blockStyles: {
      variant: 'filled',
      font_style: 'normal',
      letter_spacing: 0,
      background_opacity: 1,
    },
  },
  {
    id: 'conversion-king',
    name: 'Conversion King',
    category: 'marketing',
    description: 'High-contrast with outline buttons',
    theme: {
      background: {
        type: 'solid',
        solid_color: '#fafafa',
        gradient_css: '',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0,
        source: null,
      },
      buttons: {
        shape: 'square',
        fill_color: '#18181b',
        text_color: '#fafafa',
        border_enabled: true,
        border_color: '#18181b',
        shadow_enabled: false,
        density: 'normal',
      },
      typography: {
        font: 'inter',
        text_color: '#18181b',
      },
      motion: { enabled: true },
    },
    blockStyles: {
      variant: 'outline',
      font_style: 'normal',
      letter_spacing: 0.01,
      background_opacity: 0,
      border_width: 2,
      border_color: '#18181b',
    },
  },

  // Social Media Templates
  {
    id: 'tiktok-vibes',
    name: 'TikTok Vibes',
    category: 'social',
    description: 'Dark with cyan & magenta accents',
    theme: {
      background: {
        type: 'solid',
        solid_color: '#000000',
        gradient_css: '',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0,
        source: null,
      },
      buttons: {
        shape: 'rounded',
        fill_color: '#00f2ea',
        text_color: '#000000',
        border_enabled: false,
        border_color: '#ff0050',
        shadow_enabled: true,
        density: 'normal',
      },
      typography: {
        font: 'inter',
        text_color: '#ffffff',
      },
      motion: { enabled: true },
    },
    blockStyles: {
      variant: 'filled',
      font_style: 'normal',
      letter_spacing: 0,
      background_opacity: 1,
    },
  },
  {
    id: 'insta-aesthetic',
    name: 'Insta Aesthetic',
    category: 'social',
    description: 'Warm gradient with glass morphism',
    theme: {
      background: {
        type: 'gradient',
        solid_color: '#fef3c7',
        gradient_css: 'linear-gradient(135deg, #fef3c7 0%, #fcd34d 25%, #f97316 50%, #ec4899 75%, #8b5cf6 100%)',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0.2,
        source: null,
      },
      buttons: {
        shape: 'pill',
        fill_color: 'rgba(255,255,255,0.25)',
        text_color: '#ffffff',
        border_enabled: true,
        border_color: 'rgba(255,255,255,0.4)',
        shadow_enabled: false,
        density: 'normal',
      },
      typography: {
        font: 'inter',
        text_color: '#ffffff',
      },
      motion: { enabled: true },
    },
    blockStyles: {
      variant: 'glass',
      font_style: 'normal',
      letter_spacing: 0,
      background_opacity: 0.25,
      border_width: 1,
      border_color: 'rgba(255,255,255,0.4)',
    },
  },

  // Music Templates
  {
    id: 'vinyl-records',
    name: 'Vinyl Records',
    category: 'music',
    description: 'Retro warm tones with serif type',
    theme: {
      background: {
        type: 'solid',
        solid_color: '#1c1917',
        gradient_css: '',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0,
        source: null,
      },
      buttons: {
        shape: 'rounded',
        fill_color: '#fbbf24',
        text_color: '#1c1917',
        border_enabled: false,
        border_color: '#fbbf24',
        shadow_enabled: true,
        density: 'normal',
      },
      typography: {
        font: 'serif',
        text_color: '#fef3c7',
      },
      motion: { enabled: true },
    },
    blockStyles: {
      variant: 'filled',
      font_style: 'serif',
      letter_spacing: 0.02,
      background_opacity: 1,
    },
  },
  {
    id: 'edm-pulse',
    name: 'EDM Pulse',
    category: 'music',
    description: 'Electric purple with mono font',
    theme: {
      background: {
        type: 'gradient',
        solid_color: '#0a0a0a',
        gradient_css: 'linear-gradient(180deg, #0a0a0a 0%, #1e1b4b 50%, #4c1d95 100%)',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0,
        source: null,
      },
      buttons: {
        shape: 'square',
        fill_color: '#a78bfa',
        text_color: '#0a0a0a',
        border_enabled: true,
        border_color: '#a78bfa',
        shadow_enabled: true,
        density: 'normal',
      },
      typography: {
        font: 'mono',
        text_color: '#e9d5ff',
      },
      motion: { enabled: true },
    },
    blockStyles: {
      variant: 'filled',
      font_style: 'mono',
      letter_spacing: 0.05,
      background_opacity: 1,
    },
  },

  // Small Business Templates
  {
    id: 'local-shop',
    name: 'Local Shop',
    category: 'business',
    description: 'Warm and inviting for local businesses',
    theme: {
      background: {
        type: 'solid',
        solid_color: '#fef7ed',
        gradient_css: '',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0,
        source: null,
      },
      buttons: {
        shape: 'rounded',
        fill_color: '#9a3412',
        text_color: '#ffffff',
        border_enabled: false,
        border_color: '#9a3412',
        shadow_enabled: false,
        density: 'normal',
      },
      typography: {
        font: 'serif',
        text_color: '#451a03',
      },
      motion: { enabled: true },
    },
    blockStyles: {
      variant: 'filled',
      font_style: 'serif',
      letter_spacing: 0,
      background_opacity: 1,
    },
  },
  {
    id: 'corporate-clean',
    name: 'Corporate Clean',
    category: 'business',
    description: 'Professional and trustworthy',
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
        text_color: '#f8fafc',
        border_enabled: false,
        border_color: '#0f172a',
        shadow_enabled: true,
        density: 'normal',
      },
      typography: {
        font: 'inter',
        text_color: '#0f172a',
      },
      motion: { enabled: true },
    },
    blockStyles: {
      variant: 'filled',
      font_style: 'normal',
      letter_spacing: 0,
      background_opacity: 1,
    },
  },

  // Minimal Templates
  {
    id: 'pure-white',
    name: 'Pure White',
    category: 'minimal',
    description: 'Ultra-minimal white canvas',
    theme: {
      background: {
        type: 'solid',
        solid_color: '#ffffff',
        gradient_css: '',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0,
        source: null,
      },
      buttons: {
        shape: 'pill',
        fill_color: '#000000',
        text_color: '#ffffff',
        border_enabled: false,
        border_color: '#000000',
        shadow_enabled: false,
        density: 'normal',
      },
      typography: {
        font: 'inter',
        text_color: '#000000',
      },
      motion: { enabled: false },
    },
    blockStyles: {
      variant: 'filled',
      font_style: 'normal',
      letter_spacing: 0,
      background_opacity: 1,
    },
  },
  {
    id: 'outline-minimal',
    name: 'Outline Only',
    category: 'minimal',
    description: 'Clean outline buttons on white',
    theme: {
      background: {
        type: 'solid',
        solid_color: '#fafafa',
        gradient_css: '',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0,
        source: null,
      },
      buttons: {
        shape: 'rounded',
        fill_color: 'transparent',
        text_color: '#18181b',
        border_enabled: true,
        border_color: '#18181b',
        shadow_enabled: false,
        density: 'normal',
      },
      typography: {
        font: 'inter',
        text_color: '#18181b',
      },
      motion: { enabled: true },
    },
    blockStyles: {
      variant: 'outline',
      font_style: 'normal',
      letter_spacing: 0,
      background_opacity: 0,
      border_width: 1,
      border_color: '#18181b',
    },
  },

  // Bold Templates
  {
    id: 'electric-lime',
    name: 'Electric Lime',
    category: 'bold',
    description: 'Eye-catching lime green',
    theme: {
      background: {
        type: 'solid',
        solid_color: '#0a0a0a',
        gradient_css: '',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0,
        source: null,
      },
      buttons: {
        shape: 'square',
        fill_color: '#a3e635',
        text_color: '#0a0a0a',
        border_enabled: false,
        border_color: '#a3e635',
        shadow_enabled: true,
        density: 'roomy',
      },
      typography: {
        font: 'mono',
        text_color: '#a3e635',
      },
      motion: { enabled: true },
    },
    blockStyles: {
      variant: 'filled',
      font_style: 'mono',
      letter_spacing: 0.05,
      background_opacity: 1,
    },
  },
  {
    id: 'hot-coral',
    name: 'Hot Coral',
    category: 'bold',
    description: 'Vivid coral with high impact',
    theme: {
      background: {
        type: 'gradient',
        solid_color: '#fff1f2',
        gradient_css: 'linear-gradient(180deg, #fff1f2 0%, #fecdd3 100%)',
        image_url: '',
        overlay_color: '#000000',
        overlay_opacity: 0,
        source: null,
      },
      buttons: {
        shape: 'pill',
        fill_color: '#f43f5e',
        text_color: '#ffffff',
        border_enabled: false,
        border_color: '#f43f5e',
        shadow_enabled: true,
        density: 'roomy',
      },
      typography: {
        font: 'inter',
        text_color: '#881337',
      },
      motion: { enabled: true },
    },
    blockStyles: {
      variant: 'filled',
      font_style: 'normal',
      letter_spacing: 0.01,
      background_opacity: 1,
    },
  },
];

export function getTemplatesByCategory(category: TemplateCategory): TemplateDefinition[] {
  if (category === 'all') {
    return TEMPLATES;
  }
  return TEMPLATES.filter((t) => t.category === category);
}
