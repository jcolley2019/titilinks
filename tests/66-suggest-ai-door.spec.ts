// TL.AI.LINKS.1 — the "Suggest with AI" door on the phone's links block.
//
// SuggestLinksDialog shipped complete (Pro-gated inside: useEntitlements for
// the client twin, a 403 PLAN_REQUIRED handler for the server truth) but had
// ZERO callers. This epic gives it one door: a second glass card directly
// under the links block's "+ Add link" card, on the edit preview only.
//
// What the five tests pin:
//   1. battery (Pro) — the door renders directly below the add-link card,
//      opens the dialog (title visible, prompt input present), and raises NO
//      upsell. Both projects: the desktop phone stage and the mobile branch
//      are both mounted (CSS-hidden, not unmounted), so every locator filters
//      on :visible.
//   2. free — the door is visible for everyone; the click lands on the
//      dialog's own Pro gate (the body IS the upsell: no prompt input, a
//      "See Pro" link to /dashboard/upgrade). Note: the useProUpsell TOAST is
//      the dialog's handleGenerate path, unreachable without the input, so
//      the in-dialog gate is the upsell a free creator actually meets.
//   3. visitor toggle (desktop stage chrome only) — the non-edit path drops
//      the door: count 0 inside the device frame.
//   4. the anonymous public page — count 0. Same fixture rows, no session.
//   5. the Pro path end-to-end with the edge call MOCKED — suggest-links
//      answers one link; the dialog's INSERT into block_items is answered by
//      a route-level 201 that captures the body, so the battery's real page
//      is never written (the default-deny fixture is NOT opted out).
//
// Fixture injection follows 47/48: the real pages/modes rows pass through
// (entitlements come from `profiles`, untouched, so the plan is the real one);
// blocks/block_items are a fixture so the links block always has an item and
// therefore renders LinksBlock's trailing cards.

import { test, expect, withFreeUser, type Page, type Route, type TestInfo } from './fixtures';
import { TEST_HANDLE, FREE_TEST_USER_ID, loginAsFreeUser } from './helpers/auth';

const PROFILE = `/${TEST_HANDLE}`;
const LINKS_BLOCK = 'ai1-links-block';
const DOOR = 'links-suggest-ai';
const PRO_GATE = 'suggest-links-pro-gate';

const routeFetchWithRetry = async (route: Route, attempts = 4) => {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await route.fetch({ timeout: 20_000 }); } catch (e) { lastErr = e; }
  }
  throw lastErr instanceof Error ? lastErr : new Error('route.fetch failed after retries');
};

/** Every body POSTed at rest/v1/block_items while the fixture is installed. */
type Captured = { itemBodies: unknown[] };

const seed = async (page: Page): Promise<Captured> => {
  const captured: Captured = { itemBodies: [] };

  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') { await route.fulfill({ status: 204, body: '' }); return; }
    const res = await routeFetchWithRetry(route);
    await route.fulfill({ response: res, body: JSON.stringify(await res.json()) });
  });

  let modeId = '';
  await page.route('**/rest/v1/modes*', async (route) => {
    const res = await routeFetchWithRetry(route);
    const body = await res.json();
    const arr = Array.isArray(body) ? body : [body];
    modeId = arr.find((m: any) => m?.type === 'page1')?.id ?? arr[0]?.id ?? '';
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });

  await page.route('**/rest/v1/blocks*', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') { await route.fulfill({ status: 204, body: '' }); return; }
    const rows = [
      { id: LINKS_BLOCK, mode_id: modeId, type: 'links', title: null, is_enabled: true, order_index: 0 },
    ];
    // Honour `type=eq.X` — the dialog's find-or-create narrows by type and
    // calls .maybeSingle() (see 47 for why a fixture must filter).
    const type = new URL(req.url()).searchParams.get('type');
    const want = type?.startsWith('eq.') ? type.slice(3) : null;
    await route.fulfill({ json: want ? rows.filter((b) => b.type === want) : rows });
  });

  await page.route('**/rest/v1/block_items*', async (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      // The dialog's INSERT. Answered here — a page route is consulted before
      // the fixture's context-level deny — so nothing reaches the shared
      // account and the body is on record for test 5.
      let body: unknown = null;
      try { body = JSON.parse(req.postData() || 'null'); } catch { body = req.postData(); }
      captured.itemBodies.push(body);
      const rows = (Array.isArray(body) ? body : [body]).map((r: any, i: number) => ({
        id: `ai1-new-${i}`, is_adult: false, badge: null, image_url: null, size: 'medium', style_json: null, ...r,
      }));
      await route.fulfill({ status: 201, json: rows });
      return;
    }
    if (req.method() !== 'GET') { await route.fulfill({ status: 204, body: '' }); return; }
    const f = new URL(req.url()).searchParams.get('block_id') ?? '';
    const ids = f.startsWith('eq.') ? [f.slice(3)]
      : f.startsWith('in.') ? f.slice(3).replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''))
      : null;
    const rows = [{
      id: 'ai1-link-0', block_id: LINKS_BLOCK, label: 'My Website', url: 'https://example.com',
      is_adult: false, order_index: 0, subtitle: 'Check out my website', badge: null, image_url: null,
      size: 'medium', style_json: null,
    }];
    await route.fulfill({ json: ids ? rows.filter((r) => ids.includes(r.block_id)) : rows });
  });

  return captured;
};

