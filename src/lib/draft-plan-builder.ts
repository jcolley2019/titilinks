// Deterministic draft plan builder
// No LLM required - pure data transformation

import {
  type CreatorType,
  type Tone,
  type BlockType,
  type SubstitutionMap,
  getTemplate,
  ItemKeys,
} from './page-plan-templates';
import { generateBios, generateFallbackBios, type GeneratedBios } from './bio-generator';
import { ITEM_CAPS, isValidUrl as checkValidUrl, sanitizeHandle } from './validation';

// Input from AI setup intake form
export interface IntakeData {
  // Required fields
  handle: string;
  display_name: string;
  creator_type: CreatorType;
  tone: Tone;
  personal_website_url: string;
  primary_offer_url: string;
  creator_program_url: string;

  // Optional social URLs
  social_tiktok?: string;
  social_instagram?: string;
  social_youtube?: string;
  social_facebook?: string;
  social_facebook_group?: string;
  social_snapchat?: string;
  social_kick?: string;
  social_twitch?: string;
  social_discord?: string;
  social_x?: string;
  social_spotify?: string;
  social_apple_music?: string;

  // Featured media (up to 3)
  featured_media_1?: string;
  featured_media_2?: string;
  featured_media_3?: string;

  // Products (up to 6)
  product_1_url?: string;
  product_1_title?: string;
  product_2_url?: string;
  product_2_title?: string;
  product_3_url?: string;
  product_3_title?: string;
  product_4_url?: string;
  product_4_title?: string;
  product_5_url?: string;
  product_5_title?: string;
  product_6_url?: string;
  product_6_title?: string;
}

// Draft plan item
export interface DraftItem {
  item_key: string;
  label: string;
  url: string;
  subtitle?: string;
  badge?: string;
}

// Draft plan block
export interface DraftBlock {
  type: BlockType;
  title: string;
  is_enabled: boolean;
  order_index: number;
  items: DraftItem[];
}

// Draft plan mode
export interface DraftMode {
  type: 'shop' | 'recruit';
  blocks: DraftBlock[];
}

// Complete draft plan
export interface DraftPlan {
  handle: string;
  display_name: string;
  bio_short: string;
  bio_long: string;
  creator_type: CreatorType;
  tone: Tone;
  shop_mode: DraftMode;
  recruit_mode: DraftMode;
  goal_primary_offer_item_key: string;
  goal_recruit_item_key: string;
}

// Build result type
export type BuildResult =
  | { success: true; plan: DraftPlan }
  | { success: false; error: string };

// Block item caps - use shared constants
const BLOCK_CAPS: Partial<Record<BlockType, number>> = {
  featured_media: ITEM_CAPS.featured_media,
  product_cards: ITEM_CAPS.product_cards,
};

// Convert intake data to substitution map
function buildSubstitutionMap(intake: IntakeData): SubstitutionMap {
  return {
    PERSONAL_WEBSITE_URL: intake.personal_website_url || '',
    PRIMARY_OFFER_URL: intake.primary_offer_url || '',
    CREATOR_PROGRAM_URL: intake.creator_program_url || '',
    SOCIAL_TIKTOK: intake.social_tiktok,
    SOCIAL_INSTAGRAM: intake.social_instagram,
    SOCIAL_YOUTUBE: intake.social_youtube,
    SOCIAL_FACEBOOK: intake.social_facebook,
    SOCIAL_FACEBOOK_GROUP: intake.social_facebook_group,
    SOCIAL_SNAPCHAT: intake.social_snapchat,
    SOCIAL_KICK: intake.social_kick,
    SOCIAL_TWITCH: intake.social_twitch,
    SOCIAL_DISCORD: intake.social_discord,
    SOCIAL_X: intake.social_x,
    SOCIAL_SPOTIFY: intake.social_spotify,
    SOCIAL_APPLE_MUSIC: intake.social_apple_music,
    FEATURED_MEDIA_1: intake.featured_media_1,
    FEATURED_MEDIA_2: intake.featured_media_2,
    FEATURED_MEDIA_3: intake.featured_media_3,
    PRODUCT_1_URL: intake.product_1_url,
    PRODUCT_1_TITLE: intake.product_1_title,
    PRODUCT_2_URL: intake.product_2_url,
    PRODUCT_2_TITLE: intake.product_2_title,
    PRODUCT_3_URL: intake.product_3_url,
    PRODUCT_3_TITLE: intake.product_3_title,
    PRODUCT_4_URL: intake.product_4_url,
    PRODUCT_4_TITLE: intake.product_4_title,
    PRODUCT_5_URL: intake.product_5_url,
    PRODUCT_5_TITLE: intake.product_5_title,
    PRODUCT_6_URL: intake.product_6_url,
    PRODUCT_6_TITLE: intake.product_6_title,
  };
}

