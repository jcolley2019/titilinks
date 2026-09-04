/**
 * TL.HANDLE.1 — reserved-word + format floor on page handles, the SINGLE
 * source of truth for what a `pages.handle` / `profiles.username` may be.
 *
 * AUDIT_rev6 #5: handle entry checked uniqueness only. A handle that reads as
 * official ("admin", "support", "titilinks") or that shadows a real route
 * ("settings", "templates") was claimable, and `pages.handle` carried a UNIQUE
 * index but no CHECK — so the server accepted anything a client sent.
 *
 * The format rule mirrors the DB check constraints `pages_handle_rules` and
 * `profiles_username_rules` (see handle1.sql /
 * supabase/migrations/20260904130000_handle1_reserved_and_format.sql); keep the
 * three in agreement. `RESERVED_SQL_ARRAY` below is the literal the constraints
 * embed, generated from the same set the client checks.
 *
 * This is a superset of the short-link rules: every reserved slug is also a
 * reserved handle (a /s/:slug word must not be claimable as a /:handle either),
 * plus brand and system words that only matter at the top level.
 */

import { RESERVED_SLUGS } from './reserved-slugs';

/** 3–30 chars, lowercase alnum + hyphen, no leading/trailing hyphen.
 *  Must match the `pages_handle_rules` CHECK constraint exactly. */
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/** Brand and system words that must never be claimable as a page handle.
 *  Route prefixes and the common reserved words live in RESERVED_SLUGS. */
const HANDLE_ONLY_RESERVED = [
  // Brand — a handle that reads as us
  'titi', 'titilink', 'titiactriz',
  // Authority words — a handle that reads as staff
  'official', 'staff', 'team', 'mod', 'moderator', 'security', 'legal', 'press',
  // System words — a handle that reads as a status page or a JS bug
  'status', 'null', 'undefined',
] as const;

/** RESERVED_SLUGS ∪ the brand/system words above. */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  ...RESERVED_SLUGS,
  ...HANDLE_ONLY_RESERVED,
]);

/** The reserved list, sorted, for stable output (SQL, tests, docs). */
export const RESERVED_HANDLE_LIST: readonly string[] =
  [...RESERVED_HANDLES].sort();

/** The reserved list as a Postgres text[] literal, for the CHECK constraints.
 *  Every member is `[a-z0-9-]` only, so no quote escaping is possible — but we
 *  assert that rather than assume it, so a future entry with a quote in it
 *  fails loudly here instead of silently producing broken SQL. */
export const RESERVED_SQL_ARRAY: string = (() => {
  for (const w of RESERVED_HANDLE_LIST) {
    if (!/^[a-z0-9-]+$/.test(w)) {
      throw new Error(`reserved handle "${w}" is not SQL-literal safe`);
    }
  }
  return `array[${RESERVED_HANDLE_LIST.map((w) => `'${w}'`).join(', ')}]`;
})();

/** Case-insensitive reserved check (input is normalised first). */
export function isReservedHandle(handle: string): boolean {
  return RESERVED_HANDLES.has(handle.trim().toLowerCase());
}

/** Why a handle was rejected, or null when it is valid. */
export type HandleError = 'format' | 'reserved';

/**
 * Validate a candidate handle: format first, then reservation.
 *
 * The input is trimmed and lowercased before both checks, so 'Titi' takes the
 * lowercased path and comes back 'reserved' (not 'format') — the entry field
 * lowercases as you type, and the DB stores lowercase, so an uppercase
 * candidate is a casing artefact of the input, never a distinct handle.
 *
 * Returns the failure reason, or null when the handle is acceptable.
 */
export function validateHandle(handle: string): HandleError | null {
  const value = handle.trim().toLowerCase();
  if (!HANDLE_PATTERN.test(value)) return 'format';
  if (isReservedHandle(value)) return 'reserved';
  return null;
}
