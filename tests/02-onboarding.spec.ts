import { test, expect } from '@playwright/test';
import { screenshotPage } from './helpers/auth';

// HARNESS.AUTH.2 — onboarding-from-zero coverage is deferred.
//
// These specs exercise the first-run onboarding wizard (choose style → upload
// hero → pick platforms). They structurally require a FRESH account that has not
// completed onboarding. The shared storageState account (HARNESS.AUTH.1) has
// already completed onboarding and OWNS a page, so OnboardingFlow's resume guard
// fires `GO_TO_STEP → step 4` on load (src/pages/OnboardingFlow.tsx:78-82),
// auto-advancing past the style picker — the step-1/step-2 UI these specs assert
// is never shown, and the step-4 spec has no navigation of its own.
//
// Rather than skip silently, each spec is explicitly skipped with this reason and
// keeps its original assertions as the contract HARNESS.AUTH.2 must satisfy once a
// dedicated fresh-onboarding account (or programmatic reset) is available.

test.describe('Onboarding Flow', () => {
  test('step 1 shows Hero and Full Bleed only (no Classic)', async ({ page }) => {
    test.skip(true, 'HARNESS.AUTH.2 — needs a fresh onboarding-from-zero account; shared account auto-advances to step 4.');
    await page.goto('/onboarding');
    await page.waitForLoadState('networkidle');
    await screenshotPage(page, 'onboarding-step1');
    await expect(page.locator('text=Hero')).toBeVisible();
    await expect(page.locator('text=Full Bleed')).toBeVisible();
    await expect(page.locator('text=Classic')).not.toBeVisible();
  });

  test('step 2 shows full-width hero photo upload area', async ({ page }) => {
    test.skip(true, 'HARNESS.AUTH.2 — needs a fresh onboarding-from-zero account; shared account auto-advances to step 4.');
    await page.goto('/onboarding');
    await page.waitForLoadState('networkidle');
    // Click Hero style
    await page.click('text=Hero');
    await page.click('text=Continue');
    await page.waitForTimeout(500);
    await screenshotPage(page, 'onboarding-step2');
    await expect(page.locator('text=Upload photo')).toBeVisible();
    await expect(page.locator('text=Hero Photo')).toBeVisible();
  });

  test('step 4 shows platform picker not URL inputs', async ({ page }) => {
    test.skip(true, 'HARNESS.AUTH.2 — needs a fresh onboarding-from-zero account traversed through steps 1-3.');
    // This requires going through steps 1-3 first
    // Just check the component renders the platform categories
    await screenshotPage(page, 'onboarding-step4-check');
    await expect(page.locator('text=Social Media')).toBeVisible();
    await expect(page.locator('text=TikTok')).toBeVisible();
    await expect(page.locator('text=Instagram')).toBeVisible();
  });
});
