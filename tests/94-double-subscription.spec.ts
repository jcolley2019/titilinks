// FRAGILE.SUB.1 — a paying customer can never be sold a second subscription.
//
// AUDIT.FRAGILE.1 B1: `useEntitlements` turned a failed plan read into "no
// plan" (= Free), cached it for five minutes and never retried; /dashboard/
// upgrade had no loading state; create-checkout-session never looked for an
// existing subscription. One dropped request could show a paying creator the
// Pro pitch, and the click went through to a second bill.
//
// What this spec pins (the server-side refusal itself is unit-tested in
// scripts/billing.test.mjs — no live Stripe here):
//   • a plan read that fails on every attempt → Retry, no pitch, no checkout
//   • a plan read still in flight → spinner, no checkout; released → paid view
//   • a plan read that fails once → the retry runs and the paid view appears
//   • create-checkout-session answering 409 → "already subscribed" toast on
//     every surface that starts checkout, no hop to Stripe, the plan re-read
//   • B3: the "premium themes" promise is gone from both pricing surfaces
//
// Battery account; every write is blocked on the wire by the fixture guard and
// create-checkout-session is route-mocked (fulfilled before the guard sees it).

import { test, expect, type Page, type Route } from './fixtures';

type Lang = 'en' | 'es';
type Plan = 'free' | 'pro' | 'business';

const PENDING_CHECKOUT_KEY = 'titilinks-pending-checkout';

const ALREADY_SUBSCRIBED: Record<Lang, string> = {
  en: 'You already have an active subscription.',
  es: 'Ya tienes una suscripción activa.',
};

const bootLang = (page: Page, lang: Lang) =>
  page.addInitScript((l) => localStorage.setItem('titilinks-language', l), lang);

const isPlanRead = (route: Route) => {
  const req = route.request();
  return req.method() === 'GET' && /select=plan(\b|&|$|%2C|,)/.test(req.url());
};

const planBody = (plan: Plan) => ({ plan, show_badge: true, referral_code: null });

/**
 * Answer every `profiles.plan` read through `answer(n)` (n = 1-based read
 * number). Returns a live counter so a test can prove the plan was read again.
 */
async function routePlanReads(
  page: Page,
  answer: (n: number) => Plan | 'fail' | Promise<Plan>,
) {
  const reads = { count: 0 };
  await page.route('**/rest/v1/profiles*', async (route) => {
    if (!isPlanRead(route)) return route.continue();
    reads.count += 1;
    const a = await answer(reads.count);
    if (a === 'fail') {
      return route.fulfill({ status: 503, json: { message: 'spec94: plan read failed' } });
    }
    return route.fulfill({ json: planBody(a) });
  });
  return reads;
}

/** create-checkout-session answering 409, as the server now does for a subscriber. */
async function routeCheckoutConflict(page: Page) {
  const calls = { count: 0 };
  await page.route('**/functions/v1/create-checkout-session', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, body: '' });
    calls.count += 1;
    return route.fulfill({
      status: 409,
      json: { error: 'You already have an active subscription' },
    });
  });
  return calls;
}

/** The parts of the Pro pitch that must never show while the plan is unknown. */
async function expectNoPitch(page: Page) {
  await expect(page.getByTestId('upgrade-cta')).toHaveCount(0);
  await expect(page.getByTestId('upgrade-features')).toHaveCount(0);
  await expect(page.getByTestId('upgrade-price')).toHaveCount(0);
  await expect(page.getByTestId('upgrade-interval-toggle')).toHaveCount(0);
}

