// TL.PLAN.ENFORCE.3 — the editor side of STRICT plan enforcement.
//
// Ruling: when the owner's plan lacks a feature but Pro data is saved, the
// editor shows it in place, dimmed, with a PRO lock. The owner cannot open or
// edit it (a tap raises the upsell); moving and hiding still work. Nothing is
// mutated, so re-upgrading unlocks everything. The rule is the owner-side half
// of src/lib/plan-gate.ts (unit-tested by scripts/plan-gate.test.mjs), bound to
// the owner's own plan by src/hooks/usePlanLock.ts.
//
// The battery, signed in, with spec 82's fixtures (tests/helpers/plan-fixtures
// — rows tagged s83): a carousel on page 1, a card on page 2, and on the wire a
// two-page switcher, a page-level animation and a custom page font. The owner
// plan is MOCKED free (the spec 29 pattern — the editor reads profiles.plan),
// then left UNMOCKED (the battery is Pro, TL.COMP.4) to prove none of the locks
// render and the same taps open the editor and switch the page.
//
// Desktop only: it writes fixture rows on a shared account.

import { test, expect, type Page } from './fixtures';
import { planFixtures, withBatteryClient } from './helpers/plan-fixtures';

const DESKTOP = { width: 1440, height: 1000 };

const fx = planFixtures('s83');
const { CAROUSEL_TITLE, PAGE2_LABEL, SWITCH, CUSTOM_FONT } = fx;

/** The spec 29 pattern: the owner's profiles.plan read answers 'free'. Everything else falls through. */
async function mockEditorPlanFree(page: Page) {
  await page.route('**/rest/v1/profiles*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET' && /select=plan(\b|&|$)/.test(req.url())) {
      return route.fulfill({ json: { plan: 'free' } });
    }
    return route.fallback();
  });
}

/** Load the editor and wait until the owner's plan has landed — nothing locks before it does. */
async function openEditor(page: Page) {
  const planRead = page.waitForResponse((r) => r.url().includes('/rest/v1/profiles') && /select=plan/.test(r.url()));
  await page.goto('/dashboard/editor');
  await planRead;
  await page.waitForLoadState('networkidle');
  const frame = page.getByTestId('device-frame');
  await expect(frame.getByText(CAROUSEL_TITLE).first()).toBeVisible({ timeout: 15_000 });
  return frame;
}

/** The PRO pill in a canvas block's control bar, right after the block's title (the SampleTag slot). */
const lockAfter = (frame: ReturnType<Page['getByTestId']>, title: string) =>
  frame.locator('span', { hasText: new RegExp(`^${title}$`) })
    .locator('xpath=following-sibling::*[@data-testid="plan-lock-tag"]');

/** The control bar's edit chevron — the last button after the block's title. */
const chevronAfter = (frame: ReturnType<Page['getByTestId']>, title: string) =>
  frame.locator('span', { hasText: new RegExp(`^${title}$`) }).locator('xpath=following-sibling::button[last()]');

/** Edit Profile → Customize Profile (DesignEditor) → Buttons tab — the page-level animation chips. */
async function openButtonsTab(page: Page) {
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: /customize profile/i }).filter({ visible: true }).first().click();
  await page.getByRole('tab', { name: 'Buttons' }).filter({ visible: true }).first().click();
  await expect(page.getByTestId('page-anim-chip-none')).toBeVisible();
}

async function openFontTab(page: Page) {
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: /name & handle/i }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Font', exact: true }).click();
}

