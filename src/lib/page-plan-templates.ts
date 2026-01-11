// Template library for PagePlan drafts keyed by creator_type
// These templates are brand-agnostic and use placeholders

export type CreatorType = 
  | 'streaming_tiktok'
  | 'gamer'
  | 'fitness'
  | 'musician'
  | 'affiliate_marketer'
  | 'adult_creator';

export type Tone = 'professional' | 'friendly' | 'bold' | 'minimal' | 'funny';

export type BlockType = 'primary_cta' | 'product_cards' | 'featured_media' | 'social_links' | 'links';

// Placeholder tokens for URL substitution
export const Placeholders = {
  PERSONAL_WEBSITE_URL: '{{PERSONAL_WEBSITE_URL}}',
  PRIMARY_OFFER_URL: '{{PRIMARY_OFFER_URL}}',
  CREATOR_PROGRAM_URL: '{{CREATOR_PROGRAM_URL}}',
  SOCIAL_TIKTOK: '{{SOCIAL_TIKTOK}}',
  SOCIAL_INSTAGRAM: '{{SOCIAL_INSTAGRAM}}',
  SOCIAL_YOUTUBE: '{{SOCIAL_YOUTUBE}}',
  SOCIAL_FACEBOOK: '{{SOCIAL_FACEBOOK}}',
  SOCIAL_FACEBOOK_GROUP: '{{SOCIAL_FACEBOOK_GROUP}}',
  SOCIAL_SNAPCHAT: '{{SOCIAL_SNAPCHAT}}',
  SOCIAL_KICK: '{{SOCIAL_KICK}}',
  SOCIAL_TWITCH: '{{SOCIAL_TWITCH}}',
  SOCIAL_DISCORD: '{{SOCIAL_DISCORD}}',
  SOCIAL_X: '{{SOCIAL_X}}',
  SOCIAL_SPOTIFY: '{{SOCIAL_SPOTIFY}}',
  SOCIAL_APPLE_MUSIC: '{{SOCIAL_APPLE_MUSIC}}',
  FEATURED_MEDIA_1: '{{FEATURED_MEDIA_1}}',
  FEATURED_MEDIA_2: '{{FEATURED_MEDIA_2}}',
  FEATURED_MEDIA_3: '{{FEATURED_MEDIA_3}}',
  PRODUCT_1_URL: '{{PRODUCT_1_URL}}',
  PRODUCT_1_TITLE: '{{PRODUCT_1_TITLE}}',
  PRODUCT_2_URL: '{{PRODUCT_2_URL}}',
  PRODUCT_2_TITLE: '{{PRODUCT_2_TITLE}}',
  PRODUCT_3_URL: '{{PRODUCT_3_URL}}',
  PRODUCT_3_TITLE: '{{PRODUCT_3_TITLE}}',
  PRODUCT_4_URL: '{{PRODUCT_4_URL}}',
  PRODUCT_4_TITLE: '{{PRODUCT_4_TITLE}}',
  PRODUCT_5_URL: '{{PRODUCT_5_URL}}',
  PRODUCT_5_TITLE: '{{PRODUCT_5_TITLE}}',
  PRODUCT_6_URL: '{{PRODUCT_6_URL}}',
  PRODUCT_6_TITLE: '{{PRODUCT_6_TITLE}}',
} as const;

// Stable item keys for tracking and goal assignment
export const ItemKeys = {
  // Primary actions
  SHOP_PRIMARY_OFFER: 'shop_primary_offer',
  RECRUIT_PRIMARY_APPLY: 'recruit_primary_apply',
  
  // Products
  PROD_1: 'prod_1',
  PROD_2: 'prod_2',
  PROD_3: 'prod_3',
  PROD_4: 'prod_4',
  PROD_5: 'prod_5',
  PROD_6: 'prod_6',
  
  // Featured media
  MEDIA_1: 'media_1',
  MEDIA_2: 'media_2',
  MEDIA_3: 'media_3',
  
  // Social platforms
  SOCIAL_TIKTOK: 'social_tiktok',
  SOCIAL_INSTAGRAM: 'social_instagram',
  SOCIAL_YOUTUBE: 'social_youtube',
  SOCIAL_FACEBOOK: 'social_facebook',
  SOCIAL_FACEBOOK_GROUP: 'social_facebook_group',
  SOCIAL_SNAPCHAT: 'social_snapchat',
  SOCIAL_KICK: 'social_kick',
  SOCIAL_TWITCH: 'social_twitch',
  SOCIAL_DISCORD: 'social_discord',
  SOCIAL_X: 'social_x',
  SOCIAL_SPOTIFY: 'social_spotify',
  SOCIAL_APPLE_MUSIC: 'social_apple_music',
  
  // Links
  LINK_PERSONAL: 'link_personal',
  LINK_CREATOR_PROGRAM: 'link_creator_program',
} as const;

