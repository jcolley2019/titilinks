// BILL.B2 — Stripe becomes the source of truth for `profiles.plan`.
//
// This is the ONLY writer of plan / stripe_customer_id / subscription_*. The
// app has no client-side plan writes (censused: zero call sites) and the
// guard_billing_columns trigger from 20260729120100_add_webhook_events.sql makes
// that structural rather than a convention.
//
// Contract with Stripe:
//   • signature verified over the RAW body (STRIPE_WEBHOOK_SECRET)
//   • at-least-once delivery, so every handler is gated on claiming the event id
//     in stripe_webhook_events — the primary key IS the deduplication
//   • a failed handler leaves the claim UNfinished (processed_at null) and
//     returns 500, so Stripe's retry can re-claim it; the error is kept on the
//     row for forensics rather than thrown away
//   • unhandled event types are acked 200 without a ledger row — never 4xx, or
//     Stripe disables the endpoint
//
// Deploy (JWT verification MUST be off — Stripe does not send a Supabase JWT):
//   supabase functions deploy stripe-webhook --no-verify-jwt --project-ref ohmvlypcbrfkuudcuqub

import { serviceClient } from "../_shared/auth.ts";
import { stripeFetch, verifyStripeSignature } from "../_shared/stripe.ts";
import {
  isFirstSubscriptionInvoice,
  isHandledEvent,
  isRealPaidInvoice,
  planForSubscriptionStatus,
  resolveCustomerId,
  resolveSubscriptionId,
  resolveUserId,
  subscriptionPatch,
  type ProfileBillingPatch,
  type StripeEventLike,
  type StripeSubscriptionLike,
} from "../_shared/plan-lifecycle.ts";
import {
  applyReferralCouponFor,
  ensureReferralCoupon,
  qualifyReferralOnFirstPayment,
  releaseDueGrants,
  voidGrantsForReferred,
} from "../_shared/referrals.ts";

// Stripe reads only the status code; the body is for humans reading logs.
const ack = (body: Record<string, unknown> = { received: true }) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const retryable = (message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });

type Svc = ReturnType<typeof serviceClient>;

interface ProfileRef {
  id: string;
  plan: string;
  referred_by: string | null;
  stripe_customer_id: string | null;
}

/**
 * Find the profile an event belongs to.
 *
 * Prefers the id we put on the object ourselves (client_reference_id /
 * metadata.user_id) and falls back to the Stripe customer id. Returns null when
 * neither resolves — an event for a customer we have never seen is not an error
 * to retry, it is an event to ack and log.
 */
async function resolveProfile(svc: Svc, event: StripeEventLike): Promise<ProfileRef | null> {
  const columns = "id, plan, referred_by, stripe_customer_id";

  const userId = resolveUserId(event);
  if (userId) {
    const { data } = await svc.from("profiles").select(columns).eq("id", userId).maybeSingle();
    if (data) return data as unknown as ProfileRef;
    console.warn(`[stripe-webhook] metadata user_id ${userId} has no profile row`);
  }

  const customerId = resolveCustomerId(event);
  if (customerId) {
    const { data } = await svc
      .from("profiles")
      .select(columns)
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (data) return data as unknown as ProfileRef;
  }

  return null;
}

/** Apply a billing patch, dropping no-op writes. */
async function patchProfile(svc: Svc, profileId: string, patch: ProfileBillingPatch) {
  if (Object.keys(patch).length === 0) return;
  const { error } = await svc.from("profiles").update(patch).eq("id", profileId);
  if (error) throw new Error(`profile update failed: ${error.message}`);
  console.log(
    `[stripe-webhook] profile ${profileId} → ${JSON.stringify({
      plan: patch.plan,
      status: patch.subscription_status,
    })}`,
  );
}

