/**
 * FRAGILE.ONB.1 — audit O1: one failed read must never send a finished
 * creator into onboarding, and step 4's Continue must never delete their
 * social links.
 *
 * Runs as the battery account only (project storageState). Every mutating
 * Supabase request is recorded and ABORTED at the page level before it can
 * reach the wire, so nothing in the account changes — the default-deny fixture
 * would abort them too; this layer exists to count them (test c asserts that
 * no DELETE was even attempted).
 *
 *   (a) the onboarding_complete read fails (all retries) → Retry, not /onboarding
 *   (b) the editor's own page read fails once → Retry, not /onboarding
 *   (c) step 4 with social links in the block, nothing ticked → Continue sends no DELETE
 *   (d) control: a SUCCESSFUL read saying "incomplete" still redirects
 */
import { test, expect, type Page } from './fixtures';
import { translations } from '../src/hooks/useLanguage';

const T = translations.en;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type Write = { method: string; url: string };

/** Record + abort every mutating REST/storage/function call. */
async function blockWrites(page: Page): Promise<Write[]> {
  const writes: Write[] = [];
  await page.route('**/*.supabase.co/**', async (route) => {
    const req = route.request();
    if (!MUTATING.has(req.method())) return route.fallback();
    const url = req.url();
    // Session refreshes are the battery's own token, never account data.
    if (url.includes('/auth/v1/token')) return route.fallback();
    // The read RPCs are POSTs; they change nothing and are left alone.
    if (url.includes('/rest/v1/rpc/get_public_') || url.includes('/rest/v1/rpc/plan_allows')) {
      return route.fallback();
    }
    writes.push({ method: req.method(), url });
    return route.abort('blockedbyclient');
  });
  return writes;
}

const isStatusRead = (url: string, method: string) =>
  method === 'GET' && url.includes('/rest/v1/profiles') && url.includes('select=onboarding_complete');

const isEditorPageRead = (url: string, method: string) =>
  method === 'GET' && url.includes('/rest/v1/pages') && url.includes('select=*') && url.includes('user_id=eq.');

const editProfilePill = (page: Page) =>
  page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first();

const retryButton = (page: Page) => page.getByTestId('load-error-retry').filter({ visible: true });

test.describe('FRAGILE.ONB.1 — a failed read is not "new user"', () => {
  test('(a) failed onboarding_complete read → Retry on the editor, never /onboarding', async ({ page }) => {
    await blockWrites(page);
    let fail = true;
    let failed = 0;
    await page.route('**/rest/v1/profiles*', async (route) => {
      const req = route.request();
      if (!fail || !isStatusRead(req.url(), req.method())) return route.fallback();
      failed += 1;
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"FRAGILE.ONB.1 probe"}' });
    });

    await page.goto('/dashboard/editor');

    // The query retries (3 retries after the first try) before it gives up.
    await expect(retryButton(page)).toBeVisible({ timeout: 20_000 });
    expect(failed, 'the read is retried, not cached as an answer').toBeGreaterThanOrEqual(4);
    await expect(page).toHaveURL(/\/dashboard\/editor$/);
    await expect(page.getByTestId('load-error-state').filter({ visible: true })).toContainText(T['loadError.title']);

    // Let it succeed: Retry loads the editor, still no detour.
    fail = false;
    await retryButton(page).click();
    await expect(editProfilePill(page)).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/dashboard\/editor$/);
  });

  test('(b) the editor page read fails once → Retry, never /onboarding', async ({ page }) => {
    await blockWrites(page);
    let failsLeft = 1;
    await page.route('**/rest/v1/pages*', async (route) => {
      const req = route.request();
      if (failsLeft === 0 || !isEditorPageRead(req.url(), req.method())) return route.fallback();
      failsLeft -= 1;
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"FRAGILE.ONB.1 probe"}' });
    });

    await page.goto('/dashboard/editor');

    await expect(retryButton(page)).toBeVisible({ timeout: 20_000 });
    expect(failsLeft).toBe(0);
    await expect(page).toHaveURL(/\/dashboard\/editor$/);

    await retryButton(page).click();
    await expect(editProfilePill(page)).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/dashboard\/editor$/);
  });

  test('(c) step 4 Continue with nothing ticked sends no DELETE', async ({ page }) => {
    const writes = await blockWrites(page);

    // Precondition, read off the app's own requests: the account's page1
    // social_links block holds items. The editor's block + item reads carry it.
    const blocksResp = page.waitForResponse((r) =>
      r.request().method() === 'GET' && r.url().includes('/rest/v1/blocks') && r.url().includes('select=*') && r.url().includes('mode_id=eq.') && r.ok());
    const itemsResp = page.waitForResponse((r) =>
      r.request().method() === 'GET' && r.url().includes('/rest/v1/block_items') && r.url().includes('select=*') && r.url().includes('block_id=in.') && r.ok());
    await page.goto('/dashboard/editor');
    const blocks = (await (await blocksResp).json()) as Array<{ id: string; type: string }>;
    const items = (await (await itemsResp).json()) as Array<{ block_id: string }>;
    const social = blocks.find((b) => b.type === 'social_links');
    expect(social, 'the battery page has a social_links block').toBeTruthy();
    const socialCount = items.filter((i) => i.block_id === social!.id).length;
    expect(socialCount, 'the battery social_links block has items to lose').toBeGreaterThan(0);

    // Fresh wizard state, so the resume guard jumps a page-owning account to step 4.
    await page.evaluate(() => {
      for (const k of Object.keys(sessionStorage)) if (k.startsWith('onboarding:')) sessionStorage.removeItem(k);
    });
    await page.goto('/onboarding');
    await expect(
      page.getByText(T['onboardingFlow.yourSocialPlatforms'], { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 20_000 });

    const before = writes.length;
    await page
      .getByRole('button', { name: T['onboardingFlow.continue'], exact: true })
      .filter({ visible: true })
      .first()
      .click();

    // Continue advanced to step 5 …
    await expect(
      page.getByText(T['onboardingFlow.youreLive'], { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 10_000 });
    // … without trying to delete (or write) anything.
    const after = writes.slice(before);
    expect(after.filter((w) => w.method === 'DELETE'), 'no DELETE request').toEqual([]);
    expect(after.filter((w) => w.url.includes('/block_items')), 'no block_items write at all').toEqual([]);
  });

  test('(d) control: a successful "incomplete" read still redirects to /onboarding', async ({ page }) => {
    await blockWrites(page);
    await page.route('**/rest/v1/profiles*', async (route) => {
      const req = route.request();
      if (!isStatusRead(req.url(), req.method())) return route.fallback();
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[{"onboarding_complete":false}]' });
    });
    await page.goto('/dashboard/editor');
    await expect(page).toHaveURL(/\/onboarding$/, { timeout: 20_000 });
    await expect(page.getByTestId('load-error-retry')).toHaveCount(0);
  });
});