export interface TemplateItem {
  item_key: string;
  label: string;
  url_placeholder: string;
  subtitle?: string;
  badge?: string;
  is_optional?: boolean;
}

export interface TemplateBlock {
  type: BlockType;
  title: string;
  is_optional?: boolean;
  items: TemplateItem[];
}

export interface ModeTemplate {
  blocks: TemplateBlock[];
}

export interface ProfileTemplate {
  display_name_suggestion: string;
  bio_suggestion: string;
}

export interface PagePlanTemplate {
  creator_type: CreatorType;
  profile: ProfileTemplate;
  shop_mode: ModeTemplate;
  recruit_mode: ModeTemplate;
}

// Social links block template (shared across modes)
const createSocialLinksBlock = (platforms: string[]): TemplateBlock => ({
  type: 'social_links',
  title: 'Connect With Me',
  is_optional: true,
  items: platforms.map((platform) => ({
    item_key: `social_${platform.toLowerCase()}`,
    label: platform,
    url_placeholder: Placeholders[`SOCIAL_${platform.toUpperCase()}` as keyof typeof Placeholders] || '',
    is_optional: true,
  })),
});

// Featured media block template
const createFeaturedMediaBlock = (title: string): TemplateBlock => ({
  type: 'featured_media',
  title,
  is_optional: true,
  items: [
    { item_key: ItemKeys.MEDIA_1, label: 'Featured Content 1', url_placeholder: Placeholders.FEATURED_MEDIA_1, is_optional: true },
    { item_key: ItemKeys.MEDIA_2, label: 'Featured Content 2', url_placeholder: Placeholders.FEATURED_MEDIA_2, is_optional: true },
    { item_key: ItemKeys.MEDIA_3, label: 'Featured Content 3', url_placeholder: Placeholders.FEATURED_MEDIA_3, is_optional: true },
  ],
});

// Product cards block template
const createProductCardsBlock = (title: string): TemplateBlock => ({
  type: 'product_cards',
  title,
  is_optional: true,
  items: [
    { item_key: ItemKeys.PROD_1, label: Placeholders.PRODUCT_1_TITLE, url_placeholder: Placeholders.PRODUCT_1_URL, is_optional: true },
    { item_key: ItemKeys.PROD_2, label: Placeholders.PRODUCT_2_TITLE, url_placeholder: Placeholders.PRODUCT_2_URL, is_optional: true },
    { item_key: ItemKeys.PROD_3, label: Placeholders.PRODUCT_3_TITLE, url_placeholder: Placeholders.PRODUCT_3_URL, is_optional: true },
    { item_key: ItemKeys.PROD_4, label: Placeholders.PRODUCT_4_TITLE, url_placeholder: Placeholders.PRODUCT_4_URL, is_optional: true },
    { item_key: ItemKeys.PROD_5, label: Placeholders.PRODUCT_5_TITLE, url_placeholder: Placeholders.PRODUCT_5_URL, is_optional: true },
    { item_key: ItemKeys.PROD_6, label: Placeholders.PRODUCT_6_TITLE, url_placeholder: Placeholders.PRODUCT_6_URL, is_optional: true },
  ],
});

