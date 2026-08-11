// TL.SEC.XSS.1 — the render-time URL guard.
//
// Why this exists: every stored destination (block_items.url, a block config's
// redirect_url or view_all_url, a short link's target) is owner-writable under
// RLS, and the editor's validateUrl is a UX affordance rather than a security
// boundary — a direct PostgREST write never runs it. A stored `javascript:`
// URI that reaches an href or a location assignment executes in the titilinks
// origin the moment a visitor clicks it.
//
// So this is the LAST thing between stored data and the DOM. It does not
// replace input validation; it backstops it, on the assumption that anything
// in the database may have been written by something other than our editor.

/** The only schemes a stored destination may carry. Everything else is refused. */
const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
]);

/**
 * The sanitized form of a stored destination, or undefined if it has none.
 *
 * Returns the URL unchanged when its scheme is allowed. Returns undefined for
 * an empty string, an unparseable one, or a dangerous scheme (javascript:,
 * data:, vbscript:, file:, ...).
 *
 * undefined is the deliberate refusal value: React omits an href set to
 * undefined entirely, so a refused URL renders an inert anchor rather than a
 * live one — the same shape ADULT.2a already uses when it strips a gated href.
 * Callers driving a navigation sink (location.href, location.replace,
 * window.open) must treat undefined as "do not navigate" and fall back to
 * their existing error state.
 *
 * The scheme is read from the PARSED url.protocol, never a string prefix. The
 * URL parser strips the tabs and newlines that an obfuscated "java&#9;script:"
 * hides behind and lowercases the result, so both normalize before the check.
 * url.protocol is also why the returned value is the original string: parsing
 * proves the scheme, but re-serializing would rewrite stored URLs (a bare
 * origin gains a trailing slash), and the browser re-parses the same string
 * with the same algorithm anyway.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    return ALLOWED_PROTOCOLS.has(parsed.protocol) ? trimmed : undefined;
  } catch {
    // Not an absolute URL — relative paths included. Refuse rather than guess
    // at a base; every caller here stores absolute destinations.
    return undefined;
  }
}
