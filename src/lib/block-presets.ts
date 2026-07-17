import type { Enums } from '@/integrations/supabase/types';

// A block type a preset can create — the canonical Supabase `block_type` enum.
export type PresetBlockType = Enums<'block_type'>;

export interface PresetBlock {
  type: PresetBlockType;
  title: string;
}

export interface BlockPreset {
  key: string;
  /** Display name shown in the picker. */
  label: string;
  /** One-line description shown under the label. */
  desc: string;
  /** Content blocks this preset creates, in order. Header social blocks
   *  (social_links / social_icon_row) are never part of a preset and are
   *  preserved when a preset is applied. */
  blocks: PresetBlock[];
}

/**
 * Shared preset registry — the SINGLE source of truth for "preset → blocks".
 *
 * Consumed by the editor's Pages menu (ProfileDashboard) as the "reset this
 * page to the default blocks" set, by onboarding's Page 1 seed, and by
 * ensureSecondPage's born-complete Page 2 seed. One definition, so the default
 * composition can't drift between where it's applied.
 *
 * FIX.P2: the four alternate presets (Social Links / New Merch / Custom Events
 * / Forms) were ratified DEAD (Joey, July 2026). `default` is the only preset;
 * `BLOCK_PRESETS` stays an array so its consumers (find-by-key, map) are
 * unchanged. Uses only real, wired block types (see `Enums<'block_type'>`).
 */
export const DEFAULT_PRESET_KEY = 'default';

export const BLOCK_PRESETS: BlockPreset[] = [
  {
    key: DEFAULT_PRESET_KEY,
    label: 'Default',
    desc: "All link cards — turn off the ones you don't want",
    blocks: [
      { type: 'primary_cta', title: 'Primary CTA' },
      { type: 'links', title: 'Links' },
      { type: 'product_cards', title: 'Products' },
      { type: 'gallery', title: 'Gallery' },
      { type: 'video_feed', title: 'Videos' },
      { type: 'bio', title: 'About' },
    ],
  },
];
