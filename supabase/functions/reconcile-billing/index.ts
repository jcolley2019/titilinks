// BILL.RECON.3 — the backstop for a webhook that never arrived.
//
// stripe-webhook is the ONLY writer of profiles.plan, and Stripe delivers
// at-least-once — but not at-least-once forever. An endpoint that is down long
// enough, or a handler that crashes after Stripe has already recorded the 2xx,
// exhausts the retry schedule and the event is gone. Nothing then re-derives the
// plan, so the row stays wrong in whichever direction it broke: a paying
// customer stuck on free, or a cancelled one keeping Pro indefinitely. This
// function re-derives plan truth from Stripe on a schedule and records the
// difference.
//
// It is REPORT-ONLY unless explicitly armed. `RECONCILE_APPLY === "true"` is the
// single write path; unset, mis-set, or set to anything else means the run
// observes and records, and touches no profile. That default is deliberate: the
// dangerous direction here is an automated downgrade of a real customer off the
// back of a bad Stripe read, so writing has to be a decision somebody made on
// purpose, not the state the function ships in.
//
// Enumeration is STRIPE-DRIVEN: it walks Stripe's subscription list and joins
// profiles onto it, rather than walking profiles and asking Stripe about each.
// That is what makes `unmatched_customer` observable at all, and it is one
// paginated pass instead of one API call per account.
//
// Deploy — JWT verification STAYS ON. stripe-webhook is deployed --no-verify-jwt
// only because Stripe cannot send a Supabase JWT; every caller of THIS function
// is ours and can. The shared secret below sits on top of that, not instead:
//   supabase functions deploy reconcile-billing --project-ref ohmvlypcbrfkuudcuqub

import { serviceClient } from "../_shared/auth.ts";
import { corsHeaders, fail, json } from "../_shared/cors.ts";
import { stripeFetch } from "../_shared/stripe.ts";
import {
  customerIdOf,
  selectAuthoritativeSubscription,
  subscriptionPatch,
  type ProfileBillingPatch,
  type StripeSubscriptionLike,
} from "../_shared/plan-lifecycle.ts";

/**
 * Findings above this and an armed run applies NOTHING.
 *
 * Drift is rare and individual. A run that suddenly disagrees with Stripe about
 * dozens of accounts is far more likely to be a bad read — a partial page, an
 * API-version shift, a Stripe incident — than dozens of simultaneously missed
 * webhooks. The cap turns that class of failure into a loud report instead of a
 * mass downgrade.
 */
const MAX_APPLY_FINDINGS = 25;

/** Stripe list page size (its maximum) and a hard stop against a cursor that never advances. */
const STRIPE_PAGE_SIZE = 100;
const MAX_STRIPE_PAGES = 200;

/** PostgREST page size for the profiles sweep, and a hard stop against a stalled cursor. */
const PROFILE_PAGE_SIZE = 1000;
const MAX_PROFILE_ROWS = 200_000;

type Svc = ReturnType<typeof serviceClient>;

type FindingKind =
  | "plan_mismatch"
  | "status_mismatch"
  | "period_mismatch"
  | "unmatched_customer"
  | "business_skip";

interface LinkedProfile {
  id: string;
  plan: string;
  stripe_customer_id: string;
  subscription_status: string | null;
  subscription_period_end: string | null;
}

interface FindingRow {
  run_id: string;
  profile_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  kind: FindingKind;
  /**
   * For the three `*_mismatch` kinds this IS the ProfileBillingPatch to write —
   * exactly one column, the one that drifted. `business_skip` and
   * `unmatched_customer` carry null so that no apply pass, now or later, can
   * find anything to act on.
   */
  expected: ProfileBillingPatch | null;
  actual: Record<string, unknown> | null;
}

/** Constant-time string compare. Length is not secret; the bytes are. */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Same point in time?
 *
 * Postgres hands back `2026-09-01T00:00:00+00:00` where Stripe-derived values are
 * `2026-09-01T00:00:00.000Z`. Comparing those as strings would report a
 * period_mismatch on every single row.
 */
