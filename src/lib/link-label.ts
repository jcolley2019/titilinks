// TL.POLISH.1d — what a featured link is CALLED.
//
// A link's title is optional, and two things leave it useless: an empty title,
// and a title that IS the URL. The second is what a paste into both fields
// produces — all six of mecivietnam's links landed that way on 2026-08-19,
// showing "https://www.pinterest.com/pin/1084945366506614118/" where a human
// would have written "Pinterest".
//
// The ruling: a label that IS a URL is treated exactly like an empty label —
// at render time for rows already stored, and at save time for new ones.
//
// One home for the hostname logic: labelFromUrl used to live in
// LinksEditor.tsx (FL.11) and moved here unchanged, so the editor's save
// fallback and the public render agree by construction.

/**
 * Hostname of a URL-ish string, without a leading "www." — '' when it will not
 * parse. Never throws; callers pick their own fallback.
 */
function hostnameOf(value: string | null | undefined): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// A schemeless address: "pinterest.com", "www.pinterest.com/pin/1/",
// "mecivietnam.com/". Two deliberate narrowings keep human titles safe:
//   - lower case only, so "Node.js" or "Vogue.com" reads as a name, not a paste
//   - the last segment must be a letters-only TLD, so a version-ish title
//     ("v1.2", "1.5") is never mistaken for a domain
const BARE_DOMAIN = /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/|$)/;

/** True when the label is an address rather than a name. */
export function looksLikeUrl(label: string | null | undefined): boolean {
  const v = (label || '').trim();
  // Whitespace anywhere means prose ("Read my https://blog post"), not a paste.
  if (!v || /\s/.test(v)) return false;
  try {
    const u = new URL(v);
    if (u.protocol === 'http:' || u.protocol === 'https:') return true;
  } catch {
    // Not an absolute URL — fall through to the schemeless shape.
  }
  return BARE_DOMAIN.test(v);
}

/**
 * What the visitor should read on the button. An empty label, or one that is
 * itself a URL, becomes the link's hostname; anything else is the user's own
 * title and is returned untouched. Falls back to the raw label rather than
 * ever returning nothing for a label that had content.
 */
export function displayLabel(label: string | null | undefined, url?: string | null): string {
  const original = label ?? '';
  const raw = original.trim();
  if (raw && !looksLikeUrl(raw)) return original;
  return hostnameOf(url) || hostnameOf(raw) || original;
}

/**
 * FL.11 save-time fallback: a text link with no title shows its hostname
 * rather than nothing. Unparseable input returns as typed; empty returns
 * 'Link'. Behaviour is identical to the LinksEditor-local version it replaced.
 */
export function labelFromUrl(url: string | null | undefined): string {
  const raw = (url || '').trim();
  if (!raw) return 'Link';
  return hostnameOf(raw) || raw;
}
