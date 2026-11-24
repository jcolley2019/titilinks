// FRAGILE.SUB.1 — the pure "already subscribed?" decision for checkout.
//
// No Deno globals, no network: imported by ./index.ts (Deno) and by
// scripts/billing.test.mjs via tsx (Node), so it is verified on every
// `npm run guard`. "Subscribed" means exactly what the webhook means by it:
// a status in ACCESS_GRANTING_STATUSES (active, trialing, past_due). A
// `past_due` subscription still counts — it is live and in dunning, and a
// second checkout would bill the customer twice once the card recovers.

import { ACCESS_GRANTING_STATUSES } from "../_shared/plan-lifecycle.ts";

/** The one field of a Stripe subscription this decision reads. */
export interface SubscriptionStatusLike {
  status?: string | null;
}

/**
 * True when any of a customer's subscriptions still grants paid access, i.e.
 * checkout must refuse rather than sell a second one. A missing or empty list
 * is "no subscription". Unknown statuses do not count, matching the webhook's
 * conservative reading of a status it does not recognise.
 */
export function hasAccessGrantingSubscription(
  subscriptions: readonly SubscriptionStatusLike[] | null | undefined,
): boolean {
  if (!Array.isArray(subscriptions)) return false;
  return subscriptions.some(
    (sub) =>
      typeof sub?.status === "string" &&
      (ACCESS_GRANTING_STATUSES as readonly string[]).includes(sub.status),
  );
}
