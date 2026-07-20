/**
 * Plan tiers and per-tier entitlements — the SINGLE source of truth for what
 * each plan can do across the app (onboarding, editor, gating, upsells).
 *
 * Billing/Stripe is NOT wired yet: `profiles.plan` defaults to 'free' and is
 * the only thing read today. When billing lands, a webhook updates
 * `profiles.plan` and every gate below follows automatically — no call sites
 * change. Add a new tier by adding a key here (and to the DB check constraint).
 *
 * Limits are derived from the marketing copy in
 * `src/components/landing/PricingSection.tsx` so the seen and enforced plans
 * stay in agreement.
 */

export type Plan = 'free' | 'pro' | 'business';

/** Tiers from least to most capable. Used for `planAtLeast` comparisons. */
export const PLAN_ORDER: Plan[] = ['free', 'pro', 'business'];

export interface PlanEntitlements {
  /** Display name for the tier. */
  label: string;
  /** Max profile pages. 1 = single page; 2 = both pages. */
  maxPages: number;
  /** Style a page differently from the profile-level default (PAGES.STYLE.1) —
   *  e.g. a hero Page 1 with a full-bleed Page 2. Distinct from `maxPages`:
   *  having a second page and giving it a look of its own are separate sells. */
  perPageStyle: boolean;
  /** Max link items per links block. `Infinity` = unlimited. */
  maxLinks: number;
  /** Max MANUAL profile snapshots (named restore points) retained per page.
   *  Auto snapshots (the pre-destructive-action safety net) are exempt and
   *  ring-buffered separately. Enforced at capture time (SNAP.1). */
  maxSnapshots: number;
  premiumThemes: boolean;
  analytics: boolean;
  /** Meta / TikTok / GA4 tracking pixels injected on the public profile. Paid
   *  everywhere in the market (Linktree, Link.me), so Pro+ here. */
  trackingPixels: boolean;
  customDomain: boolean;
  aiBio: boolean;
  emailSubscribe: boolean;
  /** Swipeable carousel of link cards (Featured Links → Carousel). */
  carousel: boolean;
  /** Per-link motion effects (ANIM.1): pulse / shimmer / bounce / glow / shake.
   *  Link.me sells animations as a paid feature; matched here. `none` is always
   *  available to everyone, so a free profile still renders — it just can't move. */
  linkAnimations: boolean;
  /** Business-tier extras. */
  teamCollab: boolean;
  whiteLabel: boolean;
  apiAccess: boolean;
  prioritySupport: boolean;
}

export const ENTITLEMENTS: Record<Plan, PlanEntitlements> = {
  free: {
    label: 'Free',
    maxPages: 1,
    perPageStyle: false,
    maxLinks: 5,
    maxSnapshots: 1,
    premiumThemes: false,
    analytics: false,
    trackingPixels: false,
    customDomain: false,
    aiBio: false,
    emailSubscribe: false,
    carousel: false,
    linkAnimations: false,
    teamCollab: false,
    whiteLabel: false,
    apiAccess: false,
    prioritySupport: false,
  },
  pro: {
    label: 'Pro',
    maxPages: 2,
    perPageStyle: true,
    maxLinks: Infinity,
    maxSnapshots: 5,
    premiumThemes: true,
    analytics: true,
    trackingPixels: true,
    customDomain: true,
    aiBio: true,
    emailSubscribe: true,
    carousel: true,
    linkAnimations: true,
    teamCollab: false,
    whiteLabel: false,
    apiAccess: false,
    prioritySupport: false,
  },
  business: {
    label: 'Business',
    maxPages: 2,
    perPageStyle: true,
    maxLinks: Infinity,
    maxSnapshots: 20,
    premiumThemes: true,
    analytics: true,
    trackingPixels: true,
    customDomain: true,
    aiBio: true,
    emailSubscribe: true,
    carousel: true,
    linkAnimations: true,
    teamCollab: true,
    whiteLabel: true,
    apiAccess: true,
    prioritySupport: true,
  },
};

/** Fallback when a profile has no plan set (legacy rows, null from the DB). */
export const DEFAULT_PLAN: Plan = 'free';

/** Boolean feature flags on PlanEntitlements — the keys `can()` accepts. */
export type BooleanFeature = {
  [K in keyof PlanEntitlements]: PlanEntitlements[K] extends boolean ? K : never;
}[keyof PlanEntitlements];

/** Coerce an unknown/legacy value (e.g. null from the DB) to a valid Plan. */
export function normalizePlan(value: string | null | undefined): Plan {
  return value === 'pro' || value === 'business' ? value : DEFAULT_PLAN;
}

/** Entitlements for a plan, safe against unknown/null values. */
export function getEntitlements(plan: string | null | undefined): PlanEntitlements {
  return ENTITLEMENTS[normalizePlan(plan)];
}

/** True if `plan` is at least `min` in tier order (free < pro < business). */
export function planAtLeast(plan: string | null | undefined, min: Plan): boolean {
  return PLAN_ORDER.indexOf(normalizePlan(plan)) >= PLAN_ORDER.indexOf(min);
}

/** True if `plan` grants a boolean feature. */
export function can(plan: string | null | undefined, feature: BooleanFeature): boolean {
  return getEntitlements(plan)[feature];
}
