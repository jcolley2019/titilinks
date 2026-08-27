// BILL.B1 — Stripe checkout + portal wiring.
//
// What ships in B1:
//   • edge functions create-checkout-session / create-portal-session
//   • profiles.stripe_customer_id / subscription_status /
//     subscription_period_end / referred_by (migration mirror)
//   • pricing CTA wired per auth state (signed out → stash intent + signup,
//     signed in → Stripe Checkout), Settings → Customer Portal
//   • /billing/success, which waits for the B2 webhook rather than granting
//
// Mutation-verified: before B1 the Pro CTA was an unconditional
// <Link to="/login?mode=signup"> for every visitor, /billing/success fell
// through to the catch-all NotFound, and neither edge function existed — so the
// auth-state, request-issued and success-page assertions all fail without it.
//
// NO live Stripe: both edge functions are route-mocked at the functions/v1
// layer and return a URL back into this app, so the post-checkout navigation is
// deterministic and nothing reaches api.stripe.com.

import { test, expect, type Page } from './fixtures';
import { PRO_PRICES } from '../supabase/functions/_shared/billing.ts';

type Lang = 'en' | 'es';

// Read from the server allowlist rather than re-typing ids: a price id rotation
// (sandbox → live) must not need a test edit, and asserting against the
// authority is what "the checkout asked for a purchasable price" actually means.
const priceIdFor = (interval: 'month' | 'year') =>
  PRO_PRICES.find((p) => p.interval === interval)!.id;

const PRICE_MONTHLY = priceIdFor('month'); // pro_monthly_founding
const PRICE_YEARLY = priceIdFor('year'); // pro_yearly_founding
const PENDING_CHECKOUT_KEY = 'titilinks-pending-checkout';

const bootLang = (page: Page, lang: Lang) =>
  page.addInitScript((l) => localStorage.setItem('titilinks-language', l), lang);

/** Pin `profiles.plan` so entitlement-dependent UI is deterministic. */
async function routeProfilePlan(page: Page, plan: 'free' | 'pro' | 'business') {
  await page.route('**/rest/v1/profiles*', (route) => {
    const req = route.request();
    if (req.method() === 'GET' && /select=plan(\b|&|$|%2C|,)/.test(req.url())) {
      return route.fulfill({ json: { plan, show_badge: true } });
    }
    return route.continue();
  });
}

interface Captured {
  count: number;
  bodies: Record<string, unknown>[];
}

/**
 * Stand in for an edge function. Returns a URL inside this app so the
 * `window.location.assign` in src/lib/billing.ts lands somewhere real.
 */
async function routeFunction(page: Page, name: string, response: Record<string, unknown>) {
  const captured: Captured = { count: 0, bodies: [] };
  await page.route(`**/functions/v1/${name}`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, body: '' });
    captured.count += 1;
    try {
      captured.bodies.push(JSON.parse(req.postData() || '{}'));
    } catch {
      captured.bodies.push({});
    }
    return route.fulfill({ json: response });
  });
  return captured;
}

/** Scroll the pricing section into view and settle its reveal animation. */
async function openPricing(page: Page) {
  await page.goto('/#pricing');
  await page.getByTestId('pricing-card-pro').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('pricing-card-pro')).toBeVisible();
}

