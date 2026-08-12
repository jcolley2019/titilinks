// BILL.B2 — the pure decision layer for Stripe subscription lifecycle events.
//
// Everything here is a total function over plain data: no Deno globals, no
// network, no `Date.now()` unless injected. That is deliberate — it is imported
// BOTH by supabase/functions/stripe-webhook/index.ts (Deno) and by
// scripts/billing.test.mjs via tsx (Node), so the plan-flip table is verified
// on every `npm run guard` rather than only in production.
//
// Rule: Stripe is the source of truth. Nothing in the app may infer a plan from
// anything else; the only writer of profiles.plan is the webhook, and the only
// input it trusts is a signature-verified event.

/** Plan tiers, mirroring `Plan` in src/lib/entitlements.ts. */
export type Plan = "free" | "pro" | "business";

export const HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  // BILL.REF.2 — money going back out is what makes a referral clawback real.
  // Neither of these touches `plan` (Stripe sends the subscription events for
  // that); they exist so rule R4 can void or debit the grant the payment earned.
  "charge.refunded",
  "charge.dispute.created",
] as const;

export type HandledEventType = (typeof HANDLED_EVENT_TYPES)[number];

export function isHandledEvent(type: string): type is HandledEventType {
  return (HANDLED_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * Statuses that keep paid access.
 *
 * `past_due` is INCLUDED on purpose. Stripe retries a failed card for days
 * (dunning) before giving up, and taking someone's live public page down over a
 * card that will very likely succeed on retry is the worse failure. Access ends
 * at `unpaid` (dunning exhausted) or `canceled`.
 *
 * `trialing` is included so a future trial grants features; no trial price is
 * wired today.
 */
export const ACCESS_GRANTING_STATUSES = ["active", "trialing", "past_due"] as const;

/**
 * Statuses that revoke paid access. Listed explicitly rather than as "everything
 * else" so a NEW Stripe status can never silently grant or silently revoke — an
 * unrecognised status is treated conservatively (see `planForSubscriptionStatus`).
 */
export const ACCESS_REVOKING_STATUSES = [
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused",
] as const;

/**
 * Plan implied by a Stripe subscription status.
 *
 * An unknown/absent status falls back to 'free': never grant a paid tier from a
 * value we do not understand. (The inverse bias — defaulting to 'pro' — would
 * turn a Stripe API change into free Pro for everyone.)
 */
export function planForSubscriptionStatus(status: string | null | undefined): Plan {
  if (!status) return "free";
  if ((ACCESS_GRANTING_STATUSES as readonly string[]).includes(status)) return "pro";
  return "free";
}

/** Shape of the Stripe subscription fields this module reads. */
export interface StripeSubscriptionLike {
  id?: string;
  status?: string;
  customer?: string | { id?: string };
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  items?: { data?: Array<{ current_period_end?: number }> };
  metadata?: Record<string, string>;
}

/** The subset of `profiles` columns a lifecycle event may write. */
export interface ProfileBillingPatch {
  plan?: Plan;
  stripe_customer_id?: string;
  subscription_status?: string | null;
  subscription_period_end?: string | null;
}

/** Normalise Stripe's `customer` (id string or expanded object) to an id. */
export function customerIdOf(
  value: string | { id?: string } | null | undefined,
): string | null {
  if (!value) return null;
  if (typeof value === "string") return value || null;
  return value.id ?? null;
}

/**
 * Read the period end from a subscription.
 *
 * Newer Stripe API versions moved `current_period_end` off the subscription and
 * onto its items; older ones keep it at the top level. Read both so a Stripe
 * API-version bump does not silently start writing nulls.
 */
export function periodEndOf(sub: StripeSubscriptionLike): string | null {
  const seconds = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

/**
 * The profile patch for a `customer.subscription.*` event.
 *
 * `deleted` is passed as `revoked` rather than inferred from the status, because
 * Stripe sends the subscription object in whatever state it ended in and the
 * event type is the authoritative signal that it is over.
 */
export function subscriptionPatch(
  sub: StripeSubscriptionLike,
  { revoked = false }: { revoked?: boolean } = {},
): ProfileBillingPatch {
  const status = revoked ? "canceled" : (sub.status ?? null);
  const patch: ProfileBillingPatch = {
    plan: revoked ? "free" : planForSubscriptionStatus(sub.status),
    subscription_status: status,
    subscription_period_end: periodEndOf(sub),
  };

  const customer = customerIdOf(sub.customer);
  if (customer) patch.stripe_customer_id = customer;

  return patch;
}

/** Minimal event envelope shared by every handler. */
export interface StripeEventLike {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
}

/**
 * Resolve the owning profile id from an event, WITHOUT a DB lookup.
 *
 * Checkout sessions carry `client_reference_id`; subscriptions carry the same id
 * in `metadata.user_id` (create-checkout-session writes both, because
 * subscription.* events never include the checkout session). Invoices reach the
 * profile through `subscription_details.metadata` or, failing that, the customer
 * id — which is why the caller still needs a customer-id fallback path.
 *
 * Returns null when the event cannot be attributed; the webhook then resolves by
 * `stripe_customer_id` instead. Never guess.
 */
export function resolveUserId(event: StripeEventLike): string | null {
  const obj = (event.data?.object ?? {}) as Record<string, unknown>;

  const direct = obj.client_reference_id;
  if (typeof direct === "string" && direct) return direct;

  const meta = obj.metadata as Record<string, string> | undefined;
  if (meta?.user_id) return meta.user_id;

  const subDetails = obj.subscription_details as
    | { metadata?: Record<string, string> }
    | undefined;
  if (subDetails?.metadata?.user_id) return subDetails.metadata.user_id;

  const parent = obj.parent as
    | { subscription_details?: { metadata?: Record<string, string> } }
    | undefined;
  if (parent?.subscription_details?.metadata?.user_id) {
    return parent.subscription_details.metadata.user_id;
  }

  return null;
}

/** Resolve the Stripe customer id from any handled event object. */
export function resolveCustomerId(event: StripeEventLike): string | null {
  const obj = (event.data?.object ?? {}) as Record<string, unknown>;
  return customerIdOf(obj.customer as string | { id?: string } | undefined);
}

/**
 * Resolve the subscription id from an invoice or checkout session.
 * Newer API versions nest it under `parent.subscription_details`.
 */
export function resolveSubscriptionId(event: StripeEventLike): string | null {
  const obj = (event.data?.object ?? {}) as Record<string, unknown>;

  const direct = obj.subscription;
  if (typeof direct === "string" && direct) return direct;
  if (direct && typeof direct === "object") {
    const id = (direct as { id?: string }).id;
    if (id) return id;
  }

  const parent = obj.parent as
    | { subscription_details?: { subscription?: string } }
    | undefined;
  return parent?.subscription_details?.subscription ?? null;
}

/**
 * True when an `invoice.paid` represents REAL money moving.
 *
 * This is the gate referral rewards hang off (rule R1): a $0 invoice — full
 * coupon, credit balance, trial conversion — must not qualify a referral, or the
 * give/get program pays out for free signups dressed up as conversions.
 */
export function isRealPaidInvoice(invoice: {
  amount_paid?: number;
  paid?: boolean;
  billing_reason?: string;
}): boolean {
  return invoice.paid === true && typeof invoice.amount_paid === "number" && invoice.amount_paid > 0;
}

/**
 * True when this invoice is the FIRST payment of a subscription.
 *
 * Stripe's `billing_reason` distinguishes the initial charge
 * (`subscription_create`) from renewals (`subscription_cycle`). Referral
 * qualification keys on the first paid invoice only.
 */
export function isFirstSubscriptionInvoice(invoice: { billing_reason?: string }): boolean {
  return invoice.billing_reason === "subscription_create";
}
