// PRICE.TRUTH.1 — pricing gates + page reconciliation.
//
// Five surfaces:
//  1. Branding badge — the public "Made with TitiLinks" footer shows on Free,
//     is absent on Pro, and fails OPEN (shows) if the owner-plan RPC errors.
//  2. Email capture gate — Free sees the lock badge + upsell on the "Create
//     Form" row; the editor never opens (mirrors PIXELS.1's established
//     pattern). Pro opens it normally.
//  3. Analytics split — Free sees the Pro-only lock overlay on advanced
//     sections; Pro does not.
//  4. Pricing page — founding-price framing on Pro, no dollar amount on
//     Business, annual is the default, no "Custom domain" text anywhere.
//  5. ES smoke — founding-price copy renders in Spanish.

import { test, expect, type Page } from '@playwright/test';

const PROFILE = '/joeyc';

async function routeProfilePlan(page: Page, plan: 'free' | 'pro' | 'business') {
  await page.route('**/rest/v1/profiles*', async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'GET' && /select=plan(\b|&|$)/.test(url)) {
      return route.fulfill({ json: { plan } });
    }
    return route.continue();
  });
}

const openEditProfile = async (page: Page) => {
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
};

test.describe('PRICE.TRUTH.1 — branding badge', () => {
  test('Free public page shows the "Made with TitiLinks" badge', async ({ page }) => {
    await page.route('**/rest/v1/rpc/get_public_page_plan*', (route) => route.fulfill({ json: 'free' }));
    await page.goto(PROFILE);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: /made with/i })).toBeVisible();
  });

  test('Pro public page hides the badge', async ({ page }) => {
    await page.route('**/rest/v1/rpc/get_public_page_plan*', (route) => route.fulfill({ json: 'pro' }));
    await page.goto(PROFILE);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: /made with/i })).toHaveCount(0);
  });

  test('fails OPEN: an errored plan lookup still shows the badge', async ({ page }) => {
    await page.route('**/rest/v1/rpc/get_public_page_plan*', (route) => route.fulfill({ status: 500, body: '' }));
    await page.goto(PROFILE);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: /made with/i })).toBeVisible();
  });
});

test.describe('PRICE.TRUTH.1 — email capture gate', () => {
  test('Free creator sees the lock badge + upsell; the editor never opens', async ({ page }) => {
    await routeProfilePlan(page, 'free');
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
    await openEditProfile(page);

    const row = page.getByRole('button', { name: /create form/i }).filter({ visible: true }).first();
    await expect(row).toContainText('PRO');

    await row.click();
    await expect(page.getByText('Email capture is a Pro feature')).toBeVisible();
    await expect(page.getByText('Collect Name')).toHaveCount(0);
  });

  test('Pro creator opens the editor from the same row', async ({ page }) => {
    await routeProfilePlan(page, 'pro');
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
    await openEditProfile(page);

    const row = page.getByRole('button', { name: /create form/i }).filter({ visible: true }).first();
    await expect(row).not.toContainText('PRO');
    await row.click();
    // Panel mode shows the row title as its header, not the editor's own
    // dialog title — assert editor-specific content instead.
    await expect(page.getByText('Collect Name')).toBeVisible();
    await expect(page.getByPlaceholder('Stay up to date')).toBeVisible();
  });
});

test.describe('PRICE.TRUTH.1 — analytics split', () => {
  test('Free sees the Pro-only lock on advanced sections', async ({ page }) => {
    await routeProfilePlan(page, 'free');
    await page.goto('/dashboard/analytics');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Pro feature').first()).toBeVisible();
  });

  test('Pro sees no lock overlay', async ({ page }) => {
    await routeProfilePlan(page, 'pro');
    await page.goto('/dashboard/analytics');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Pro feature')).toHaveCount(0);
  });
});

test.describe('PRICE.TRUTH.1 — pricing page', () => {
  test('Pro shows founding-price framing; annual is the default', async ({ page }) => {
    await page.goto('/#pricing');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('$7').first()).toBeVisible();
    await expect(page.getByText('then $15/mo')).toBeVisible();
    await expect(page.getByText('Founding price — lock it in forever')).toBeVisible();
  });

  test('Business card carries no dollar amount', async ({ page }) => {
    await page.goto('/#pricing');
    await page.waitForLoadState('networkidle');
    const businessCard = page.getByTestId('pricing-card-business');
    await expect(businessCard.getByText('Coming soon').first()).toBeVisible();
    const cardText = await businessCard.innerText();
    expect(cardText).not.toContain('$');
  });

  test('no "Custom domain" claim anywhere on the page', async ({ page }) => {
    await page.goto('/#pricing');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/custom domain/i)).toHaveCount(0);
  });

  test('ES: founding-price copy renders in Spanish', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('titilinks-language', 'es'));
    await page.goto('/#pricing');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Precio de lanzamiento — consérvalo para siempre')).toBeVisible();
  });
});
