// BILL.B4 / DELETE.1 — account deletion.
//
// What ships in B4:
//   • edge function delete-account: cancels Stripe FIRST (immediate, no
//     proration), then purges storage + the three tables nothing cascades to
//     (canva_connections, custom_theme_presets, pending_canva_auth), then
//     auth.admin.deleteUser cascades the rest
//   • a type-your-handle danger zone in Settings, EN/ES
//   • /goodbye — a PUBLIC route, because the auth user is gone by then
//
// Mutation-verified: before B4 there was no danger zone, no /goodbye (it fell
// through to the single-segment /:handle route → PublicProfile), and no function.
//
// The function is route-mocked at functions/v1 — nothing here deletes anything.
// The shared test account must survive this spec, so the real endpoint is never
// reached: every test installs a mock BEFORE navigating, and the one test that
// asserts "no call was issued" checks a counter rather than an outcome.

import { test, expect, type Page } from './fixtures';

type Lang = 'en' | 'es';

const HANDLE = 'testcreator';

const bootLang = (page: Page, lang: Lang) =>
  page.addInitScript((l) => localStorage.setItem('titilinks-language', l), lang);

/** Pin the plan (settings needs it) and the page handle (the confirm gate). */
async function routeSettingsData(page: Page, handle: string | null = HANDLE) {
  await page.route('**/rest/v1/profiles*', (route) => {
    const req = route.request();
    if (req.method() === 'GET' && /select=plan(\b|&|$|%2C|,)/.test(req.url())) {
      return route.fulfill({ json: { plan: 'pro', show_badge: true, referral_code: 'abcd2345' } });
    }
    if (req.method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    return route.continue();
  });

  await page.route('**/rest/v1/pages*', (route) => {
    const req = route.request();
    if (req.method() === 'GET' && /select=handle/.test(req.url())) {
      // maybeSingle() → a single object, or null when there is no page.
      return route.fulfill({ json: handle ? { handle } : null });
    }
    return route.continue();
  });
}

/** Mock delete-account and count the calls. */
async function routeDelete(
  page: Page,
  response: { status?: number; json: Record<string, unknown> } = { json: { deleted: true, warnings: [] } },
) {
  const calls: Record<string, unknown>[] = [];
  await page.route('**/functions/v1/delete-account', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, body: '' });
    try {
      calls.push(JSON.parse(req.postData() || '{}'));
    } catch {
      calls.push({});
    }
    return route.fulfill({ status: response.status ?? 200, json: response.json });
  });
  return calls;
}

async function openDangerDialog(page: Page) {
  await page.goto('/dashboard/settings');
  const zone = page.getByTestId('danger-zone');
  await zone.scrollIntoViewIfNeeded();
  await expect(zone).toBeVisible();
  await page.getByTestId('danger-open').click();
  await expect(page.getByTestId('danger-dialog')).toBeVisible();
}