// Template definitions by creator type
export const PagePlanTemplates: Record<CreatorType, PagePlanTemplate> = {
  streaming_tiktok: {
    creator_type: 'streaming_tiktok',
    profile: {
      display_name_suggestion: 'Your Creator Name',
      bio_suggestion: 'Content creator sharing lifestyle, tips & exclusive deals ✨',
    },
    shop_mode: {
      blocks: [
        {
          type: 'primary_cta',
          title: 'Primary Offer',
          items: [
            {
              item_key: ItemKeys.SHOP_PRIMARY_OFFER,
              label: 'Shop My Favorites',
              url_placeholder: Placeholders.PRIMARY_OFFER_URL,
              subtitle: 'Exclusive deals just for you',
            },
          ],
        },
        createProductCardsBlock('My Top Picks'),
        createFeaturedMediaBlock('Latest Content'),
        createSocialLinksBlock(['TikTok', 'Instagram', 'YouTube', 'Snapchat', 'X']),
        {
          type: 'links',
          title: 'More Links',
          items: [
            { item_key: ItemKeys.LINK_PERSONAL, label: 'My Website', url_placeholder: Placeholders.PERSONAL_WEBSITE_URL },
          ],
        },
      ],
    },
    recruit_mode: {
      blocks: [
        {
          type: 'primary_cta',
          title: 'Join My Team',
          items: [
            {
              item_key: ItemKeys.RECRUIT_PRIMARY_APPLY,
              label: 'Become a Creator',
              url_placeholder: Placeholders.CREATOR_PROGRAM_URL,
              subtitle: 'Join my affiliate program',
            },
          ],
        },
        createFeaturedMediaBlock('Success Stories'),
        createSocialLinksBlock(['TikTok', 'Instagram', 'Discord']),
        {
          type: 'links',
          title: 'Learn More',
          items: [
            { item_key: ItemKeys.LINK_PERSONAL, label: 'About Me', url_placeholder: Placeholders.PERSONAL_WEBSITE_URL },
            { item_key: ItemKeys.LINK_CREATOR_PROGRAM, label: 'Program Details', url_placeholder: Placeholders.CREATOR_PROGRAM_URL },
          ],
        },
      ],
    },
  },

  gamer: {
    creator_type: 'gamer',
    profile: {
      display_name_suggestion: 'Your Gamer Tag',
      bio_suggestion: 'Pro gamer & streamer | Check out my gear & join my community 🎮',
    },
    shop_mode: {
      blocks: [
        {
          type: 'primary_cta',
          title: 'My Setup',
          items: [
            {
              item_key: ItemKeys.SHOP_PRIMARY_OFFER,
              label: 'Shop My Gaming Gear',
              url_placeholder: Placeholders.PRIMARY_OFFER_URL,
              subtitle: 'The exact setup I use',
            },
          ],
        },
        createProductCardsBlock('My Gaming Setup'),
        createFeaturedMediaBlock('Stream Highlights'),
        createSocialLinksBlock(['Twitch', 'Kick', 'YouTube', 'Discord', 'X']),
        {
          type: 'links',
          title: 'More Links',
          items: [
            { item_key: ItemKeys.LINK_PERSONAL, label: 'My Website', url_placeholder: Placeholders.PERSONAL_WEBSITE_URL },
          ],
        },
      ],
    },
    recruit_mode: {
      blocks: [
        {
          type: 'primary_cta',
          title: 'Join the Team',
          items: [
            {
              item_key: ItemKeys.RECRUIT_PRIMARY_APPLY,
              label: 'Join My Affiliate Program',
              url_placeholder: Placeholders.CREATOR_PROGRAM_URL,
              subtitle: 'Earn while you game',
            },
          ],
        },
        createFeaturedMediaBlock('Team Highlights'),
        createSocialLinksBlock(['Discord', 'Twitch']),
        {
          type: 'links',
          title: 'Learn More',
          items: [
            { item_key: ItemKeys.LINK_CREATOR_PROGRAM, label: 'Program Benefits', url_placeholder: Placeholders.CREATOR_PROGRAM_URL },
          ],
        },
      ],
    },
  },

  fitness: {
    creator_type: 'fitness',
    profile: {
      display_name_suggestion: 'Your Fitness Name',
      bio_suggestion: 'Certified trainer helping you achieve your fitness goals 💪',
    },
    shop_mode: {
      blocks: [
        {
          type: 'primary_cta',
          title: 'Start Your Journey',
          items: [
            {
              item_key: ItemKeys.SHOP_PRIMARY_OFFER,
              label: 'Shop My Supplements',
              url_placeholder: Placeholders.PRIMARY_OFFER_URL,
              subtitle: 'What I use daily',
            },
          ],
        },
        createProductCardsBlock('My Favorites'),
        createFeaturedMediaBlock('Workout Videos'),
        createSocialLinksBlock(['Instagram', 'TikTok', 'YouTube', 'Facebook']),
        {
          type: 'links',
          title: 'Resources',
          items: [
            { item_key: ItemKeys.LINK_PERSONAL, label: 'Training Programs', url_placeholder: Placeholders.PERSONAL_WEBSITE_URL },
          ],
        },
      ],
    },
    recruit_mode: {
      blocks: [
        {
          type: 'primary_cta',
          title: 'Become a Coach',
          items: [
            {
              item_key: ItemKeys.RECRUIT_PRIMARY_APPLY,
              label: 'Join My Coaching Team',
              url_placeholder: Placeholders.CREATOR_PROGRAM_URL,
              subtitle: 'Build your fitness business',
            },
          ],
        },
        createFeaturedMediaBlock('Coach Success Stories'),
        createSocialLinksBlock(['Instagram', 'Facebook_Group']),
        {
          type: 'links',
          title: 'Opportunity',
          items: [
            { item_key: ItemKeys.LINK_CREATOR_PROGRAM, label: 'Learn About the Opportunity', url_placeholder: Placeholders.CREATOR_PROGRAM_URL },
          ],
        },
      ],
    },
  },

  musician: {
    creator_type: 'musician',
    profile: {
      display_name_suggestion: 'Your Artist Name',
      bio_suggestion: 'Making music that moves you 🎵 New single out now!',
    },
    shop_mode: {
      blocks: [
        {
          type: 'primary_cta',
          title: 'Listen Now',
          items: [
            {
              item_key: ItemKeys.SHOP_PRIMARY_OFFER,
              label: 'Stream My Music',
              url_placeholder: Placeholders.PRIMARY_OFFER_URL,
              subtitle: 'Available on all platforms',
            },
          ],
        },
        createProductCardsBlock('Merch Store'),
        createFeaturedMediaBlock('Music Videos'),
        createSocialLinksBlock(['Spotify', 'Apple_Music', 'YouTube', 'Instagram', 'TikTok']),
        {
          type: 'links',
          title: 'More',
          items: [
            { item_key: ItemKeys.LINK_PERSONAL, label: 'Official Website', url_placeholder: Placeholders.PERSONAL_WEBSITE_URL },
          ],
        },
      ],
    },
    recruit_mode: {
      blocks: [
        {
          type: 'primary_cta',
          title: 'Collaborate',
          items: [
            {
              item_key: ItemKeys.RECRUIT_PRIMARY_APPLY,
              label: 'Work With Me',
              url_placeholder: Placeholders.CREATOR_PROGRAM_URL,
              subtitle: 'Booking & collaborations',
            },
          ],
        },
        createFeaturedMediaBlock('Past Collaborations'),
        createSocialLinksBlock(['Instagram', 'X']),
        {
          type: 'links',
          title: 'Inquiries',
          items: [
            { item_key: ItemKeys.LINK_CREATOR_PROGRAM, label: 'Booking Info', url_placeholder: Placeholders.CREATOR_PROGRAM_URL },
          ],
        },
      ],
    },
  },

  affiliate_marketer: {
    creator_type: 'affiliate_marketer',
    profile: {
      display_name_suggestion: 'Your Brand Name',
      bio_suggestion: 'Helping you discover amazing products at the best prices 🛍️',
    },
    shop_mode: {
      blocks: [
        {
          type: 'primary_cta',
          title: "Today's Deal",
          items: [
            {
              item_key: ItemKeys.SHOP_PRIMARY_OFFER,
              label: 'Shop My Recommendations',
              url_placeholder: Placeholders.PRIMARY_OFFER_URL,
              subtitle: 'Curated just for you',
              badge: 'HOT',
            },
          ],
        },
        createProductCardsBlock('Top Deals'),
        createFeaturedMediaBlock('Product Reviews'),
        createSocialLinksBlock(['TikTok', 'Instagram', 'YouTube', 'Facebook_Group']),
        {
          type: 'links',
          title: 'More Deals',
          items: [
            { item_key: ItemKeys.LINK_PERSONAL, label: 'All Deals', url_placeholder: Placeholders.PERSONAL_WEBSITE_URL },
          ],
        },
      ],
    },
    recruit_mode: {
      blocks: [
        {
          type: 'primary_cta',
          title: 'Start Earning',
          items: [
            {
              item_key: ItemKeys.RECRUIT_PRIMARY_APPLY,
              label: 'Join My Team',
              url_placeholder: Placeholders.CREATOR_PROGRAM_URL,
              subtitle: 'Learn to earn online',
            },
          ],
        },
        createFeaturedMediaBlock('Team Success'),
        createSocialLinksBlock(['Facebook_Group', 'Instagram']),
        {
          type: 'links',
          title: 'Get Started',
          items: [
            { item_key: ItemKeys.LINK_CREATOR_PROGRAM, label: 'How It Works', url_placeholder: Placeholders.CREATOR_PROGRAM_URL },
          ],
        },
      ],
    },
  },

  adult_creator: {
    creator_type: 'adult_creator',
    profile: {
      display_name_suggestion: 'Your Creator Name',
      bio_suggestion: 'Exclusive content creator ✨ Premium access below',
    },
    shop_mode: {
      blocks: [
        {
          type: 'primary_cta',
          title: 'Exclusive Access',
          items: [
            {
              item_key: ItemKeys.SHOP_PRIMARY_OFFER,
              label: 'Subscribe Now',
              url_placeholder: Placeholders.PRIMARY_OFFER_URL,
              subtitle: 'Unlock premium content',
            },
          ],
        },
        createFeaturedMediaBlock('Preview'),
        createSocialLinksBlock(['Instagram', 'X', 'Snapchat']),
        {
          type: 'links',
          title: 'Other Platforms',
          items: [
            { item_key: ItemKeys.LINK_PERSONAL, label: 'More Content', url_placeholder: Placeholders.PERSONAL_WEBSITE_URL },
          ],
        },
      ],
    },
    recruit_mode: {
      blocks: [
        {
          type: 'primary_cta',
          title: 'Become a Creator',
          items: [
            {
              item_key: ItemKeys.RECRUIT_PRIMARY_APPLY,
              label: 'Start Creating',
              url_placeholder: Placeholders.CREATOR_PROGRAM_URL,
              subtitle: 'Join my referral program',
            },
          ],
        },
        createSocialLinksBlock(['X', 'Instagram']),
        {
          type: 'links',
          title: 'Learn More',
          items: [
            { item_key: ItemKeys.LINK_CREATOR_PROGRAM, label: 'Program Details', url_placeholder: Placeholders.CREATOR_PROGRAM_URL },
          ],
        },
      ],
    },
  },
};

