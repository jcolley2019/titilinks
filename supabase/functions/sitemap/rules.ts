// sitemap content rule (TL.SEO.SITEMAP.3c) — pure, no imports, so the Deno
// test can pin it without a database.
//
// Every new page is born with placeholder items (OnboardingFlow seeds
// example.com links, a '#' subscribe row and url-less social icons; the
// tpl-presets compositions seed url '' / image_url '' and wa.me links with no
// number), so "has an item" is true for everyone. An item only counts as
// content when it points somewhere real or carries a picture, and never when
// it sits on a social / subscribe block (TL.SEO.SITEMAP.3d).

// Placeholder hosts: example.com and every subdomain of it.
const PLACEHOLDER_HOST = "example.com";
// A WhatsApp deep link needs a number in the path; the bare host is a seed.
const WHATSAPP_HOSTS = new Set(["wa.me", "api.whatsapp.com"]);

// TL.SEO.SITEMAP.3d (product ruling): social rows are not page content — a
// page of nothing but social icons and a subscribe box is not worth indexing.
export const SOCIAL_BLOCK_TYPES = new Set(["social_links", "social_icon_row", "email_subscribe"]);

/** True when the item points at a real destination or carries an image, on a non-social block. */
export function isContentItem(item: { url: string | null; image_url: string | null }, blockType: string): boolean {
  if (SOCIAL_BLOCK_TYPES.has(blockType)) return false;
  return isRealDestination(item.url) || (item.image_url ?? "").trim() !== "";
}

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
