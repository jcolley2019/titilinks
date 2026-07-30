// BILL.B2 — unit tests for the Stripe webhook decision layer.
//
// Same convention as brand.test.mjs / tpl-apply.test.mjs: a standalone node
// script run with `npx tsx`, no network, no DB. Run:
//   npx tsx scripts/billing.test.mjs
//
// Two things are verified here that a Playwright spec structurally cannot:
//
//   1. The plan-flip table (supabase/functions/_shared/plan-lifecycle.ts). Which
//      Stripe status grants Pro is the single most consequential mapping in the
//      app — get it wrong one way and paying customers lose their page, wrong the
//      other way and everyone gets Pro for free. It is table-driven and total.
//
//   2. Signature verification against REAL HMACs built with node:crypto, rather
//      than a mocked-out verifier. Mocking the check would test nothing: the
//      whole point is that a forged or replayed body is rejected.
//
// Plus a static census: nothing in src/ may write profiles.plan from the client.

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  ACCESS_GRANTING_STATUSES,
  ACCESS_REVOKING_STATUSES,
  HANDLED_EVENT_TYPES,
  customerIdOf,
  isFirstSubscriptionInvoice,
  isHandledEvent,
  isRealPaidInvoice,
  periodEndOf,
  planForSubscriptionStatus,
  resolveCustomerId,
  resolveSubscriptionId,
  resolveUserId,
  subscriptionPatch,
} from '../supabase/functions/_shared/plan-lifecycle.ts';
import {
  SIGNATURE_TOLERANCE_SECONDS,
  encodeForm,
  parseSignatureHeader,
  verifyStripeSignature,
} from '../supabase/functions/_shared/stripe.ts';
import {
  ALLOWED_PRICE_IDS,
  PRO_PRICES,
  priceDefinitionFor,
} from '../supabase/functions/_shared/billing.ts';
import {
  MAX_EARNED_MONTHS_PER_YEAR,
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  REF_COUPON_ID,
  REF_COUPON_SPEC,
  RESERVED_REF_VALUES,
  RETENTION_HOLD_DAYS,
  decideClawback,
  decideQualification,
  decideRelease,
  holdElapsed,
  isSelfReferral,
  isValidReferralCode,
  qualifyAtFrom,
} from '../supabase/functions/_shared/referrals.ts';
import { ENTITLEMENTS } from '../src/lib/entitlements.ts';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

// ── 1. plan-flip table ───────────────────────────────────────────────────────

// Every Stripe subscription status, and the plan it must produce. `past_due`
// KEEPS Pro on purpose (dunning grace); `unpaid` is where access ends.
const PLAN_TABLE = [
  ['active', 'pro', 'the ordinary paying state'],
  ['trialing', 'pro', 'a trial grants features'],
  ['past_due', 'pro', 'dunning grace — a retryable card must not dark a live page'],
  ['unpaid', 'free', 'dunning exhausted'],
  ['canceled', 'free', 'subscription over'],
  ['incomplete', 'free', 'first payment never succeeded'],
  ['incomplete_expired', 'free', 'first payment abandoned'],
  ['paused', 'free', 'no billing, no features'],
];

for (const [status, expected, why] of PLAN_TABLE) {
  assert.equal(planForSubscriptionStatus(status), expected, `${status} → ${expected} (${why})`);
}
ok(`plan-flip table: all ${PLAN_TABLE.length} Stripe statuses map as designed`);

// The two status lists must partition the table — a status in neither list is a
// status nobody decided about.
const listed = new Set([...ACCESS_GRANTING_STATUSES, ...ACCESS_REVOKING_STATUSES]);
assert.deepEqual(
  PLAN_TABLE.map(([s]) => s).filter((s) => !listed.has(s)),
  [],
  'every tested status appears in exactly one of the two exported lists',
);
assert.equal(listed.size, ACCESS_GRANTING_STATUSES.length + ACCESS_REVOKING_STATUSES.length,
  'the granting and revoking lists do not overlap');
ok('granting/revoking status lists partition cleanly');

