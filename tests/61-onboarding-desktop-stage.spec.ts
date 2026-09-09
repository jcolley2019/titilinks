/**
 * TL.ONB.STAGE.2 — at >=lg the onboarding wizard renders as the editor's stage:
 * the steps in a fixed left panel, the real EditorStage phone beside them.
 *
 * HOW STEPS 1-3 ARE REACHED. The battery account already owns a page, so
 * OnboardingFlow's resume guard reads profiles + pages on mount and jumps to
 * step 4. Tests 1, 2 and 4 mock those two GET reads to return [] (non-GET falls
 * through with route.fallback()), so the wizard boots at step 1 as a brand-new
 * account would. sessionStorage is cleared through addInitScript before each
 * goto, because the wizard restores its own persisted step.
 *
 * WHAT IS NEVER CLICKED. The default-deny fixture aborts every mutating request,
 * so the step-1 and step-2 profile writes fail — the wizard ignores that by
 * design and advances anyway, which is what makes driving the panel possible.
 * Step 3's Continue is a pages.insert, which the guard would abort mid-flight,
 * so no test clicks Continue on step 3. Test 3 runs with no mocks at all and
 * never clicks anything: it only reads the resumed step-4 page.
 */
import { test, expect, type Page } from './fixtures';
import { translations } from '../src/hooks/useLanguage';
import { TEST_HANDLE, screenshotPage } from './helpers/auth';

const T = translations.en;

/** The resume guard's two reads, answered empty so the wizard starts at step 1. */
async function mockFreshAccount(page: Page) {
  await page.addInitScript(() => {
    try { window.sessionStorage.clear(); } catch { /* storage disabled */ }
  });
  for (const table of ['profiles', 'pages']) {
    await page.route(`**/rest/v1/${table}*`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
  }
}

const panel = (page: Page) => page.getByTestId('onboarding-panel');
const frame = (page: Page) => page.getByTestId('device-frame');

test.describe('TL.ONB.STAGE.2 — onboarding on the desktop stage', () => {
  test('at ≥lg the wizard is the editor stage: panel + phone, no stretched backdrop', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the stage is a ≥lg surface');
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockFreshAccount(page);
    await page.goto('/onboarding');

    await expect(panel(page)).toBeVisible();
    await expect(page.getByTestId('onboarding-title')).toHaveText('Onboarding');
    await expect(frame(page)).toBeVisible();
    await expect(page.getByTestId('device-selector')).toBeVisible();
    await expect(page.getByTestId('stage-label')).toBeVisible();

    // The stage owns the preview, so onboarding's own chrome is off: no
    // edit/visitor toggle, and no ONB.10 full-screen backdrop behind the steps.
    await expect(page.getByTestId('preview-mode-toggle')).toHaveCount(0);
    await expect(page.locator('div.fixed.inset-0.-z-10')).toHaveCount(0);

    // Nothing is typed yet, so the phone shows the preview placeholders rather
    // than a nameless hero over a bare "@".
    await expect(frame(page)).toContainText('Your Name');
    await expect(frame(page)).toContainText('@yourname');

    await screenshotPage(page, 'desktop-onb-step1');
  });

  test('the phone mirrors the choices live (steps 1→3)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the stage is a ≥lg surface');
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockFreshAccount(page);
    await page.goto('/onboarding');

    // Step 1 — pick the full-screen style, then Continue.
    await panel(page).getByRole('button').filter({ hasText: T['onboardingFlow.styleFullBleed'] }).first().click();
    await panel(page).getByRole('button', { name: T['onboardingFlow.continue'], exact: true }).click();

    // Step 2 — the name and handle land in the phone as they are typed.
    const name = panel(page).getByPlaceholder(T['onboardingFlow.displayNamePlaceholder']);
    await expect(name).toBeVisible();
    await name.fill('Preview Person');
    await panel(page).getByPlaceholder(T['onboardingFlow.usernamePlaceholder']).fill('previewperson');

    await expect(frame(page)).toContainText('Preview Person');
    await expect(frame(page)).toContainText('@previewperson');
    await screenshotPage(page, 'desktop-onb-step2');

    // ONB.6: with no photo picked, the first Continue offers to add one and the
    // second acknowledges the skip. Two modals, then step 3.
    await panel(page).getByRole('button', { name: T['onboardingFlow.continue'], exact: true }).click();
    await page.getByRole('button', { name: T['onboardingFlow.photoNudgeNotNow'], exact: true }).click();
    await panel(page).getByRole('button', { name: T['onboardingFlow.continue'], exact: true }).click();
    await page.getByRole('button', { name: T['onboardingFlow.photoSkipContinue'], exact: true }).click();

    // Step 3 — full_bleed routes to the button-size step; the phone stays up.
    await expect(panel(page).getByText(T['onboardingFlow.chooseButtons'], { exact: true })).toBeVisible();
    await expect(frame(page)).toBeVisible();
    await screenshotPage(page, 'desktop-onb-step3');
    // Deliberately NOT clicking Continue: step 3 is the pages.insert.
  });

  test('an account that already has a page resumes at step 4 with the REAL page in the phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the stage is a ≥lg surface');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      try { window.sessionStorage.clear(); } catch { /* storage disabled */ }
    });
    await page.goto('/onboarding');

    // No mocks: the resume guard finds the battery account's page and jumps to
    // step 4, and the read-only hook loads those real rows into the phone.
    await expect(panel(page).getByText(T['onboardingFlow.yourSocialPlatforms'], { exact: true })).toBeVisible();
    await expect(frame(page)).toContainText(`@${TEST_HANDLE}`);
    await screenshotPage(page, 'desktop-onb-step4-real');
    // Deliberately NOT clicking Continue: step 4 writes the social rows.
  });

  test('below lg the mobile onboarding is unchanged', async ({ page }, testInfo) => {
    const narrow = testInfo.project.name === 'desktop';
    if (narrow) await page.setViewportSize({ width: 1023, height: 900 });
    await mockFreshAccount(page);
    await page.goto('/onboarding');

    await expect(page.getByTestId('onboarding-desktop')).toHaveCount(0);
    await expect(panel(page)).toHaveCount(0);
    await expect(frame(page)).toHaveCount(0);

    // The pre-STAGE.2 tree: the root, with the top bar carrying the wordmark
    // as its first child.
    const root = page.locator('div.relative.isolate.min-h-screen');
    await expect(root).toHaveCount(1);
    await expect(root.locator('> div').first()).toContainText('TitiLinks');

    await screenshotPage(page, narrow ? 'desktop-1023-onb-step1' : 'mobile-onb-step1');
  });
});
