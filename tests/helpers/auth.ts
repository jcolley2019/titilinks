import { Page } from '@playwright/test';

/**
 * Dedicated Playwright test-account credentials.
 * Real values live ONLY in .env.test (gitignored) — see .env.test.example.
 * ⚠️ The repo is PUBLIC: never hardcode a real email/password in this file.
 */
export const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? '';
export const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? '';

/**
 * Perform ONE real Supabase login through the /login form.
 * Called only by tests/auth.setup.ts to mint the shared storageState;
 * individual specs consume that saved session instead of logging in per-test.
 *
 * Success = navigation AWAY from /login. The post-login destination is
 * /dashboard/editor when onboarding_complete, else /onboarding (Login.tsx:42) —
 * so we wait to LEAVE /login rather than for one specific route.
 */
export async function loginAsTestUser(page: Page) {
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    throw new Error(
      'Missing TEST_USER_EMAIL / TEST_USER_PASSWORD. Copy .env.test.example to ' +
        '.env.test and fill in the dedicated test-account credentials.'
    );
  }
  await page.goto('/login');
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 });
}

export async function screenshotPage(page: Page, name: string) {
  await page.screenshot({
    path: `tests/screenshots/${name}.png`,
    fullPage: true,
  });
}