// Unknown values fail CLOSED. A Stripe API change must never mint free Pro.
for (const unknown of ['', null, undefined, 'schrodinger', 'ACTIVE', 'active ']) {
  assert.equal(planForSubscriptionStatus(unknown), 'free',
    `unrecognised status ${JSON.stringify(unknown)} must fall back to free`);
}
ok('unknown / null / mis-cased statuses fail closed to free');

// ── 2. subscriptionPatch ─────────────────────────────────────────────────────

{
  const patch = subscriptionPatch({
    id: 'sub_1',
    status: 'active',
    customer: 'cus_1',
    current_period_end: 1_800_000_000,
  });
  assert.equal(patch.plan, 'pro');
  assert.equal(patch.subscription_status, 'active');
  assert.equal(patch.stripe_customer_id, 'cus_1');
  assert.equal(patch.subscription_period_end, new Date(1_800_000_000_000).toISOString());
  ok('active subscription patches plan, status, customer and period end');
}

{
  // `deleted` is authoritative regardless of the status Stripe leaves on the
  // object — the event type is the signal, not the field.
  const patch = subscriptionPatch({ status: 'active', customer: 'cus_2' }, { revoked: true });
  assert.equal(patch.plan, 'free', 'a deleted subscription revokes even when status still reads active');
  assert.equal(patch.subscription_status, 'canceled');
  ok('revoked flag overrides a stale active status');
}

{
  const patch = subscriptionPatch({ status: 'past_due', customer: 'cus_3' });
  assert.equal(patch.plan, 'pro', 'past_due keeps access');
  assert.equal(patch.subscription_status, 'past_due', 'but the reason is recorded');
  ok('past_due keeps Pro while recording the state');
}

{
  // Newer Stripe API versions moved current_period_end onto the items.
  const patch = subscriptionPatch({
    status: 'active',
    customer: { id: 'cus_4' },
    items: { data: [{ current_period_end: 1_900_000_000 }] },
  });
  assert.equal(patch.stripe_customer_id, 'cus_4', 'expanded customer object is normalised to an id');
  assert.equal(patch.subscription_period_end, new Date(1_900_000_000_000).toISOString());
  ok('period end falls back to subscription items; expanded customer normalises');
}

{
  const patch = subscriptionPatch({ status: 'active' });
  assert.equal(patch.subscription_period_end, null, 'a missing period end is null, not NaN or 1970');
  assert.ok(!('stripe_customer_id' in patch), 'no customer → the column is left untouched, not nulled');
  ok('absent fields are omitted rather than written as junk');
}

assert.equal(periodEndOf({ current_period_end: Number.NaN }), null);
assert.equal(periodEndOf({ current_period_end: 'soon' }), null);
assert.equal(customerIdOf({}), null);
assert.equal(customerIdOf(''), null);
ok('periodEndOf / customerIdOf reject malformed input');

// ── 3. attribution: who does this event belong to? ───────────────────────────

const ev = (object, type = 'invoice.paid', id = 'evt_1') => ({ id, type, data: { object } });

assert.equal(resolveUserId(ev({ client_reference_id: 'u1' })), 'u1');
assert.equal(resolveUserId(ev({ metadata: { user_id: 'u2' } })), 'u2');
assert.equal(resolveUserId(ev({ subscription_details: { metadata: { user_id: 'u3' } } })), 'u3');
assert.equal(resolveUserId(ev({ parent: { subscription_details: { metadata: { user_id: 'u4' } } } })), 'u4');
assert.equal(resolveUserId(ev({ customer: 'cus_x' })), null, 'no metadata → null, never a guess');
assert.equal(resolveUserId(ev({ client_reference_id: '' })), null, 'empty string is not an id');
ok('resolveUserId reads all four metadata carriers and refuses to guess');

// client_reference_id wins: it is the one we set at checkout creation.
assert.equal(
  resolveUserId(ev({ client_reference_id: 'u1', metadata: { user_id: 'other' } })),
  'u1',
  'client_reference_id outranks metadata',
);
ok('attribution precedence is deterministic');

