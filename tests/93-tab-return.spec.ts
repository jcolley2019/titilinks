/**
 * FRAGILE.TAB.1 — audit E1: coming back to the tab must not reload the editor
 * or throw away unsaved work.
 *
 * supabase-js announces SIGNED_IN again every time the tab becomes visible,
 * with a freshly built user object, and useAuth stores it. Every hook that
 * listed the whole `user` as a dependency re-ran on each return: the editor
 * re-read its page and blocks, DesignEditor got a new themeJson and reset its
 * unsaved draft, the tracking-pixels panel reloaded over typed IDs. The fix
 * depends on `user?.id` (guard USER-ID-DEPS) and DesignEditor never adopts a
 * new saved theme over a dirty draft.
 *
 * TAB RETURN — simulated the way the audit probe did: document.visibilityState
 * is flipped to hidden then visible and `visibilitychange` dispatched each
 * time, so supabase-js runs its real visibility handler and re-announces the
 * session.
 *
 * FIXTURE MODEL — battery account, writes blocked on the wire by the default-
 * deny fixture (no allowWrites()). The editor's `pages` read is passed through
 * with its theme pinned to a known solid colour (spec 92's model: the battery's
 * stored theme is not canonical). No test clicks Save.
 *
 * A NEW themeJson WITHOUT A TAB RETURN. No UI reachable while the Design panel
 * is open refreshes the page, so the "dirty draft vs a refresh" tests deliver
 * the re-read from the test side: Editor's own `page` state setter (found on
 * its React fiber, dev build) is called with a fresh page object — exactly
 * what fetchPageData/refreshPage do after a read.
 *
 * Desktop viewport + DPR 1 in the editor tests (spec 92's reasoning): canvas
 * queries are scoped to getByTestId('device-frame').
 */
import { test, expect, type Locator, type Page, type Route } from './fixtures';
import { translations } from '../src/hooks/useLanguage';

test.use({ deviceScaleFactor: 1 });

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

const EN = translations.en as Record<string, string>;
const DESKTOP = { width: 1440, height: 1000 };
const START_BG = '#123456';
const START_TEXT = '#EEEEEE';

const rgb = (hex: string) => {
  const h = hex.replace('#', '');
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};

// ── tab return ───────────────────────────────────────────────────────────────

async function tabReturn(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
  });
  // Long enough for the re-announced session to reach every consumer and any
  // re-read it triggers to land.
  await page.waitForTimeout(2500);
  await page.waitForLoadState('networkidle').catch(() => {});
}

// ── editor harness ───────────────────────────────────────────────────────────

/** The stored theme with a known solid background + title colour, hero layout. */
function pinTheme(raw: unknown, bg: string, text: string) {
  const t = JSON.parse(JSON.stringify(raw && typeof raw === 'object' ? raw : {}));
  t.background = { ...(t.background || {}), type: 'solid', solid_color: bg, gradient_css: '', image_url: '' };
  t.typography = { ...(t.typography || {}), text_color: text };
  t.pageStyle = 'hero';
  t.auto_contrast = false;
  if (t.pages && typeof t.pages === 'object') {
    for (const id of Object.keys(t.pages)) {
      if (t.pages[id] && typeof t.pages[id] === 'object') delete t.pages[id].style;
    }
  }
  return t;
}

async function rewriteRead(route: Route, fn: (row: any) => any) {
  const res = await route.fetch();
  const body = await res.json();
  const out = Array.isArray(body)
    ? body.map((r) => (r && 'theme_json' in r ? fn(r) : r))
    : body && typeof body === 'object' && 'theme_json' in body ? fn(body) : body;
  await route.fulfill({ response: res, body: JSON.stringify(out) });
}

/** Pin the editor's own pages read; writes fall through to the deny fixture. */
async function pinPages(page: Page) {
  await page.route((url) => url.pathname === '/rest/v1/pages', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return rewriteRead(route, (row) => ({ ...row, theme_json: pinTheme(row.theme_json, START_BG, START_TEXT) }));
  });
}

