// TL.HANDLE.2 — change your handle from the Name & Handle hub.
//
// The hub's Name tab gains a Username field under Display name. It runs the
// onboarding rules (validateHandle → format / reserved) and the onboarding
// availability query, offers free alternatives when the wanted handle is taken
// (src/lib/handle-suggest.ts), and Keep renames through the change_handle RPC
// (pages.handle + profiles.username in one transaction) before the usual
// theme/display-name write.
//
// 1. The field seeds with the battery handle; the hub starts clean.
// 2. Format and reserved errors block Keep; typing the handle back is clean.
// 3. A real rename to <handle>-x and back, through the UI, with the public
//    page checked at both URLs. WRITES: the battery's pages.handle /
//    profiles.username (restored in the test, and again unconditionally in
//    afterAll through a Node client — every other spec depends on the handle).
//    The renamed handle keeps the joey2019pwtest prefix, so the sitemap
//    exclusion holds for the whole run.
// 4. Taken → suggestion chips. `joeyc` is someone else's page (the battery's
//    own handle is excluded by .neq(user_id)); only a read-only availability
//    check runs, nothing is written.
//
// Needs 20260928120000_handle2_change_handle.sql applied in prod for test 3
// (and for afterAll's restore to be more than a read). Desktop only: the hub
// and the RPC do not depend on the browser engine.

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { test, expect, allowWrites, type Page } from './fixtures';
import { TEST_EMAIL, TEST_PASSWORD, TEST_HANDLE, PINNED_TEST_USER_ID } from './helpers/auth';

const RENAMED = `${TEST_HANDLE}-x`;
const DESKTOP = { width: 1440, height: 1000 };

/** .env holds the app's Supabase URL/key; playwright.config only loads .env.test. */
function viteEnv(name: string): string {
  if (process.env[name]) return process.env[name]!;
  for (const file of ['.env.test', '.env']) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[1] === name) return m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  throw new Error(`${name} not found in process.env, .env.test or .env`);
}

const usernameInput = (page: Page) => page.getByTestId('hub-username').filter({ visible: true }).first();
const usernameStatus = (page: Page) => page.getByTestId('hub-username-status').filter({ visible: true }).first();
const keepButton = (page: Page) =>
  page.getByRole('button', { name: /^(Save|Guardar)$/ }).filter({ visible: true }).first();

const openHub = async (page: Page) => {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
  await page.getByText('Name & Handle', { exact: false }).filter({ visible: true }).first().click();
  await expect(usernameInput(page)).toBeVisible();
};

const rename = async (page: Page, to: string) => {
  await usernameInput(page).fill(to);
  await expect(usernameStatus(page)).toContainText('Available', { timeout: 10_000 });
  await expect(keepButton(page)).toBeEnabled();
  await keepButton(page).click();
  await expect(page.getByText(/^(Saved|Guardado)$/).first()).toBeVisible({ timeout: 15_000 });
  await expect(usernameInput(page)).toHaveValue(to);
  await expect(keepButton(page), 'the saved handle is the new baseline').toBeDisabled();
};

const expectPublicPage = async (page: Page, handle: string) => {
  const res = await page.goto(`/${handle}`);
  expect(res?.status()).toBe(200);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: '404' })).toHaveCount(0);
  await expect(page.getByText(`@${handle}`).first()).toBeVisible({ timeout: 15_000 });
};