assert.equal(resolveCustomerId(ev({ customer: 'cus_9' })), 'cus_9');
assert.equal(resolveCustomerId(ev({ customer: { id: 'cus_10' } })), 'cus_10');
assert.equal(resolveCustomerId(ev({})), null);
assert.equal(resolveSubscriptionId(ev({ subscription: 'sub_9' })), 'sub_9');
assert.equal(resolveSubscriptionId(ev({ subscription: { id: 'sub_10' } })), 'sub_10');
assert.equal(resolveSubscriptionId(ev({ parent: { subscription_details: { subscription: 'sub_11' } } })), 'sub_11');
assert.equal(resolveSubscriptionId(ev({})), null);
ok('customer / subscription ids resolve across both Stripe payload shapes');

// ── 4. rule R1 — only REAL money qualifies a referral ────────────────────────

const INVOICE_TABLE = [
  [{ paid: true, amount_paid: 900, billing_reason: 'subscription_create' }, true, true, 'first real charge'],
  [{ paid: true, amount_paid: 900, billing_reason: 'subscription_cycle' }, true, false, 'renewal is real but not first'],
  [{ paid: true, amount_paid: 0, billing_reason: 'subscription_create' }, false, true, '100% coupon — no money moved'],
  [{ paid: false, amount_paid: 900, billing_reason: 'subscription_create' }, false, true, 'not actually paid'],
  [{ paid: true, billing_reason: 'subscription_create' }, false, true, 'no amount field at all'],
  [{ paid: true, amount_paid: 0, billing_reason: 'subscription_update' }, false, false, 'credited proration'],
];

for (const [invoice, real, first, why] of INVOICE_TABLE) {
  assert.equal(isRealPaidInvoice(invoice), real, `isRealPaidInvoice: ${why}`);
  assert.equal(isFirstSubscriptionInvoice(invoice), first, `isFirstSubscriptionInvoice: ${why}`);
}
// The conjunction is what gates a reward — a $0 invoice can never qualify one.
assert.equal(
  INVOICE_TABLE.filter(([inv]) => isRealPaidInvoice(inv) && isFirstSubscriptionInvoice(inv)).length,
  1,
  'exactly one row in the table qualifies a referral',
);
ok(`rule R1: ${INVOICE_TABLE.length} invoice shapes gate rewards on real first payments only`);

// ── 5. handled event types ───────────────────────────────────────────────────

for (const t of HANDLED_EVENT_TYPES) assert.ok(isHandledEvent(t), `${t} is handled`);
for (const t of ['customer.created', 'charge.succeeded', 'invoice.finalized', '', 'INVOICE.PAID']) {
  assert.equal(isHandledEvent(t), false, `${t} is not handled`);
}
assert.equal(HANDLED_EVENT_TYPES.length, 6, 'the handled set is exactly the six documented events');
ok('handled-event set is closed and case-sensitive');

// ── 6. signature verification against real HMACs ─────────────────────────────

const SECRET = 'whsec_test_do_not_use_anywhere_real';
const NOW = 1_800_000_000;

/** Build a Stripe-Signature header the way Stripe does. */
function sign(body, { secret = SECRET, timestamp = NOW, extraV1 = [] } = {}) {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return [`t=${timestamp}`, ...[v1, ...extraV1].map((s) => `v1=${s}`)].join(',');
}

const BODY = JSON.stringify({
  id: 'evt_test_1',
  type: 'checkout.session.completed',
  data: { object: { client_reference_id: 'u1', customer: 'cus_1', subscription: 'sub_1' } },
});

assert.deepEqual(await verifyStripeSignature(BODY, sign(BODY), SECRET, NOW), { ok: true });
ok('a correctly signed body verifies');

{
  const r = await verifyStripeSignature(BODY, sign(BODY, { secret: 'whsec_wrong' }), SECRET, NOW);
  assert.equal(r.ok, false);
  assert.match(r.reason, /no signature matched/);
  ok('a body signed with the wrong secret is rejected');
}

{
  // Tampering with one character of the payload must invalidate it — this is the
  // property that makes the raw-body requirement non-negotiable.
  const tampered = BODY.replace('"u1"', '"u2"');
  const r = await verifyStripeSignature(tampered, sign(BODY), SECRET, NOW);
  assert.equal(r.ok, false);
  ok('a tampered body is rejected against a valid signature');
}

{
  // Re-serialising the parsed JSON changes key order/spacing → different HMAC.
  const reserialized = JSON.stringify(JSON.parse(BODY), null, 2);
  const r = await verifyStripeSignature(reserialized, sign(BODY), SECRET, NOW);
  assert.equal(r.ok, false);
  ok('re-serialised JSON fails — the handler must use the RAW body');
}

