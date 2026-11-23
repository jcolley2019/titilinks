/**
 * FRAGILE.PUB.1 — audit P1 + P2: a failed read on the public page is not an
 * answer.
 *
 *   P1  "not found" only when the page lookup SUCCEEDED and returned no row;
 *       a lookup that failed every try shows Retry, and a failed secondary
 *       read renders what loaded instead of blanking the page.
 *   P2  the owner-plan lookup retries once and gives up at ~4 s so the page
 *       always paints; with no answer it uses the last plan this browser
 *       session saw for the handle, Free only when nothing is known, and it
 *       never stores a failure as an answer.
 *
 * The battery's public page, visited ANONYMOUSLY. Every mutating Supabase
 * request (the page-view event included) is recorded and ABORTED at the page
 * level, on top of the fixture's default-deny layer — nothing in the account
 * changes. Failures are injected on the wire with page.route.
 *
 *   (a) the page lookup fails every try → Retry, never the 404; then it succeeds → the page
 *   (b) a handle with no page → the 404, no Retry (unchanged)
 *   (c) the plan lookup fails → retried once, the page still paints inside the limit
 *   (d) the plan lookup stalls forever → the page paints anyway
 *   (e) a failed plan lookup keeps the plan last seen this session; a failure is never stored
 *   (f) a failed secondary read (block items) → the page still renders, no 404, no Retry
 *
 * FRAGILE.PUB.1a:
 *   (g) the Retry screen speaks to a visitor (not "your page"), in EN and in ES
 *   (h) the plan lookup fails after a confirmed Pro answer this session → the email form still shows
 */
import { test, expect, type Page } from './fixtures';
import { TEST_HANDLE } from './helpers/auth';
import { translations } from '../src/hooks/useLanguage';

