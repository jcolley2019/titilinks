import type { Page } from '../fixtures';

/**
 * Dedicated Playwright test-account credentials.
 * Real values live ONLY in .env.test (gitignored) — see .env.test.example.
 * ⚠️ The repo is PUBLIC: never hardcode a real email/password in this file.
 */
export const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? '';
export const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? '';

/**
 * TL.ISO.1 — identity pin. The ONLY account the battery may run as.
 * Committed deliberately: UUIDs and handles are identifiers, not secrets.
 * The pin makes credential drift in .env.test hard-fail at auth setup
 * instead of silently running every spec against the wrong account.
 */
export const PINNED_TEST_USER_ID = 'd3f1cfce-d15a-4f4a-ba5c-908e3e959e58';

/**
 * Joey's PERSONAL account — formerly the shared
 * battery account. The Aug 18-19, 2026 incident minted 32 duplicate blocks
 * on this live page while specs and real usage shared it. Specs must never
 * auth as it again; auth.setup.ts refuses this id by name.
 */
export const OLD_JOEYC_USER_ID = '3eb457d7-8a07-4b2b-88e6-22222debfdc1';

/**
 * Public handle of the dedicated battery account
 * (joey2019pwtest+battery@gmail.com). Every spec URL derives from this —
 * no spec may hardcode a handle string.
 */
export const TEST_HANDLE = 'joey2019pwtestbattery';

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