function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  const x = Date.parse(a);
  const y = Date.parse(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return a === b;
  return x === y;
}

/**
 * Every subscription on the account, in one paginated pass.
 *
 * `status=all` is required: a reconciler that only saw live subscriptions could
 * never tell "cancelled, correctly downgraded" from "cancelled, still on Pro".
 * Throws on any page failure — a PARTIAL list is worse than none, because every
 * customer whose page never arrived looks like an account with no subscriptions
 * and would be reported as needing a downgrade.
 */
async function listAllSubscriptions(): Promise<StripeSubscriptionLike[]> {
  const all: StripeSubscriptionLike[] = [];
  let startingAfter: string | undefined;

  for (let page = 0; page < MAX_STRIPE_PAGES; page++) {
    const query = new URLSearchParams({ status: "all", limit: String(STRIPE_PAGE_SIZE) });
    if (startingAfter) query.set("starting_after", startingAfter);

    const res = await stripeFetch<{ data?: StripeSubscriptionLike[]; has_more?: boolean }>(
      `/subscriptions?${query.toString()}`,
      { method: "GET" },
    );

    const batch = Array.isArray(res.data) ? res.data : [];
    all.push(...batch);

    const last = batch[batch.length - 1]?.id;
    if (!res.has_more || !last) return all;
    startingAfter = last;
  }

  throw new Error(`subscription list exceeded ${MAX_STRIPE_PAGES} pages — refusing to loop`);
}

/**
 * Every profile bound to a Stripe customer.
 *
 * The `not null` filter is what keeps comped accounts out of the reconciler
 * entirely: a plan set by hand with no Stripe customer behind it has no Stripe
 * truth to be compared against, and deriving one would read as drift and
 * downgrade a deliberately granted account.
 */
async function loadLinkedProfiles(svc: Svc): Promise<LinkedProfile[]> {
  const columns = "id, plan, stripe_customer_id, subscription_status, subscription_period_end";
  const all: LinkedProfile[] = [];

  for (let from = 0; from < MAX_PROFILE_ROWS;) {
    const { data, error } = await svc
      .from("profiles")
      .select(columns)
      .not("stripe_customer_id", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PROFILE_PAGE_SIZE - 1);

    if (error) throw new Error(`profiles read failed: ${error.message}`);

    const batch = (data ?? []) as unknown as LinkedProfile[];
    all.push(...batch);
    if (batch.length === 0) return all;
    // Advance by what came BACK, not by what was asked for: PostgREST may cap a
    // page below PROFILE_PAGE_SIZE, and a fixed stride would then read a short
    // page as the end of the table and silently skip every profile after it.
    from += batch.length;
  }

  throw new Error(`profiles sweep exceeded ${MAX_PROFILE_ROWS} rows — refusing to loop`);
}

/**
 * Compare one profile against the subscriptions Stripe holds for its customer.
 *
 * `plan` is always compared — it is the column every entitlement gate reads and
 * the only one worth waking anybody for. The two mirror columns are compared
 * ONLY when a subscription actually grants access: with nothing granting,
 * `subscriptionPatch(..., { revoked: true })` normalises the expectation to
 * `canceled` / null, while the webhook legitimately left behind whatever
 * terminal state it last saw (`unpaid`, `incomplete`, a stale period end).
 * Comparing those would flag every long-cancelled account, forever, and bury the
 * one finding that matters.
 */