const shot = (name: string) => `tests/screenshots/${name}.png`;
const suffix = (info: TestInfo) => info.project.name;

const gotoEditor = async (page: Page) => {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(900);
};

/** The one door this project can actually see (both EPV instances are mounted). */
const door = (page: Page) => page.getByTestId(DOOR).filter({ visible: true });

const dialog = (page: Page) => page.getByRole('dialog');
/** The prompt input — structural (maxLength=500 is the dialog's only input). */
const promptInput = (page: Page) => dialog(page).locator('input[maxlength="500"]');

/** Run supabase-js inside the page using the app's own signed-in client (as spec 60). */
const signedInId = (page: Page): Promise<string | null> =>
  page.evaluate(async () => {
    // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
    const m = await import('/src/integrations/supabase/client.ts');
    const { data } = await (m as any).supabase.auth.getUser();
    return data?.user?.id ?? null;
  });

/** Guarantee a live FREE session on this page, then assert it is the right one (spec 60). */
async function ensureFreeSession(page: Page): Promise<void> {
  await page.goto('/');
  let id = await signedInId(page);
  if (!id) {
    await loginAsFreeUser(page);
    await page.goto('/');
    id = await signedInId(page);
  }
  if (!id) throw new Error('could not establish a FREE session — check TEST_FREE_USER_* in .env.test');
  expect(id, 'TL.HARNESS.FREE.1 — this test only ever touches the free account').toBe(FREE_TEST_USER_ID);
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

// ─── 1. Pro: the door, directly below the add-link card, opens the dialog ───

test('battery (Pro): the door sits under "+ Add link", opens the dialog, no upsell', async ({ page }, info) => {
  await seed(page);
  await gotoEditor(page);

  const d = door(page);
  await expect(d, 'exactly one visible door (the other EPV instance is CSS-hidden)').toHaveCount(1);
  await expect(d).toBeVisible();
  await expect(d).toContainText('Suggest with AI');

  // "Directly below": the door's previous sibling IS the add-link card, and
  // the door starts at or below that card's bottom edge with the same width.
  const addCard = d.locator('xpath=preceding-sibling::*[1]');
  await expect(addCard).toContainText('Add link');
  const [a, b] = await Promise.all([addCard.boundingBox(), d.boundingBox()]);
  expect(a && b, 'both cards are laid out').toBeTruthy();
  expect(b!.y, 'the door is below the add-link card').toBeGreaterThanOrEqual(a!.y + a!.height - 1);
  expect(Math.abs(b!.width - a!.width), 'same width as the add-link card').toBeLessThanOrEqual(2);
  expect(Math.abs(b!.x - a!.x), 'same left edge as the add-link card').toBeLessThanOrEqual(2);

  await page.screenshot({ path: shot(`${suffix(info)}-ai1-door`) });

  await d.click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByText('Suggest Links', { exact: true })).toBeVisible();
  await expect(promptInput(page), 'Pro sees the prompt, not the gate').toBeVisible();
  await expect(page.getByTestId(PRO_GATE)).toHaveCount(0);
  await expect(page.getByText('AI tools are a Pro feature'), 'no upsell toast either').toHaveCount(0);

  await page.screenshot({ path: shot(`${suffix(info)}-ai1-dialog`) });

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
});

// ─── 2. Free: the door is for everyone; the click meets the Pro gate ────────

