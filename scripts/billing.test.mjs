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
for (const bad of [null, undefined, '', 'price_business', 'PRICE_1TW3JIGNT7TSX25PQEBDG0SY', 42, {}]) {
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

console.log(`\nAll ${passed} billing checks passed.`);
