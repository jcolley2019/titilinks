// TL.PLAN.ENFORCE.2 — STRICT plan enforcement on visitor surfaces.
//
// Ruling: when the page owner's plan is Free, a visitor gets only Free-tier
// features, whatever is saved (src/lib/plan-gate.ts, unit-tested by
// scripts/plan-gate.test.mjs). The gate works at render only — saved rows are
// never touched, so re-upgrading restores everything.
//
// a. The FREE account (joey2019pwtestfree), visited ANONYMOUSLY and READ ONLY.
//    Onboarding seeded it an enabled email_subscribe block; its visitor gets no
//    form, no page switcher, and the "Made with TitiLinks" badge. Never signed
//    in as, never written to (TL.HARNESS.FREE.1).
// b. The battery with a carousel, a page 2, animations and a custom page font,
//    visited anonymously — first with the owner plan MOCKED free (the spec
//    29/30 pattern: the get_public_page_branding / get_public_page_plan RPCs),
//    then UNMOCKED (the battery is Pro, TL.COMP.4). Free: the carousel renders
//    as plain links, no animation class anywhere, the default font, no email
//    form, page 1 at ?page=2 and no switcher. Pro: all of it.
//
// FIXTURES (b). The canonical battery tree (TL.ISO.4) has no carousel and no
// page 2, so beforeAll ADDS them and afterAll REMOVES them — a carousel on
// page 1 whose cards carry a paintable animation, and a card on page 2 — and
// the switcher, page-level animation and custom page font are PATCHED onto the
// page row on the wire, never written. The door, the sweep and the patch live
// in tests/helpers/plan-fixtures.ts (TL.PLAN.ENFORCE.3 factored them out for
// spec 83); this spec owns the rows tagged s82.
//
// b is desktop only (it writes, on a shared account); a runs on both projects.

import { test, expect, type Page } from './fixtures';
import { TEST_HANDLE, FREE_TEST_HANDLE } from './helpers/auth';
import { planFixtures, withBatteryClient } from './helpers/plan-fixtures';

const PHONE = { width: 390, height: 844 };
const ANONYMOUS = { cookies: [], origins: [] };

const fx = planFixtures('s82');
const { CAROUSEL_TITLE, CARD_1, PAGE2_LABEL, SWITCH, CUSTOM_FONT } = fx;

/** The spec 29/30 pattern: the owner-plan RPCs answer 'free'. */
async function mockOwnerPlanFree(page: Page) {
  await page.route('**/rest/v1/rpc/get_public_page_branding*', (route) =>
    route.fulfill({ json: [{ plan: 'free', show_badge: true, referral_code: null }] }));
  await page.route('**/rest/v1/rpc/get_public_page_plan*', (route) => route.fulfill({ json: 'free' }));
}

async function visit(page: Page, handle: string, query = '') {
  await page.goto(`/${handle}${query}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(`@${handle}`).first()).toBeVisible({ timeout: 15_000 });
}

test.describe('TL.PLAN.ENFORCE.2 — a. the FREE account, visited anonymously', () => {
  test.use({ storageState: ANONYMOUS, viewport: PHONE });

  test('no subscribe form, no page switcher, the badge shows', async ({ page }) => {
    await visit(page, FREE_TEST_HANDLE);
    await expect(page.getByRole('link', { name: /made with/i })).toBeVisible();
    // Onboarding seeded an enabled email_subscribe block; a Free owner's visitor never gets the form.
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Page|Página) [12]$/ })).toHaveCount(0);
  });
});

test.describe('TL.PLAN.ENFORCE.2 — b. the battery, owner plan free vs pro', () => {
  test.use({ storageState: ANONYMOUS, viewport: PHONE });

  test.beforeAll(async () => {
    if (test.info().project.name !== 'desktop') return;
    await withBatteryClient(fx.addFixtures);
  });

  // Unconditional: a run that dies anywhere must not leave the fixtures behind.
  test.afterAll(async () => {
    if (test.info().project.name !== 'desktop') return;
    await withBatteryClient(fx.sweep);
  });

  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'desktop only — fixture rows on the shared battery');
    await fx.patchPageRow(page);
  });

  test('free: carousel as plain links, no animation, default font, no email form, no switcher', async ({ page }) => {
    await mockOwnerPlanFree(page);
    await visit(page, TEST_HANDLE);

    const card = page.locator(`a[href="${CARD_1}"]`);
    await expect(card).toHaveCount(1);
    await expect(card, 'rendered by LinkButton — the links path').toHaveClass(/lb-velvet/);
    await expect(page.getByText(CAROUSEL_TITLE)).toHaveCount(0);
    await expect(page.locator('[class*="lb-anim-"]')).toHaveCount(0);
    await expect(page.locator(`[style*="${CUSTOM_FONT}"]`)).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: SWITCH.page2 })).toHaveCount(0);
  });

  test('free: ?page=2 serves page 1 and no switcher', async ({ page }) => {
    await mockOwnerPlanFree(page);
    await visit(page, TEST_HANDLE, '?page=2');

    await expect(page.getByText(PAGE2_LABEL)).toHaveCount(0);
    await expect(page.locator(`a[href="${CARD_1}"]`), 'page 1 content').toHaveCount(1);
    await expect(page.getByRole('button', { name: SWITCH.page1 })).toHaveCount(0);
    await expect(page.getByRole('button', { name: SWITCH.page2 })).toHaveCount(0);
  });

  test('pro (unmocked): carousel, animations, custom font, email form, switcher and page 2', async ({ page }) => {
    await visit(page, TEST_HANDLE);

    await expect(page.getByText(CAROUSEL_TITLE)).toBeVisible();
    await expect(page.locator(`a[href="${CARD_1}"]`).first()).toBeVisible();
    await expect(page.locator(`a.lb-velvet[href="${CARD_1}"]`), 'the carousel renderer, not links').toHaveCount(0);
    expect(await page.locator('[class*="lb-anim-pulse"]').count()).toBeGreaterThan(0);
    expect(await page.locator(`[style*="${CUSTOM_FONT}"]`).count()).toBeGreaterThan(0);
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: SWITCH.page2 })).toBeVisible();
    await expect(page.getByText(PAGE2_LABEL)).toHaveCount(0);

    await visit(page, TEST_HANDLE, '?page=2');
    await expect(page.getByText(PAGE2_LABEL).first()).toBeVisible();
    await expect(page.locator(`a[href="${CARD_1}"]`)).toHaveCount(0);
    await expect(page.getByRole('button', { name: SWITCH.page1 })).toBeVisible();
  });
});
