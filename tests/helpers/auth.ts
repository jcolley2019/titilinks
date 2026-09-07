import type { Page } from '../fixtures';

/**
 * Dedicated Playwright test-account credentials.
 * Real values live ONLY in .env.test (gitignored) — see .env.test.example.
 * ⚠️ The repo is PUBLIC: never hardcode a real email/password in this file.
 */
export const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? '';
export const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? '';

/**
 * TL.HARNESS.FREE.1 — the SECOND test account, on the FREE plan.
 * Same rules as the pair above: real values live ONLY in .env.test.
 */
export const FREE_TEST_EMAIL = process.env.TEST_FREE_USER_EMAIL ?? '';
export const FREE_TEST_PASSWORD = process.env.TEST_FREE_USER_PASSWORD ?? '';

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
 * TL.HARNESS.FREE.1 — identity pin for the FREE-plan account
 * (joey2019pwtestfree@gmail.com), signed up through the app's own onboarding
 * on 2026-09-07. Second locked door, same lock: auth.setup.ts refuses to save
 * a storageState for anyone but this id.
 *
 * This account exists to prove the FREE floor — the closed side of every plan
 * gate the battery (which is comped to Pro forever, TL.COMP.4) can only prove
 * open. It is therefore NEVER comped, NEVER seeded and NEVER reset:
 * scripts/reset-test-account.mjs refuses its handle by name, and a spec may
 * only write to it under an explicit allowWrites() that restores what it
 * changed. Its page stays as onboarding left it.
 */
export const FREE_TEST_USER_ID = '87d14c9b-0eca-4ddf-bfe6-88f1a91ce8c3';

/** Public handle of the free-plan account. No spec may hardcode a handle string. */
export const FREE_TEST_HANDLE = 'joey2019pwtestfree';

/**
 * Perform ONE real Supabase login through the /login form.
 * The ONE login code path — both accounts go through it, so a change to the
 * form or to the post-login wait can never fix one door and miss the other.
 *
 * Success = navigation AWAY from /login. The post-login destination is
 * /dashboard/editor when onboarding_complete, else /onboarding (Login.tsx:42) —
 * so we wait to LEAVE /login rather than for one specific route.
 */
async function loginWithCredentials(
  page: Page,
  email: string,
  password: string,
  envKeys: string
) {
  if (!email || !password) {
    throw new Error(
      `Missing ${envKeys}. Copy .env.test.example to ` +
        '.env.test and fill in the dedicated test-account credentials.'
    );
  }
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20000 });
}

/**
 * Log in as the PRO battery account (TL.ISO.1).
 * Called by tests/auth.setup.ts to mint the shared storageState, and by the
 * handful of specs that recover a session spec 39 signed out for real.
 */
export async function loginAsTestUser(page: Page) {
  await loginWithCredentials(
    page,
    TEST_EMAIL,
    TEST_PASSWORD,
    'TEST_USER_EMAIL / TEST_USER_PASSWORD'
  );
}

/**
 * Log in as the FREE account (TL.HARNESS.FREE.1) — the second key.
 * Called by tests/auth.setup.ts to mint tests/.auth/free.json, which
 * fixtures.withFreeUser() then opens behind the same write guard.
 */
export async function loginAsFreeUser(page: Page) {
  await loginWithCredentials(
    page,
    FREE_TEST_EMAIL,
    FREE_TEST_PASSWORD,
    'TEST_FREE_USER_EMAIL / TEST_FREE_USER_PASSWORD'
  );
}

export async function screenshotPage(page: Page, name: string) {
  await page.screenshot({
    path: `tests/screenshots/${name}.png`,
    fullPage: true,
  });
}