{
  const stale = NOW - SIGNATURE_TOLERANCE_SECONDS - 1;
  const r = await verifyStripeSignature(BODY, sign(BODY, { timestamp: stale }), SECRET, NOW);
  assert.equal(r.ok, false);
  assert.match(r.reason, /tolerance/);
  ok('a replayed event outside the tolerance window is rejected');
}

{
  const edge = NOW - SIGNATURE_TOLERANCE_SECONDS;
  assert.deepEqual(await verifyStripeSignature(BODY, sign(BODY, { timestamp: edge }), SECRET, NOW), { ok: true });
  ok('the tolerance boundary itself is accepted (inclusive)');
}

{
  // During a secret rotation Stripe sends several v1 signatures; any match wins.
  const header = sign(BODY, { extraV1: ['deadbeef'.repeat(8)] });
  assert.deepEqual(await verifyStripeSignature(BODY, header, SECRET, NOW), { ok: true });
  ok('multiple v1 signatures (secret rotation) verify if any one matches');
}

for (const [header, why] of [
  [null, 'missing header'],
  ['', 'empty header'],
  ['t=123', 'no v1'],
  ['v1=abc', 'no timestamp'],
  ['garbage', 'unparseable'],
]) {
  const r = await verifyStripeSignature(BODY, header, SECRET, NOW);
  assert.equal(r.ok, false, `rejected: ${why}`);
}
assert.deepEqual(parseSignatureHeader('t=1,v1=a,v1=b'), { timestamp: 1, v1: ['a', 'b'] });
ok('malformed / missing signature headers are all rejected');

{
  const r = await verifyStripeSignature(BODY, sign(BODY), '', NOW);
  assert.equal(r.ok, false);
  assert.match(r.reason, /STRIPE_WEBHOOK_SECRET/);
  ok('an unset webhook secret fails loudly rather than accepting everything');
}

// ── 7. price allowlist (the server decides what anyone pays) ─────────────────

assert.equal(PRO_PRICES.length, 2, 'exactly the two founding Pro prices are purchasable');
assert.deepEqual(
  PRO_PRICES.map((p) => p.lookupKey).sort(),
  ['pro_monthly_founding', 'pro_yearly_founding'],
);
assert.deepEqual(
  PRO_PRICES.map((p) => p.interval).sort(),
  ['month', 'year'],
  'one price per interval — no ambiguity about what a toggle buys',
);
for (const p of PRO_PRICES) {
  assert.equal(priceDefinitionFor(p.id)?.lookupKey, p.lookupKey);
  assert.equal(priceDefinitionFor(p.id)?.plan, 'pro');
}
// Derived, not re-typed: the uppercased form of a REAL price id must still be
// rejected, and that stays a case-sensitivity test after any id rotation.
const uppercasedRealId = PRO_PRICES[0].id.toUpperCase();
for (const bad of [null, undefined, '', 'price_business', uppercasedRealId, 42, {}]) {
  assert.equal(priceDefinitionFor(bad), null, `${JSON.stringify(bad)} is not purchasable`);
}
assert.equal(ALLOWED_PRICE_IDS.length, 2);
ok('price allowlist accepts only the two Pro prices — Business is not purchasable');

// ── 8. Stripe form encoding (nested checkout payloads) ───────────────────────

{
  const encoded = encodeForm({
    mode: 'subscription',
    line_items: [{ price: 'price_1', quantity: 1 }],
    subscription_data: { metadata: { user_id: 'u1', plan: 'pro' } },
    allow_promotion_codes: true,
    customer: undefined,
    customer_email: null,
  });
  const params = new URLSearchParams(encoded);
  assert.equal(params.get('line_items[0][price]'), 'price_1');
  assert.equal(params.get('line_items[0][quantity]'), '1');
  assert.equal(params.get('subscription_data[metadata][user_id]'), 'u1');
  assert.equal(params.get('allow_promotion_codes'), 'true');
  // Stripe rejects a request carrying BOTH customer and customer_email, so the
  // undefined/null branches must drop out entirely rather than send "undefined".
  assert.equal(params.has('customer'), false, 'undefined keys are dropped');
  assert.equal(params.has('customer_email'), false, 'null keys are dropped');
  ok('encodeForm produces Stripe bracket notation and drops empty keys');
}