// Helper function to get template by creator type
export function getTemplate(creatorType: CreatorType): PagePlanTemplate {
  return PagePlanTemplates[creatorType];
}

// Helper function to get all available creator types
export function getCreatorTypes(): { value: CreatorType; label: string }[] {
  return [
    { value: 'streaming_tiktok', label: 'Streaming / TikTok Creator' },
    { value: 'gamer', label: 'Gamer' },
    { value: 'fitness', label: 'Fitness Creator' },
    { value: 'musician', label: 'Musician' },
    { value: 'affiliate_marketer', label: 'Affiliate Marketer' },
    { value: 'adult_creator', label: 'Adult Creator' },
  ];
}

// Interface for resolved plan after placeholder substitution
export interface ResolvedItem {
  item_key: string;
  label: string;
  url: string;
  subtitle?: string;
  badge?: string;
}

export interface ResolvedBlock {
  type: BlockType;
  title: string;
  items: ResolvedItem[];
}

export interface ResolvedMode {
  blocks: ResolvedBlock[];
}

export interface ResolvedPagePlan {
  handle: string;
  display_name: string;
  bio: string;
  creator_type: CreatorType;
  tone: Tone;
  shop_mode: ResolvedMode;
  recruit_mode: ResolvedMode;
  goal_primary_offer_item_key: string;
  goal_recruit_item_key: string;
}

