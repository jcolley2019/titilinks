/**
 * Tracking-pixel ID shapes — the single source of truth for both the editor's
 * loose field validation (PIXELS.1) and the strict charset the public injector
 * is allowed to place into an inline <script>.
 *
 * Two layers on purpose:
 *  - VALIDATE: loose, market-shaped formats. Used by the editor to nudge the
 *    creator when an ID is clearly malformed. Empty is always allowed (a blank
 *    field means "no pixel" / clear).
 *  - SAFE: a strict allowlist enforced at the injection boundary. Even if a
 *    value slips past the editor (or is written straight to the DB), only these
 *    characters can reach the DOM, so a pixel ID can never break out of its
 *    string literal — no quotes, angle brackets, semicolons, or whitespace.
 */

export type PixelKind = 'meta' | 'tiktok' | 'ga4';

// Loose, market-shaped validation (Meta ~15-16 digits; TikTok alphanumeric;
// GA4 G-XXXXXXXXXX). Intentionally forgiving — a false reject is worse than a
// slightly-off ID the platform will simply ignore.
const VALIDATE: Record<PixelKind, RegExp> = {
  meta: /^\d{15,16}$/,
  tiktok: /^[A-Za-z0-9]{6,40}$/,
  ga4: /^G-[A-Za-z0-9]{4,12}$/i,
};

// Strict charset allowlist for injection. Broader length bounds than VALIDATE
// (we never want to silently drop a valid-but-unusual ID) but a hard character
// class: digits only / alphanumerics only / `G-` + alphanumerics.
const SAFE: Record<PixelKind, RegExp> = {
  meta: /^\d{1,32}$/,
  tiktok: /^[A-Za-z0-9]{1,64}$/,
  ga4: /^G-[A-Za-z0-9]{1,32}$/i,
};

/** True if `value` is an acceptable ID for `kind`. Empty counts as valid. */
export function isValidPixelId(kind: PixelKind, value: string): boolean {
  const v = value.trim();
  return v === '' || VALIDATE[kind].test(v);
}

/**
 * The injection-safe form of an ID, or null if it must not be injected. Null is
 * returned for empty/missing values AND for anything failing the SAFE charset —
 * the injector treats null as "no pixel".
 */
export function safePixelId(kind: PixelKind, value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  return SAFE[kind].test(v) ? v : null;
}