// ── 9. census: no client-side plan writes ────────────────────────────────────

// B2 task 2. The webhook is the only writer of profiles.plan; the DB trigger in
// 20260729120100_add_webhook_events.sql enforces it, and this keeps the source
// tree honest so nobody writes a call site that will fail only in production.
{
  const SRC = path.resolve(import.meta.dirname, '../src');
  const offenders = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(entry)) continue;

      const text = readFileSync(full, 'utf-8');
      // A write to profiles carrying any billing column.
      const writes = text.matchAll(
        /\.(update|upsert|insert)\(\s*\{[^}]*\b(plan|stripe_customer_id|subscription_status|subscription_period_end)\s*:/g,
      );
      for (const m of writes) {
        offenders.push(`${path.relative(SRC, full)} → .${m[1]}({ ${m[2]}: … })`);
      }
    }
  };
  walk(SRC);

  assert.deepEqual(
    offenders,
    [],
    `client-side billing writes found — Stripe must be the only writer:\n  ${offenders.join('\n  ')}`,
  );
  ok('census: zero client-side writes to plan / stripe_customer_id / subscription_*');
}

// ── 10. referral rules R1-R6 ─────────────────────────────────────────────────

// Every threshold is asserted against the NAMED constant, not a literal, so the
// tests follow a deliberate policy change but still catch an accidental one.
assert.equal(RETENTION_HOLD_DAYS, 30, 'rule R2 hold — ToS Section 8.2');
assert.equal(MAX_EARNED_MONTHS_PER_YEAR, 12, 'rule R5 cap — ToS Section 8.4');
assert.equal(REF_COUPON_ID, 'ref_month_free');
assert.equal(REF_COUPON_SPEC.percent_off, 100, 'a free month means 100% off');
assert.equal(REF_COUPON_SPEC.duration, 'once', 'one month, not forever');
ok('rule R6: thresholds are named constants with ToS references');

// Rule R2 — the hold arithmetic.
{
  const paidAt = '2026-01-01T00:00:00.000Z';
  const qualifyAt = qualifyAtFrom(paidAt);
  assert.equal(qualifyAt, '2026-01-31T00:00:00.000Z', '30 days after the first paid invoice');
  assert.equal(holdElapsed(qualifyAt, '2026-01-30T23:59:59.000Z'), false, 'day 29 is too early');
  assert.equal(holdElapsed(qualifyAt, qualifyAt), true, 'the boundary itself qualifies');
  assert.equal(holdElapsed(qualifyAt, '2026-02-05T00:00:00.000Z'), true);
  assert.throws(() => qualifyAtFrom('not-a-date'), /invalid firstPaidAt/);
  ok('rule R2: the 30-day hold is inclusive at the boundary and rejects bad input');
}

// Rule R3 — self-referral, both tests.
{
  assert.equal(isSelfReferral({ referrerProfileId: 'a', referredProfileId: 'a' }), true, 'same profile');
  assert.equal(
    isSelfReferral({
      referrerProfileId: 'a',
      referredProfileId: 'b',
      referrerCustomerId: 'cus_same',
      referredCustomerId: 'cus_same',
    }),
    true,
    'two profiles, one Stripe customer — same person',
  );
  assert.equal(
    isSelfReferral({
      referrerProfileId: 'a',
      referredProfileId: 'b',
      referrerCustomerId: 'cus_1',
      referredCustomerId: 'cus_2',
    }),
    false,
    'genuinely different people',
  );
  // A null customer on either side must NOT be read as a match.
  assert.equal(
    isSelfReferral({ referrerProfileId: 'a', referredProfileId: 'b', referrerCustomerId: null, referredCustomerId: null }),
    false,
    'two unknown customers are not the same customer',
  );
  assert.equal(isSelfReferral({ referrerProfileId: null, referredProfileId: 'b' }), false, 'no referrer at all');
  ok('rule R3: self-referral caught by profile id AND shared Stripe customer');
}