const T = translations.en;
const ES = translations.es;
const PHONE = { width: 390, height: 844 };
const ANONYMOUS = { cookies: [], origins: [] };
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Mirrors src/hooks/usePublicPageBranding.ts (not imported: it pulls in the
// browser Supabase client).
const BRANDING_DEADLINE_MS = 4000;
const BRANDING_CACHE_KEY = `tl.publicBranding.${TEST_HANDLE}`;
const MISSING_HANDLE = 'fragilepubnosuchpage1';

/** Record + abort every mutating REST/storage/function call; the read RPCs (POSTs) pass. */
async function blockWrites(page: Page): Promise<string[]> {
  const writes: string[] = [];
  await page.route('**/*.supabase.co/**', async (route) => {
    const req = route.request();
    if (!MUTATING.has(req.method())) return route.fallback();
    const url = req.url();
    if (url.includes('/rest/v1/rpc/get_public_')) return route.fallback();
    writes.push(`${req.method()} ${url}`);
    return route.abort('blockedbyclient');
  });
  return writes;
}

const handleText = (page: Page, handle = TEST_HANDLE) => page.getByText(`@${handle}`).first();
const retryButton = (page: Page) => page.getByTestId('load-error-retry');
const notFoundHeading = (page: Page) => page.getByRole('heading', { name: '404', exact: true });
const notFoundText = (handle: string) => T['publicProfile.handleNotFound'].replace('{handle}', handle);
const badge = (page: Page) => page.getByRole('link', { name: /made with/i });

const isPageLookup = (url: string, method: string) =>
  method === 'GET' && url.includes('/rest/v1/pages_public') && url.includes('handle=eq.');

test.describe('FRAGILE.PUB.1 — a failed read on the public page is not an answer', () => {
  test.use({ storageState: ANONYMOUS, viewport: PHONE });

  test('(a) the page lookup fails every try → Retry, never the 404; then it loads', async ({ page }) => {
    await blockWrites(page);
    let fail = true;
    let failed = 0;
    await page.route('**/rest/v1/pages_public*', async (route) => {
      const req = route.request();
      if (!fail || !isPageLookup(req.url(), req.method())) return route.fallback();
      failed += 1;
      // A 5xx first, then dropped connections: neither is an answer.
      if (failed === 1) {
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"FRAGILE.PUB.1 probe"}' });
      }
      return route.abort('connectionfailed');
    });

    await page.goto(`/${TEST_HANDLE}`);

    await expect(retryButton(page)).toBeVisible({ timeout: 20_000 });
    expect(failed, 'the lookup is retried before it counts as failed').toBeGreaterThanOrEqual(3);
    await expect(page.getByTestId('load-error-state')).toContainText(T['loadError.visitorTitle']);
    await expect(notFoundHeading(page)).toHaveCount(0);
    await expect(page.getByText(notFoundText(TEST_HANDLE))).toHaveCount(0);

    // The network comes back: Retry loads the real page.
    fail = false;
    await retryButton(page).click();
    await expect(handleText(page)).toBeVisible({ timeout: 20_000 });
    await expect(retryButton(page)).toHaveCount(0);
    await expect(notFoundHeading(page)).toHaveCount(0);
  });

  test('(b) a handle with no page still shows the 404, and no Retry', async ({ page }) => {
    await blockWrites(page);
    const lookup = page.waitForResponse((r) => isPageLookup(r.url(), r.request().method()));
    await page.goto(`/${MISSING_HANDLE}`);
    const res = await lookup;
    expect(res.status(), 'the lookup answered — it is the answer that is empty').toBe(200);
    const body = await res.json();
    expect(Array.isArray(body) ? body.length : body, 'no row').toBeFalsy();

    await expect(notFoundHeading(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(notFoundText(MISSING_HANDLE))).toBeVisible();
    await expect(retryButton(page)).toHaveCount(0);
  });

  test('(c) the plan lookup fails → retried once, the page still paints inside the limit', async ({ page }) => {
    await blockWrites(page);
    let calls = 0;
    let firstAt = 0;
    await page.route('**/rest/v1/rpc/get_public_page_branding*', async (route) => {
      calls += 1;
      if (!firstAt) firstAt = Date.now();
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"FRAGILE.PUB.1 probe"}' });
    });

    await page.goto(`/${TEST_HANDLE}`);
    await expect(handleText(page)).toBeVisible({ timeout: 20_000 });
    const elapsed = Date.now() - firstAt;

    expect(calls, 'one retry, then it stops asking').toBe(2);
    expect(elapsed, 'painted inside the plan-lookup limit').toBeLessThan(BRANDING_DEADLINE_MS + 2_000);
    // Nothing known in this fresh session → the Free fallback, badge shown.
    await expect(badge(page)).toBeVisible();
    await expect(retryButton(page)).toHaveCount(0);
    await expect(notFoundHeading(page)).toHaveCount(0);
  });

  test('(d) the plan lookup stalls forever → the page paints anyway', async ({ page }) => {
    await blockWrites(page);
    let firstAt = 0;
    await page.route('**/rest/v1/rpc/get_public_page_branding*', async () => {
      if (!firstAt) firstAt = Date.now();
      await new Promise(() => {}); // never answers
    });

    await page.goto(`/${TEST_HANDLE}`);
    await expect(handleText(page)).toBeVisible({ timeout: BRANDING_DEADLINE_MS + 15_000 });
    const elapsed = Date.now() - firstAt;

    expect(firstAt, 'the plan lookup was sent').toBeGreaterThan(0);
    expect(elapsed, 'painted at the plan-lookup limit, not never').toBeLessThan(BRANDING_DEADLINE_MS + 2_500);
    await expect(badge(page)).toBeVisible();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('(e) a failed plan lookup keeps the plan last seen this session; a failure is never stored', async ({ page }) => {
    await blockWrites(page);
    let answer: 'fail' | 'pro-no-badge' = 'fail';
    await page.route('**/rest/v1/rpc/get_public_page_branding*', async (route) => {
      if (answer === 'fail') return route.abort('connectionfailed');
      return route.fulfill({ json: [{ plan: 'pro', show_badge: false, referral_code: null }] });
    });
    const cached = () => page.evaluate((k) => window.sessionStorage.getItem(k), BRANDING_CACHE_KEY);

    // 1. Nothing known yet: the lookup fails → Free (badge), and nothing is stored.
    await page.goto(`/${TEST_HANDLE}`);
    await expect(handleText(page)).toBeVisible({ timeout: 20_000 });
    await expect(badge(page)).toBeVisible();
    expect(await cached(), 'a failure is never cached as an answer').toBeNull();

    // 2. A confirmed answer (Pro, badge off) is shown and remembered.
    answer = 'pro-no-badge';
    await page.goto(`/${TEST_HANDLE}`);
    await expect(handleText(page)).toBeVisible({ timeout: 20_000 });
    await expect(badge(page)).toHaveCount(0);
    expect(JSON.parse((await cached()) ?? 'null')).toMatchObject({ plan: 'pro', show_badge: false });

    // 3. The lookup fails again: the last confirmed plan holds, not Free.
    answer = 'fail';
    await page.goto(`/${TEST_HANDLE}`);
    await expect(handleText(page)).toBeVisible({ timeout: 20_000 });
    await expect(badge(page), 'last known Pro, not the Free fallback').toHaveCount(0);
    expect(JSON.parse((await cached()) ?? 'null')).toMatchObject({ plan: 'pro', show_badge: false });
  });

  test('(f) a failed secondary read (block items) → the page still renders, no 404, no Retry', async ({ page }) => {
    await blockWrites(page);
    let failed = 0;
    await page.route('**/rest/v1/block_items*', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      failed += 1;
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"FRAGILE.PUB.1 probe"}' });
    });

    await page.goto(`/${TEST_HANDLE}`);
    await expect(handleText(page)).toBeVisible({ timeout: 20_000 });
    expect(failed, 'the items read was attempted (and retried)').toBeGreaterThanOrEqual(3);
    await expect(notFoundHeading(page)).toHaveCount(0);
    await expect(retryButton(page)).toHaveCount(0);
  });
});

