// BILL.B1 — open the Stripe Customer Portal for the signed-in user.
//
// Auth required. The customer id comes from the caller's own profile row read
// with the service role — never from the request body, which would let anyone
// open anyone else's billing portal.
//
// Cancellations, plan switches, payment-method updates and invoice history all
// happen inside the portal; the resulting state reaches us through the
// stripe-webhook function (B2), not through this call.
//
// Deploy:
//   supabase functions deploy create-portal-session --project-ref ohmvlypcbrfkuudcuqub

import { corsHeaders, fail, json, preflight, resolveSiteOrigin } from "../_shared/cors.ts";
import { getAuthedUser, serviceClient } from "../_shared/auth.ts";
import { stripeFetch } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return fail("Method not allowed", 405);

  try {
    const user = await getAuthedUser(req);
    if (!user) return fail("Unauthorized", 401);

    const svc = serviceClient();
    const { data: profile, error: profileErr } = await svc
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      console.error("[create-portal-session] profile read failed:", profileErr.message);
      return fail("Could not load your account", 500);
    }

    const customerId = (profile as { stripe_customer_id?: string | null } | null)
      ?.stripe_customer_id;

    // No customer means the account has never checked out. A 409 (not 500) lets
    // the client tell the difference and send them to pricing instead.
    if (!customerId) return fail("No billing account yet", 409);

    const origin = resolveSiteOrigin(req);
    if (!origin) {
      console.error("[create-portal-session] SITE_URL is not set and Origin was unusable");
      return fail("Billing is not configured", 500);
    }

    const session = await stripeFetch<{ id: string; url: string }>(
      "/billing_portal/sessions",
      {
        body: {
          customer: customerId,
          return_url: `${origin}/dashboard/settings`,
        },
      },
    );

    console.log(`[create-portal-session] portal ${session.id} for user ${user.id}`);

    return json({ url: session.url });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[create-portal-session] unhandled:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
