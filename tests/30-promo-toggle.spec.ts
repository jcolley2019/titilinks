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

import { test, expect, allowWrites, type Page } from './fixtures';
import { TEST_HANDLE } from './helpers/auth';

const PROFILE = `/${TEST_HANDLE}`;

// BADGE.CTA.1 — the footer badge is now a two-line signup invitation, so
// target the gated footer link by its href rather than by exact text.
const badge = (page: Page) => page.locator('a[href="/?ref=badge"]');

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
    // ...with the PRO upsell chip linking to the in-app upgrade page
    // (UPGRADE.1 — it used to point at the public /#pricing anchor)...
    const proChip = page.getByRole('link', { name: 'PRO', exact: true });
    await expect(proChip).toBeVisible();
    await expect(proChip).toHaveAttribute('href', '/dashboard/upgrade');
    // ...and a disabled (locked) switch.
    await expect(page.locator('[role="switch"][disabled]').first()).toBeVisible();
  });

  // ── TL.COMP.5b ────────────────────────────────────────────────────────────
  // The Pro path — the half spec 30 never covered, and the reason a live defect
  // went unnoticed. Every test above this one mocks get_public_page_branding or
  // the plan GET; none issues the PATCH. This one does, against the real
  // battery account (plan=pro), with no plan mock. Until 2026-09-01 the live
  // `profiles` UPDATE policy pinned `show_badge` in its WITH CHECK and the
  // write came back 403 for everyone (TL.COMP.5a probe); TL.COMP.5b dropped
  // that pin, and this test is the regression guard.
  test('Pro can turn the badge off and the choice survives a reload', async ({ page }) => {
    await allowWrites(page, ['rest/v1/profiles']);

    const toggle = () =>
      page
        .getByText('Show badge', { exact: true })
        .locator('xpath=ancestor::div[contains(@class,"justify-between")][1]')
        .getByRole('switch');

    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');

    // A disabled switch here means the account is not being read as paid, and
    // the rest of this test would be measuring the wrong thing.
    await expect(
      toggle(),
      'the battery account must render as PAID for this test to mean anything',
    ).toBeEnabled();

    const before = await toggle().getAttribute('aria-checked');
    let flipped = false;

    try {
      await toggle().click();

      // The app confirms the save...
      await expect(page.getByText('Badge preference saved', { exact: true })).toBeVisible();

      // ...and the DB agrees, past the optimistic cache flip.
      await page.reload();
      await page.waitForLoadState('networkidle');
      const after = await toggle().getAttribute('aria-checked');
      flipped = after !== before;

      expect(
        after,
        'show_badge must persist: a reload reads the DB, not the optimistic cache',
      ).not.toBe(before);
    } finally {
      // Restore only if the value actually moved — a rejected write leaves
      // nothing to undo, and clicking again would be a second write, not a
      // restore.
      if (flipped) {
        await page.goto('/dashboard/settings');
        await page.waitForLoadState('networkidle');
        await toggle().click();
        // Same wait as the forward path: reloading before the PATCH lands
        // cancels the request and the restore never reaches the DB.
        await expect(page.getByText('Badge preference saved', { exact: true })).toBeVisible();
        await page.reload();
        await page.waitForLoadState('networkidle');
        const restored = await toggle().getAttribute('aria-checked');
        if (restored !== before) {
          throw new Error(
            `RESTORE FAILED — profiles.show_badge for the battery account is ` +
              `"${restored}" but started as "${before}". Put it back by hand ` +
              `before running the battery again.`,
          );
        }
      }
    }
  });
});