const expectNotFound = async (page: Page, handle: string) => {
  // The dev server has no middleware, so the SPA answers 200 and renders its
  // own 404 view; in prod the middleware 404s first. Either way: not the page.
  await page.goto(`/${handle}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible({ timeout: 15_000 });
  // NotFoundView names the missing handle itself ('@{handle} not found'), so
  // "@handle is absent" would be false here — assert the not-found line instead.
  await expect(page.getByText(`@${handle} not found`, { exact: true })).toBeVisible();
};

test.describe('TL.HANDLE.2 — change your handle from the hub', () => {
  test.use({ viewport: DESKTOP });

  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'desktop only — shared-account rename');
    // TL.ISO.2 write opt-in: Keep calls change_handle, then PATCHes pages.
    await allowWrites(page, ['rest/v1/rpc/change_handle', 'rest/v1/pages']);
  });

  // Unconditional restore: a run that dies mid-rename must never leave the
  // battery on another handle. Signs in as the battery through a Node client
  // (not the page — afterAll has none), re-checks the identity pin, and renames
  // back. A failed call is only tolerated when the handle is already canonical
  // (e.g. before the migration is applied, when no rename could have happened).
  test.afterAll(async () => {
    if (test.info().project.name !== 'desktop') return;
    const sb = createClient(viteEnv('VITE_SUPABASE_URL'), viteEnv('VITE_SUPABASE_PUBLISHABLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
    if (authErr) throw new Error(`afterAll restore: sign-in failed: ${authErr.message}`);
    if (auth.user?.id !== PINNED_TEST_USER_ID) {
      throw new Error(`afterAll restore: signed in as ${auth.user?.id}, not the battery ${PINNED_TEST_USER_ID}. Nothing renamed.`);
    }
    const { error } = await sb.rpc('change_handle', { p_handle: TEST_HANDLE });
    if (error) {
      const { data: pg } = await sb.from('pages').select('handle').eq('user_id', PINNED_TEST_USER_ID).maybeSingle();
      if (pg?.handle !== TEST_HANDLE) {
        throw new Error(`afterAll restore FAILED: battery is on '${pg?.handle}' — ${error.message}. Run node scripts/reset-test-account.mjs.`);
      }
    }
    await sb.auth.signOut();
  });

  test('1. the field seeds with the battery handle; the hub starts clean', async ({ page }) => {
    await openHub(page);
    await expect(usernameInput(page)).toHaveValue(TEST_HANDLE);
    await expect(usernameStatus(page)).toHaveCount(0);
    await expect(keepButton(page)).toBeDisabled();
  });

  test('2. format and reserved errors block Keep; the own handle is clean again', async ({ page }) => {
    await openHub(page);

    await usernameInput(page).fill('ab');
    await expect(usernameStatus(page)).toContainText('Use 3–30 lowercase letters');
    await expect(keepButton(page)).toBeDisabled();

    await usernameInput(page).fill('admin');
    await expect(usernameStatus(page)).toContainText('reserved');
    await expect(keepButton(page)).toBeDisabled();

    await usernameInput(page).fill(TEST_HANDLE);
    await expect(usernameStatus(page)).toHaveCount(0);
    await expect(keepButton(page)).toBeDisabled();
  });

  test('3. rename to <handle>-x and back: the new URL serves the page, the old one does not', async ({ page }) => {
    test.setTimeout(120_000);
    await openHub(page);
    await rename(page, RENAMED);
    // The editor chrome reads the refetched page row, not a cached handle.
    await expect(page.getByText(`@${RENAMED}`, { exact: true }).filter({ visible: true }).first()).toBeVisible();

    await expectPublicPage(page, RENAMED);
    await expectNotFound(page, TEST_HANDLE);

    // Back through the UI — the hub re-seeds from the renamed page.
    await openHub(page);
    await expect(usernameInput(page)).toHaveValue(RENAMED);
    await rename(page, TEST_HANDLE);

    await expectPublicPage(page, TEST_HANDLE);
  });

  test('4. a taken handle offers free alternatives; tapping one fills the field', async ({ page }) => {
    await openHub(page);
    await usernameInput(page).fill('joeyc');
    await expect(usernameStatus(page)).toContainText('already taken', { timeout: 10_000 });
    await expect(keepButton(page)).toBeDisabled();

    const chips = page.getByTestId('hub-username-suggestion').filter({ visible: true });
    await expect(chips.first()).toBeVisible({ timeout: 10_000 });
    const pick = ((await chips.first().textContent()) ?? '').replace(/^@/, '').trim();
    expect(pick).toMatch(/^joeyc/);
    // Visual gate: the field, status, chips and warning fit the slide-in panel.
    await usernameInput(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'tests/screenshots/hub-username-taken.png' });

    await chips.first().click();
    await expect(usernameInput(page)).toHaveValue(pick);
    await expect(usernameStatus(page)).toContainText(/Available|already taken/, { timeout: 10_000 });
    await expect(usernameStatus(page)).not.toContainText('Use 3–30');
    // Read-only: nothing is kept.
    await page.getByRole('button', { name: /^(Cancel|Cancelar)$/ }).filter({ visible: true }).first().click();
    await expect(usernameInput(page)).toHaveValue(TEST_HANDLE);
  });
});
