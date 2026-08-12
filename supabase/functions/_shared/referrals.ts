// BILL.B3 — the referral reward rules, in ONE place (rule R6).
//
// Every threshold below is a named constant with the ToS section it is promised
// under. Changing a number here changes what customers are owed, so it must
// never be inlined at a call site.
//
//   ToS Section 8 — Referral Rewards.
//
// Grounded in how Beacons and Linktree run give/get: the reward keys on money
// received, not on account creation, and it survives a retention hold before it
// is spendable. Free signups earn ZERO by construction — a farm of throwaway
// emails produces no pending grants at all, because nothing is written until a
// real invoice is paid.
//
// Pure decision functions only (no Deno globals, no network) so
// scripts/billing.test.mjs can drive the whole rule set from Node.

// ---------------------------------------------------------------------------
// Constants — ToS Section 8
// ---------------------------------------------------------------------------

/**
 * Rule R2 — RETENTION HOLD. Days a referred subscription must stay active and
 * unrefunded, measured from its FIRST PAID INVOICE, before either side's free
 * month becomes spendable. Absorbs refund windows and instant-churn abuse: a
 * signup that pays once and refunds never matures into a reward.
 * ToS Section 8.2.
 */
export const RETENTION_HOLD_DAYS = 30;

/**
 * Rule R5 — annual cap on EARNED free months per referrer. Referrals beyond the
 * cap are still recorded (they feed the future cash program) but grant nothing.
 * ToS Section 8.4.
 */
export const MAX_EARNED_MONTHS_PER_YEAR = 12;

/** Window the R5 cap is counted over. ToS Section 8.4. */
export const CAP_WINDOW_DAYS = 365;

/**
 * What one earned "free month" is worth, in cents, per side per grant.
 * ToS Section 8.1.
 *
 * 900 = the $9/month founding rate in `PRO_PRICE.month` (src/lib/pricing.ts).
 * It is a FLAT amount regardless of the referred subscription's interval: an
 * annual referrer earns the same $9 credit a monthly one does, which is what
 * "one free month" means at the monthly rate.
 *
 * REVISIT WHEN FOUNDING PRICING ENDS. If PRO_PRICE.month moves off $9 (or the
 * $15 anchor becomes the real rate), this number is what customers are owed and
 * must be re-decided deliberately — the two are not wired together, because the
 * marketing price is a display string and this is money.
 */
export const REF_CREDIT_CENTS = 900;

/** Currency the referral credit is denominated in. */
export const REF_CREDIT_CURRENCY = "usd";

/** Lifecycle of a row in `pending_grants`. */
export type GrantStatus = "pending" | "granted" | "void";

/** Why a pending grant was voided — kept for support and abuse forensics. */
export type VoidReason =
  | "refund"
  | "chargeback"
  | "cancellation"
  | "self_referral"
  | "cap_exceeded";

// ---------------------------------------------------------------------------
// Rule R2 — retention hold
// ---------------------------------------------------------------------------

