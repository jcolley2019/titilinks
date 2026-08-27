// UPGRADE.1 — the in-app upgrade surface.
//
// What ships here:
//   • /dashboard/upgrade — the Pro pitch (price + $15 anchor + founding line +
//     feature list, all from src/lib/pricing.ts), a monthly/annual toggle and a
//     checkout button; already-paid plans get a plan readout + portal handoff
//   • a sidebar "Upgrade" entry in brand gold, FREE plans only
//   • every in-app Pro upsell now aims at this page instead of /#pricing —
//     the link-shaped ones directly, the toasts via a "See Pro" action button
//
// Mutation-verified. Before UPGRADE.1 the route did not exist (it fell through
// to the catch-all NotFound), no nav entry rendered at any plan, and every
// upsell pointed at the public marketing anchor /#pricing — so the render,
// nav-visibility, checkout and destination assertions all fail without it.
//
// NO live Stripe: create-checkout-session / create-portal-session are
// route-mocked at the functions/v1 layer and return URLs back into this app.

import { test, expect, type Page } from './fixtures';
import { PRO_PRICES } from '../supabase/functions/_shared/billing.ts';

type Lang = 'en' | 'es';
type Plan = 'free' | 'pro' | 'business';

// Read from the server allowlist rather than re-typing ids — see 36-billing.
const priceIdFor = (interval: 'month' | 'year') =>
  PRO_PRICES.find((p) => p.interval === interval)!.id;

const PRICE_MONTHLY = priceIdFor('month'); // pro_monthly_founding
const PRICE_YEARLY = priceIdFor('year'); // pro_yearly_founding

const bootLang = (page: Page, lang: Lang) =>
  page.addInitScript((l) => localStorage.setItem('titilinks-language', l), lang);

/** Pin `profiles.plan` so entitlement-dependent UI is deterministic. */
async function routeProfilePlan(page: Page, plan: Plan) {
  await page.route('**/rest/v1/profiles*', (route) => {
    const req = route.request();
    if (req.method() === 'GET' && /select=plan(\b|&|$|%2C|,)/.test(req.url())) {
      return route.fulfill({ json: { plan, show_badge: true, referral_code: null } });
    }
    return route.continue();
  });
}

interface Captured {
  count: number;
  bodies: Record<string, unknown>[];
}

/** Stand in for a billing edge function; returns a URL inside this app. */
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

/**
 * The nav entry lives in TWO places — the always-mounted desktop sidebar
 * (`hidden lg:block`) and the mobile slide-out, which has to be opened first.
 * Filtering on :visible picks whichever one this project can actually see.
 */
async function openNav(page: Page, mobile: boolean) {
  if (mobile) await page.locator('header button').last().click();
}

const visibleUpgradeNav = (page: Page) =>
  page.locator('[data-testid="nav-upgrade"]:visible');