// ---------------------------------------------------------------------------
// Signed-out: the CTA stashes the chosen interval, then sends them to signup
// ---------------------------------------------------------------------------
test.describe('pricing CTA — signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Pro CTA links to signup and stashes the annual intent', async ({ page }) => {
    await bootLang(page, 'en');
    await openPricing(page);

    const cta = page.getByTestId('pricing-cta-pro');
    // A link, not a checkout button — there is no session to charge yet.
    await expect(cta).toHaveJSProperty('tagName', 'A');
    // Annual is the default selection (PRICE.TRUTH.1 TASK 3).
    await expect(cta).toHaveAttribute('data-billing-interval', 'year');

    await cta.click();
    await page.waitForURL(/\/login/);
    expect(new URL(page.url()).searchParams.get('mode')).toBe('signup');

    const stashed = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || 'null'),
      PENDING_CHECKOUT_KEY,
    );
    expect(stashed?.interval).toBe('year');
    expect(typeof stashed?.at).toBe('number');
  });

  test('monthly toggle stashes the monthly intent instead', async ({ page }) => {
    await bootLang(page, 'en');
    await openPricing(page);

    await page.getByRole('button', { name: /toggle annual billing/i }).click();
    const cta = page.getByTestId('pricing-cta-pro');
    await expect(cta).toHaveAttribute('data-billing-interval', 'month');

    await cta.click();
    await page.waitForURL(/\/login/);
    const stashed = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) || 'null'),
      PENDING_CHECKOUT_KEY,
    );
    expect(stashed?.interval).toBe('month');
  });

  test('free CTA goes to signup without stashing a checkout', async ({ page }) => {
    await bootLang(page, 'en');
    await openPricing(page);

    await page.getByTestId('pricing-cta-free').click();
    await page.waitForURL(/\/login/);

    const stashed = await page.evaluate(
      (key) => localStorage.getItem(key),
      PENDING_CHECKOUT_KEY,
    );
    expect(stashed).toBeNull();
  });

  test('Business CTA stays disabled — the tier is not purchasable', async ({ page }) => {
    await bootLang(page, 'en');
    await openPricing(page);
    await expect(page.getByTestId('pricing-cta-business')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// Signed in: the CTA issues a checkout session for the selected interval
// ---------------------------------------------------------------------------
test.describe('pricing CTA — signed in', () => {
  test('annual CTA posts the yearly price id and follows the returned URL', async ({ page, baseURL }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');
    const checkout = await routeFunction(page, 'create-checkout-session', {
      sessionId: 'cs_test_spec36',
      url: `${baseURL}/billing/success?session_id=cs_test_spec36`,
    });

    await openPricing(page);

    const cta = page.getByTestId('pricing-cta-pro');
    // A real button now — an authenticated visitor can be charged directly.
    await expect(cta).toHaveJSProperty('tagName', 'BUTTON');
    await expect(cta).toHaveText(/upgrade to pro/i);

    await cta.click();
    await page.waitForURL(/\/billing\/success/);

    expect(checkout.count).toBe(1);
    expect(checkout.bodies[0].priceId).toBe(PRICE_YEARLY);
  });

  test('monthly CTA posts the monthly price id', async ({ page, baseURL }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');
    const checkout = await routeFunction(page, 'create-checkout-session', {
      sessionId: 'cs_test_spec36m',
      url: `${baseURL}/billing/success?session_id=cs_test_spec36m`,
    });

    await openPricing(page);
    await page.getByRole('button', { name: /toggle annual billing/i }).click();
    await page.getByTestId('pricing-cta-pro').click();
    await page.waitForURL(/\/billing\/success/);

    expect(checkout.count).toBe(1);
    expect(checkout.bodies[0].priceId).toBe(PRICE_MONTHLY);
  });
});

// ---------------------------------------------------------------------------
// /billing/success — honest waiting, because the webhook owns the plan flip
// ---------------------------------------------------------------------------
test.describe('/billing/success', () => {
  test('shows the activating state while the plan is still free', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');

    await page.goto('/billing/success?session_id=cs_test_wait');
    await expect(page.getByTestId('billing-success-card')).toBeVisible();
    await expect(page.getByTestId('billing-success-spinner')).toBeVisible();
    await expect(page.getByTestId('billing-success-title')).toHaveText(/activating your pro plan/i);
    // The session id is echoed back as a support reference.
    await expect(page.getByText(/cs_test_wait/)).toBeVisible();
  });

  test('shows the welcome state once the plan reads pro', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'pro');

    await page.goto('/billing/success?session_id=cs_test_done');
    await expect(page.getByTestId('billing-success-active-icon')).toBeVisible();
    await expect(page.getByTestId('billing-success-title')).toHaveText(/welcome to pro/i);
    await expect(page.getByTestId('billing-success-spinner')).toHaveCount(0);
  });

  test('renders in Spanish', async ({ page }) => {
    await bootLang(page, 'es');
    await routeProfilePlan(page, 'pro');

    await page.goto('/billing/success?session_id=cs_test_es');
    await expect(page.getByTestId('billing-success-title')).toHaveText(/bienvenido a pro/i);
  });
});

// ---------------------------------------------------------------------------
// Settings — plan readout + Customer Portal handoff
// ---------------------------------------------------------------------------
test.describe('settings billing section', () => {
  test('free plan offers an upgrade link, not a portal', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');

    await page.goto('/dashboard/settings');
    await expect(page.getByTestId('settings-current-plan')).toHaveText('Free');
    await expect(page.getByTestId('settings-billing-upgrade')).toBeVisible();
    await expect(page.getByTestId('settings-manage-billing')).toHaveCount(0);
  });

  test('paid plan opens the Stripe Customer Portal', async ({ page, baseURL }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'pro');
    const portal = await routeFunction(page, 'create-portal-session', {
      url: `${baseURL}/dashboard/settings?portal=stub`,
    });

    await page.goto('/dashboard/settings');
    await expect(page.getByTestId('settings-current-plan')).toHaveText('Pro');

    const manage = page.getByTestId('settings-manage-billing');
    await expect(manage).toBeVisible();
    await manage.click();

    await page.waitForURL(/portal=stub/);
    expect(portal.count).toBe(1);
  });

  test('portal failure surfaces a toast and stays on settings', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'pro');
    // 409 = paid plan with no Stripe customer (granted by hand).
    await page.route('**/functions/v1/create-portal-session', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ status: 409, json: { error: 'No billing account yet' } });
    });

    await page.goto('/dashboard/settings');
    await page.getByTestId('settings-manage-billing').click();

    await expect(page.getByText(/no billing account yet/i).first()).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/dashboard/settings');
  });
});
