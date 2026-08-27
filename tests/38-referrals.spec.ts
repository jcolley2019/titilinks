// BILL.B3 — referrals (payment-qualified, 30-day hold) + server-side entitlements.
//
// The reward RULES are pure decisions and are exhaustively table-tested in
// scripts/billing.test.mjs (rules R1-R6, including every R2 void case and the R5
// cap), wired into `npm run guard`. This spec covers the browser-observable half:
//
//   • ?ref=<code> capture — valid codes stashed, `badge` and malformed values
//     refused, first code wins
//   • claim_referral offered at the auth boundary, never by anon
//   • the share link + copy affordance in Settings
//   • ENT.SRV: a SERVER quota refusal (42501) is surfaced as a quota message and
//     the row is not added optimistically
//
// Mutation-verified: before B3 there was no ReferralCapture, the settings card
// showed a "Coming soon" chip with no link, claim_referral did not exist, and a
// 42501 insert refusal fell through to the generic "couldn't save" copy.
//
// Every Supabase call is stubbed at the REST/RPC layer (route-level fulfill, no
// live passthrough — HOUSE.1 flake lesson).

import { test, expect, type Page } from '@playwright/test';
import { TEST_HANDLE } from './helpers/auth';

type Lang = 'en' | 'es';

const PENDING_REFERRAL_KEY = 'titilinks-pending-referral';
const CODE = 'abcd2345';
const OTHER_CODE = 'wxyz6789';

const bootLang = (page: Page, lang: Lang) =>
  page.addInitScript((l) => localStorage.setItem('titilinks-language', l), lang);

const readStash = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), PENDING_REFERRAL_KEY);

/** Pin plan + referral_code on the shared ['plan'] query. */
async function routeProfiles(
  page: Page,
  plan: 'free' | 'pro' | 'business',
  referralCode: string | null = CODE,
) {
  await page.route('**/rest/v1/profiles*', (route) => {
    const req = route.request();
    if (req.method() === 'GET' && /select=plan(\b|&|$|%2C|,)/.test(req.url())) {
      return route.fulfill({ json: { plan, show_badge: true, referral_code: referralCode } });
    }
    if (req.method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    return route.continue();
  });
}

/** Record calls to the claim_referral RPC and control its verdict. */
async function routeClaim(page: Page, result: boolean | { status: number } = true) {
  const calls: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/rpc/claim_referral', async (route) => {
    try {
      calls.push(JSON.parse(route.request().postData() || '{}'));
    } catch {
      calls.push({});
    }
    if (typeof result === 'object') {
      return route.fulfill({ status: result.status, json: { message: 'denied' } });
    }
    return route.fulfill({ json: result });
  });
  return calls;
}