// Rules R1 + R3 + R5 — the qualification gate, table-driven.
{
  const base = {
    referredProfileId: 'referred',
    referredBy: 'referrer',
    referredCustomerId: 'cus_r',
    referrerCustomerId: 'cus_a',
    realPayment: true,
    firstInvoice: true,
    earnedInWindow: 0,
    alreadyRecorded: false,
    paidAt: '2026-03-01T00:00:00.000Z',
  };

  const QUAL_TABLE = [
    [{}, 'record', 'the happy path'],
    [{ referredBy: null }, 'skip', 'organic signup — nobody to pay'],
    [{ referredBy: undefined }, 'skip', 'missing referrer'],
    // Rule R1 — this row is the whole anti-farming argument: a free signup
    // never produces a real payment, so it never reaches "record".
    [{ realPayment: false }, 'skip', 'free signup / $0 invoice earns nothing'],
    [{ firstInvoice: false }, 'skip', 'renewals do not re-earn'],
    [{ referredBy: 'referred' }, 'skip', 'self-referral by id'],
    [{ referrerCustomerId: 'cus_r' }, 'skip', 'self-referral by shared customer'],
    [{ alreadyRecorded: true }, 'skip', 'no second grant for one account'],
    [{ earnedInWindow: MAX_EARNED_MONTHS_PER_YEAR }, 'record', 'at the cap — recorded, not granted'],
    [{ earnedInWindow: 99 }, 'record', 'far over the cap — still recorded'],
  ];

  for (const [override, action, why] of QUAL_TABLE) {
    const d = decideQualification({ ...base, ...override });
    assert.equal(d.action, action, `decideQualification: ${why}`);
  }

  // The cap records but never grants (rule R5 — attribution is kept for the
  // future cash program; dropping the row would lose it permanently).
  const atCap = decideQualification({ ...base, earnedInWindow: MAX_EARNED_MONTHS_PER_YEAR });
  assert.equal(atCap.grantable, false);
  assert.equal(atCap.reason, 'cap_exceeded');
  const underCap = decideQualification({ ...base, earnedInWindow: MAX_EARNED_MONTHS_PER_YEAR - 1 });
  assert.equal(underCap.grantable, true, 'one below the cap still earns');
  assert.equal(underCap.qualifyAt, qualifyAtFrom(base.paidAt));
  ok(`rules R1/R3/R5: ${QUAL_TABLE.length} qualification cases, cap records without granting`);
}

// Rule R2 — release, with the void-before-hold ordering.
{
  const hold = { qualifyAt: '2026-04-01T00:00:00.000Z', grantable: true };

  assert.equal(
    decideRelease({ ...hold, status: 'pending', referredStillActive: true, nowIso: '2026-04-02T00:00:00.000Z' }).action,
    'grant',
    'hold elapsed and still subscribed → grant',
  );
  assert.equal(
    decideRelease({ ...hold, status: 'pending', referredStillActive: true, nowIso: '2026-03-20T00:00:00.000Z' }).action,
    'wait',
    'inside the hold → wait',
  );

  // THE ordering case: cancelled during the hold, but not swept until after it.
  // Checking the hold first would pay out here.
  const lapsed = decideRelease({
    ...hold,
    status: 'pending',
    referredStillActive: false,
    nowIso: '2026-05-01T00:00:00.000Z',
  });
  assert.equal(lapsed.action, 'void', 'a lapsed subscription voids even after the hold elapsed');
  assert.equal(lapsed.reason, 'cancellation');

  assert.equal(
    decideRelease({ ...hold, grantable: false, status: 'pending', referredStillActive: true, nowIso: '2026-05-01T00:00:00.000Z' }).action,
    'wait',
    'over the cap → tracked, never granted',
  );
  for (const status of ['granted', 'void']) {
    assert.equal(
      decideRelease({ ...hold, status, referredStillActive: true, nowIso: '2026-05-01T00:00:00.000Z' }).action,
      'wait',
      `${status} is terminal — never released twice`,
    );
  }
  ok('rule R2: release voids a lapsed referral even after the hold, and is idempotent');
}