// ---------------------------------------------------------------------------
// The confirm gate
// ---------------------------------------------------------------------------
test.describe('confirm gate', () => {
  test('the danger zone spells out what is lost', async ({ page }) => {
    await bootLang(page, 'en');
    await routeSettingsData(page);
    await routeDelete(page);

    await page.goto('/dashboard/settings');
    const zone = page.getByTestId('danger-zone');
    await zone.scrollIntoViewIfNeeded();

    await expect(zone).toContainText(/permanent/i);
    await expect(zone).toContainText(/public page goes offline/i);
    await expect(zone).toContainText(/subscription is cancelled/i);
    await expect(zone).toContainText(/handle is released/i);
  });

  test('the delete button is disabled until the handle matches exactly', async ({ page }) => {
    await bootLang(page, 'en');
    await routeSettingsData(page);
    const calls = await routeDelete(page);
    await openDangerDialog(page);

    const confirm = page.getByTestId('danger-confirm');
    const input = page.getByTestId('danger-confirm-input');

    await expect(confirm).toBeDisabled();

    // A wrong handle keeps it disabled and says so.
    await input.fill('someoneelse');
    await expect(page.getByTestId('danger-mismatch')).toBeVisible();
    await expect(confirm).toBeDisabled();

    // A near-miss (prefix) must not pass.
    await input.fill(HANDLE.slice(0, -1));
    await expect(confirm).toBeDisabled();

    // The exact handle unlocks it.
    await input.fill(HANDLE);
    await expect(page.getByTestId('danger-mismatch')).toHaveCount(0);
    await expect(confirm).toBeEnabled();

    // Nothing has been called just by typing.
    expect(calls).toEqual([]);
  });

  test('case and surrounding whitespace are forgiven, the handle is not', async ({ page }) => {
    await bootLang(page, 'en');
    await routeSettingsData(page);
    await routeDelete(page);
    await openDangerDialog(page);

    await page.getByTestId('danger-confirm-input').fill(`  ${HANDLE.toUpperCase()}  `);
    await expect(page.getByTestId('danger-confirm')).toBeEnabled();
  });

  test('cancelling closes the dialog and calls nothing', async ({ page }) => {
    await bootLang(page, 'en');
    await routeSettingsData(page);
    const calls = await routeDelete(page);
    await openDangerDialog(page);

    await page.getByTestId('danger-confirm-input').fill(HANDLE);
    await page.getByTestId('danger-cancel').click();

    await expect(page.getByTestId('danger-dialog')).toHaveCount(0);
    expect(calls).toEqual([]);
    expect(new URL(page.url()).pathname).toBe('/dashboard/settings');
  });

  test('an account with no page asks for the literal "delete"', async ({ page }) => {
    await bootLang(page, 'en');
    await routeSettingsData(page, null);
    await routeDelete(page);
    await openDangerDialog(page);

    const confirm = page.getByTestId('danger-confirm');
    await page.getByTestId('danger-confirm-input').fill('anything');
    await expect(confirm).toBeDisabled();

    await page.getByTestId('danger-confirm-input').fill('delete');
    await expect(confirm).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// The flow
// ---------------------------------------------------------------------------
test.describe('deletion flow', () => {
  test('confirming issues the call with the typed handle and lands on /goodbye', async ({ page }) => {
    await bootLang(page, 'en');
    await routeSettingsData(page);
    const calls = await routeDelete(page, { json: { deleted: true, warnings: [] } });

    await openDangerDialog(page);
    await page.getByTestId('danger-confirm-input').fill(HANDLE);
    await page.getByTestId('danger-confirm').click();

    await page.waitForURL(/\/goodbye/);
    await expect(page.getByTestId('goodbye-title')).toHaveText(/your account has been deleted/i);
    // The typed handle is sent so the SERVER can re-verify it.
    expect(calls).toEqual([{ confirmHandle: HANDLE }]);
  });

  test('/goodbye is public — it must render with no session', async ({ page }) => {
    await bootLang(page, 'en');
    await page.context().clearCookies();
    await page.addInitScript(() => localStorage.clear());

    await page.goto('/goodbye');
    // Not bounced to /login, and not swallowed by the /:handle catch-all.
    await expect(page.getByTestId('goodbye-card')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/goodbye');
    await expect(page.getByRole('link', { name: /back to home/i })).toBeVisible();
  });

  test('a Stripe cancellation failure keeps the account and shows why', async ({ page }) => {
    await bootLang(page, 'en');
    await routeSettingsData(page);
    // 502 = the function refused to proceed because Stripe could not be
    // cancelled. Deleting anyway would keep billing a card with no account.
    await routeDelete(page, {
      status: 502,
      json: { error: 'Could not cancel your subscription: Stripe is unreachable' },
    });

    await openDangerDialog(page);
    await page.getByTestId('danger-confirm-input').fill(HANDLE);
    await page.getByTestId('danger-confirm').click();

    await expect(page.getByText(/couldn't delete your account/i).first()).toBeVisible();
    // The real reason is surfaced, not the opaque supabase-js message.
    await expect(page.getByText(/Stripe is unreachable/i).first()).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/dashboard/settings');
  });

  test('a server handle mismatch is refused even if the UI let it through', async ({ page }) => {
    await bootLang(page, 'en');
    await routeSettingsData(page);
    await routeDelete(page, { status: 400, json: { error: 'Confirmation did not match' } });

    await openDangerDialog(page);
    await page.getByTestId('danger-confirm-input').fill(HANDLE);
    await page.getByTestId('danger-confirm').click();

    await expect(page.getByText(/confirmation did not match/i).first()).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/dashboard/settings');
  });
});

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------
test.describe('Spanish', () => {
  test('danger zone and goodbye page render in Spanish', async ({ page }) => {
    await bootLang(page, 'es');
    await routeSettingsData(page);
    await routeDelete(page);

    await openDangerDialog(page);
    await expect(page.getByTestId('danger-dialog')).toContainText(/eliminar tu cuenta permanentemente/i);
    await expect(page.getByTestId('danger-cancel')).toHaveText(/Conservar mi cuenta/i);

    await page.getByTestId('danger-confirm-input').fill(HANDLE);
    await page.getByTestId('danger-confirm').click();

    await page.waitForURL(/\/goodbye/);
    await expect(page.getByTestId('goodbye-title')).toHaveText(/Tu cuenta ha sido eliminada/i);
  });
});
