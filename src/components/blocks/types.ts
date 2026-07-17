import type { Tables } from '@/integrations/supabase/types';
import type { ThemeJson } from '@/lib/theme-defaults';

export type Block = Tables<'blocks'>;
export type BlockItem = Tables<'block_items'>;

export interface BlockWithItems extends Block {
  items: BlockItem[];
}

/**
 * Outbound link click handler.
 * Returns true to allow navigation, false to prevent
 * (e.g., when adult-content interstitial needs user confirmation).
 */
export type ClickHandler = (
  blockType: string,
  blockId: string,
  itemId: string,
  url: string,
  isAdult?: boolean
) => boolean;

export interface ThemedBlockProps {
  block: BlockWithItems;
  onOutboundClick: ClickHandler;
  theme: ThemeJson;
  /** ADULT.2a: gated items keep their URL out of the DOM in public/view mode.
   *  Edit mode is exempt — the threat model is the public page, and the editor
   *  needs its real links. */
  editMode?: boolean;
}
