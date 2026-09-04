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
  /** Unix seconds. Read only as the tie-break in `selectAuthoritativeSubscription`. */
  created?: number;
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

/**
 * TL.COMP.3 — is a comp (hand-granted Pro) still in force?
 *
 * `profiles.comped_until` is a timestamptz. PostgREST serialises Postgres
 * `'infinity'` as the STRING "infinity", and `Date.parse("infinity")` is NaN, so
 * `new Date(row.comped_until) > new Date()` is FALSE for exactly the rows that
 * matter — every real comp in prod is `'infinity'`. That literal is special-cased
 * here, and nowhere else may re-derive this. Any other unparseable value fails
 * OPEN to Stripe truth: never grant Pro from a value we do not understand.
 *
 * The boundary is strict (`>`): a comp whose end equals `now` has expired.
 */
export function isCompActive(compedUntil: unknown, now: Date = new Date()): boolean {
  if (typeof compedUntil !== "string" || compedUntil === "") return false;
  const trimmed = compedUntil.trim().toLowerCase();
  if (trimmed === "infinity") return true;
  if (trimmed === "-infinity") return false;
  const ms = Date.parse(compedUntil);
  return Number.isFinite(ms) && ms > now.getTime();
}

/**
 * TL.COMP.3 — the patch with `plan` REMOVED while a comp is active.
 *
 * Ruling: while comped, `plan` stays 'pro' no matter what Stripe says. The
 * Stripe mirror columns (subscription_status / subscription_period_end /
 * stripe_customer_id) still go through so the ledger stays truthful — we record
 * what Stripe thinks, we just refuse to act on it. Comp expiry is not decided
 * here; `admin_revoke_comp` is the door. Pure: the caller supplies the row.
 */
export function withCompGuard<T extends { plan?: string }>(
  patch: T,
  compedUntil: unknown,
  now: Date = new Date(),
): T {
  if (!isCompActive(compedUntil, now)) return patch;
  const { plan: _plan, ...rest } = patch;
  return rest as T;
}

/** Period end as milliseconds, or null when the subscription carries none. */
function periodEndMillis(sub: StripeSubscriptionLike): number | null {
  const iso = periodEndOf(sub);
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** `created` as unix seconds, or null when absent or not a finite number. */
function createdSecondsOf(sub: StripeSubscriptionLike): number | null {
  const created = sub.created;
  return typeof created === "number" && Number.isFinite(created) ? created : null;
}

/**
 * Does `candidate` beat the current incumbent? Undecidable comparisons return
 * false, which is what makes the incumbent (the first encountered) keep the seat.
 */
function outranks(candidate: StripeSubscriptionLike, incumbent: StripeSubscriptionLike): boolean {
  const candidateEnd = periodEndMillis(candidate);
  const incumbentEnd = periodEndMillis(incumbent);
  if (candidateEnd !== incumbentEnd) {
    // A usable period end outranks none at all. A granting subscription Stripe
    // gave no period to is the malformed one; it must not take the seat from a
    // well-formed subscription just by arriving first.
    if (candidateEnd === null) return false;
    if (incumbentEnd === null) return true;
    return candidateEnd > incumbentEnd;
  }

  const candidateCreated = createdSecondsOf(candidate);
  const incumbentCreated = createdSecondsOf(incumbent);
  if (
    candidateCreated !== null && incumbentCreated !== null &&
    candidateCreated !== incumbentCreated
  ) {
    return candidateCreated > incumbentCreated;
  }

  return false;
}

/**
 * Pick the ONE subscription a customer's plan should be derived from.
 *
 * Consumed by the reconciler (BILL.RECON), which starts from
 * `profiles.stripe_customer_id`, lists that customer's subscriptions with
 * `status=all`, and has to decide which one speaks for the account — an upgrade
 * leaves a canceled subscription beside the live one, a failed checkout leaves an
 * `incomplete` one. The webhook never faces the question: an event names its
 * subscription. So the choice would otherwise be private to the reconciler, and
 * the nightly job could reach a different verdict than the live path for the same
 * customer. It lives here, beside `planForSubscriptionStatus`, so "which
 * subscription counts" is decided in exactly one place and `npm run guard`
 * covers it.
 *
 * The rule, in two steps:
 *
 *   1. Keep only subscriptions whose status grants access — routed through
 *      `planForSubscriptionStatus` rather than re-reading the status list, so
 *      this can never drift from the plan-flip table. Of those, the latest
 *      `periodEndOf()` wins, and a subscription that HAS a usable period end
 *      beats one that has none — a granting subscription with no period is the
 *      malformed one and must not win on arrival order. Equal ends, or none on
 *      either side, fall through to the latest `created`; still undecided, the
 *      first encountered keeps the seat, so a given list order always yields
 *      the same answer.
 *
 *   2. Nothing grants access → null. A canceled subscription is never selected,
 *      however recent it is; no access-granting subscription means no access, and
 *      the caller derives the free/revoked patch from the absence.
 *
 * Total by construction: Stripe's JSON arrives untyped and this runs unattended
 * on a schedule, so an empty list, a null element, a missing status or a
 * non-numeric timestamp each produce an answer or null — never a throw.
 */
export function selectAuthoritativeSubscription(
  subs: StripeSubscriptionLike[],
): StripeSubscriptionLike | null {
  if (!Array.isArray(subs)) return null;

  const granting = subs.filter((sub) =>
    sub !== null && typeof sub === "object" && !Array.isArray(sub) &&
    planForSubscriptionStatus(sub.status) !== "free"
  );
  if (granting.length === 0) return null;

  let winner = granting[0];
  for (const candidate of granting.slice(1)) {
    if (outranks(candidate, winner)) winner = candidate;
  }
  return winner;
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
