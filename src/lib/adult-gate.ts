// ADULT.2a — 18+ gating primitives.
//
// Why this exists: Instagram's crawlers follow bio links and flag the pages
// they land on; TikTok hard-blocks pages whose DOM carries adult domains. A
// raw OnlyFans href on a TitiLinks page therefore endangers the CREATOR'S own
// social accounts, not just the visitor's experience. Click-time
// preventDefault does nothing about that — a crawler never clicks, it reads
// attributes. So gated URLs must never reach the DOM in public/view mode;
// they travel in JS state and open via window.open on an explicit 18+
// confirmation.
//
// The adult platform set derives from PLATFORM_CATALOG's 'ADULT (18+)'
// category. It is never a hardcoded list — adding a platform to that category
// is the only step required to gate it everywhere.

import { PLATFORM_CATALOG } from './platform-catalog';
import { platformFromUrl } from './platform-from-url';

const ADULT_CATEGORY = 'ADULT (18+)';

/** Labels of every platform in the catalog's ADULT (18+) category. */
export const ADULT_PLATFORM_LABELS: ReadonlySet<string> = new Set(
  (PLATFORM_CATALOG.find((c) => c.label === ADULT_CATEGORY)?.platforms ?? []).map((p) => p.label)
);

const norm = (s: string) => s.toLowerCase().trim();
const ADULT_NORMALIZED: ReadonlySet<string> = new Set([...ADULT_PLATFORM_LABELS].map(norm));

/** True when a platform label belongs to the catalog's ADULT (18+) category. */
export function isAdultPlatformLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return ADULT_NORMALIZED.has(norm(label));
}

/**
 * True when a URL's host resolves to a platform in the ADULT (18+) category.
 *
 * Derived, never hardcoded: platformFromUrl owns host->label, the catalog owns
 * label->category. Both stay single sources. A platform in the ADULT category
 * that platformFromUrl has no host pattern for cannot domain-match here — it
 * gates on the is_adult flag alone.
 */
export function isAdultUrl(url: string | null | undefined): boolean {
  return isAdultPlatformLabel(platformFromUrl(url));
}

/** The item shape every gated surface can supply: a destination and a flag. */
export interface GatableItem {
  url?: string | null;
  is_adult?: boolean | null;
}

/**
 * THE gating predicate — the one question every gated surface asks.
 *
 * Gating is derived at RENDER time from the destination, not trusted from
 * stored state. An adult domain gates itself even when is_adult is false,
 * whatever the reason it is false: a row written before this system existed, a
 * flag that never round-tripped through an editor, or a creator who cleared it.
 * The flag can only ever ADD gating, never remove it. That is what makes the
 * compliance guarantee hold independently of data quality.
 */
export function isEffectivelyGated(item: GatableItem): boolean {
  return !!item.is_adult || isAdultUrl(item.url);
}

/**
 * The href an anchor may carry for this item.
 *
 * Returns undefined for a gated item in public/view mode, so the URL is absent
 * from the rendered DOM entirely. Edit mode is unaffected: the threat model is
 * the public page, and the editor needs its real links.
 */
export function gatedHref(
  url: string,
  isAdult: boolean | null | undefined,
  editMode?: boolean
): string | undefined {
  return isEffectivelyGated({ url, is_adult: isAdult }) && !editMode ? undefined : url;
}

/** True when this item must be gated on the surface currently rendering it. */
export function isGated(item: GatableItem, editMode?: boolean): boolean {
  return isEffectivelyGated(item) && !editMode;
}

/** Opens a gated destination after confirmation, without ever rendering it. */
export function openGated(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