/** The colour painted under the hero (the content panel's background). */
async function previewColour(scope: Locator) {
  return scope.getByTestId('hero-sticky').first().evaluate((hero) => {
    let panel = hero.nextElementSibling as HTMLElement | null;
    while (panel && panel.style.minHeight !== '60vh') panel = panel.nextElementSibling as HTMLElement | null;
    return panel ? getComputedStyle(panel).backgroundColor : null;
  });
}

const frame = (page: Page) => page.getByTestId('device-frame');
const bgBox = (page: Page) => page.getByPlaceholder('#000000').filter({ visible: true }).first();
const saveButton = (page: Page) =>
  page.getByRole('button', { name: EN['blockEditor.save'], exact: true }).filter({ visible: true }).first();

async function loadEditor(page: Page) {
  await page.setViewportSize(DESKTOP);
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await expect(frame(page)).toBeVisible();
}

async function openDesign(page: Page) {
  await pinPages(page);
  await loadEditor(page);
  await expect.poll(() => previewColour(frame(page)), { timeout: 20_000 }).toBe(rgb(START_BG));
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: /customize profile/i }).filter({ visible: true }).first().click();
  await expect(bgBox(page)).toHaveValue(START_BG);
}

/**
 * Deliver a re-read page row to the editor: call Editor's `page` state setter
 * (found on the React fiber above the Design panel) with a fresh copy of the
 * current page (its background colour optionally replaced). A new object, so the
 * DesignEditor receives a new themeJson reference, as after a real refresh.
 */
async function deliverReRead(page: Page, bg?: string) {
  const ok = await bgBox(page).evaluate((el, newBg) => {
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    let fiber: any = key ? (el as any)[key] : null;
    while (fiber && !(typeof fiber.type === 'function' && fiber.type.name === 'Editor')) fiber = fiber.return;
    if (!fiber) return 'no Editor fiber';
    for (let hook = fiber.memoizedState; hook; hook = hook.next) {
      const s = hook.memoizedState;
      if (s && typeof s === 'object' && 'theme_json' in s && 'handle' in s && hook.queue?.dispatch) {
        const theme = JSON.parse(JSON.stringify(s.theme_json));
        if (newBg) theme.background = { ...theme.background, type: 'solid', solid_color: newBg };
        hook.queue.dispatch({ ...s, theme_json: theme });
        return 'ok';
      }
    }
    return 'no page state hook';
  }, bg);
  expect(ok).toBe('ok');
  await page.waitForTimeout(500);
}

// ── tests ────────────────────────────────────────────────────────────────────