/** Every page lookup fails until `ok()` is called. */
async function failPageLookup(page: Page): Promise<{ ok: () => void }> {
  let fail = true;
  await page.route('**/rest/v1/pages_public*', async (route) => {
    const req = route.request();
    if (!fail || !isPageLookup(req.url(), req.method())) return route.fallback();
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"FRAGILE.PUB.1a probe"}' });
  });
  return { ok: () => { fail = false; } };
}

test.describe('FRAGILE.PUB.1a — visitor wording on the Retry screen', () => {
  test.use({ storageState: ANONYMOUS, viewport: PHONE });

  test('(g-en) the Retry screen speaks to a visitor, not to the creator', async ({ page }) => {
    await blockWrites(page);
    await failPageLookup(page);
    await page.goto(`/${TEST_HANDLE}`);

    const state = page.getByTestId('load-error-state');
    await expect(retryButton(page)).toBeVisible({ timeout: 20_000 });
    await expect(state).toContainText(T['loadError.visitorTitle']);
    await expect(state).toContainText(T['loadError.visitorBody']);
    await expect(retryButton(page)).toHaveText(T['loadError.retry']);
    await expect(state).not.toContainText(T['loadError.title']);
    await expect(state).not.toContainText(T['loadError.body']);
  });
});

test.describe('FRAGILE.PUB.1a — visitor wording on the Retry screen (ES)', () => {
  test.use({ storageState: ANONYMOUS, viewport: PHONE, locale: 'es-ES' });

  test('(g-es) la pantalla de Reintentar le habla al visitante', async ({ page }) => {
    await blockWrites(page);
    await failPageLookup(page);
    await page.goto(`/${TEST_HANDLE}`);

    const state = page.getByTestId('load-error-state');
    await expect(retryButton(page)).toBeVisible({ timeout: 20_000 });
    await expect(state).toContainText(ES['loadError.visitorTitle']);
    await expect(state).toContainText(ES['loadError.visitorBody']);
    await expect(retryButton(page)).toHaveText(ES['loadError.retry']);
    await expect(state).not.toContainText(ES['loadError.title']);
  });
});

test.describe('FRAGILE.PUB.1a — the email-subscribe gate keeps the last known plan', () => {
  test.use({ storageState: ANONYMOUS, viewport: PHONE });

  test('(h) the plan lookup fails after a confirmed Pro answer → the email form still shows', async ({ page }) => {
    await blockWrites(page);
    let answer: 'pro' | 'fail' = 'pro';
    await page.route('**/rest/v1/rpc/get_public_page_branding*', async (route) => {
      if (answer === 'fail') return route.abort('connectionfailed');
      return route.fulfill({ json: [{ plan: 'pro', show_badge: true, referral_code: null }] });
    });
    // The email gate's old separate lookup: failed too, so nothing can answer behind the scenes.
    await page.route('**/rest/v1/rpc/get_public_page_plan*', async (route) => {
      if (answer === 'fail') return route.abort('connectionfailed');
      return route.fallback();
    });
    const emailInput = page.locator('input[type="email"]').first();

    // 1. A confirmed Pro answer: the battery's email_subscribe block renders its form.
    await page.goto(`/${TEST_HANDLE}`);
    await expect(handleText(page)).toBeVisible({ timeout: 20_000 });
    await expect(emailInput, 'precondition: Pro shows the email form').toBeVisible({ timeout: 15_000 });

    // 2. A fresh load where every plan lookup fails: the last confirmed Pro holds.
    answer = 'fail';
    await page.goto(`/${TEST_HANDLE}`);
    await expect(handleText(page)).toBeVisible({ timeout: 20_000 });
    await expect(emailInput, 'last known Pro, not the Free fallback').toBeVisible({ timeout: 15_000 });
  });
});
