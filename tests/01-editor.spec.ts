import { test, expect } from '@playwright/test';
import { loginAsTestUser, screenshotPage } from './helpers/auth';

test.describe('Editor - Desktop', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
  });

  test('editor loads with two-panel layout', async ({ page }) => {
    await screenshotPage(page, 'desktop-editor');
    // Left panel should be visible
    await expect(page.locator('text=Content')).toBeVisible();
    await expect(page.locator('text=Design')).toBeVisible();
  });

  test('design tab shows profile photo section', async ({ page }) => {
    await page.click('text=Design');
    await page.waitForTimeout(500);
    await screenshotPage(page, 'desktop-design-tab');
    await expect(page.locator('text=Profile Photo')).toBeVisible();
  });

  test('content tab shows Clear All button', async ({ page }) => {
    await screenshotPage(page, 'desktop-content-tab');
    await expect(page.locator('text=Clear All')).toBeVisible();
  });
});

test.describe('Editor - Mobile', () => {
  test.use({ ...require('@playwright/test').devices['iPhone 14 Pro Max'] });

  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/dashboard/editor');
    await page.waitForLoadState('networkidle');
  });

  test('mobile shows cinematic hero preview', async ({ page }) => {
    await page.waitForTimeout(1000);
    await screenshotPage(page, 'mobile-editor-preview');
    // Should show the live preview iframe
    await expect(page.locator('iframe')).toBeVisible();
  });

  test('mobile shows Edit Profile gold pill', async ({ page }) => {
    await page.waitForTimeout(1000);
    await screenshotPage(page, 'mobile-editor-pill');
    await expect(page.locator('text=Edit Profile')).toBeVisible();
  });
});