test.describe('FRAGILE.TAB.1 — returning to the tab', () => {
  test('the editor does not re-read its page or blocks', async ({ page }) => {
    const reads = { pages: 0, blocks: 0 };
    page.on('request', (req) => {
      if (req.method() !== 'GET') return;
      const path = new URL(req.url()).pathname;
      if (path === '/rest/v1/pages') reads.pages++;
      if (path === '/rest/v1/blocks') reads.blocks++;
    });
    await loadEditor(page);
    await page.waitForTimeout(1500);
    const before = { ...reads };
    expect(before.pages, 'the editor read its page at load').toBeGreaterThan(0);
    expect(before.blocks, 'the editor read its blocks at load').toBeGreaterThan(0);

    await tabReturn(page);
    await tabReturn(page);

    expect(reads, 'two tab returns trigger no page/blocks re-read').toEqual(before);
  });

  test('an unsaved Design draft survives two tab returns', async ({ page }) => {
    await openDesign(page);
    await expect(saveButton(page)).toBeDisabled();

    await bgBox(page).fill('#ABCDEF');
    await expect.poll(() => previewColour(frame(page))).toBe(rgb('#ABCDEF'));
    await expect(saveButton(page)).toBeEnabled();

    await tabReturn(page);
    await tabReturn(page);

    await expect(bgBox(page)).toHaveValue('#ABCDEF');
    expect(await previewColour(frame(page)), 'the preview still shows the draft').toBe(rgb('#ABCDEF'));
    await expect(saveButton(page)).toBeEnabled();
  });

  test('a page re-read with the same saved theme does not overwrite a dirty draft', async ({ page }) => {
    await openDesign(page);
    await bgBox(page).fill('#ABCDEF');
    await expect(saveButton(page)).toBeEnabled();

    await deliverReRead(page);

    await expect(bgBox(page)).toHaveValue('#ABCDEF');
    expect(await previewColour(frame(page))).toBe(rgb('#ABCDEF'));
    await expect(saveButton(page)).toBeEnabled();
  });

  test('a clean Design panel adopts a changed saved theme', async ({ page }) => {
    await openDesign(page);
    await expect(saveButton(page)).toBeDisabled();

    await deliverReRead(page, '#654321');

    await expect(bgBox(page)).toHaveValue('#654321');
    await expect.poll(() => previewColour(frame(page))).toBe(rgb('#654321'));
    await expect(saveButton(page), 'the adopted theme is the new baseline').toBeDisabled();
  });

  test('typed, unsaved tracking-pixel IDs survive a tab return', async ({ page }) => {
    // Plan + pixel columns answered here (spec 16's model) so the panel opens
    // and seeds empty whatever the account holds. Writes are not mocked: the
    // fixture aborts them, and nothing here saves.
    await page.route('**/rest/v1/profiles*', async (route) => {
      const req = route.request();
      if (req.method() === 'GET' && /select=plan(\b|&|$)/.test(req.url())) return route.fulfill({ json: { plan: 'pro' } });
      if (req.method() === 'GET' && /meta_pixel_id/.test(req.url())) {
        return route.fulfill({ json: { meta_pixel_id: null, tiktok_pixel_id: null, ga4_id: null } });
      }
      return route.fallback();
    });
    await loadEditor(page);
    await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
    await page.getByRole('button', { name: /tracking pixels/i }).filter({ visible: true }).first().click();
    await expect(page.getByTestId('tracking-pixels-panel')).toBeVisible();
    await expect(page.getByTestId('pixel-meta')).toHaveValue('');

    await page.getByTestId('pixel-meta').fill('000000000000000');
    await tabReturn(page);

    await expect(page.getByTestId('pixel-meta')).toHaveValue('000000000000000');
  });
});

// ── onboarding ───────────────────────────────────────────────────────────────

/** Spec 61's mockFreshAccount: the resume reads answered empty, the step-1 PATCH 204. */
async function mockFreshAccount(page: Page) {
  await page.addInitScript(() => {
    try { window.sessionStorage.clear(); } catch { /* storage disabled */ }
  });
  for (const table of ['profiles', 'pages']) {
    await page.route(`**/rest/v1/${table}*`, async (route) => {
      const method = route.request().method();
      if (method === 'PATCH' && table === 'profiles') return route.fulfill({ status: 204, body: '' });
      if (method !== 'GET') return route.fallback();
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
  }
}

test.describe('FRAGILE.TAB.1 — onboarding', () => {
  test('a tab return does not change the wizard step', async ({ page }, testInfo) => {
    const desktop = testInfo.project.name === 'desktop';
    if (desktop) await page.setViewportSize({ width: 1440, height: 900 });
    await mockFreshAccount(page);
    const scope: Locator | Page = desktop ? page.getByTestId('onboarding-panel') : page;

    await page.goto('/onboarding');
    const heroChoice = scope.getByRole('button').filter({ hasText: EN['onboardingFlow.styleHero'] }).first();
    await expect(heroChoice).toBeVisible();

    // Step 1: a tab return leaves the wizard on step 1.
    await tabReturn(page);
    await expect(heroChoice).toBeVisible();
    await expect(scope.getByText(EN['onboardingFlow.yourSocialPlatforms'], { exact: true })).toHaveCount(0);

    // Step 2: same, and the typed name is still there.
    await heroChoice.click();
    await scope.getByRole('button', { name: EN['onboardingFlow.continue'], exact: true }).click();
    const name = scope.getByPlaceholder(EN['onboardingFlow.displayNamePlaceholder']);
    await expect(name).toBeVisible();
    await name.fill('Tab Person');

    await tabReturn(page);

    await expect(name).toBeVisible();
    await expect(name).toHaveValue('Tab Person');
    await expect(scope.getByText(EN['onboardingFlow.yourSocialPlatforms'], { exact: true })).toHaveCount(0);
  });
});