// ---------------------------------------------------------------------------
// Capture — the client remembers a code; it decides nothing
// ---------------------------------------------------------------------------
test.describe('?ref capture', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a valid code on the landing page is stashed', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto(`/?ref=${CODE}`);
    await expect.poll(() => readStash(page)).toMatchObject({ code: CODE });
  });

  test('?ref=badge is the generic badge link and is NOT attributed', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto('/?ref=badge');
    // Give the capture effect a chance to run before asserting the absence.
    await page.waitForTimeout(500);
    expect(await readStash(page)).toBeNull();
  });

  test('malformed codes are refused', async ({ page }) => {
    await bootLang(page, 'en');
    // Wrong length, wrong case, and a look-alike character that is not in the
    // alphabet (0 / l are excluded because codes get typed by hand).
    for (const bad of ['abc', 'ABCD2345', 'abcd2340', 'abcd234l', 'abcd234!']) {
      await page.goto(`/?ref=${bad}`);
      await page.waitForTimeout(200);
      expect(await readStash(page), `${bad} must not be stashed`).toBeNull();
    }
  });

  test('the first code wins — a later link cannot steal the credit', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto(`/?ref=${CODE}`);
    await expect.poll(() => readStash(page)).toMatchObject({ code: CODE });

    await page.goto(`/?ref=${OTHER_CODE}`);
    await page.waitForTimeout(400);
    expect(await readStash(page)).toMatchObject({ code: CODE });
  });

  test('capture works from any route, not just the landing page', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto(`/login?ref=${CODE}`);
    await expect.poll(() => readStash(page)).toMatchObject({ code: CODE });
  });

  test('anon never calls claim_referral — there is no account to attribute', async ({ page }) => {
    await bootLang(page, 'en');
    const calls = await routeClaim(page, true);
    await page.goto(`/?ref=${CODE}`);
    await page.waitForTimeout(700);
    expect(calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Claim — offered once a session exists, and the server decides
// ---------------------------------------------------------------------------
test.describe('claim_referral at the auth boundary', () => {
  test('a stashed code is offered on sign-in and cleared when accepted', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfiles(page, 'free');
    const calls = await routeClaim(page, true);

    // Seed the stash as though the visitor arrived on a share link earlier.
    await page.addInitScript(
      ([key, code]) => localStorage.setItem(key, JSON.stringify({ code, at: Date.now() })),
      [PENDING_REFERRAL_KEY, CODE] as const,
    );

    await page.goto('/login');
    await expect.poll(() => calls.length).toBe(1);
    expect(calls[0]).toEqual({ p_code: CODE });

    // Accepted → the key is cleared so it is never offered twice.
    await expect.poll(() => readStash(page)).toBeNull();
  });

  test('a server rejection also clears the code (no retry storm)', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfiles(page, 'free');
    // false = the RPC ran and refused (unknown code, self-referral, stale account).
    const calls = await routeClaim(page, false);

    await page.addInitScript(
      ([key, code]) => localStorage.setItem(key, JSON.stringify({ code, at: Date.now() })),
      [PENDING_REFERRAL_KEY, CODE] as const,
    );

    await page.goto('/login');
    await expect.poll(() => calls.length).toBe(1);
    await expect.poll(() => readStash(page)).toBeNull();
  });

  test('a transport failure KEEPS the code for the next attempt', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfiles(page, 'free');
    const calls = await routeClaim(page, { status: 500 });

    await page.addInitScript(
      ([key, code]) => localStorage.setItem(key, JSON.stringify({ code, at: Date.now() })),
      [PENDING_REFERRAL_KEY, CODE] as const,
    );

    await page.goto('/login');
    await expect.poll(() => calls.length).toBe(1);
    // Attribution must survive a network blip — it is unbackfillable.
    await expect.poll(() => readStash(page)).toMatchObject({ code: CODE });
  });

  test('an expired stash is discarded without calling the RPC', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfiles(page, 'free');
    const calls = await routeClaim(page, true);

    // 8 days old — past the 7-day client TTL.
    await page.addInitScript(
      ([key, code]) =>
        localStorage.setItem(key, JSON.stringify({ code, at: Date.now() - 8 * 24 * 60 * 60 * 1000 })),
      [PENDING_REFERRAL_KEY, CODE] as const,
    );

    await page.goto('/login');
    await page.waitForTimeout(900);
    expect(calls).toEqual([]);
    expect(await readStash(page)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Settings — the share link replaces the "Coming soon" placeholder
// ---------------------------------------------------------------------------
test.describe('settings referral section', () => {
  test('shows the share link and copies it', async ({ page, baseURL }) => {
    await bootLang(page, 'en');
    await routeProfiles(page, 'pro', CODE);

    // Record what gets written instead of granting clipboard permissions: the
    // mobile project is WebKit, which has no 'clipboard-write' permission at all.
    // Stubbing writeText works on both engines AND pins the exact string copied.
    await page.addInitScript(() => {
      (window as unknown as { __copied: string[] }).__copied = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (text: string) => {
            (window as unknown as { __copied: string[] }).__copied.push(text);
            return Promise.resolve();
          },
        },
      });
    });

    await page.goto('/dashboard/settings');

    const link = page.getByTestId('settings-referral-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveText(`${baseURL}/?ref=${CODE}`);

    await page.getByTestId('settings-referral-copy').click();
    await expect(page.getByTestId('settings-referral-copy')).toHaveText(/copied/i);
    expect(await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied)).toEqual([
      `${baseURL}/?ref=${CODE}`,
    ]);
  });

  test('the rewards teaser now points at the future CASH program', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfiles(page, 'pro', CODE);
    await page.goto('/dashboard/settings');

    // The give/get month is live, so the "Coming soon" chip must no longer be
    // attached to it — it belongs to the unbuilt cash program.
    await expect(page.getByText(/cash rewards/i)).toBeVisible();
    await expect(page.getByText(/paying subscriber for 30 days/i)).toBeVisible();
    await expect(page.getByText(/free signups don’t count/i)).toBeVisible();
  });

  test('free tier gets the referral link too — referring is not a paid feature', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfiles(page, 'free', CODE);
    await page.goto('/dashboard/settings');
    await expect(page.getByTestId('settings-referral-link')).toBeVisible();
  });

  test('no code yet renders a waiting note, never /?ref=null', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfiles(page, 'pro', null);
    await page.goto('/dashboard/settings');

    await expect(page.getByTestId('settings-referral-pending')).toBeVisible();
    await expect(page.getByTestId('settings-referral-link')).toHaveCount(0);
    await expect(page.getByText('/?ref=null')).toHaveCount(0);
  });

  test('renders in Spanish', async ({ page }) => {
    await bootLang(page, 'es');
    await routeProfiles(page, 'pro', CODE);
    await page.goto('/dashboard/settings');
    await expect(page.getByText(/Regala un mes, gana un mes/i)).toBeVisible();
    await expect(page.getByTestId('settings-referral-copy')).toHaveText(/Copiar enlace/i);
  });
});