// Substitution map interface
export interface SubstitutionMap {
  PERSONAL_WEBSITE_URL?: string;
  PRIMARY_OFFER_URL?: string;
  CREATOR_PROGRAM_URL?: string;
  SOCIAL_TIKTOK?: string;
  SOCIAL_INSTAGRAM?: string;
  SOCIAL_YOUTUBE?: string;
  SOCIAL_FACEBOOK?: string;
  SOCIAL_FACEBOOK_GROUP?: string;
  SOCIAL_SNAPCHAT?: string;
  SOCIAL_KICK?: string;
  SOCIAL_TWITCH?: string;
  SOCIAL_DISCORD?: string;
  SOCIAL_X?: string;
  SOCIAL_SPOTIFY?: string;
  SOCIAL_APPLE_MUSIC?: string;
  FEATURED_MEDIA_1?: string;
  FEATURED_MEDIA_2?: string;
  FEATURED_MEDIA_3?: string;
  PRODUCT_1_URL?: string;
  PRODUCT_1_TITLE?: string;
  PRODUCT_2_URL?: string;
  PRODUCT_2_TITLE?: string;
  PRODUCT_3_URL?: string;
  PRODUCT_3_TITLE?: string;
  PRODUCT_4_URL?: string;
  PRODUCT_4_TITLE?: string;
  PRODUCT_5_URL?: string;
  PRODUCT_5_TITLE?: string;
  PRODUCT_6_URL?: string;
  PRODUCT_6_TITLE?: string;
}

