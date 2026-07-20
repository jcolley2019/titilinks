/**
 * AIS.0b — the guided checklist's REALITY layer.
 *
 * The success screen's checkmarks are not state — they are a READING of the
 * page. There is no `checklist_progress` table and no localStorage: an item is
 * checked iff the page's own data satisfies it, so a check can never drift from
 * what the visitor actually sees. Reopen the wizard after adding a WhatsApp
 * number and that row is simply true.
 *
 * Everything here is pure (no supabase, no React) so every rule is unit-testable
 * in scripts/ais-checklist.test.mjs. The caller (PageSetupWizard) is responsible
 * for gathering the `PageReality` snapshot; this module only judges it and says
 * where each item routes.
 *
 * Relative import (not the `@/` alias) so this module stays loadable under
 * `tsx` for the guard suite — matching the ais-recommend / tpl-presets convention.
 */
import { isWhatsAppUrl } from './whatsapp';

/** Where a checklist row sends the user when tapped. */
export type ChecklistRoute =
  /** Open a block editor in the dashboard panel (optionally straight to one item). */
  | {
      kind: 'block';
      blockType: 'social_links' | 'primary_cta' | 'product_cards' | 'links';
      titleKey: string;
      /** Set by the caller to open one item's detail view (WA.1's wa.me link). */
      itemId?: string | null;
    }
  /** Open the Video Profile menu (hero video lives in theme_json, not a block). */
  | { kind: 'videoProfile' }
  /** Informational only — nothing to open yet. */
  | { kind: 'none' };

/**
 * A flat snapshot of the page, gathered once per success-screen mount. Kept
 * primitive on purpose: the judging rules below stay trivially testable, and the
 * gathering side is free to source each field however it likes.
 */
export interface PageReality {
  /** Number of items in the social_links block (0 when the block is absent). */
  socialCount: number;
  /** pages.avatar_url — the still profile photo. */
  avatarUrl: string | null;
  /** Resolved hero video for the active page (theme_json.heroConfig.video). */
  heroVideoUrl: string | null;
  /** url of the seeded wa.me item in the links block, if one exists. */
  whatsappUrl: string | null;
  /** block_items.id of that wa.me item — the direct-edit target for WA.1. */
  whatsappItemId: string | null;
  /** url on the primary_cta block's single item. */
  primaryCtaUrl: string | null;
  /** Number of items in the product_cards block. */
  productCount: number;
}

/** An empty page — the safe default while the snapshot is still loading. */
export const EMPTY_REALITY: PageReality = {
  socialCount: 0,
  avatarUrl: null,
  heroVideoUrl: null,
  whatsappUrl: null,
  whatsappItemId: null,
  primaryCtaUrl: null,
  productCount: 0,
};

/**
 * Does a wa.me link actually carry a phone number? The presets seed a BARE
 * `https://wa.me/` (and sometimes `https://wa.me/?text=...`), which looks like a
 * WhatsApp link but reaches nobody — so the rule is the digits between `wa.me/`
 * and the query string, not the mere presence of the link.
 */
export function whatsappHasNumber(url: string | null | undefined): boolean {
  const raw = (url || '').trim();
  if (!raw || !isWhatsAppUrl(raw)) return false;
  // Path segment after wa.me/, stopping at ? # or a further /.
  const m = raw.match(/wa\.me\/([^?#/]*)/i);
  if (!m) return false;
  return m[1].replace(/\D/g, '').length > 0;
}

/** A non-empty, non-whitespace url counts as "set". */
function hasUrl(url: string | null | undefined): boolean {
  return (url || '').trim().length > 0;
}

/**
 * The single source of truth for a checklist row's checked state. Ids match
 * ChecklistItem.id from ais-recommend.ts. Unknown / informational ids are never
 * checked — `payout` has nothing to satisfy yet.
 */
export function isChecklistItemDone(id: string, reality: PageReality): boolean {
  switch (id) {
    case 'socials':
      return reality.socialCount > 0;
    case 'profileMedia':
      // Either half satisfies it — a still photo OR a hero video.
      return hasUrl(reality.avatarUrl) || hasUrl(reality.heroVideoUrl);
    case 'whatsapp':
      return whatsappHasNumber(reality.whatsappUrl);
    case 'bookingCta':
      return hasUrl(reality.primaryCtaUrl);
    case 'products':
      return reality.productCount > 0;
    default:
      return false;
  }
}

/**
 * Where each checklist id routes. `payout` is deliberately inert — payouts are
 * not built yet, so that row renders as informational (no chevron, no tap)
 * rather than lying about a destination.
 */
export const CHECKLIST_ROUTES: Record<string, ChecklistRoute> = {
  socials: { kind: 'block', blockType: 'social_links', titleKey: 'dashboard.managePlatforms' },
  profileMedia: { kind: 'videoProfile' },
  whatsapp: { kind: 'block', blockType: 'links', titleKey: 'dashboard.featuredLinks' },
  bookingCta: { kind: 'block', blockType: 'primary_cta', titleKey: 'dashboard.primaryCta' },
  products: { kind: 'block', blockType: 'product_cards', titleKey: 'dashboard.newMerch' },
  payout: { kind: 'none' },
};

/** Route for an id; unknown ids are inert rather than throwing. */
export function routeForChecklistItem(id: string): ChecklistRoute {
  return CHECKLIST_ROUTES[id] ?? { kind: 'none' };
}

/** True when the row is a dead end (renders flat: no chevron, not tappable). */
export function isInformationalItem(id: string): boolean {
  return routeForChecklistItem(id).kind === 'none';
}
