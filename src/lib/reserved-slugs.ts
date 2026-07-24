/**
 * SHORT.1 — reserved slugs + slug validation, the SINGLE source of truth for
 * what a custom short-link slug may be.
 *
 * The format rule mirrors the DB check constraint on
 * `custom_short_links.slug` (`^[a-z0-9-]{3,32}$`); keep the two in agreement.
 * Reserved values are app route prefixes and common words that must never be
 * claimable as a /s/:slug (they would shadow real routes or read as official).
 */

/** Must match the `custom_short_links.slug` CHECK constraint exactly. */
export const SLUG_PATTERN = /^[a-z0-9-]{3,32}$/;

/** Route prefixes + common/brand words that cannot be used as a slug. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // App route prefixes (see src/App.tsx)
  'api', 'dashboard', 'editor', 'go', 'l', 'login', 'onboarding', 'privacy',
  's', 'settings', 'setup', 'templates', 'terms', 'qr', 'short-links',
  // Common reserved words
  'about', 'account', 'admin', 'analytics', 'app', 'auth', 'billing', 'blog',
  'contact', 'docs', 'features', 'help', 'home', 'logout', 'pricing', 'profile',
  'root', 'signin', 'signup', 'support', 'titilinks', 'u', 'user', 'users',
  'www',
]);

/** Case-insensitive reserved check. */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase());
}

/** Why a slug was rejected, or null when it is valid. */
export type SlugError = 'format' | 'reserved';

/** Validate a candidate slug for format then reservation (format wins).
 *  Returns the failure reason, or null when the slug is acceptable. */
export function validateSlug(slug: string): SlugError | null {
  const value = slug.trim().toLowerCase();
  if (!SLUG_PATTERN.test(value)) return 'format';
  if (isReservedSlug(value)) return 'reserved';
  return null;
}