/** The instant a grant becomes releasable: first paid invoice + the hold. */
export function qualifyAtFrom(firstPaidAtIso: string): string {
  const base = new Date(firstPaidAtIso).getTime();
  if (!Number.isFinite(base)) throw new Error(`invalid firstPaidAt: ${firstPaidAtIso}`);
  return new Date(base + RETENTION_HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** True once the hold has elapsed. Boundary is inclusive — on the day counts. */
export function holdElapsed(qualifyAtIso: string, nowIso: string): boolean {
  return new Date(nowIso).getTime() >= new Date(qualifyAtIso).getTime();
}

// ---------------------------------------------------------------------------
// Rule R3 — self-referral
// ---------------------------------------------------------------------------

export interface SelfReferralCheck {
  referrerProfileId: string | null | undefined;
  referredProfileId: string;
  referrerCustomerId?: string | null;
  referredCustomerId?: string | null;
}

/**
 * Rule R3 — reject a referral that is the same person on both sides.
 *
 * Two independent tests, because the id check alone is trivially beaten by
 * signing up twice: same profile id, OR the same Stripe customer paying for
 * both. The unique constraint on profiles.stripe_customer_id is what makes the
 * second test meaningful.
 */
export function isSelfReferral(check: SelfReferralCheck): boolean {
  const { referrerProfileId, referredProfileId, referrerCustomerId, referredCustomerId } = check;
  if (!referrerProfileId) return false;
  if (referrerProfileId === referredProfileId) return true;
  if (referrerCustomerId && referredCustomerId && referrerCustomerId === referredCustomerId) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Rules R1 + R3 + R5 — should this first payment create a pending grant?
// ---------------------------------------------------------------------------

export interface QualificationInput {
  /** The paying (referred) account. */
  referredProfileId: string;
  /** Who referred them — null when the signup was organic. */
  referredBy: string | null | undefined;
  referredCustomerId?: string | null;
  referrerCustomerId?: string | null;
  /** Rule R1: did a REAL charge succeed (not $0, not a trial/credit)? */
  realPayment: boolean;
  /** Rule R1: was this the subscription's FIRST invoice? */
  firstInvoice: boolean;
  /** Rule R5: months this referrer has already EARNED in the cap window. */
  earnedInWindow: number;
  /** Guards against a duplicate grant for the same referred account. */
  alreadyRecorded: boolean;
  /** ISO timestamp of the paid invoice. */
  paidAt: string;
}

export type QualificationDecision =
  | { action: "skip"; reason: string }
  | { action: "record"; qualifyAt: string; grantable: true }
  | { action: "record"; qualifyAt: string; grantable: false; reason: "cap_exceeded" };

/**
 * The whole R1/R3/R5 gate as one pure decision.
 *
 * Note the shape of the cap outcome: over the cap we STILL record the referral
 * (rule R5 — it counts toward the future cash program) but mark it ungrantable.
 * Dropping it entirely would lose the attribution permanently.
 */
export function decideQualification(input: QualificationInput): QualificationDecision {
  if (!input.referredBy) return { action: "skip", reason: "organic signup — no referrer" };

  // Rule R1: rewards key on payment received, never on signup.
  if (!input.realPayment) return { action: "skip", reason: "no real charge — $0 or unpaid invoice" };
  if (!input.firstInvoice) return { action: "skip", reason: "renewal, not a first payment" };

  // Rule R3.
  if (
    isSelfReferral({
      referrerProfileId: input.referredBy,
      referredProfileId: input.referredProfileId,
      referrerCustomerId: input.referrerCustomerId,
      referredCustomerId: input.referredCustomerId,
    })
  ) {
    return { action: "skip", reason: "self-referral" };
  }

  if (input.alreadyRecorded) return { action: "skip", reason: "already recorded for this account" };

  const qualifyAt = qualifyAtFrom(input.paidAt);

  // Rule R5.
  if (input.earnedInWindow >= MAX_EARNED_MONTHS_PER_YEAR) {
    return { action: "record", qualifyAt, grantable: false, reason: "cap_exceeded" };
  }

  return { action: "record", qualifyAt, grantable: true };
}

// ---------------------------------------------------------------------------
// Rule R2 release / Rule R4 clawback
// ---------------------------------------------------------------------------

export interface ReleaseInput {
  status: GrantStatus;
  qualifyAt: string;
  grantable: boolean;
  /** Current state of the referred subscription, per Stripe. */
  referredStillActive: boolean;
  nowIso: string;
}

export type ReleaseDecision =
  | { action: "grant" }
  | { action: "void"; reason: VoidReason }
  | { action: "wait"; reason: string };

/**
 * Rule R2 — release a pending grant, or void it.
 *
 * The ordering matters: a subscription that has lapsed is voided EVEN IF the hold
 * has elapsed. Checking the hold first would pay out for someone who cancelled on
 * day 29 but whose row was not processed until day 31.
 */
export function decideRelease(input: ReleaseInput): ReleaseDecision {
  if (input.status !== "pending") return { action: "wait", reason: `already ${input.status}` };

  if (!input.referredStillActive) return { action: "void", reason: "cancellation" };

  if (!input.grantable) return { action: "wait", reason: "over the annual cap — tracked, not granted" };

  if (!holdElapsed(input.qualifyAt, input.nowIso)) {
    return { action: "wait", reason: `retention hold until ${input.qualifyAt}` };
  }

  return { action: "grant" };
}

/**
 * Rule R4 — what a refund/chargeback does, which depends on whether the month
 * was already handed over.
 *
 * "revoke_if_possible" is a DEBIT of the same amount that was credited, not an
 * undo: Stripe's customer credit balance is an append-only ledger, so the
 * clawback is a new positive balance transaction. It can drive the balance to a
 * debit (the customer owes it on their next invoice), which is the correct
 * outcome for a refunded referral. Logging is unconditional on purpose — a
 * clawback that fails at Stripe still has to be visible.
 */
export function decideClawback(status: GrantStatus, reason: VoidReason): {
  action: "void" | "revoke_if_possible" | "noop";
  reason: VoidReason;
  log: true;
} {
  if (status === "pending") return { action: "void", reason, log: true };
  if (status === "granted") return { action: "revoke_if_possible", reason, log: true };
  return { action: "noop", reason, log: true };
}

// ---------------------------------------------------------------------------
// Referral codes
// ---------------------------------------------------------------------------

/**
 * Alphabet for generated referral codes: lowercase + digits, minus the
 * look-alikes (0/o, 1/l/i). Codes get read off screens and typed by hand.
 */
export const REFERRAL_CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const REFERRAL_CODE_LENGTH = 8;

/** Shape a referral code must have to be worth a DB lookup. */
export const REFERRAL_CODE_PATTERN = new RegExp(
  `^[${REFERRAL_CODE_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`,
);

/**
 * `?ref=badge` is the generic public-page badge link — a real code, structurally,
 * would collide with it. It is reserved and never attributes to anyone.
 */
export const RESERVED_REF_VALUES = ["badge"] as const;

export function isValidReferralCode(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if ((RESERVED_REF_VALUES as readonly string[]).includes(value)) return false;
  return REFERRAL_CODE_PATTERN.test(value);
}

// ---------------------------------------------------------------------------
// Effects — the thin DB/Stripe layer over the decisions above
// ---------------------------------------------------------------------------
// Everything below is I/O. The rules are already decided by the pure functions;
// these just carry them out, and every one of them is safe to run twice (the
// unique constraint on pending_grants.referred_id and the status transitions do
// the idempotency).

/** Minimal shape of the service-role Supabase client these helpers need. */
// deno-lint-ignore no-explicit-any
type Db = any;

export interface QualifyArgs {
  referredProfileId: string;
  referredBy: string | null | undefined;
  referredCustomerId: string | null;
  /** ISO timestamp of the paid invoice. */
  paidAt: string;
}

/**
 * Rule R1 + R3 + R5 — record a pending grant on a referred account's first real
 * payment. Writes nothing when the decision says skip.
 */
export async function qualifyReferralOnFirstPayment(db: Db, args: QualifyArgs): Promise<void> {
  if (!args.referredBy) return;

  // Rule R3's second test needs the REFERRER's customer id: two accounts paying
  // from one Stripe customer are the same person. profiles.stripe_customer_id is
  // unique, so this can only match when they genuinely share one.
  const { data: referrer } = await db
    .from("profiles")
    .select("id, stripe_customer_id")
    .eq("id", args.referredBy)
    .maybeSingle();

  const { data: existing } = await db
    .from("pending_grants")
    .select("id")
    .eq("referred_id", args.referredProfileId)
    .maybeSingle();

  const { data: earned } = await db.rpc("referral_earned_in_window", {
    p_referrer: args.referredBy,
  });

  const decision = decideQualification({
    referredProfileId: args.referredProfileId,
    referredBy: args.referredBy,
    referredCustomerId: args.referredCustomerId,
    referrerCustomerId: referrer?.stripe_customer_id ?? null,
    realPayment: true, // the caller only reaches here for a real first invoice
    firstInvoice: true,
    earnedInWindow: typeof earned === "number" ? earned : 0,
    alreadyRecorded: !!existing,
    paidAt: args.paidAt,
  });

  if (decision.action === "skip") {
    console.log(`[referrals] no grant for ${args.referredProfileId}: ${decision.reason}`);
    return;
  }

  const { error } = await db.from("pending_grants").insert({
    referrer_id: args.referredBy,
    referred_id: args.referredProfileId,
    status: "pending",
    grantable: decision.grantable,
    first_paid_at: args.paidAt,
    qualify_at: decision.qualifyAt,
    void_reason: decision.grantable ? null : "cap_exceeded",
  });

  // 23505 = the one-per-referred unique constraint. A concurrent duplicate
  // event losing this race is the correct outcome, not an error to retry.
  if (error && error.code !== "23505") {
    throw new Error(`pending_grants insert failed: ${error.message}`);
  }

  console.log(
    `[referrals] pending grant for ${args.referredProfileId} → referrer ${args.referredBy}, qualify_at ${decision.qualifyAt}, grantable=${decision.grantable}`,
  );
}

/**
 * Rule R2 — release every pending grant whose retention hold has elapsed.
 *
 * Called opportunistically from invoice.paid, so the common case needs no cron:
 * a platform with any paying traffic sweeps itself. A grant whose referred
 * subscription has lapsed is voided instead of released.
 */
export async function releaseDueGrants(
  db: Db,
  nowIso = new Date().toISOString(),
  applyCredit?: (profileId: string) => Promise<string | null>,
): Promise<void> {
  const { data: due } = await db
    .from("pending_grants")
    .select("id, referrer_id, referred_id, status, grantable, qualify_at")
    .eq("status", "pending")
    .eq("grantable", true)
    .lte("qualify_at", nowIso)
    .limit(50);

  if (!due?.length) return;

  for (const grant of due) {
    // Rule R2's ordering: a lapsed subscription voids the grant even though the
    // hold has elapsed. Checking the hold first would pay out for someone who
    // cancelled on day 29 but whose row was not swept until day 31.
    const { data: referred } = await db
      .from("profiles")
      .select("plan, subscription_status")
      .eq("id", grant.referred_id)
      .maybeSingle();

    const stillActive = referred?.plan === "pro" || referred?.plan === "business";

    const decision = decideRelease({
      status: grant.status as GrantStatus,
      qualifyAt: grant.qualify_at,
      grantable: grant.grantable,
      referredStillActive: stillActive,
      nowIso,
    });

    if (decision.action === "wait") continue;

    if (decision.action === "void") {
      await voidGrant(db, grant.id, decision.reason);
      continue;
    }

    await grantFreeMonths(db, grant, applyCredit);
  }
}

/** Mark a grant void. Idempotent: only a pending row transitions. */
export async function voidGrant(db: Db, grantId: string, reason: VoidReason): Promise<void> {
  await db
    .from("pending_grants")
    .update({ status: "void", voided_at: new Date().toISOString(), void_reason: reason })
    .eq("id", grantId)
    .eq("status", "pending");
  console.log(`[referrals] grant ${grantId} voided: ${reason}`);
}

/**
 * Rules R2/R4 — a referred account losing paid access, refunding, or disputing
 * kills its grant.
 *
 * `reason` is the typed VoidReason that lands in the row / the log; `why` is the
 * free-text originating event, kept alongside it for support. They are separate
 * because the caller knows both the policy reason (refund vs chargeback vs
 * cancellation) and the raw Stripe event type, and collapsing them would lose
 * one of the two.
 *
 * Pending → void. Already granted → both sides are DEBITED the credit they were
 * given, and the clawback is logged either way.
 */
export async function voidGrantsForReferred(
  db: Db,
  referredId: string,
  why: string,
  reason: VoidReason,
  debitCredit?: (profileId: string) => Promise<string | null>,
): Promise<void> {
  const { data: grant } = await db
    .from("pending_grants")
    .select("id, status, referrer_id, referred_id")
    .eq("referred_id", referredId)
    .maybeSingle();

  if (!grant) return;

  const decision = decideClawback(grant.status as GrantStatus, reason);

  if (decision.action === "void") {
    await voidGrant(db, grant.id, decision.reason);
    return;
  }

  if (decision.action === "revoke_if_possible" && debitCredit) {
    // Both sides were credited, so both sides are debited. Each is attempted
    // independently: one failing must not stop the other, because a half-clawed
    // -back grant is still better than none and the log carries the remainder.
    for (const profileId of [grant.referrer_id, grant.referred_id]) {
      try {
        const txn = await debitCredit(profileId);
        console.warn(
          `[referrals] CLAWBACK debit ${REF_CREDIT_CENTS} from ${profileId} for grant ${grant.id} → ${txn ?? "no Stripe customer"}`,
        );
      } catch (err) {
        // Forensics over atomicity: a failed debit is recorded, never retried
        // into a loop and never allowed to fail the webhook.
        console.error(
          `[referrals] CLAWBACK debit FAILED for ${profileId} (grant ${grant.id}):`,
          String(err),
        );
      }
    }
  }

  // Rule R4: log regardless — a clawback that could not be collected still has
  // to be visible.
  console.warn(
    `[referrals] CLAWBACK ${decision.action} for grant ${grant.id} (referred ${referredId}, ${why}, reason=${decision.reason}) — already ${grant.status}`,
  );
}

/**
 * Credit both sides with one free month.
 *
 * `applyCredit` is injected so the Stripe calls stay out of this module (and out
 * of the Node test run). Failing to credit is NOT fatal to the sweep: the row
 * stays pending and the next invoice.paid retries it, which is better than
 * marking a month granted that Stripe never applied.
 *
 * The `*_coupon_id` columns are named for the coupon mechanism this replaced;
 * they now hold the Stripe balance-transaction id. Kept as-is deliberately — the
 * column is "what Stripe object recorded this side's month", and renaming it
 * would need a migration for zero behavioural gain.
 */
export async function grantFreeMonths(
  db: Db,
  grant: { id: string; referrer_id: string; referred_id: string },
  applyCredit?: (profileId: string) => Promise<string | null>,
): Promise<void> {
  let referrerCredit: string | null = null;
  let referredCredit: string | null = null;

  if (applyCredit) {
    try {
      referrerCredit = await applyCredit(grant.referrer_id);
      referredCredit = await applyCredit(grant.referred_id);
    } catch (err) {
      console.error(`[referrals] credit apply failed for grant ${grant.id}:`, String(err));
      return; // stays pending — retried on the next sweep
    }
  }

  await db
    .from("pending_grants")
    .update({
      status: "granted",
      granted_at: new Date().toISOString(),
      referrer_coupon_id: referrerCredit,
      referred_coupon_id: referredCredit,
    })
    .eq("id", grant.id)
    .eq("status", "pending");

  console.log(`[referrals] grant ${grant.id} released — both sides credited one month`);
}

/** The injected Stripe caller these helpers need — the real one is `stripeFetch`. */
type StripeCall = <T>(
  path: string,
  init?: { method?: "GET" | "POST"; body?: Record<string, unknown> },
) => Promise<T>;

/**
 * Move REF_CREDIT_CENTS on a profile's Stripe customer credit balance.
 *
 * Stripe's sign convention, which is the whole reason this is one function and
 * not two: a NEGATIVE amount is a credit (reduces what they owe), a POSITIVE
 * amount is a debit. `sign` makes the call site say which it means.
 *
 * Credit balance rather than a coupon because it is the only mechanism that
 * stacks: three referrals leave $27 sitting on the customer, a remainder carries
 * to the next invoice, and — the reason this brick exists — a grant can be
 * clawed back by posting the opposite transaction.
 */
async function moveReferralBalance(
  db: Db,
  profileId: string,
  stripeCall: StripeCall,
  sign: 1 | -1,
): Promise<string | null> {
  const { data: profile } = await db
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", profileId)
    .maybeSingle();

  const customer = profile?.stripe_customer_id;
  // Someone with no Stripe customer has no balance to move yet. Returning null
  // (rather than throwing) lets the other side still be settled.
  if (!customer) {
    console.log(`[referrals] ${profileId} has no Stripe customer — balance move skipped`);
    return null;
  }

  const credited = sign < 0;
  const txn = await stripeCall<{ id?: string }>(`/customers/${customer}/balance_transactions`, {
    method: "POST",
    body: {
      amount: sign * REF_CREDIT_CENTS,
      currency: REF_CREDIT_CURRENCY,
      description: credited
        ? "TitiLinks referral reward — one month"
        : "TitiLinks referral reward reversed (refund/chargeback)",
    },
  });

  return txn?.id ?? null;
}

/**
 * Credit a profile's Stripe customer with one referral month.
 * Returns the balance-transaction id, or null when they have no customer yet.
 */
export function applyReferralCreditFor(
  db: Db,
  profileId: string,
  stripeCall: StripeCall,
): Promise<string | null> {
  return moveReferralBalance(db, profileId, stripeCall, -1);
}

/**
 * Rule R4 — take a referral month back off a profile's Stripe customer.
 * The balance may go into debit; that is the point.
 */
export function debitReferralCreditFor(
  db: Db,
  profileId: string,
  stripeCall: StripeCall,
): Promise<string | null> {
  return moveReferralBalance(db, profileId, stripeCall, 1);
}