// ---------------------------------------------------------------------------
// Sidebar entry — free only
// ---------------------------------------------------------------------------
test.describe('sidebar Upgrade entry', () => {
  test('free plan sees it, and it routes to the upgrade page', async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile';
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');

    await page.goto('/dashboard/settings');
    await openNav(page, mobile);

    const entry = visibleUpgradeNav(page).first();
    await expect(entry).toBeVisible();
    await expect(entry).toHaveText(/upgrade/i);

    await entry.click();
    await page.waitForURL(/\/dashboard\/upgrade/);
    await expect(page.getByTestId('upgrade-page')).toBeVisible();
  });

  test('pro plan sees no Upgrade entry at all', async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile';
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'pro');

    await page.goto('/dashboard/settings');
    await openNav(page, mobile);

    // The other nav rows are on screen, so the menu really did open — the
    // Upgrade entry is absent because the plan already owns everything.
    await expect(page.locator('a:visible', { hasText: 'Settings' }).first()).toBeVisible();
    await expect(visibleUpgradeNav(page)).toHaveCount(0);
  });

  test('business plan sees no Upgrade entry either', async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile';
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'business');

    await page.goto('/dashboard/settings');
    await openNav(page, mobile);

    // Anchor on a sibling row FIRST. Without it a zero-count assertion passes
    // against a nav that simply hasn't rendered yet, and stops proving anything.
    await expect(page.locator('a:visible', { hasText: 'Settings' }).first()).toBeVisible();
    await expect(visibleUpgradeNav(page)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// The pitch — free plan
// ---------------------------------------------------------------------------
test.describe('/dashboard/upgrade — free plan', () => {
  test('renders the founding price, the $15 anchor and the Pro feature list', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');

    await page.goto('/dashboard/upgrade');
    await expect(page.getByTestId('upgrade-page')).toBeVisible();

    // Annual is the default selection, so the lower founding rate shows first.
    await expect(page.getByTestId('upgrade-cta')).toHaveAttribute('data-billing-interval', 'year');
    await expect(page.getByTestId('upgrade-price')).toHaveText('$7');
    await expect(page.getByTestId('upgrade-anchor')).toHaveText('then $15/mo');
    await expect(page.getByTestId('upgrade-founding')).toHaveText(/lock it in forever/i);

    // The feature list is the pricing grid's, not a second hand-written copy.
    const features = page.getByTestId('upgrade-features').locator('li');
    await expect(features).toHaveCount(8);
    await expect(features.first()).toHaveText('Two pages');
    await expect(features.nth(7)).toHaveText('TitiLinks badge — optional');

    // Nothing about managing an existing subscription belongs here.
    await expect(page.getByTestId('upgrade-manage-billing')).toHaveCount(0);
  });

  test('the pitch is the SAME data as the landing pricing grid, not a fork', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');

    // Both surfaces read src/lib/pricing.ts. If either ever grows its own copy
    // of the price, the anchor or the feature list, this comparison breaks.
    await page.goto('/dashboard/upgrade');
    const inApp = {
      price: await page.getByTestId('upgrade-price').innerText(),
      anchor: await page.getByTestId('upgrade-anchor').innerText(),
      features: await page.getByTestId('upgrade-features').locator('li').allInnerTexts(),
    };

    await page.goto('/#pricing');
    const card = page.getByTestId('pricing-card-pro');
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();

    // Annual is the default on both, so the figures line up without touching
    // either toggle.
    await expect(card.locator('.text-4xl')).toHaveText(inApp.price);
    await expect(card.locator('.line-through')).toHaveText(inApp.anchor);
    expect(await card.locator('ul li').allInnerTexts()).toEqual(inApp.features);
  });

  test('the toggle switches to the monthly founding price', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');

    await page.goto('/dashboard/upgrade');
    await page.getByTestId('upgrade-interval-toggle').click();

    await expect(page.getByTestId('upgrade-price')).toHaveText('$9');
    await expect(page.getByTestId('upgrade-cta')).toHaveAttribute('data-billing-interval', 'month');
  });

  test('Upgrade issues a checkout session for the annual price', async ({ page, baseURL }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');
    const checkout = await routeFunction(page, 'create-checkout-session', {
      sessionId: 'cs_test_spec40',
      url: `${baseURL}/billing/success?session_id=cs_test_spec40`,
    });

    await page.goto('/dashboard/upgrade');
    await page.getByTestId('upgrade-cta').click();
    await page.waitForURL(/\/billing\/success/);

    expect(checkout.count).toBe(1);
    expect(checkout.bodies[0].priceId).toBe(PRICE_YEARLY);
  });

  test('the monthly toggle changes which price id is charged', async ({ page, baseURL }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');
    const checkout = await routeFunction(page, 'create-checkout-session', {
      sessionId: 'cs_test_spec40m',
      url: `${baseURL}/billing/success?session_id=cs_test_spec40m`,
    });

    await page.goto('/dashboard/upgrade');
    await page.getByTestId('upgrade-interval-toggle').click();
    await page.getByTestId('upgrade-cta').click();
    await page.waitForURL(/\/billing\/success/);

    expect(checkout.count).toBe(1);
    expect(checkout.bodies[0].priceId).toBe(PRICE_MONTHLY);
  });

  test('a failed checkout stays on the page and says why', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');
    await page.route('**/functions/v1/create-checkout-session', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ status: 500, json: { error: 'Stripe is unreachable' } });
    });

    await page.goto('/dashboard/upgrade');
    await page.getByTestId('upgrade-cta').click();

    await expect(page.getByText(/stripe is unreachable/i).first()).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/dashboard/upgrade');
  });

  test('renders in Spanish', async ({ page }) => {
    await bootLang(page, 'es');
    await routeProfilePlan(page, 'free');

    await page.goto('/dashboard/upgrade');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/mejora a pro/i);
    await expect(page.getByTestId('upgrade-anchor')).toHaveText('luego $15/mes');
    await expect(page.getByTestId('upgrade-features').locator('li').first()).toHaveText('Dos páginas');
  });
});