// Resolve placeholder to actual value
function resolvePlaceholder(placeholder: string, subs: SubstitutionMap): string | null {
  const match = placeholder.match(/^\{\{(\w+)\}\}$/);
  if (!match) {
    // Not a placeholder, return as-is
    return placeholder;
  }

  const key = match[1] as keyof SubstitutionMap;
  const value = subs[key];

  if (!value || value.trim() === '') {
    return null;
  }

  return value.trim();
}

// Check if URL is valid and non-empty
function isValidUrl(url: string | null | undefined): url is string {
  if (!url || url.trim() === '') return false;
  // Check if it's still a placeholder
  if (url.startsWith('{{') && url.endsWith('}}')) return false;
  // Check if it has a valid protocol
  return url.startsWith('http://') || url.startsWith('https://');
}

// Build draft plan from intake data
export function buildDraftPlan(intake: IntakeData): BuildResult {
  // Step 1: Select template by creator_type
  const template = getTemplate(intake.creator_type);
  if (!template) {
    return { success: false, error: `Unknown creator type: ${intake.creator_type}` };
  }

  // Build substitution map
  const subs = buildSubstitutionMap(intake);

  // Track required keys
  let hasShopPrimaryOffer = false;
  let hasRecruitPrimaryApply = false;

  // Process a mode template into a draft mode
  const processMode = (
    modeType: 'shop' | 'recruit',
    modeTemplate: typeof template.shop_mode
  ): DraftMode => {
    const draftBlocks: DraftBlock[] = [];

    modeTemplate.blocks.forEach((blockTemplate, blockIndex) => {
      const draftItems: DraftItem[] = [];

      // Process each item in the block
      for (const itemTemplate of blockTemplate.items) {
        // Step 2: Fill placeholders
        const resolvedUrl = resolvePlaceholder(itemTemplate.url_placeholder, subs);
        
        // Step 3: Prune items where URL is missing/empty
        if (!isValidUrl(resolvedUrl)) {
          continue;
        }

        // Resolve label (might be a placeholder for product titles)
        let label = itemTemplate.label;
        if (label.startsWith('{{') && label.endsWith('}}')) {
          const resolvedLabel = resolvePlaceholder(label, subs);
          // If title placeholder is empty, generate a default label
          if (!resolvedLabel) {
            // Extract item number from key for better default labels
            const numMatch = itemTemplate.item_key.match(/\d+$/);
            label = numMatch ? `Product ${numMatch[0]}` : 'Product';
          } else {
            label = resolvedLabel;
          }
        }

        // Track required keys
        if (itemTemplate.item_key === ItemKeys.SHOP_PRIMARY_OFFER) {
          hasShopPrimaryOffer = true;
        }
        if (itemTemplate.item_key === ItemKeys.RECRUIT_PRIMARY_APPLY) {
          hasRecruitPrimaryApply = true;
        }

        draftItems.push({
          item_key: itemTemplate.item_key,
          label,
          url: resolvedUrl,
          subtitle: itemTemplate.subtitle,
          badge: itemTemplate.badge,
        });
      }

      // Step 5: Enforce caps
      const cap = BLOCK_CAPS[blockTemplate.type];
      const cappedItems = cap ? draftItems.slice(0, cap) : draftItems;

      // Step 4: If block has 0 items after pruning, set is_enabled=false
      const isEnabled = cappedItems.length > 0;

      draftBlocks.push({
        type: blockTemplate.type,
        title: blockTemplate.title,
        is_enabled: isEnabled,
        order_index: blockIndex,
        items: cappedItems,
      });
    });

    return {
      type: modeType,
      blocks: draftBlocks,
    };
  };

  // Process both modes
  const shopMode = processMode('shop', template.shop_mode);
  const recruitMode = processMode('recruit', template.recruit_mode);

  // Step 6: If required keys are missing, ensure placeholder blocks exist (disabled)
  // This allows pages to be created even without all URLs filled in

  // Build the complete draft plan with fallback bios
  // AI bios can be added later via enhancePlanWithAIBios()
  const fallbackBios = generateFallbackBios({
    display_name: intake.display_name,
    creator_type: intake.creator_type,
    tone: intake.tone,
  });

  const plan: DraftPlan = {
    handle: intake.handle.toLowerCase().trim(),
    display_name: intake.display_name.trim(),
    bio_short: fallbackBios.bio_short,
    bio_long: fallbackBios.bio_long,
    creator_type: intake.creator_type,
    tone: intake.tone,
    shop_mode: shopMode,
    recruit_mode: recruitMode,
    goal_primary_offer_item_key: ItemKeys.SHOP_PRIMARY_OFFER,
    goal_recruit_item_key: ItemKeys.RECRUIT_PRIMARY_APPLY,
  };

  return { success: true, plan };
}