test.describe('TL.PLAN.ENFORCE.3 — the editor locks saved Pro items', () => {
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
    await page.setViewportSize(DESKTOP);
    await fx.patchPageRow(page);
  });

  test('free: the carousel is locked — its block and its chevron raise the upsell, never the editor', async ({ page }) => {
    await mockEditorPlanFree(page);
    const frame = await openEditor(page);

    await expect(lockAfter(frame, 'Carousel')).toBeVisible();
    await expect(lockAfter(frame, 'Carousel')).toHaveAttribute('title', /^Carousel is a Pro feature\. Visitors see these cards as plain links/);
    // The battery's canonical email_subscribe block locks the same way.
    await expect(lockAfter(frame, 'Email Capture')).toBeVisible();
    await frame.getByText(CAROUSEL_TITLE).first().scrollIntoViewIfNeeded();
    await frame.screenshot({ path: 'tests/screenshots/plan-lock-canvas.png' });

    await frame.getByText(CAROUSEL_TITLE).first().click();
    await expect(page.getByText('Carousel is a Pro feature', { exact: true })).toBeVisible();
    await expect(page.getByText('Card size'), 'the CarouselEditor never opens').toHaveCount(0);

    await chevronAfter(frame, 'Carousel').click();
    await expect(page.getByText('Carousel is a Pro feature', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Card size'), 'nor from the chevron').toHaveCount(0);
  });

  test('free: the Sections rail row — the other door to the same editor — is locked too', async ({ page }) => {
    await mockEditorPlanFree(page);
    await openEditor(page);
    await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();

    const row = page.locator('[data-testid="section-row"][data-section-type="carousel"]');
    await expect(row.getByTestId('plan-lock-tag')).toBeVisible();
    await row.screenshot({ path: 'tests/screenshots/plan-lock-rail.png' });
    await row.getByRole('button').first().click();
    await expect(page.getByText('Carousel is a Pro feature', { exact: true })).toBeVisible();
    await expect(page.getByText('Card size'), 'the CarouselEditor never opens').toHaveCount(0);
    await expect(row, 'still on the rail').toBeVisible();
  });

  test('free: the page-2 tab is locked — tapping it raises the upsell and page 1 stays selected', async ({ page }) => {
    await mockEditorPlanFree(page);
    const frame = await openEditor(page);

    const tab = frame.getByTestId('page2-tab-locked');
    await expect(tab).toBeVisible();
    await expect(tab).toContainText(SWITCH.page2);
    await expect(tab).toHaveAttribute('title', /second page is a Pro feature/);

    await tab.click();
    await expect(page.getByText('Two pages is a Pro feature', { exact: true })).toBeVisible();
    await expect(frame.getByRole('button', { name: SWITCH.page1 }), 'page 1 stays selected').toHaveClass(/bg-\[#C9A55C\]/);
    await expect(frame.getByText(CAROUSEL_TITLE).first(), 'page 1 content still on the canvas').toBeVisible();
    await expect(frame.getByText(PAGE2_LABEL), 'page 2 never loads').toHaveCount(0);
  });

  test('free: the font picker shows the saved custom font as the current value, locked', async ({ page }) => {
    await mockEditorPlanFree(page);
    await openEditor(page);
    await openFontTab(page);

    const locked = page.getByTestId('locked-font');
    await expect(locked).toBeVisible();
    await expect(locked).toContainText(CUSTOM_FONT);
    await expect(locked.getByTestId('plan-lock-tag')).toBeVisible();
    await expect(locked).toContainText('Visitors see the default font until you upgrade.');
    await locked.screenshot({ path: 'tests/screenshots/plan-lock-font.png' });
  });

  test('free: the page-level animation keeps its saved value, locked, with the note', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockEditorPlanFree(page);
    await openEditor(page);
    await openButtonsTab(page);

    // The wire-patched theme saves 'pulse': still the selected chip — never swapped.
    await expect(page.getByTestId('page-anim-chip-pulse')).toHaveAttribute('aria-pressed', 'true');
    const note = page.getByTestId('page-anim-chip-locked');
    await expect(note).toBeVisible();
    await expect(note).toContainText('Visitors see no motion until you upgrade.');
    // Centered: at the tab's natural scroll the panel's sticky Save footer covers it.
    await note.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await note.screenshot({ path: 'tests/screenshots/plan-lock-animation.png' });
  });

  test('pro (unmocked): nothing is locked — the carousel opens its editor and page 2 switches', async ({ page }) => {
    // Opening page 2 runs the editor's default-block seed (ensureDefaultBlocks)
    // on the fixture page. Answer its insert with a no-op (spec 22's 204
    // convention): nothing lands on the battery, and the write guard is not
    // left to log a denial on a passing test.
    await page.route('**/rest/v1/blocks*', (route) =>
      route.request().method() === 'POST' ? route.fulfill({ status: 204, body: '' }) : route.fallback());
    const frame = await openEditor(page);

    await expect(frame.getByTestId('plan-lock-tag')).toHaveCount(0);
    await expect(frame.getByTestId('page2-tab-locked')).toHaveCount(0);

    // The same taps, unlocked: page 2 loads, and back on page 1 the carousel opens its editor.
    await frame.getByRole('button', { name: SWITCH.page2 }).click();
    await expect(frame.getByText(PAGE2_LABEL).first()).toBeVisible();
    await frame.getByRole('button', { name: SWITCH.page1 }).click();
    await frame.getByText(CAROUSEL_TITLE).first().click();
    await expect(page.getByText('Card size').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('Carousel is a Pro feature', { exact: true })).toHaveCount(0);
  });

  test('pro (unmocked): the font picker carries no lock', async ({ page }) => {
    await openEditor(page);
    await openFontTab(page);
    await expect(page.getByRole('button', { name: 'Font', exact: true })).toBeVisible();
    await expect(page.getByTestId('locked-font')).toHaveCount(0);
  });

  test('pro (unmocked): the page-level animation carries no lock note', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openEditor(page);
    await openButtonsTab(page);
    await expect(page.getByTestId('page-anim-chip-pulse')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('page-anim-chip-locked')).toHaveCount(0);
  });
});