/** Fetch a subscription so the plan can flip on the spot rather than a beat later. */
async function fetchSubscription(id: string): Promise<StripeSubscriptionLike | null> {
  try {
    return await stripeFetch<StripeSubscriptionLike>(`/subscriptions/${id}`, { method: "GET" });
  } catch (err) {
    console.error(`[stripe-webhook] could not fetch subscription ${id}:`, String(err));
    return null;
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(svc: Svc, event: StripeEventLike) {
  const session = (event.data?.object ?? {}) as Record<string, unknown>;
  const userId = resolveUserId(event);
  if (!userId) {
    console.warn("[stripe-webhook] checkout.session.completed with no attributable user");
    return;
  }

  const customerId = resolveCustomerId(event);
  const subscriptionId = resolveSubscriptionId(event);

  // Bind the Stripe customer to the profile first — everything downstream
  // (portal, invoices, subscription.* fallback resolution) depends on it.
  const patch: ProfileBillingPatch = {};
  if (customerId) patch.stripe_customer_id = customerId;

  // `payment_status` is 'paid' for a completed subscription checkout; anything
  // else means the session finished without money moving (async payment method).
  if (subscriptionId) {
    const sub = await fetchSubscription(subscriptionId);
    if (sub) Object.assign(patch, subscriptionPatch(sub));
  } else if (session.payment_status === "paid") {
    // No subscription on the session — nothing to grant, but keep the customer.
    console.warn("[stripe-webhook] paid checkout session carried no subscription id");
  }

  await patchProfile(svc, userId, patch);
}

async function handleSubscriptionChange(
  svc: Svc,
  event: StripeEventLike,
  { revoked }: { revoked: boolean },
) {
  const sub = (event.data?.object ?? {}) as StripeSubscriptionLike;
  const profile = await resolveProfile(svc, event);
  if (!profile) {
    console.warn(`[stripe-webhook] ${event.type} for an unknown customer — acked, no write`);
    return;
  }

  await patchProfile(svc, profile.id, subscriptionPatch(sub, { revoked }));

  // Rules R2 / R4 — losing paid access voids a free month still inside its
  // retention hold, and flags an already-granted one for clawback.
  if (revoked || planForSubscriptionStatus(sub.status) === "free") {
    await voidGrantsForReferred(svc, profile.id, String(event.type));
  }
}

async function handleInvoicePaid(svc: Svc, event: StripeEventLike) {
  const invoice = (event.data?.object ?? {}) as Record<string, unknown>;
  const profile = await resolveProfile(svc, event);
  if (!profile) {
    console.warn("[stripe-webhook] invoice.paid for an unknown customer — acked, no write");
    return;
  }

  const real = isRealPaidInvoice(invoice as { amount_paid?: number; paid?: boolean });
  const first = isFirstSubscriptionInvoice(invoice as { billing_reason?: string });

  // Refresh the subscription mirror from Stripe rather than inferring it from the
  // invoice — the invoice says a payment happened, the subscription says what
  // state that leaves the customer in.
  const subscriptionId = resolveSubscriptionId(event);
  if (subscriptionId) {
    const sub = await fetchSubscription(subscriptionId);
    if (sub) await patchProfile(svc, profile.id, subscriptionPatch(sub));
  }

  // Rule R1: a referral qualifies on the first REAL paid invoice — never on
  // signup, never on a $0 (fully-couponed / credited) invoice. Free signups
  // therefore earn nothing by construction: no invoice, no grant row.
  if (real && first) {
    await qualifyReferralOnFirstPayment(svc, {
      referredProfileId: profile.id,
      referredBy: profile.referred_by,
      referredCustomerId: profile.stripe_customer_id ?? resolveCustomerId(event),
      paidAt: new Date().toISOString(),
    });
  } else {
    console.log(
      `[stripe-webhook] invoice.paid ${profile.id}: real=${real} first=${first} — no referral credit`,
    );
  }

  // Rule R2 — any paid invoice is also the moment to release grants whose 30-day
  // hold has elapsed, so a platform with paying traffic sweeps itself and the
  // common case needs no cron. Failures here must not fail the invoice event:
  // the rows stay pending and the next sweep retries them.
  try {
    await ensureReferralCoupon((path, init) => stripeFetch(path, init));
    await releaseDueGrants(svc, new Date().toISOString(), (profileId) =>
      applyReferralCouponFor(svc, profileId, (path, init) => stripeFetch(path, init)),
    );
  } catch (err) {
    console.error("[stripe-webhook] referral sweep failed (rows stay pending):", String(err));
  }
}

async function handleInvoicePaymentFailed(svc: Svc, event: StripeEventLike) {
  const profile = await resolveProfile(svc, event);
  if (!profile) return;

  // Deliberately does NOT touch `plan`. Stripe retries a failed card for days;
  // ACCESS_GRANTING_STATUSES keeps `past_due` on Pro so a live public page does
  // not go dark over a card that will probably succeed on retry. Access ends when
  // Stripe gives up (status → unpaid/canceled), which arrives as a
  // customer.subscription.updated.
  await patchProfile(svc, profile.id, { subscription_status: "past_due" });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  // MUST be the raw bytes: re-serialising the parsed JSON changes key order and
  // whitespace, and the HMAC would never match.
  const rawBody = await req.text();

  const verdict = await verifyStripeSignature(
    rawBody,
    req.headers.get("stripe-signature"),
    Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "",
  );
  if (!verdict.ok) {
    console.error(`[stripe-webhook] signature rejected: ${verdict.reason}`);
    // 400, not 500: an unsigned request must not be retried.
    return new Response(JSON.stringify({ error: `Invalid signature: ${verdict.reason}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let event: StripeEventLike;
  try {
    event = JSON.parse(rawBody) as StripeEventLike;
  } catch {
    return new Response(JSON.stringify({ error: "Malformed JSON body" }), { status: 400 });
  }

  const eventId = event.id;
  const eventType = event.type ?? "";
  if (!eventId) return new Response(JSON.stringify({ error: "Event has no id" }), { status: 400 });

  if (!isHandledEvent(eventType)) {
    // Ack unknown types: a 4xx here makes Stripe mark the endpoint unhealthy.
    return ack({ received: true, ignored: eventType });
  }

  const svc = serviceClient();

  // Claim the event. `on conflict do nothing` + a follow-up read distinguishes
  // "already finished" (skip) from "previous attempt failed" (retry allowed).
  const { error: claimErr } = await svc
    .from("stripe_webhook_events")
    .insert({ id: eventId, type: eventType });

  if (claimErr && claimErr.code !== "23505") {
    console.error("[stripe-webhook] ledger insert failed:", claimErr.message);
    return retryable(`Ledger unavailable: ${claimErr.message}`);
  }

  if (claimErr?.code === "23505") {
    const { data: existing } = await svc
      .from("stripe_webhook_events")
      .select("processed_at")
      .eq("id", eventId)
      .maybeSingle();

    if ((existing as { processed_at?: string | null } | null)?.processed_at) {
      console.log(`[stripe-webhook] ${eventId} (${eventType}) already processed — skipping`);
      return ack({ received: true, duplicate: true });
    }
    console.warn(`[stripe-webhook] ${eventId} retrying after an unfinished attempt`);
  }

  try {
    switch (eventType) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(svc, event);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionChange(svc, event, { revoked: false });
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionChange(svc, event, { revoked: true });
        break;
      case "invoice.paid":
        await handleInvoicePaid(svc, event);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(svc, event);
        break;
    }

    await svc
      .from("stripe_webhook_events")
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq("id", eventId);

    return ack();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[stripe-webhook] ${eventType} (${eventId}) failed:`, msg);
    // Leave processed_at null so the retry re-claims it; keep the reason.
    await svc.from("stripe_webhook_events").update({ error: msg.slice(0, 500) }).eq("id", eventId);
    return retryable(msg);
  }
});