// ---------------------------------------------------------------------------
// BILL.B3b — the public badge credits the page owner
// ---------------------------------------------------------------------------
// The badge href comes from EPV's `badgeRefCode` prop, fed by
// get_public_page_branding.referral_code through usePublicPageBranding. The prop
// is OPTIONAL, so the two editor-mounted EPV instances keep the generic link.
//
// Mutation-verified: reverting the EPV href ternary to the literal
// "/?ref=badge" fails the first test here.
test.describe('public badge attribution', () => {
  const PROFILE = `/${TEST_HANDLE}`;

  /** Stub the public branding RPC. Returns a table → array of rows. */
  const routeBranding = (page: Page, row: Record<string, unknown>) =>
    page.route('**/rest/v1/rpc/get_public_page_branding*', (route) =>
      route.fulfill({ json: [row] }),
    );

  test('a free page badge links with the owner referral code', async ({ page }) => {
    await routeBranding(page, { plan: 'free', show_badge: true, referral_code: CODE });
    await page.goto(PROFILE);
    await page.waitForLoadState('networkidle');

    await expect(page.locator(`a[href="/?ref=${CODE}"]`)).toBeVisible();
    // The generic link must be gone — the visit is attributed now.
    await expect(page.locator('a[href="/?ref=badge"]')).toHaveCount(0);
  });

  test('a pro page that keeps the badge on is also credited', async ({ page }) => {
    await routeBranding(page, { plan: 'pro', show_badge: true, referral_code: CODE });
    await page.goto(PROFILE);
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`a[href="/?ref=${CODE}"]`)).toBeVisible();
  });

  test('no referral_code falls back to the generic badge link', async ({ page }) => {
    // The shape the RPC returned before the referrals migration ran — the badge
    // must keep working rather than emitting /?ref=null.
    await routeBranding(page, { plan: 'free', show_badge: true });
    await page.goto(PROFILE);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('a[href="/?ref=badge"]')).toBeVisible();
    await expect(page.locator('a[href="/?ref=null"]')).toHaveCount(0);
  });

  test('a pro page with the badge off has no link to credit', async ({ page }) => {
    await routeBranding(page, { plan: 'pro', show_badge: false, referral_code: CODE });
    await page.goto(PROFILE);
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`a[href="/?ref=${CODE}"]`)).toHaveCount(0);
    await expect(page.locator('a[href="/?ref=badge"]')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// ENT.SRV — the server is the floor, and the client explains its refusal
// ---------------------------------------------------------------------------
test.describe('server-side quota refusal', () => {
  test('a 42501 policy denial surfaces as a quota message, not a generic error', async ({ page }) => {
    await bootLang(page, 'en');
    await routeProfiles(page, 'free', CODE);

    // The client thinks it has room (one link, free allows three) but the server
    // counts for itself — this is the stale-cache case ENT.SRV exists to catch.
    await page.route('**/rest/v1/custom_short_links*', (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        return route.fulfill({
          json: [
            {
              id: 'id-1',
              user_id: 'u',
              slug: 'existing',
              target_url: 'https://example.com',
              clicks: 0,
              created_at: '2026-07-29T00:00:00Z',
            },
          ],
        });
      }
      if (req.method() === 'POST') {
        return route.fulfill({
          status: 403,
          json: {
            code: '42501',
            message: 'new row violates row-level security policy for table "custom_short_links"',
          },
        });
      }
      return route.continue();
    });

    await page.goto('/dashboard/short-links');
    await page.getByTestId('short-link-slug').fill('newslug');
    await page.getByTestId('short-link-url').fill('example.com/x');
    await page.getByTestId('short-link-create').click();

    const error = page.getByTestId('short-link-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText(/short-link limit/i);
    // The refused row must not appear optimistically.
    await expect(page.getByTestId('short-link-row')).toHaveCount(1);
  });
});
