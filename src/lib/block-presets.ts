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
 * Consumed today by the editor's Pages menu (ProfileDashboard). Onboarding and
 * the AI setup flow will read these same definitions, so updating a preset here
 * propagates everywhere — no per-surface copies that drift apart.
 *
 * Uses only real, wired block types (see `Enums<'block_type'>`). "Custom Events"
 * has no dedicated block type yet, so it composes content_section + links + CTA.
 */
export const BLOCK_PRESETS: BlockPreset[] = [
  {
    key: 'default',
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
  {
    key: 'social',
    label: 'Social Links',
    desc: 'A clean set focused on your links',
    blocks: [
      { type: 'bio', title: 'About' },
      { type: 'links', title: 'My Links' },
    ],
  },
  {
    key: 'store',
    label: 'New Merch / Store',
    desc: 'Set up for selling products',
    blocks: [
      { type: 'primary_cta', title: 'Shop Now' },
      { type: 'product_cards', title: 'Products' },
      { type: 'gallery', title: 'Gallery' },
    ],
  },
  {
    key: 'events',
    label: 'Custom Events',
    desc: 'Share event details and RSVP links',
    blocks: [
      { type: 'content_section', title: 'Event Details' },
      { type: 'links', title: 'RSVP & Tickets' },
      { type: 'primary_cta', title: 'Get Tickets' },
    ],
  },
  {
    key: 'forms',
    label: 'Forms',
    desc: 'Capture contact info from visitors',
    blocks: [
      { type: 'email_subscribe', title: 'Get in Touch' },
      { type: 'content_section', title: 'Details' },
    ],
  },
];
