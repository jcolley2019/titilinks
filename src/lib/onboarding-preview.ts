// TL.ONB.STAGE.2 — the desktop onboarding phone preview for steps 1-3, which
// run BEFORE pages.insert. Pure; feeds EditableProfileView an in-memory page +
// blocks that match what step 3 will create. Preview only: nothing here writes.
//
// buildOnboardingTheme is the SINGLE source of the theme literal: OnboardingFlow's
// two write sites (update-existing and insert-new) call it, and the preview reads
// it, so what the phone shows and what the DB gets can never drift.
import { BLOCK_PRESETS } from './block-presets';
import type { OnboardingState } from '@/components/onboarding/useOnboardingWizard';
import type { BlockWithItems } from '@/components/blocks/types';
import type { ThemeTypography } from '@/lib/theme-defaults';
import type { Tables } from '@/integrations/supabase/types';

/** The in-memory page's id / mode id. Never a real row — nothing queries by it. */
export const PREVIEW_PAGE_ID = 'onboarding-preview';

/**
 * The theme literal step 3 writes, lifted verbatim from OnboardingFlow.
 *
 * Map the Vibe choice into the theme background. A gradient goes into
 * gradient_css with type:'gradient'; solid_color always keeps a real hex
 * (the gradient's top color) so the hero photo's fade-out stays valid —
 * a gradient string in solid_color produced an invalid nested gradient
 * and silently killed the hero fade.
 */
export function buildOnboardingTheme(state: OnboardingState) {
  const isGradient = state.backgroundType === 'gradient';
  const backgroundJson = {
    type: isGradient ? ('gradient' as const) : ('solid' as const),
    solid_color: isGradient ? state.gradientStart : (state.backgroundColor || '#0e0c09'),
    gradient_css: isGradient ? `linear-gradient(135deg, ${state.gradientStart}, ${state.gradientEnd})` : '',
    image_url: '',
    overlay_color: '#000000',
    overlay_opacity: 0.5,
    source: null,
  };

  // Auto-contrast: dark name/text on light backgrounds, white on dark, so a
  // light Vibe color never makes the name invisible. Gradients average their
  // two stops.
  const lum = (hex: string): number => {
    const m = (hex || '').replace('#', '');
    if (m.length < 6) return 0;
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return 0;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };
  const bgLum = isGradient ? (lum(state.gradientStart) + lum(state.gradientEnd)) / 2 : lum(state.backgroundColor);
  const textColor = bgLum > 0.6 ? '#0e0c09' : '#ffffff';

  // Full-bleed archetype default: outline buttons with a soft
  // translucent white fill (theme.buttons keys LinkButton honors).
  // Users refine in the editor. Hero pages write none.
  const fbButtons = state.pageStyle === 'full_bleed' ? {
    variant: 'glass',
    shape: state.buttonShape,
    background_opacity: 0.35,
    fill_color: '#FFFFFF',
    text_color: '#FFFFFF',
    border_enabled: true,
    border_color: '#FFFFFF',
  } : null;

  return {
    background: backgroundJson,
    ...(fbButtons ? { buttons: fbButtons } : {}),
    buttonStyle: state.buttonStyle,
    typography: { font: state.fontChoice as ThemeTypography['font'], text_color: textColor },
    pageStyle: state.pageStyle,
    linkLayout: state.linkLayout,
    linkCount: state.linkCount,
  };
}

/**
 * The page row step 3 will insert, as an in-memory object the preview can render.
 *
 * `placeholders` fills the phone on step 1, before the user has typed anything:
 * without it the hero renders a bare "@". They are preview-only — nothing here
 * is ever written, so a page still inserts the user's own (empty) values.
 */
export function buildPreviewPage(
  state: OnboardingState,
  userId: string,
  placeholders?: { name: string; handle: string },
): Tables<'pages'> {
  return {
    id: PREVIEW_PAGE_ID,
    user_id: userId,
    handle: state.username.trim().toLowerCase() || placeholders?.handle || '',
    display_name: state.displayName || placeholders?.name || null,
    avatar_url: state.avatarPreview,
    avatar_original_url: state.avatarOriginalUrl,
    bio: null,
    theme_json: buildOnboardingTheme(state),
    goal_primary_offer_item_id: null,
    goal_secondary_item_id: null,
    created_at: '',
    updated_at: '',
  };
}