// Rule R4 — clawback depends on whether the month was already handed over.
{
  for (const reason of ['refund', 'chargeback', 'cancellation']) {
    assert.deepEqual(decideClawback('pending', reason), { action: 'void', reason, log: true });
    assert.deepEqual(decideClawback('granted', reason), { action: 'revoke_if_possible', reason, log: true });
    assert.deepEqual(decideClawback('void', reason), { action: 'noop', reason, log: true });
  }
  // Logging is unconditional: an unrecoverable clawback still has to be visible.
  for (const status of ['pending', 'granted', 'void']) {
    assert.equal(decideClawback(status, 'refund').log, true, `${status} clawback is always logged`);
  }
  ok('rule R4: clawback voids pending, attempts revoke on granted, always logs');
}

// Referral codes: shape, reserved values, and the ?ref=badge collision.
{
  assert.equal(REFERRAL_CODE_LENGTH, 8);
  assert.equal(isValidReferralCode('abcd2345'), true);
  assert.equal(isValidReferralCode('badge'), false, '?ref=badge is the generic badge link, not a referral');
  for (const bad of ['', 'abc', 'abcd23456', 'ABCD2345', 'abcd234!', 'abcd2340', 'abcd234l', null, 42, undefined]) {
    assert.equal(isValidReferralCode(bad), false, `${JSON.stringify(bad)} is not a code`);
  }
  // Look-alike exclusions: 0, 1, i, l, o must never appear in the alphabet.
  for (const ch of ['0', '1', 'i', 'l', 'o']) {
    assert.equal(REFERRAL_CODE_ALPHABET.includes(ch), false, `'${ch}' is a look-alike and is excluded`);
  }
  assert.equal(RESERVED_REF_VALUES.includes('badge'), true);
  // 'badge' is 5 chars, codes are 8 — a real code can never collide with it.
  assert.notEqual('badge'.length, REFERRAL_CODE_LENGTH);
  ok('referral codes: 8 chars, no look-alikes, ?ref=badge reserved and non-colliding');
}

// ── 11. ENT.SRV quota mirror: SQL must agree with entitlements.ts ────────────

// plan_limit()/plan_allows() in 20260729120300_ent_srv.sql duplicate
// src/lib/entitlements.ts because Postgres and the Vite bundle share no runtime.
// Two copies of a number is a bug waiting to happen, so the guard battery parses
// the migration and compares.
{
  const migration = readFileSync(
    path.resolve(import.meta.dirname, '../supabase/migrations/20260729120300_ent_srv.sql'),
    'utf-8',
  );

  /** Pull `when 'business' then N when 'pro' then M else K end` for a limit. */
  const limitFromSql = (name) => {
    const block = migration.match(
      new RegExp(`when '${name}' then[\\s\\S]{0,200}?when 'business' then (\\d+) when 'pro' then (\\d+) else (\\d+) end`),
    );
    assert.ok(block, `plan_limit is missing a '${name}' branch`);
    return { business: +block[1], pro: +block[2], free: +block[3] };
  };

  for (const key of ['maxSnapshots', 'maxShortLinks', 'maxPages']) {
    const sql = limitFromSql(key);
    for (const plan of ['free', 'pro', 'business']) {
      assert.equal(
        sql[plan],
        ENTITLEMENTS[plan][key],
        `ENT.SRV drift: plan_limit('${plan}','${key}') = ${sql[plan]} but entitlements.ts says ${ENTITLEMENTS[plan][key]}`,
      );
    }
  }

  // Boolean flags: every feature plan_allows() knows must be pro+ in both places.
  const flags = [...migration.matchAll(/when '(\w+)' then coalesce\(p_plan, 'free'\) in \('pro', 'business'\)/g)]
    .map((m) => m[1]);
  assert.ok(flags.length >= 4, 'plan_allows should police at least four boolean flags');
  for (const flag of flags) {
    assert.equal(ENTITLEMENTS.free[flag], false, `entitlements.ts: free must NOT have ${flag}`);
    assert.equal(ENTITLEMENTS.pro[flag], true, `entitlements.ts: pro must have ${flag}`);
    assert.equal(ENTITLEMENTS.business[flag], true, `entitlements.ts: business must have ${flag}`);
  }

  ok(`ENT.SRV: SQL quotas match entitlements.ts (3 limits × 3 tiers, ${flags.length} flags)`);
}

console.log(`\nAll ${passed} billing checks passed.`);
