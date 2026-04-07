import { Page } from '@playwright/test';

export const TEST_EMAIL = 'playwright-test@titilinks.com';
export const TEST_PASSWORD = 'TestPassword123!';

export async function loginAsTestUser(page: Page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard/**', { timeout: 10000 });
}

export async function screenshotPage(page: Page, name: string) {
  await page.screenshot({
    path: `tests/screenshots/${name}.png`,
    fullPage: true
  });
}
