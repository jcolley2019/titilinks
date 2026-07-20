// ANIM.1 — link animations (PRO): the per-link motion picker + its gating.
//
// Four things under test:
//   1. The picker renders in the expanded link form (six chips).
//   2. Picking an animation writes block_items.style_json.animation (PATCH read
//      straight off the resolved Request, suite-19 style — nothing real mutates).
//   3. prefers-reduced-motion renders the effect INERT: the .lb-anim-* class is
//      still in the DOM but its keyframes only exist inside the CSS
//      no-preference block, so computed animation-name collapses to `none`.
//   4. A mocked FREE plan sees the PRO lock + upsell; only `none` is selectable.
//
// Editor content is seeded like tests/14 (a known links block + item on the
// editor's data reads) and the plan is mocked like suites 17–19. The device
// frame is desktop-only chrome, so a desktop viewport lets this run under BOTH
// projects without a skip.

import { test, expect, type Page, type Route } from '@playwright/test';

type Plan = 'free' | 'pro' | 'business';

const DESKTOP = { width: 1440, height: 1000 };

const LINKS_BLOCK_ID = 'anim-links-block';
const ITEM_ID = 'anim-item-1';
const ITEM_LABEL = 'Animate Me';
const ITEM_URL = 'https://example.com/anim';

const wantsObject = (route: Route) =>
  (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object+json');

const asJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * Seed a known links block + item onto the editor's reads and pin the plan.
 * modes/pages load real (the editor needs its live mode/theme); only blocks and
 * block_items are answered with a fixture, and every non-GET write is no-op'd so
 * nothing touches the real tables. The block_items PATCH the save issues is read
 * off the Request in the test, never here.
 */
async function installEditorMocks(page: Page, opts: { plan?: Plan } = {}) {
  const plan: Plan = opts.plan ?? 'pro';
  let modeId = '';

  // profiles — answer only the plan query (useEntitlements); everything else real.
  await page.route('**/rest/v1/profiles*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    if (!route.request().url().includes('select=plan')) return route.continue();
    return asJson(route, wantsObject(route) ? { plan } : [{ plan }]);
  });

  // modes — pass through, capturing the real mode id to link the fixture block.
  // Guarded: a late modes request can be in flight as the test tears down, and
  // an unhandled throw from route.fetch()/fulfill() there would fail the test.
  await page.route('**/rest/v1/modes*', async (route) => {
    try {
      const res = await route.fetch();
      const body = await res.json();
      const arr = Array.isArray(body) ? body : [];
      modeId = (arr.find((m: { type?: string }) => m?.type === 'page1') ?? arr[0])?.id ?? '';
      await route.fulfill({ response: res, body: JSON.stringify(body) });
    } catch {
      try { await route.continue(); } catch { /* page already closing */ }
    }
  });

  // pages — pass through GET (theme/hero load); swallow writes.
  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    return route.continue();
  });

  // blocks — one links block. Array for the editor's list load; object for
  // LinksEditor.fetchItems' `.single()` title read. Writes swallowed.
  await page.route('**/rest/v1/blocks*', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    const block = {
      id: LINKS_BLOCK_ID,
      mode_id: modeId,
      type: 'links',
      title: null,
      is_enabled: true,
      order_index: 0,
    };
    return asJson(route, wantsObject(route) ? block : [block]);
  });

  // block_items — one plain medium card (no style yet). Writes swallowed; the
  // save PATCH is captured in the test off the resolved Request.
  await page.route('**/rest/v1/block_items*', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    const item = {
      id: ITEM_ID,
      block_id: LINKS_BLOCK_ID,
      label: ITEM_LABEL,
      url: ITEM_URL,
      is_adult: false,
      order_index: 0,
      subtitle: null,
      badge: null,
      image_url: null,
      size: 'medium',
      bg_color: null,
      title_color: null,
      style_json: null,
    };
    return asJson(route, wantsObject(route) ? item : [item]);
  });
}

/** Open the editor, then tap the seeded card to open its detail panel. */
async function openLinkDetail(page: Page) {
  await page.setViewportSize(DESKTOP);
  // Chips preview their own animation; under reduced motion they're static, so
  // clicks are deterministic (the CSS motion contract is covered separately).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');

  const frame = page.getByTestId('device-frame');
  await expect(frame).toBeVisible();

  // Tapping a card in edit mode bubbles to the card wrapper's onItemEdit, which
  // opens LinksEditor straight into the item's detail panel (directItemId).
  await frame.getByText(ITEM_LABEL, { exact: true }).first().click();

  // The animation picker lives in the expanded form.
  await expect(page.getByTestId('anim-chip-none')).toBeVisible();
}

test.describe('ANIM.1 — link animations', () => {
  test('the six-chip picker renders in the expanded link form', async ({ page }) => {
    await installEditorMocks(page, { plan: 'pro' });
    await openLinkDetail(page);

    for (const id of ['none', 'pulse', 'shimmer', 'bounce', 'glow', 'shake']) {
      await expect(page.getByTestId(`anim-chip-${id}`)).toBeVisible();
    }
    // Pro plan → no lock badge / upsell button on the picker.
    await expect(page.getByTestId('animations-upsell')).toHaveCount(0);
  });

  test('picking an animation writes style_json.animation (Pro)', async ({ page }) => {
    await installEditorMocks(page, { plan: 'pro' });
    await openLinkDetail(page);

    // Wait for the plan query (useEntitlements) to settle to Pro — the upsell
    // affordance disappearing is the signal — so the pick isn't blocked as free.
    await expect(page.getByTestId('animations-upsell')).toHaveCount(0);

    // Capture the save PATCH off the wire (waitForRequest resolves on issuance).
    const itemsPatch = page.waitForRequest(
      (r) => r.url().includes('/rest/v1/block_items') && r.method() === 'PATCH',
    );

    await page.getByTestId('anim-chip-pulse').click();
    await expect(page.getByTestId('anim-chip-pulse')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('link-detail-save').click();

    const body = (await itemsPatch).postDataJSON();
    expect(body.style_json).toBeTruthy();
    expect(body.style_json.animation).toBe('pulse');
  });

  test('a free plan sees the PRO lock + upsell; only None is selectable', async ({ page }) => {
    await installEditorMocks(page, { plan: 'free' });
    await openLinkDetail(page);

    // The gold upsell button is the free-plan affordance.
    await expect(page.getByTestId('animations-upsell')).toBeVisible();
    // None is the default selection and the only free option.
    await expect(page.getByTestId('anim-chip-none')).toHaveAttribute('aria-pressed', 'true');

    // Tapping a locked effect raises the upsell and never selects it.
    await page.getByTestId('anim-chip-glow').click();
    await expect(page.getByTestId('anim-chip-glow')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('anim-chip-none')).toHaveAttribute('aria-pressed', 'true');
  });

  test('prefers-reduced-motion renders the effect inert', async ({ page }) => {
    // No editor needed — this exercises the CSS contract directly. Any app route
    // loads index.css; inject a probe carrying the class and read animation-name.
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const animName = () =>
      page.evaluate(() => {
        let el = document.getElementById('anim-probe');
        if (!el) {
          el = document.createElement('div');
          el.id = 'anim-probe';
          el.className = 'lb-velvet lb-anim-pulse';
          document.body.appendChild(el);
        }
        return getComputedStyle(el).animationName;
      });

    // With motion allowed, the keyframes bind.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(await animName()).toBe('lb-anim-pulse');

    // Under reduced motion the rule doesn't exist → fully static button.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await animName()).toBe('none');
  });
});
