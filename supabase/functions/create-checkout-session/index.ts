// BILL.B1 — create a Stripe Checkout session for a Pro subscription.
//
// Auth required. The client sends a `priceId`, but that is only a request: the
// id is validated against the server-side allowlist in _shared/billing.ts, so a
// tampered request cannot subscribe someone to an arbitrary (or Business-tier)
// price. Nothing in this function writes to `profiles` — the plan flips only
// when Stripe tells us the money moved, via the stripe-webhook function (B2).
//
// Deploy:
//   supabase functions deploy create-checkout-session --project-ref ohmvlypcbrfkuudcuqub

import { corsHeaders, fail, json, preflight, resolveSiteOrigin } from "../_shared/cors.ts";
import { getAuthedUser, serviceClient } from "../_shared/auth.ts";
import { priceDefinitionFor } from "../_shared/billing.ts";
import { stripeFetch } from "../_shared/stripe.ts";

interface CheckoutRequest {
  priceId?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return fail("Method not allowed", 405);

  try {
    const user = await getAuthedUser(req);
    if (!user) return fail("Unauthorized", 401);

    const body = (await req.json().catch(() => ({}))) as CheckoutRequest;
    const price = priceDefinitionFor(body.priceId);
    if (!price) {
      console.warn(`[create-checkout-session] rejected price id for user ${user.id}`);
      return fail("Unknown or unavailable price", 400);
    }

    const origin = resolveSiteOrigin(req);
    if (!origin) {
      console.error("[create-checkout-session] SITE_URL is not set and Origin was unusable");
      return fail("Billing is not configured", 500);
    }

    // An existing Stripe customer must be reused, otherwise the portal, the
    // subscription history and the referral self-referral check (rule R3) all
    // fragment across duplicate customers. Read with the service role: the
    // column is not client-readable.
    const svc = serviceClient();
    const { data: profile, error: profileErr } = await svc
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      console.error("[create-checkout-session] profile read failed:", profileErr.message);
      return fail("Could not load your account", 500);
    }

    const existingCustomer = (profile as { stripe_customer_id?: string | null } | null)
      ?.stripe_customer_id;

    const session = await stripeFetch<{ id: string; url: string | null }>(
      "/checkout/sessions",
      {
        body: {
          mode: "subscription",
          line_items: [{ price: price.id, quantity: 1 }],
          // Exactly one of customer / customer_email — Stripe rejects both.
          customer: existingCustomer || undefined,
          customer_email: existingCustomer ? undefined : (user.email ?? undefined),
          // The webhook's primary way back to the profile row.
          client_reference_id: user.id,
          allow_promotion_codes: true,
          success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/#pricing`,
          // Redundant with client_reference_id on purpose: subscription.* events
          // do not carry the checkout session, so the id has to live on the
          // subscription itself for the lifecycle handlers to resolve the owner.
          subscription_data: {
            metadata: { user_id: user.id, plan: price.plan, lookup_key: price.lookupKey },
          },
          metadata: { user_id: user.id, lookup_key: price.lookupKey },
        },
      },
    );

    console.log(
      `[create-checkout-session] session ${session.id} for user ${user.id} (${price.lookupKey})`,
    );

    return json({ sessionId: session.id, url: session.url });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[create-checkout-session] unhandled:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