// ---------------------------------------------------------------------------
// The paid variant — nothing to sell, so manage the subscription instead
// ---------------------------------------------------------------------------
test.describe('/dashboard/upgrade — paid plans', () => {
  test('pro sees the plan readout and no checkout CTA', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'pro');

    await page.goto('/dashboard/upgrade');
    await expect(page.getByTestId('upgrade-current-plan')).toHaveText('Pro');
    await expect(page.getByTestId('upgrade-manage-billing')).toBeVisible();

    await expect(page.getByTestId('upgrade-cta')).toHaveCount(0);
    await expect(page.getByTestId('upgrade-interval-toggle')).toHaveCount(0);
    await expect(page.getByTestId('upgrade-price')).toHaveCount(0);
  });

  test('Manage billing opens the Stripe Customer Portal', async ({ page, baseURL }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'pro');
    const portal = await routeFunction(page, 'create-portal-session', {
      url: `${baseURL}/dashboard/settings?portal=stub`,
    });

    await page.goto('/dashboard/upgrade');
    await page.getByTestId('upgrade-manage-billing').click();

    await page.waitForURL(/portal=stub/);
    expect(portal.count).toBe(1);
  });

  test('business sees its own label, not "Pro"', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'business');

    await page.goto('/dashboard/upgrade');
    await expect(page.getByTestId('upgrade-current-plan')).toHaveText('Business');
    await expect(page.getByTestId('upgrade-cta')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Upsell destinations — every in-app Pro nudge lands on the upgrade page
// ---------------------------------------------------------------------------
test.describe('upsell destinations', () => {
  test('the Settings billing card and badge lock both aim at /dashboard/upgrade', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');

    await page.goto('/dashboard/settings');
    // Button renders asChild, so the testid lands on the <a> itself.
    await expect(page.getByTestId('settings-billing-upgrade')).toHaveAttribute(
      'href',
      '/dashboard/upgrade',
    );
    await expect(page.getByTestId('settings-badge-pro-lock')).toHaveAttribute(
      'href',
      '/dashboard/upgrade',
    );

    await page.getByTestId('settings-badge-pro-lock').click();
    await page.waitForURL(/\/dashboard\/upgrade/);
    await expect(page.getByTestId('upgrade-page')).toBeVisible();
  });

  test('the locked analytics sections link to the upgrade page', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');

    await page.goto('/dashboard/analytics');
    await page.waitForLoadState('networkidle');

    const cta = page.getByTestId('analytics-upgrade-cta').first();
    await expect(cta).toHaveAttribute('href', '/dashboard/upgrade');
  });

  test('the short-link quota notice links to the upgrade page', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');
    // Free is capped at 3 short links — seed the cap so the notice renders.
    await page.route('**/rest/v1/custom_short_links*', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({
        json: [1, 2, 3].map((i) => ({
          id: `seed-${i}`,
          user_id: 'test-user',
          slug: `s${i}`,
          target_url: `https://example.com/${i}`,
          clicks: 0,
          created_at: `2026-07-30T00:00:0${i}Z`,
        })),
      });
    });

    await page.goto('/dashboard/short-links');
    await expect(page.getByTestId('short-link-quota-reached')).toBeVisible();
    await expect(page.getByTestId('short-link-upgrade-cta')).toHaveAttribute(
      'href',
      '/dashboard/upgrade',
    );
  });

  test('the plan badge popover sends free plans to the upgrade page', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');

    await page.goto('/dashboard/settings');
    await page.locator('[class*="cursor-pointer"]:visible', { hasText: 'Free' }).first().click();

    const viewPlans = page.getByTestId('plan-badge-view-plans').first();
    await expect(viewPlans).toBeVisible();
    await expect(viewPlans).toHaveAttribute('href', '/dashboard/upgrade');
  });

  test('a Pro upsell toast carries a "See Pro" action that routes to the page', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfilePlan(page, 'free');

    await page.goto('/dashboard/editor');
    await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();

    // Tracking pixels are Pro — tapping the row raises the upsell toast.
    await page
      .getByRole('button', { name: /tracking pixels/i })
      .filter({ visible: true })
      .first()
      .click();

    await expect(page.getByText(/tracking pixels are a pro feature/i).first()).toBeVisible();
    // The panel stayed shut: this is the upsell, not the feature.
    await expect(page.getByTestId('tracking-pixels-panel')).toHaveCount(0);

    const seePro = page.getByRole('button', { name: 'See Pro' }).first();
    await expect(seePro).toBeVisible();
    await seePro.click();

    await page.waitForURL(/\/dashboard\/upgrade/);
    await expect(page.getByTestId('upgrade-page')).toBeVisible();
  });
});
