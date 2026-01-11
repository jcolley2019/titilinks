// Persist a DraftPlan to the database
// Creates Page, Modes, Blocks, and BlockItems

import { supabase } from '@/integrations/supabase/client';
import type { DraftPlan, DraftBlock, DraftItem } from './draft-plan-builder';
import { ItemKeys } from './page-plan-templates';

export interface PersistResult {
  success: boolean;
  pageId?: string;
  error?: string;
}

/**
 * Persist a draft plan to the database
 * Creates all necessary records and sets up goals
 */
export async function persistDraftPlan(
  plan: DraftPlan,
  userId: string
): Promise<PersistResult> {
  try {
    // 1. Create the Page
    const { data: pageData, error: pageError } = await supabase
      .from('pages')
      .insert({
        user_id: userId,
        handle: plan.handle,
        display_name: plan.display_name,
        bio: plan.bio_long, // Use long bio as main bio
      })
      .select('id')
      .single();

    if (pageError) {
      console.error('Failed to create page:', pageError);
      return { success: false, error: `Failed to create page: ${pageError.message}` };
    }

    const pageId = pageData.id;

    // 2. Create Shop and Recruit modes
    const { data: modesData, error: modesError } = await supabase
      .from('modes')
      .insert([
        { page_id: pageId, type: 'shop' as const },
        { page_id: pageId, type: 'recruit' as const },
      ])
      .select('id, type');

    if (modesError) {
      console.error('Failed to create modes:', modesError);
      // Attempt cleanup
      await supabase.from('pages').delete().eq('id', pageId);
      return { success: false, error: `Failed to create modes: ${modesError.message}` };
    }

    const shopMode = modesData.find((m) => m.type === 'shop');
    const recruitMode = modesData.find((m) => m.type === 'recruit');

    if (!shopMode || !recruitMode) {
      return { success: false, error: 'Failed to create modes' };
    }

    // Track item IDs for goal assignment
    const itemKeyToId: Record<string, string> = {};

    // 3. Create blocks and items for Shop mode
    await createBlocksAndItems(shopMode.id, plan.shop_mode.blocks, itemKeyToId);

    // 4. Create blocks and items for Recruit mode
    await createBlocksAndItems(recruitMode.id, plan.recruit_mode.blocks, itemKeyToId);

    // 5. Update Page with goal item IDs
    const primaryOfferItemId = itemKeyToId[ItemKeys.SHOP_PRIMARY_OFFER] || null;
    const recruitItemId = itemKeyToId[ItemKeys.RECRUIT_PRIMARY_APPLY] || null;

    if (primaryOfferItemId || recruitItemId) {
      const { error: updateError } = await supabase
        .from('pages')
        .update({
          goal_primary_offer_item_id: primaryOfferItemId,
          goal_recruit_item_id: recruitItemId,
        })
        .eq('id', pageId);

      if (updateError) {
        console.error('Failed to update goals:', updateError);
        // Non-fatal, continue
      }
    }

    return { success: true, pageId };
  } catch (error) {
    console.error('Error persisting draft plan:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create blocks and their items for a mode
 */
async function createBlocksAndItems(
  modeId: string,
  blocks: DraftBlock[],
  itemKeyToId: Record<string, string>
): Promise<void> {
  for (const block of blocks) {
    // Create block
    const { data: blockData, error: blockError } = await supabase
      .from('blocks')
      .insert({
        mode_id: modeId,
        type: block.type,
        title: block.title,
        is_enabled: block.is_enabled,
        order_index: block.order_index,
      })
      .select('id')
      .single();

    if (blockError) {
      console.error('Failed to create block:', blockError);
      continue;
    }

    // Create items for this block
    if (block.items.length > 0) {
      const itemsToInsert = block.items.map((item, index) => ({
        block_id: blockData.id,
        label: item.label,
        url: item.url,
        subtitle: item.subtitle || null,
        badge: item.badge || null,
        order_index: index,
      }));

      const { data: itemsData, error: itemsError } = await supabase
        .from('block_items')
        .insert(itemsToInsert)
        .select('id');

      if (itemsError) {
        console.error('Failed to create block items:', itemsError);
        continue;
      }

      // Map item keys to their database IDs
      if (itemsData) {
        block.items.forEach((item, index) => {
          if (itemsData[index]) {
            itemKeyToId[item.item_key] = itemsData[index].id;
          }
        });
      }
    }
  }
}

/**
 * Check if a handle is available
 */
export async function checkHandleAvailable(handle: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('pages')
    .select('id')
    .eq('handle', handle.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error('Error checking handle:', error);
    return false;
  }

  return !data;
}