type PreviewItemSeed = {
  label: string;
  url: string;
  subtitle?: string;
  badge?: string;
  size?: string;
};

function previewBlock(
  type: Tables<'blocks'>['type'],
  title: string,
  orderIndex: number,
  seeds: PreviewItemSeed[],
): BlockWithItems {
  const id = `onb-${type}`;
  return {
    id,
    mode_id: PREVIEW_PAGE_ID,
    type,
    title,
    is_enabled: true,
    order_index: orderIndex,
    created_at: '',
    updated_at: '',
    items: seeds.map((seed, i) => ({
      id: `${id}-${i}`,
      block_id: id,
      label: seed.label,
      url: seed.url,
      subtitle: seed.subtitle ?? null,
      badge: seed.badge ?? null,
      size: seed.size ?? null,
      order_index: i,
      archived_at: null,
      bg_color: null,
      compare_at_price: null,
      created_at: '',
      cta_label: null,
      currency: null,
      ends_at: null,
      image_url: null,
      is_adult: null,
      price: null,
      starts_at: null,
      style_json: null,
      title_color: null,
      updated_at: '',
    })),
  };
}

/**
 * The blocks step 3 will create: the social_links header block, the picked
 * preset's blocks, then email_subscribe + social_icon_row — with exactly the
 * placeholder items prefillBlockContent seeds. The literals below are the same
 * strings that function inserts; scripts/onb-preview.test.mjs re-reads
 * OnboardingFlow.tsx and fails if either side drifts.
 */
export function buildPreviewBlocks(state: OnboardingState): BlockWithItems[] {
  const preset = BLOCK_PRESETS.find((p) => p.key === state.selectedPreset) ?? BLOCK_PRESETS[0];
  // links — full-bleed pages carry the onboarding size choice
  const linkSize = state.pageStyle === 'full_bleed' ? state.buttonSize : undefined;

  const seedsFor = (type: string): PreviewItemSeed[] => {
    if (type === 'primary_cta') {
      return [{
        label: 'Shop My Collection',
        url: 'https://example.com/shop',
        subtitle: 'New arrivals every week',
        badge: 'NEW',
      }];
    }
    if (type === 'links') {
      return [
        { label: 'My Website', url: 'https://example.com', subtitle: 'Check out my website', size: linkSize },
        { label: 'Latest Blog Post', url: 'https://example.com/blog', subtitle: 'Read my latest content', size: linkSize },
        { label: 'Work With Me', url: 'https://example.com/contact', subtitle: 'Collaborations & partnerships', badge: 'OPEN', size: linkSize },
      ];
    }
    if (type === 'product_cards') {
      return [
        { label: 'Product One', url: 'https://example.com/product-1', subtitle: 'Your best seller', badge: 'SALE' },
        { label: 'Product Two', url: 'https://example.com/product-2', subtitle: 'New arrival' },
        { label: 'Product Three', url: 'https://example.com/product-3', subtitle: 'Fan favorite' },
      ];
    }
    return [];
  };

  // ONB.7g: social platforms are never seeded — the icon row shows only what
  // the user picks in the Links step. These rows are the user's own picks,
  // which step 4 writes with an empty url.
  const social = previewBlock(
    'social_links',
    'Social Links',
    0,
    state.selectedSocialPlatforms.map((platform) => ({ label: platform, url: '' })),
  );

  const presetBlocks = preset.blocks.map((b, i) => previewBlock(b.type, b.title, i + 1, seedsFor(b.type)));

  const tail = presetBlocks.length + 1;
  const emailSubscribe = previewBlock('email_subscribe', 'Email Subscribe', tail, [{
    label: 'Stay up to date',
    url: '#',
    subtitle: 'Thanks for subscribing!',
    badge: JSON.stringify({
      title: 'Stay up to date',
      placeholder: 'your@email.com',
      button_label: 'Subscribe',
      success_message: 'Thanks for subscribing!',
      redirect_url: '',
      collect_name: false,
      name_placeholder: 'Your name',
    }),
  }]);

  // ONB.7g-b: the social_icon_row block is created EMPTY — icons come only
  // from the user's step-4 picks, never from seeded placeholders.
  const socialIconRow = previewBlock('social_icon_row', 'Social Icons', tail + 1, []);

  return [social, ...presetBlocks, emailSubscribe, socialIconRow];
}
