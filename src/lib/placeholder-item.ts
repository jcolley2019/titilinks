// TL.PUB.SAMPLES.1 — a visitor never sees a sample item.
//
// Every new page is seeded with sample blocks and items (OnboardingFlow,
// tpl-presets) so the creator can scroll the editor and see what each block
// looks like, toggle blocks off, or replace the samples. That stays. But an
// item whose destination is still a placeholder is dropped at the three public
// data boundaries: PublicProfile's fetch, the editor's visitor preview
// (Editor.tsx visitorBlocks) and the no-JS SEO summary (middleware.ts). A
// destination-type block left with none reaches neither — see
// dropEmptyDestinationBlocks — so it leaves no empty renderer and no flex gap.
// A non-destination block (bio, text, video_feed, email_subscribe, events,
// gallery) is content on its own and is kept regardless. The edit canvas
// keeps showing the samples.
//
// Pure and import-free: middleware.ts bundles it for the edge runtime.

// ── Verbatim copy of supabase/functions/sitemap/rules.ts ───────────────────
// The Deno function and the app cannot share a module, so the two constants
// and isRealDestination below are copied character for character. Guard
// invariant PLACEHOLDER-RULE-PARITY fails the build if the copies drift:
// change both or neither.

// Placeholder hosts: example.com and every subdomain of it.
const PLACEHOLDER_HOST = "example.com";
// A WhatsApp deep link needs a number in the path; the bare host is a seed.
const WHATSAPP_HOSTS = new Set(["wa.me", "api.whatsapp.com"]);

function isRealDestination(raw: string | null): boolean {
  const u = (raw ?? "").trim();
  if (!u || u === "#") return false;
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return false;
  }
  // Mirrors the editors' validateUrl (src/lib/validation.ts): only http(s)
  // saves, so mailto:/tel:/anything else is not a destination we list.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (host === PLACEHOLDER_HOST || host.endsWith(`.${PLACEHOLDER_HOST}`)) return false;
  if (WHATSAPP_HOSTS.has(host) && parsed.pathname === "/") return false;
  return true;
}
// ── end verbatim copy ──────────────────────────────────────────────────────

type ItemDestination = { url: string | null; image_url: string | null };

/** True when the item has no real destination AND no image — a seeded sample. */
export function isPlaceholderItem(item: ItemDestination): boolean {
  return !isRealDestination(item.url) && (item.image_url ?? '').trim() === '';
}

// The block types whose items ARE destinations — a link, a CTA, a product, a
// social profile, a media card. Every one of their editors requires a valid
// URL, so an item here without a real one is a sample. The other types hold
// items that are content with no destination and must never be filtered:
// email_subscribe's row is its form config (url '#' unless a redirect is set),
// bio's row is the bio text (url ''), an event's ticket link and poster are
// both optional, and gallery / video_feed / text are not link items at all.
const SAMPLE_BEARING_TYPES: ReadonlySet<string> = new Set([
  'primary_cta',
  'links',
  'social_links',
  'product_cards',
  'featured_media',
  'hero_card',
  'social_icon_row',
  'content_section',
  'carousel',
]);

/** True when this item, in a block of this type, is a sample a visitor must not see. */
export function isSampleItem(blockType: string, item: ItemDestination): boolean {
  return SAMPLE_BEARING_TYPES.has(blockType) && isPlaceholderItem(item);
}

/** How many of this block's items are samples — the edit canvas tags a block while it holds any (TL.EDIT.SAMPLETAG.1). */
export function countSampleItems(block: { type: string; items: ItemDestination[] }): number {
  return block.items.filter((item) => isSampleItem(block.type, item)).length;
}

/**
 * A destination-type block (its items ARE the SAMPLE_BEARING_TYPES above) left
 * with zero items is dropped entirely rather than kept empty — an empty block
 * still occupies a flex slot and leaves a gap even though its renderer returns
 * null. Non-destination types (bio, text, video_feed, email_subscribe, events,
 * gallery) are content in their own right and are never dropped for being
 * "empty" — an event with no ticket link is still an event.
 */
export function dropEmptyDestinationBlocks<B extends { type: string; items: unknown[] }>(blocks: B[]): B[] {
  return blocks.filter((block) => block.items.length > 0 || !SAMPLE_BEARING_TYPES.has(block.type));
}

/** Each block with its sample items removed, and left-empty destination blocks dropped. */
export function stripSampleItems<B extends { type: string; items: ItemDestination[] }>(blocks: B[]): B[] {
  return dropEmptyDestinationBlocks(
    blocks.map((block) => ({
      ...block,
      items: block.items.filter((item) => !isSampleItem(block.type, item)),
    })),
  );
}