function compareProfile(
  runId: string,
  profile: LinkedProfile,
  subs: StripeSubscriptionLike[],
): FindingRow[] {
  const base = {
    run_id: runId,
    profile_id: profile.id,
    stripe_customer_id: profile.stripe_customer_id,
  };

  // Business is observed and never touched: the tier is not purchasable
  // (_shared/billing.ts sells `pro` only), so every business account was granted
  // by hand and Stripe cannot be the authority on it. Expected is null, which
  // means there is nothing here for an apply pass to act on even by accident.
  if (profile.plan === "business") {
    return [{
      ...base,
      stripe_subscription_id: null,
      kind: "business_skip",
      expected: null,
      actual: {
        plan: profile.plan,
        subscription_status: profile.subscription_status,
        subscription_period_end: profile.subscription_period_end,
      },
    }];
  }

  const selected = selectAuthoritativeSubscription(subs);
  const expected = subscriptionPatch(selected ?? {}, { revoked: selected === null });
  const subscriptionId = selected?.id ?? null;

  const findings: FindingRow[] = [];

  if (expected.plan !== profile.plan) {
    findings.push({
      ...base,
      stripe_subscription_id: subscriptionId,
      kind: "plan_mismatch",
      expected: { plan: expected.plan },
      actual: { plan: profile.plan },
    });
  }

  if (selected !== null) {
    const expectedStatus = expected.subscription_status ?? null;
    if (expectedStatus !== profile.subscription_status) {
      findings.push({
        ...base,
        stripe_subscription_id: subscriptionId,
        kind: "status_mismatch",
        expected: { subscription_status: expectedStatus },
        actual: { subscription_status: profile.subscription_status },
      });
    }

    const expectedEnd = expected.subscription_period_end ?? null;
    if (!sameInstant(expectedEnd, profile.subscription_period_end)) {
      findings.push({
        ...base,
        stripe_subscription_id: subscriptionId,
        kind: "period_mismatch",
        expected: { subscription_period_end: expectedEnd },
        actual: { subscription_period_end: profile.subscription_period_end },
      });
    }
  }

  return findings;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"]}, x-recon-secret`,
      },
    });
  }
  if (req.method !== "POST") return fail("Method not allowed", 405);

  // The gate, before any Stripe call, any DB read, any run row. Platform JWT
  // verification has already run at this point; this is the second factor, so a
  // leaked anon key alone cannot start a reconciliation. An unset secret fails
  // CLOSED — a function deployed without one is unreachable, not open.
  const secret = Deno.env.get("RECONCILE_SECRET") ?? "";
  const presented = req.headers.get("x-recon-secret") ?? "";
  if (!secret || !presented || !constantTimeEquals(presented, secret)) {
    // Never echoes either value, and never distinguishes "unset" from "wrong".
    return fail("Unauthorized", 401);
  }

  const armed = Deno.env.get("RECONCILE_APPLY") === "true";
  const svc = serviceClient();

  const { data: runRow, error: runErr } = await svc
    .from("billing_recon_runs")
    .insert({ mode: armed ? "apply" : "report" })
    .select("id")
    .single();

  if (runErr || !runRow) {
    // No run row means no record of what was done, so nothing gets done.
    return fail(`Could not open a reconciliation run: ${runErr?.message ?? "no row returned"}`, 500);
  }
  const runId = (runRow as { id: string }).id;

  const finalize = async (patch: Record<string, unknown>) => {
    await svc
      .from("billing_recon_runs")
      .update({ finished_at: new Date().toISOString(), ...patch })
      .eq("id", runId);
  };

  // ── gather ────────────────────────────────────────────────────────────────
  let subscriptions: StripeSubscriptionLike[];
  let profiles: LinkedProfile[];
  try {
    subscriptions = await listAllSubscriptions();
    profiles = await loadLinkedProfiles(svc);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[reconcile-billing] run ${runId} aborted before comparing:`, message);
    // Abort rather than compare against a partial picture — see listAllSubscriptions.
    await finalize({ mode: "report", error: `aborted: ${message}`.slice(0, 500) });
    return json({ run_id: runId, mode: "report", aborted: true, error: message }, 502);
  }

  // ── compare ───────────────────────────────────────────────────────────────
  const byCustomer = new Map<string, StripeSubscriptionLike[]>();
  for (const sub of subscriptions) {
    const customer = customerIdOf(sub.customer);
    if (!customer) continue;
    const bucket = byCustomer.get(customer);
    if (bucket) bucket.push(sub);
    else byCustomer.set(customer, [sub]);
  }

  const findings: FindingRow[] = [];
  const seenCustomers = new Set<string>();

  for (const profile of profiles) {
    seenCustomers.add(profile.stripe_customer_id);
    findings.push(
      ...compareProfile(runId, profile, byCustomer.get(profile.stripe_customer_id) ?? []),
    );
  }

  // A Stripe customer carrying subscriptions that no profile claims: a deleted
  // account still being billed, or a customer bound to a profile row that was
  // never written. Recorded, never actionable — this function does not create
  // profiles, so expected stays null.
  for (const [customer, subs] of byCustomer) {
    if (seenCustomers.has(customer)) continue;
    const selected = selectAuthoritativeSubscription(subs);
    findings.push({
      run_id: runId,
      profile_id: null,
      stripe_customer_id: customer,
      stripe_subscription_id: selected?.id ?? subs[0]?.id ?? null,
      kind: "unmatched_customer",
      expected: null,
      actual: {
        subscriptions: subs.length,
        grants_access: selected !== null,
        status: selected?.status ?? null,
      },
    });
  }

  // ── record ────────────────────────────────────────────────────────────────
  let stored: Array<FindingRow & { id: string }> = [];
  if (findings.length > 0) {
    const { data, error } = await svc
      .from("billing_recon_findings")
      .insert(findings)
      .select("id, kind, profile_id, stripe_customer_id, stripe_subscription_id, expected, actual");

    if (error) {
      console.error(`[reconcile-billing] run ${runId} could not store findings:`, error.message);
      await finalize({
        mode: "report",
        subscriptions_seen: subscriptions.length,
        profiles_checked: profiles.length,
        findings_count: findings.length,
        error: `findings insert failed: ${error.message}`.slice(0, 500),
      });
      return json({ run_id: runId, mode: "report", aborted: true, error: error.message }, 500);
    }
    stored = (data ?? []) as unknown as Array<FindingRow & { id: string }>;
  }

  // ── apply, only when armed and only under the cap ──────────────────────────
  const capTripped = armed && findings.length > MAX_APPLY_FINDINGS;
  const applying = armed && !capTripped;
  const mode = applying ? "apply" : "report";

  let applied = 0;
  const applyErrors: string[] = [];

  if (applying) {
    for (const finding of stored) {
      const patch = finding.expected;
      if (!patch || !finding.profile_id || Object.keys(patch).length === 0) continue;

      const { error: updateErr } = await svc
        .from("profiles")
        .update(patch)
        .eq("id", finding.profile_id);

      if (updateErr) {
        applyErrors.push(`${finding.profile_id}: ${updateErr.message}`);
        continue;
      }

      await svc
        .from("billing_recon_findings")
        .update({ applied: true, applied_at: new Date().toISOString() })
        .eq("id", finding.id);
      applied++;
      console.log(`[reconcile-billing] applied ${finding.kind} to profile ${finding.profile_id}`);
    }
  }

  const runError = capTripped
    ? `apply skipped: ${findings.length} findings exceed the cap of ${MAX_APPLY_FINDINGS} — ` +
      `run downgraded to report, no profile written`
    : applyErrors.length > 0
    ? `applied ${applied}/${stored.length} — failures: ${applyErrors.join("; ")}`
    : null;

  if (capTripped) {
    console.warn(`[reconcile-billing] run ${runId} tripped the apply cap at ${findings.length} findings`);
  }

  const byKind: Record<string, number> = {};
  for (const finding of findings) byKind[finding.kind] = (byKind[finding.kind] ?? 0) + 1;

  await finalize({
    mode,
    subscriptions_seen: subscriptions.length,
    profiles_checked: profiles.length,
    findings_count: findings.length,
    error: runError?.slice(0, 500) ?? null,
  });

  return json({
    run_id: runId,
    mode,
    armed,
    cap_tripped: capTripped,
    subscriptions_seen: subscriptions.length,
    profiles_checked: profiles.length,
    findings_count: findings.length,
    findings_by_kind: byKind,
    applied,
    error: runError,
    findings: (stored.length > 0 ? stored : findings).slice(0, 10).map((f) => ({
      kind: f.kind,
      profile_id: f.profile_id,
      stripe_customer_id: f.stripe_customer_id,
      stripe_subscription_id: f.stripe_subscription_id,
      expected: f.expected,
      actual: f.actual,
    })),
  });
});