// Helper to substitute placeholders in a string
function substitutePlaceholder(template: string, substitutions: SubstitutionMap): string | null {
  // Check if it's a placeholder
  const match = template.match(/^\{\{(\w+)\}\}$/);
  if (match) {
    const key = match[1] as keyof SubstitutionMap;
    const value = substitutions[key];
    return value && value.trim() !== '' ? value : null;
  }
  return template;
}

// Resolve a template into a concrete plan with actual URLs
export function resolveTemplate(
  template: PagePlanTemplate,
  substitutions: SubstitutionMap,
  profile: { handle: string; display_name: string; bio?: string; tone: Tone }
): ResolvedPagePlan {
  const resolveMode = (modeTemplate: ModeTemplate): ResolvedMode => {
    const resolvedBlocks: ResolvedBlock[] = [];

    for (const block of modeTemplate.blocks) {
      const resolvedItems: ResolvedItem[] = [];

      for (const item of block.items) {
        const resolvedUrl = substitutePlaceholder(item.url_placeholder, substitutions);
        
        // Skip optional items without URLs
        if (!resolvedUrl && item.is_optional) {
          continue;
        }
        
        // For required items, use placeholder URL if not provided
        const url = resolvedUrl || item.url_placeholder;
        
        // Resolve label (might be a placeholder for product titles)
        let label = item.label;
        if (label.startsWith('{{') && label.endsWith('}}')) {
          const resolvedLabel = substitutePlaceholder(label, substitutions);
          label = resolvedLabel || `Item ${item.item_key}`;
        }

        resolvedItems.push({
          item_key: item.item_key,
          label,
          url,
          subtitle: item.subtitle,
          badge: item.badge,
        });
      }

      // Only include blocks with items
      if (resolvedItems.length > 0 || !block.is_optional) {
        resolvedBlocks.push({
          type: block.type,
          title: block.title,
          items: resolvedItems,
        });
      }
    }

    return { blocks: resolvedBlocks };
  };

  return {
    handle: profile.handle,
    display_name: profile.display_name,
    bio: profile.bio || template.profile.bio_suggestion,
    creator_type: template.creator_type,
    tone: profile.tone,
    shop_mode: resolveMode(template.shop_mode),
    recruit_mode: resolveMode(template.recruit_mode),
    goal_primary_offer_item_key: ItemKeys.SHOP_PRIMARY_OFFER,
    goal_recruit_item_key: ItemKeys.RECRUIT_PRIMARY_APPLY,
  };
}