// ---------------------------------------------------------------------------
// A. + B. — the Upgrade page waits for a real answer
// ---------------------------------------------------------------------------
test.describe('Upgrade page — plan read states', () => {
  test('a plan read failing on every attempt shows Retry, never the pitch', async ({ page }) => {
    await bootLang(page, 'en');
    const reads = await routePlanReads(page, () => 'fail');

    await page.goto('/dashboard/upgrade');
    await expect(page.getByTestId('upgrade-page')).toBeVisible();

    // Three retries with backoff run before the error state — allow for them.
    await expect(page.getByTestId('load-error-retry')).toBeVisible({ timeout: 20_000 });
    await expectNoPitch(page);
    await expect(page.getByTestId('upgrade-manage-billing')).toHaveCount(0);
    // The retries really ran (first attempt + retries), rather than one
    // failure being taken as the answer.
    expect(reads.count).toBeGreaterThan(1);
  });

  test('a plan read held open shows the spinner; released as Pro it shows the paid view', async ({ page }) => {
    await bootLang(page, 'en');
    let release!: () => void;
    const held = new Promise<Plan>((resolve) => {
      release = () => resolve('pro');
    });
    await routePlanReads(page, () => held);

    await page.goto('/dashboard/upgrade');
    await expect(page.getByTestId('upgrade-page')).toBeVisible();
    await expect(page.getByTestId('upgrade-plan-loading')).toBeVisible();
    await expectNoPitch(page);

    release();

    await expect(page.getByTestId('upgrade-current-plan')).toBeVisible();
    await expect(page.getByTestId('upgrade-plan-loading')).toHaveCount(0);
    await expect(page.getByTestId('upgrade-cta')).toHaveCount(0);
  });

  test('a plan read failing once then succeeding as Pro shows the paid view without a reload', async ({ page }) => {
    await bootLang(page, 'en');
    const reads = await routePlanReads(page, (n) => (n === 1 ? 'fail' : 'pro'));

    await page.goto('/dashboard/upgrade');
    await expect(page.getByTestId('upgrade-current-plan')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('upgrade-cta')).toHaveCount(0);
    await expect(page.getByTestId('load-error-state')).toHaveCount(0);
    expect(reads.count).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// D. — a 409 from checkout means "already subscribed", on every surface
// ---------------------------------------------------------------------------
test.describe('checkout 409 — already subscribed', () => {
  for (const lang of ['en', 'es'] as const) {
    test(`Upgrade page (${lang}): toast, no Stripe hop, plan re-read into the paid view`, async ({ page }) => {
      await bootLang(page, lang);
      // The first read says Free (the stale answer that let the pitch show);
      // every later read says Pro — so the paid view can only appear if the
      // 409 made the page read the plan again.
      const reads = await routePlanReads(page, (n) => (n === 1 ? 'free' : 'pro'));
      const checkout = await routeCheckoutConflict(page);

      await page.goto('/dashboard/upgrade');
      await expect(page.getByTestId('upgrade-cta')).toBeVisible();
      const readsBefore = reads.count;

      await page.getByTestId('upgrade-cta').click();

      await expect(page.getByText(ALREADY_SUBSCRIBED[lang], { exact: true })).toBeVisible();
      expect(checkout.count).toBe(1);
      expect(new URL(page.url()).pathname).toBe('/dashboard/upgrade');
      // No description under the toast — the server's English reason is not shown.
      await expect(page.getByText('You already have an active subscription', { exact: true })).toHaveCount(0);

      await expect(page.getByTestId('upgrade-current-plan')).toBeVisible();
      await expect(page.getByTestId('upgrade-cta')).toHaveCount(0);
      expect(reads.count).toBeGreaterThan(readsBefore);
    });
  }

  test('landing pricing grid (en): toast and no Stripe hop', async ({ page }) => {
    await bootLang(page, 'en');
    await routePlanReads(page, () => 'free');
    const checkout = await routeCheckoutConflict(page);

    await page.goto('/#pricing');
    const card = page.getByTestId('pricing-card-pro');
    await card.scrollIntoViewIfNeeded();
    await expect(page.getByTestId('pricing-cta-pro')).toHaveJSProperty('tagName', 'BUTTON');

    await page.getByTestId('pricing-cta-pro').click();

    await expect(page.getByText(ALREADY_SUBSCRIBED.en, { exact: true })).toBeVisible();
    expect(checkout.count).toBe(1);
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('checkout resumed after signup (es): toast, no Stripe hop', async ({ page }) => {
    await bootLang(page, 'es');
    await page.addInitScript((key) => {
      localStorage.setItem(key, JSON.stringify({ interval: 'year', at: Date.now() }));
    }, PENDING_CHECKOUT_KEY);
    await routePlanReads(page, () => 'pro');
    const checkout = await routeCheckoutConflict(page);

    await page.goto('/login');

    await expect(page.getByText(ALREADY_SUBSCRIBED.es, { exact: true })).toBeVisible();
    expect(checkout.count).toBe(1);
    // Falls through to the normal destination, never to Stripe.
    await page.waitForURL(/\/dashboard\/editor|\/onboarding/);
  });
});

// ---------------------------------------------------------------------------
// E. — B3: nothing gates themes, so nothing may promise "premium themes"
// ---------------------------------------------------------------------------
test.describe('no "premium themes" promise', () => {
  const PREMIUM: Record<Lang, RegExp> = {
    en: /premium themes/i,
    es: /temas premium/i,
  };

  for (const lang of ['en', 'es'] as const) {
    test(`Upgrade page (${lang})`, async ({ page }) => {
      await bootLang(page, lang);
      await routePlanReads(page, () => 'free');

      await page.goto('/dashboard/upgrade');
      const features = page.getByTestId('upgrade-features');
      await expect(features).toBeVisible();
      await expect(features.locator('li')).toHaveCount(7);
      await expect(features.getByText(PREMIUM[lang])).toHaveCount(0);
      await expect(page.getByText(PREMIUM[lang])).toHaveCount(0);
    });

    test(`landing pricing grid (${lang})`, async ({ page }) => {
      await bootLang(page, lang);

      await page.goto('/#pricing');
      const card = page.getByTestId('pricing-card-pro');
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeVisible();
      await expect(card.locator('ul li')).toHaveCount(7);
      await expect(page.getByText(PREMIUM[lang])).toHaveCount(0);
    });
  }
});
