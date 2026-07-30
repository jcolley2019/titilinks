// BILL.B2 — Stripe is the source of truth for the plan.
//
// The webhook handler itself is server-side and cannot be driven from a browser;
// its decision layer (plan-flip table, signature verification, attribution,
// rule-R1 invoice gating) is unit-tested with constructed events and real HMACs
// in scripts/billing.test.mjs, wired into `npm run guard`.
//
// What THIS spec pins is the browser-observable half of the same contract:
//
//   1. No code path in the app writes a billing column from the client. Asserted
//      at the network layer across a walk of every surface that touches
//      `profiles`, so a future call site fails here rather than in production
//      against the guard_billing_columns trigger.
//   2. Every plan-dependent gate reads the DB value and nothing else — flip the
//      row and the UI follows, with no client-side write in either direction.
//
// Mutation-verified: adding `plan: 'pro'` to any client profiles update, or
// deriving a gate from anything other than the DB row, fails these tests.

import { test, expect, type Page } from '@playwright/test';

const BILLING_COLUMNS = [
  'plan',
  'stripe_customer_id',
  'subscription_status',
  'subscription_period_end',
] as const;

interface ProfileWrite {
  method: string;
  body: Record<string, unknown>;
}

/**
 * Pin `profiles.plan` and record every write the client attempts to `profiles`.
 * Writes are fulfilled (never passed through) so nothing can mutate the shared
 * test account.
 */
async function routeProfiles(page: Page, plan: 'free' | 'pro' | 'business') {
  const writes: ProfileWrite[] = [];

  await page.route('**/rest/v1/profiles*', async (route) => {
    const req = route.request();
    const method = req.method();

    if (method === 'GET') {
      if (/select=plan(\b|&|$|%2C|,)/.test(req.url())) {
        return route.fulfill({ json: { plan, show_badge: true } });
      }
      return route.continue();
    }

    // PATCH / POST / PUT — record it, then answer without touching the DB.
    let body: Record<string, unknown> = {};
    try {
      const raw = JSON.parse(req.postData() || '{}');
      body = Array.isArray(raw) ? (raw[0] ?? {}) : raw;
    } catch {
      /* non-JSON body — recorded as {} so the write still counts */
    }
    writes.push({ method, body });
    return route.fulfill({ status: 204, body: '' });
  });

  return writes;
}

/** Assert no recorded write touched a Stripe-owned column. */
function expectNoBillingWrites(writes: ProfileWrite[]) {
  const offenders = writes
    .filter((w) => BILLING_COLUMNS.some((c) => c in w.body))
    .map((w) => `${w.method} ${JSON.stringify(w.body)}`);

  expect(
    offenders,
    `client wrote a Stripe-owned column — only the stripe-webhook function may:\n${offenders.join('\n')}`,
  ).toEqual([]);
}

test.describe('no client-side billing writes', () => {
  test('walking every plan-aware surface writes no billing column', async ({ page }) => {
    const writes = await routeProfiles(page, 'free');

    // Every surface that reads the plan or writes to `profiles` at all.
    await page.goto('/dashboard/settings');
    await expect(page.getByTestId('settings-current-plan')).toBeVisible();

    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');

    await page.goto('/dashboard/short-links');
    await page.waitForLoadState('networkidle');

    await page.goto('/dashboard/analytics');
    await page.waitForLoadState('networkidle');

    await page.goto('/billing/success?session_id=cs_test_truth');
    await expect(page.getByTestId('billing-success-card')).toBeVisible();

    await page.goto('/#pricing');
    await page.getByTestId('pricing-card-pro').scrollIntoViewIfNeeded();

    expectNoBillingWrites(writes);
  });

  test('the badge toggle writes show_badge and nothing else', async ({ page }) => {
    // The one client write to `profiles` that a paid user can trigger from the
    // settings page (PROMO.TOGGLE.1). It must stay narrow.
    const writes = await routeProfiles(page, 'pro');

    await page.goto('/dashboard/settings');
    const toggle = page.locator('button[role="switch"]').last();
    await toggle.click();

    await expect.poll(() => writes.length).toBeGreaterThan(0);

    const patch = writes.find((w) => 'show_badge' in w.body);
    expect(patch, 'the toggle issued a show_badge write').toBeTruthy();
    expect(Object.keys(patch!.body)).toEqual(['show_badge']);
    expectNoBillingWrites(writes);
  });

  test('/billing/success polls but never writes', async ({ page }) => {
    const writes = await routeProfiles(page, 'free');

    await page.goto('/billing/success?session_id=cs_test_poll');
    await expect(page.getByTestId('billing-success-spinner')).toBeVisible();
    // Two poll cycles (3s each) — the page must only ever re-READ.
    await page.waitForTimeout(7000);

    expect(writes, 'the success page issued a write while waiting').toEqual([]);
    await expect(page.getByTestId('billing-success-spinner')).toBeVisible();
  });
});

test.describe('gates follow the DB plan', () => {
  test('free row locks the badge toggle behind a PRO chip', async ({ page }) => {
    await routeProfiles(page, 'free');
    await page.goto('/dashboard/settings');

    await expect(page.getByTestId('settings-current-plan')).toHaveText('Free');
    // PROMO.TOGGLE.1: free stays branded, so the switch is locked on.
    await expect(page.getByRole('link', { name: /^PRO$/ })).toBeVisible();
    await expect(page.getByTestId('settings-billing-upgrade')).toBeVisible();
  });

  test('pro row unlocks it, with no client write to get there', async ({ page }) => {
    const writes = await routeProfiles(page, 'pro');
    await page.goto('/dashboard/settings');

    await expect(page.getByTestId('settings-current-plan')).toHaveText('Pro');
    await expect(page.getByRole('link', { name: /^PRO$/ })).toHaveCount(0);
    await expect(page.getByTestId('settings-manage-billing')).toBeVisible();

    // The tier changed purely because the row said so.
    expectNoBillingWrites(writes);
  });

  test('business row resolves its own label from the same registry', async ({ page }) => {
    await routeProfiles(page, 'business');
    await page.goto('/dashboard/settings');
    await expect(page.getByTestId('settings-current-plan')).toHaveText('Business');
  });
});