test('free: the door is visible; the click lands on the Pro gate, no prompt input', async ({ browser }, info) => {
  await withFreeUser(browser, async (page) => {
    // withFreeUser's context inherits nothing from the project — carry the
    // viewport across so the mobile project really exercises the mobile branch.
    const vp = info.project.use.viewport;
    if (vp) await page.setViewportSize(vp);

    await ensureFreeSession(page);
    await seed(page);
    await gotoEditor(page);

    const d = door(page);
    await expect(d, 'the door itself is not plan-gated').toHaveCount(1);
    await expect(d).toBeVisible();

    await d.click();
    await expect(dialog(page)).toBeVisible();

    const gate = page.getByTestId(PRO_GATE);
    await expect(gate, 'the dialog body IS the upsell on the free tier').toBeVisible();
    await expect(gate).toContainText('AI tools are a Pro feature');
    const seePro = gate.getByRole('link', { name: 'See Pro' });
    await expect(seePro).toBeVisible();
    await expect(seePro).toHaveAttribute('href', '/dashboard/upgrade');
    await expect(promptInput(page), 'no prompt input for a free creator').toHaveCount(0);

    await page.screenshot({ path: shot(`${suffix(info)}-ai1-upsell`) });

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });
});

// ─── 3. Visitor toggle: the non-edit path has no door ───────────────────────

test('visitor toggle drops the door (desktop stage)', async ({ page }, info) => {
  // The phone-stage chrome (device frame + this toggle) is `hidden lg:block`;
  // on the mobile project the control does not exist to click (as spec 48).
  test.skip(info.project.name === 'mobile', 'visitor toggle is desktop-stage chrome (hidden lg:block)');
  await seed(page);
  await gotoEditor(page);

  const frame = page.getByTestId('device-frame');
  await expect(frame.getByTestId(DOOR)).toHaveCount(1);

  await page.getByTestId('preview-mode-toggle').click();
  await page.waitForTimeout(400);

  await expect(frame.getByTestId(DOOR), 'visitor mode renders the public path').toHaveCount(0);
  await expect(frame.getByText('My Website').first(), 'the real link survives').toBeVisible();
});

// ─── 4. The anonymous public page: no door ──────────────────────────────────

test.describe('anonymous public page', () => {
  // No session at all — the fixture's write guard still wraps this context.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the public page never renders the door', async ({ page }) => {
    await seed(page);
    await page.goto(PROFILE);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await expect(page.getByText('My Website').first(), 'the links block rendered').toBeVisible();
    await expect(page.getByTestId(DOOR)).toHaveCount(0);
    await expect(page.getByText('Suggest with AI')).toHaveCount(0);
  });
});

// ─── 5. Pro, end to end, edge call mocked ───────────────────────────────────

test('Pro path end-to-end: mocked suggest-links → selected link is POSTed to block_items', async ({ page }) => {
  const captured = await seed(page);

  const fnBodies: unknown[] = [];
  await page.route('**/functions/v1/suggest-links', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, body: '' });
    try { fnBodies.push(JSON.parse(req.postData() || '{}')); } catch { fnBodies.push({}); }
    return route.fulfill({
      json: { links: [{ label: 'Mock Link', subtitle: 'from AI', url: 'https://example.com/mock' }] },
    });
  });

  await gotoEditor(page);
  await door(page).click();
  await expect(dialog(page)).toBeVisible();

  await promptInput(page).fill('a mock fitness brand');
  await dialog(page).getByRole('button', { name: 'Suggest', exact: true }).click();

  // The mocked suggestion arrives, pre-selected.
  await expect(dialog(page).getByText('Mock Link')).toBeVisible();
  expect(fnBodies.length, 'exactly one edge call').toBe(1);
  expect((fnBodies[0] as any)?.prompt).toBe('a mock fitness brand');

  await dialog(page).getByRole('button', { name: /Add Selected/ }).click();
  await expect(dialog(page), 'the dialog closes after adding').toBeHidden();

  // The INSERT went to the route-level 201, never to the shared account, and
  // it carried the mocked link.
  expect(captured.itemBodies.length, 'one block_items INSERT').toBeGreaterThanOrEqual(1);
  const flat = JSON.stringify(captured.itemBodies);
  expect(flat).toContain('Mock Link');
  expect(flat).toContain('https://example.com/mock');
  expect(flat).toContain(LINKS_BLOCK);
});