/**
 * Enhance a draft plan with AI-generated bios
 * This is optional and can be skipped if AI is unavailable
 */
export async function enhancePlanWithAIBios(plan: DraftPlan): Promise<DraftPlan> {
  try {
    const bios = await generateBios({
      display_name: plan.display_name,
      creator_type: plan.creator_type,
      tone: plan.tone,
    });

    return {
      ...plan,
      bio_short: bios.bio_short,
      bio_long: bios.bio_long,
    };
  } catch (error) {
    console.error('Failed to enhance plan with AI bios:', error);
    return plan; // Return original plan if AI fails
  }
}

// Utility to count enabled blocks
export function countEnabledBlocks(mode: DraftMode): number {
  return mode.blocks.filter((b) => b.is_enabled).length;
}

// Utility to count total items across all blocks
export function countTotalItems(mode: DraftMode): number {
  return mode.blocks.reduce((sum, block) => sum + block.items.length, 0);
}

// Utility to get block by type
export function getBlockByType(mode: DraftMode, type: BlockType): DraftBlock | undefined {
  return mode.blocks.find((b) => b.type === type);
}

// Utility to find item by key across all blocks in a mode
export function findItemByKey(mode: DraftMode, itemKey: string): DraftItem | undefined {
  for (const block of mode.blocks) {
    const item = block.items.find((i) => i.item_key === itemKey);
    if (item) return item;
  }
  return undefined;
}

// Validate intake data before building
export function validateIntakeData(intake: Partial<IntakeData>): string[] {
  const errors: string[] = [];

  if (!intake.handle || intake.handle.trim() === '') {
    errors.push('Handle is required');
  } else if (!/^[a-zA-Z0-9_]+$/.test(intake.handle)) {
    errors.push('Handle can only contain letters, numbers, and underscores');
  }

  if (!intake.display_name || intake.display_name.trim() === '') {
    errors.push('Display name is required');
  }

  if (!intake.creator_type) {
    errors.push('Creator type is required');
  }

  if (!intake.tone) {
    errors.push('Tone is required');
  }

  // personal_website_url, primary_offer_url, creator_program_url are now optional

  return errors;
}
