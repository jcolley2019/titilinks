// PROMO.TOGGLE.1 — optional "Made with TitiLinks" badge for paid tiers.
//
// Free is always branded (unchanged). Pro/Business follow the owner's
// profiles.show_badge toggle, read on the public page through the
// get_public_page_branding security-definer RPC (fail-open: badge shows).
//
//  1. Free public page → badge shows.
//  2. Pro + show_badge=false → badge hidden.
//  3. Pro + show_badge=true  → badge shows.
//  4. Settings → the toggle is locked (PRO chip + disabled switch) on Free.
//
// Mutation-verified: pre-fix the public badge ignored show_badge (Pro always
// hid it) and Settings had no badge section, so cases 2 and 4 fail without the
// implementation.

import { test, expect, type Page } from '@playwright/test';

const PROFILE = '/joeyc';

const badge = (page: Page) => page.getByRole('link', { name: /made with/i });

async function routeBranding(page: Page, plan: 'free' | 'pro' | 'business', show_badge: boolean) {
  await page.route('**/rest/v1/rpc/get_public_page_branding*', (route) =>
    route.fulfill({ json: [{ plan, show_badge }] }),
  );
}

async function routeProfilePlan(page: Page, plan: 'free' | 'pro' | 'business') {
  await page.route('**/rest/v1/profiles*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET' && /select=plan(\b|&|$|%2C|,)/.test(req.url())) {
      return route.fulfill({ json: { plan } });
    }
    return route.continue();
  });
}

test.describe('PROMO.TOGGLE.1 — public badge', () => {
  test('Free public page shows the badge', async ({ page }) => {
    await routeBranding(page, 'free', true);
    await page.goto(PROFILE);
    await page.waitForLoadState('networkidle');
    await expect(badge(page)).toBeVisible();
  });

  test('Pro with show_badge=false hides the badge', async ({ page }) => {
    await routeBranding(page, 'pro', false);
    await page.goto(PROFILE);
    await page.waitForLoadState('networkidle');
    await expect(badge(page)).toHaveCount(0);
  });

  test('Pro with show_badge=true shows the badge', async ({ page }) => {
    await routeBranding(page, 'pro', true);
    await page.goto(PROFILE);
    await page.waitForLoadState('networkidle');
    await expect(badge(page)).toBeVisible();
  });
});

test.describe('PROMO.TOGGLE.1 — settings', () => {
  test('Free sees the badge toggle locked with a PRO chip', async ({ page }) => {
    await routeProfilePlan(page, 'free');
    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    // Section renders...
    await expect(page.getByText('TitiLinks badge').first()).toBeVisible();
    // ...with the PRO upsell chip linking to pricing...
    const proChip = page.getByRole('link', { name: 'PRO', exact: true });
    await expect(proChip).toBeVisible();
    await expect(proChip).toHaveAttribute('href', /#pricing/);
    // ...and a disabled (locked) switch.
    await expect(page.locator('[role="switch"][disabled]').first()).toBeVisible();
  });
});
