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
    // ANIM.2: Inherit is the default selection; Inherit and None are the free options.
    await expect(page.getByTestId('anim-chip-inherit')).toHaveAttribute('aria-pressed', 'true');

    // Tapping a locked effect raises the upsell and never selects it.
    await page.getByTestId('anim-chip-glow').click();
    await expect(page.getByTestId('anim-chip-glow')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('anim-chip-inherit')).toHaveAttribute('aria-pressed', 'true');
    // 'None' stays freely selectable (an explicit still override).
    await page.getByTestId('anim-chip-none').click();
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

// ─────────────────────────────────────────────────────────────────────────────
// ANIM.2 — page-level animation (Buttons tab) + per-item inherit/override.
//
// Same non-destructive mock strategy as the ANIM.1 suite above, extended with
// a primary_cta block so one preview carries BOTH resolved surfaces, and with
// an optional pages-read patch that injects theme_json.buttons.animation (the
// stored page-level value) without touching the real row. All writes are
// swallowed; saved payloads are read off the resolved Requests.
// ─────────────────────────────────────────────────────────────────────────────

const CTA_BLOCK_ID = 'anim-cta-block';
const CTA_ITEM_ID = 'anim-cta-item-1';
const CTA_LABEL = 'Book A Session';

async function installAnim2Mocks(
  page: Page,
  opts: { plan?: Plan; pageAnimation?: string; itemAnimation?: string } = {},
) {
  const plan: Plan = opts.plan ?? 'pro';
  let modeId = '';

  // profiles — answer only the plan query (useEntitlements); everything else real.
  await page.route('**/rest/v1/profiles*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    if (!route.request().url().includes('select=plan')) return route.continue();
    return asJson(route, wantsObject(route) ? { plan } : [{ plan }]);
  });

  // modes — pass through, capturing the real mode id (same guard as ANIM.1).
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

  // pages — GET passes through, optionally patching the stored page-level
  // animation onto theme_json.buttons; every write is swallowed (the save
  // PATCH is read off the Request in the test, nothing real mutates).
  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    if (!opts.pageAnimation) return route.continue();
    try {
      const res = await route.fetch();
      const body = await res.json();
      const patch = (row: unknown) => {
        const r = row as { theme_json?: Record<string, unknown> } | null;
        if (!r || typeof r !== 'object' || !r.theme_json || typeof r.theme_json !== 'object') return row;
        const buttons = (r.theme_json.buttons && typeof r.theme_json.buttons === 'object')
          ? (r.theme_json.buttons as Record<string, unknown>)
          : {};
        return { ...r, theme_json: { ...r.theme_json, buttons: { ...buttons, animation: opts.pageAnimation } } };
      };
      const patched = Array.isArray(body) ? body.map(patch) : patch(body);
      await route.fulfill({ response: res, body: JSON.stringify(patched) });
    } catch {
      try { await route.continue(); } catch { /* page already closing */ }
    }
  });

  // blocks — a links block AND a primary_cta block. Object reads (the editors'
  // `.single()` title fetch) answer for whichever id the query names.
  await page.route('**/rest/v1/blocks*', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    const linksBlock = {
      id: LINKS_BLOCK_ID, mode_id: modeId, type: 'links',
      title: null, is_enabled: true, order_index: 0,
    };
    const ctaBlock = {
      id: CTA_BLOCK_ID, mode_id: modeId, type: 'primary_cta',
      title: null, is_enabled: true, order_index: 1,
    };
    if (wantsObject(route)) {
      return asJson(route, route.request().url().includes(CTA_BLOCK_ID) ? ctaBlock : linksBlock);
    }
    return asJson(route, [linksBlock, ctaBlock]);
  });

  // block_items — one item per block; reads filtered by whichever block id the
  // query names (eq. or in.-list), both otherwise. Writes swallowed.
  await page.route('**/rest/v1/block_items*', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    const linkItem = {
      id: ITEM_ID, block_id: LINKS_BLOCK_ID, label: ITEM_LABEL, url: ITEM_URL,
      is_adult: false, order_index: 0, subtitle: null, badge: null,
      image_url: null, size: 'medium', bg_color: null, title_color: null,
      style_json: opts.itemAnimation ? { animation: opts.itemAnimation } : null,
    };
    const ctaItem = {
      id: CTA_ITEM_ID, block_id: CTA_BLOCK_ID, label: CTA_LABEL, url: 'https://example.com/book',
      is_adult: false, order_index: 0, subtitle: null, badge: null,
      image_url: null, size: null, bg_color: null, title_color: null, style_json: null,
    };
    const url = route.request().url();
    const hasLinks = url.includes(LINKS_BLOCK_ID);
    const hasCta = url.includes(CTA_BLOCK_ID);
    const rows = hasLinks && !hasCta ? [linkItem] : hasCta && !hasLinks ? [ctaItem] : [linkItem, ctaItem];
    return asJson(route, wantsObject(route) ? rows[0] : rows);
  });
}

