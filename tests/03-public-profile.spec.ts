import { test, expect } from '@playwright/test';

test.describe('Public Profile', () => {
  test('profile page loads on mobile', async ({ page }) => {
    // Uses the test account handle
    await page.goto('/joeyc');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: 'tests/screenshots/mobile-public-profile.png',
      fullPage: true
    });
  });

  test('no duplicate social icons', async ({ page }) => {
    await page.goto('/joeyc');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    // Count TikTok icons — should be 1 not 2
    const tiktokIcons = await page.locator('text=TikTok').count();
    expect(tiktokIcons).toBeLessThanOrEqual(1);
  });
});
