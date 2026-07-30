// BILL.B4 / DELETE.1 — permanent account deletion.
//
// Order is not arbitrary. Stripe is cancelled FIRST: if the rows went first and
// the Stripe call then failed, we would have destroyed the account while still
// billing the card, which is the one outcome that is both irreversible AND
// keeps taking money. Cancelling first means the worst failure leaves a cancelled
// subscription on an intact account — recoverable, and never a wrongful charge.
//
// What auth.admin.deleteUser() cascades for us (profiles.id references
// auth.users ON DELETE CASCADE, and everything hangs off profiles/pages):
//   profiles → pages → modes → blocks → block_items
//                   → events, page_subscribers, short_links
//           → profile_snapshots, custom_short_links, pending_grants
//
// What it does NOT touch, and so is deleted explicitly below:
//   • canva_connections, custom_theme_presets, pending_canva_auth — these carry a
//     bare `user_id uuid NOT NULL` with NO foreign key, so nothing cascades to
//     them. They would silently outlive the account (canva_connections holds
//     OAuth tokens, which makes it the one that actually matters).
//   • storage objects. Buckets are not relational; every upload lives under
//     `{user_id}/…` in avatars / products / fonts / page-assets.
//
// Deploy:
//   supabase functions deploy delete-account --project-ref ohmvlypcbrfkuudcuqub

import { corsHeaders, fail, json, preflight } from "../_shared/cors.ts";
import { getAuthedUser, serviceClient } from "../_shared/auth.ts";
import { stripeFetch } from "../_shared/stripe.ts";

/** Buckets that hold per-user folders. */
const USER_BUCKETS = ["avatars", "products", "fonts", "page-assets"] as const;

/** Tables with a user_id but no FK to profiles — no cascade reaches them. */
const ORPHAN_TABLES = ["canva_connections", "custom_theme_presets", "pending_canva_auth"] as const;

/** Subscription states worth cancelling; anything else is already over. */
const CANCELLABLE = ["active", "trialing", "past_due", "unpaid", "paused"];

interface DeleteRequest {
  /** The handle the user typed to confirm. Verified server-side. */
  confirmHandle?: string;
}

type Svc = ReturnType<typeof serviceClient>;

/**
 * Cancel every live subscription for a customer, immediately and without
 * proration (no final invoice — deleting an account should not produce a charge).
 */
async function cancelStripeSubscriptions(customerId: string): Promise<number> {
  const list = await stripeFetch<{ data: Array<{ id: string; status: string }> }>(
    `/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100`,
    { method: "GET" },
  );

  let cancelled = 0;
  for (const sub of list.data ?? []) {
    if (!CANCELLABLE.includes(sub.status)) continue;
    // DELETE /subscriptions/:id cancels at once. prorate=false suppresses the
    // proration credit/debit; invoice_now=false means no final invoice is issued.
    await stripeFetch(`/subscriptions/${sub.id}?prorate=false&invoice_now=false`, {
      method: "DELETE",
    });
    cancelled += 1;
    console.log(`[delete-account] cancelled subscription ${sub.id} (was ${sub.status})`);
  }
  return cancelled;
}

/**
 * Remove every object under `{userId}/` in a bucket.
 *
 * `list` is not recursive, so one level of nesting is walked explicitly. Failures
 * are collected rather than thrown: an unremovable file must not stop the account
 * deletion, it just gets reported.
 */
async function purgeBucket(svc: Svc, bucket: string, userId: string): Promise<string[]> {
  const problems: string[] = [];

  const collect = async (prefix: string, depth: number): Promise<string[]> => {
    const { data, error } = await svc.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) {
      problems.push(`${bucket}: list ${prefix} — ${error.message}`);
      return [];
    }

    const paths: string[] = [];
    for (const entry of data ?? []) {
      const full = `${prefix}/${entry.name}`;
      // A row with no id/metadata is a folder placeholder, not an object.
      if (!entry.id && depth < 2) paths.push(...(await collect(full, depth + 1)));
      else paths.push(full);
    }
    return paths;
  };

  const paths = await collect(userId, 1);
  if (paths.length === 0) return problems;

  const { error } = await svc.storage.from(bucket).remove(paths);
  if (error) problems.push(`${bucket}: remove — ${error.message}`);
  else console.log(`[delete-account] removed ${paths.length} object(s) from ${bucket}`);

  return problems;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return fail("Method not allowed", 405);

  try {
    const user = await getAuthedUser(req);
    if (!user) return fail("Unauthorized", 401);

    const body = (await req.json().catch(() => ({}))) as DeleteRequest;
    const svc = serviceClient();

    // ---- Confirm the typed handle SERVER-SIDE -----------------------------
    // The UI already gates on this, but a client check is not a safeguard for
    // something irreversible. Anything that reaches this function without the
    // right handle is refused.
    const { data: profile } = await svc
      .from("profiles")
      .select("username, stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    const { data: page } = await svc
      .from("pages")
      .select("handle")
      .eq("user_id", user.id)
      .maybeSingle();

    const accepted = [
      (page as { handle?: string } | null)?.handle,
      (profile as { username?: string | null } | null)?.username,
    ]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .map((v) => v.toLowerCase());

    // An account with no page and no username has nothing to type; require an
    // explicit literal instead of silently accepting anything.
    const expected = accepted.length > 0 ? accepted : ["delete"];
    const typed = (body.confirmHandle ?? "").trim().toLowerCase();

    if (!typed || !expected.includes(typed)) {
      console.warn(`[delete-account] handle mismatch for ${user.id}`);
      return fail("Confirmation did not match", 400);
    }

    // ---- 1. Stripe first --------------------------------------------------
    const customerId = (profile as { stripe_customer_id?: string | null } | null)
      ?.stripe_customer_id;

    if (customerId) {
      try {
        const n = await cancelStripeSubscriptions(customerId);
        console.log(`[delete-account] ${user.id}: ${n} subscription(s) cancelled`);
      } catch (err) {
        // Abort. Deleting the account now would leave a live subscription with no
        // owner — billing a card whose account no longer exists.
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[delete-account] Stripe cancel failed for ${user.id}:`, msg);
        return fail(`Could not cancel your subscription: ${msg}`, 502);
      }
    }

    // ---- 2. Storage -------------------------------------------------------
    const problems: string[] = [];
    for (const bucket of USER_BUCKETS) {
      problems.push(...(await purgeBucket(svc, bucket, user.id)));
    }

    // ---- 3. Rows nothing cascades to --------------------------------------
    for (const table of ORPHAN_TABLES) {
      const { error } = await svc.from(table).delete().eq("user_id", user.id);
      if (error) problems.push(`${table}: ${error.message}`);
    }

    // ---- 4. The auth user, which cascades the rest ------------------------
    const { error: authErr } = await svc.auth.admin.deleteUser(user.id);
    if (authErr) {
      console.error(`[delete-account] deleteUser failed for ${user.id}:`, authErr.message);
      return fail(`Could not delete your account: ${authErr.message}`, 500);
    }

    if (problems.length) {
      // The account IS gone — report the leftovers rather than implying failure.
      console.warn(`[delete-account] ${user.id} deleted with leftovers:`, problems.join("; "));
    }
    console.log(`[delete-account] ${user.id} deleted`);

    return json({ deleted: true, warnings: problems });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[delete-account] unhandled:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
