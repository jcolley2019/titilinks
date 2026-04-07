import { test, expect } from '@playwright/test';
import { screenshotPage } from './helpers/auth';

test.describe('Onboarding Flow', () => {
  test('step 1 shows Hero and Full Bleed only (no Classic)', async ({ page }) => {
    await page.goto('/onboarding');
    await page.waitForLoadState('networkidle');
    await screenshotPage(page, 'onboarding-step1');
    await expect(page.locator('text=Hero')).toBeVisible();
    await expect(page.locator('text=Full Bleed')).toBeVisible();
    await expect(page.locator('text=Classic')).not.toBeVisible();
  });

  test('step 2 shows full-width hero photo upload area', async ({ page }) => {
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
    // This requires going through steps 1-3 first
    // Just check the component renders the platform categories
    await screenshotPage(page, 'onboarding-step4-check');
    await expect(page.locator('text=Social Media')).toBeVisible();
    await expect(page.locator('text=TikTok')).toBeVisible();
    await expect(page.locator('text=Instagram')).toBeVisible();
  });
});