/** Open Edit Profile → Customize Profile (DesignEditor) → Buttons tab. */
async function openButtonsTab(page: Page) {
  await page.setViewportSize(DESKTOP);
  // Chips preview their own animation; reduced motion keeps clicks deterministic.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');

  await expect(page.getByTestId('device-frame')).toBeVisible();
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: /customize profile/i }).filter({ visible: true }).first().click();
  await page.getByRole('tab', { name: 'Buttons' }).filter({ visible: true }).first().click();
  await expect(page.getByTestId('page-anim-chip-none')).toBeVisible();
}

/** Open the seeded link card's detail panel (ANIM.2 mock variant). */
async function openLinkDetailAnim2(page: Page) {
  await page.setViewportSize(DESKTOP);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');

  const frame = page.getByTestId('device-frame');
  await expect(frame).toBeVisible();
  await frame.getByText(ITEM_LABEL, { exact: true }).first().click();
  await expect(page.getByTestId('anim-chip-none')).toBeVisible();
}

test.describe('ANIM.2 — page-level animation', () => {
  test('a page-level pick animates a links card AND the CTA in the live preview', async ({ page }) => {
    await installAnim2Mocks(page, { plan: 'pro' });
    await openButtonsTab(page);

    // Entitlements settled to Pro — no upsell affordance on the page picker.
    await expect(page.getByTestId('page-animations-upsell')).toHaveCount(0);

    const pulseChip = page.getByTestId('page-anim-chip-pulse').filter({ visible: true }).first();
    await pulseChip.click();
    await expect(pulseChip).toHaveAttribute('aria-pressed', 'true');

    // LIVE.THEME.1 streams the draft to the preview: BOTH button surfaces carry
    // the resolved lb-anim class without any save.
    const frame = page.getByTestId('device-frame');
    await expect(frame.locator('.lb-anim-pulse').filter({ hasText: ITEM_LABEL }).first()).toBeVisible();
    await expect(frame.locator('.lb-anim-pulse').filter({ hasText: CTA_LABEL }).first()).toBeVisible();
  });

  test('a per-item override beats the page value; unset items inherit', async ({ page }) => {
    await installAnim2Mocks(page, { plan: 'pro', itemAnimation: 'shake' });
    await openButtonsTab(page);

    await expect(page.getByTestId('page-animations-upsell')).toHaveCount(0);
    const pulseChip = page.getByTestId('page-anim-chip-pulse').filter({ visible: true }).first();
    await pulseChip.click();
    await expect(pulseChip).toHaveAttribute('aria-pressed', 'true');

    const frame = page.getByTestId('device-frame');
    // The overridden link card keeps ITS effect — the page value never lands on it.
    await expect(frame.locator('.lb-anim-shake').filter({ hasText: ITEM_LABEL }).first()).toBeVisible();
    await expect(frame.locator('.lb-anim-pulse').filter({ hasText: ITEM_LABEL })).toHaveCount(0);
    // The CTA (no override) inherits the page value.
    await expect(frame.locator('.lb-anim-pulse').filter({ hasText: CTA_LABEL }).first()).toBeVisible();
  });

  test('the Inherit chip is the default and names the page-level effect', async ({ page }) => {
    await installAnim2Mocks(page, { plan: 'pro', pageAnimation: 'glow' });
    await openLinkDetailAnim2(page);

    const inherit = page.getByTestId('anim-chip-inherit');
    await expect(inherit).toBeVisible();
    // Absent style_json.animation → Inherit is the selected default.
    await expect(inherit).toHaveAttribute('aria-pressed', 'true');
    // The chip names the inherited page-level effect.
    await expect(inherit).toContainText('Glow');
  });

  test('free plan: locked page picker + strip-at-save on the page-level path', async ({ page }) => {
    await installAnim2Mocks(page, { plan: 'free', pageAnimation: 'pulse' });
    await openButtonsTab(page);

    // Free-plan affordances: upsell button present, locked pick never selects.
    await expect(page.getByTestId('page-animations-upsell').filter({ visible: true }).first()).toBeVisible();
    const glowChip = page.getByTestId('page-anim-chip-glow').filter({ visible: true }).first();
    await glowChip.click();
    await expect(glowChip).toHaveAttribute('aria-pressed', 'false');

    // Saving the theme strips the stored page-level animation (belt-and-
    // suspenders): the PATCH payload carries buttons WITHOUT the key.
    const themePatch = page.waitForRequest(
      (r) => r.url().includes('/rest/v1/pages') && r.method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Save', exact: true }).filter({ visible: true }).first().click();
    const body = (await themePatch).postDataJSON();
    expect(body.theme_json.buttons).toBeTruthy();          // control: buttons written
    expect(body.theme_json.buttons.animation).toBeUndefined(); // stripped for free
  });

  test('the links-editor animation section carries the standard row rhythm', async ({ page }) => {
    await installAnim2Mocks(page, { plan: 'free' });
    await openLinkDetailAnim2(page);

    // Spacing fix (presence, not px): the section adopts the neighboring rows'
    // `py-3 border-t` rhythm, and the upsell renders inside it.
    const section = page.getByTestId('animations-section');
    await expect(section).toBeVisible();
    await expect(section).toHaveClass(/py-3/);
    await expect(section).toHaveClass(/border-t/);
    await expect(section.getByTestId('animations-upsell')).toBeVisible();
  });
});
