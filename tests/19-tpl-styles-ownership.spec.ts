import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * TPL.3b — Styles keep their promise: a Styles-tab template apply OWNS every
 * button layer (theme surface keys + per-block style + per-item overrides).
 *
 * Non-destructive, mock-based like suites 17/18: profile_snapshots is a mocked
 * in-memory store and every content-tree WRITE is no-op'd (204). We read the
 * written payloads straight off the resolved Request objects (waitForRequest),
 * so nothing on the real page is mutated.
 *
 * The twist over suite 17: we hijack applyTemplate's OWN reads (by their unique
 * select signatures, gated behind an `applying` flag) to inject a page whose
 * button layers carry a distinctive STALE orange (#ff6600) — a per-theme outline,
 * a per-block style, and a per-item style_json override. captureSnapshot's reads
 * use different selects, so they still pass through to real Supabase and the
 * safety-net snapshot is captured for real. Auth rides the shared storageState.
 */

type Plan = 'free' | 'pro' | 'business';

/** Distinctive stale color that must NOT survive the apply. */
const STALE = '#ff6600';

/** Synthetic content tree applyTemplate reads during the apply. */
const SEED_THEME = {
  pageStyle: 'hero',
  background: { type: 'solid', solid_color: '#111111' },
  // Stale Buttons-tab surface keys (should be owned/overwritten by the template).
  buttons: {
    variant: 'outline',
    outline_width: 3,
    border_color: STALE,
    fill_color: STALE,
    text_color: '#ffffff',
    shape: 'square',
    border_enabled: true,
    shadow_enabled: true,
    density: 'normal',
  },
  typography: { font: 'inter', text_color: '#ffffff' },
  // Structural non-button key — BUG.THEME.1 says it must SURVIVE the apply.
  heroConfig: { fit: 'fill', posY: 25 },
};
const SEED_MODE = { id: 'mode-1' };
const SEED_BLOCK = {
  id: 'blk-links-1',
  type: 'links',
  // Legacy JSON-in-title per-block style, carrying the stale orange outline.
  title: JSON.stringify({
    style: { variant: 'outline', border_color: STALE, border_width: 3, font_style: 'normal', background_opacity: 0 },
  }),
};
const SEED_ITEM = {
  id: 'item-1',
  // Per-item overrides: appearance keys (must be cleared) + a content key (kept).
  style_json: { border_color: STALE, border_width: 3, bg_gradient: { from: STALE, to: '#ff0000' }, icon_source: 'avatar' },
  bg_color: STALE,
  title_color: '#ffffff',
};

const wantsObject = (route: Route) =>
  (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object+json');

const asJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/**
 * Install the mocks. `setApplying()` flips on the synthetic-read hijack right
 * before the apply so the editor's initial load reads real data unperturbed.
 */
async function installMocks(page: Page, opts: { plan?: Plan } = {}) {
  const plan: Plan = opts.plan ?? 'pro';
  const store: { kind: string }[] = [];
  let applying = false;

  // profiles — answer only the plan query; everything else hits real Supabase.
  await page.route('**/rest/v1/profiles*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    if (!route.request().url().includes('select=plan')) return route.continue();
    return asJson(route, wantsObject(route) ? { plan } : [{ plan }]);
  });

  // profile_snapshots — stateful mock so the pre-apply safety net POST succeeds.
  await page.route('**/rest/v1/profile_snapshots*', async (route) => {
    const method = route.request().method();
    if (method === 'HEAD') {
      return route.fulfill({ status: 200, headers: { 'content-range': `*/${store.length}` }, body: '' });
    }
    if (method === 'POST') {
      const raw = route.request().postDataJSON();
      const input = Array.isArray(raw) ? raw[0] : raw;
      const row = { id: `snap-${store.length + 1}`, ...input };
      store.unshift({ kind: input.kind });
      return asJson(route, wantsObject(route) ? row : [row], 201);
    }
    if (method === 'DELETE') return route.fulfill({ status: 204, body: '' });
    return asJson(route, []);
  });

  // pages: applyTemplate's theme read (select=theme_json, no user_id) → synthetic;
  // captureSnapshot's (select=user_id,theme_json) + the editor load pass through.
  // Any PATCH is no-op'd (payload read off the Request in the test).
  await page.route('**/rest/v1/pages*', async (route) => {
    const method = route.request().method();
    const url = route.request().url();
    if (method === 'GET') {
      if (applying && url.includes('select=theme_json') && !url.includes('user_id')) {
        const row = { theme_json: SEED_THEME };
        return asJson(route, wantsObject(route) ? row : [row]);
      }
      return route.continue();
    }
    return route.fulfill({ status: 204, body: '' });
  });

  // modes: applyTemplate's (select=id) → synthetic; captureSnapshot's
  // (select=id,type,sticky_cta_enabled) passes through.
  await page.route('**/rest/v1/modes*', async (route) => {
    const method = route.request().method();
    const url = route.request().url();
    if (method === 'GET') {
      if (applying && url.includes('select=id&') && url.includes('page_id=eq')) {
        return asJson(route, [SEED_MODE]);
      }
      return route.continue();
    }
    return route.fulfill({ status: 204, body: '' });
  });

  // blocks: applyTemplate's read is the only one filtering type=in.(...) →
  // synthetic links block; PATCH no-op'd.
  await page.route('**/rest/v1/blocks*', async (route) => {
    const method = route.request().method();
    const url = route.request().url();
    if (method === 'GET') {
      if (applying && url.includes('type=in.')) return asJson(route, [SEED_BLOCK]);
      return route.continue();
    }
    return route.fulfill({ status: 204, body: '' });
  });

  // block_items: applyTemplate's reset read (select=id,style_json,bg_color,
  // title_color) → the stale item; captureSnapshot's ITEM_SELECT (starts block_id)
  // passes through. PATCH no-op'd.
  await page.route('**/rest/v1/block_items*', async (route) => {
    const method = route.request().method();
    const url = route.request().url();
    if (method === 'GET') {
      if (applying && url.includes('select=id%2Cstyle_json')) return asJson(route, [SEED_ITEM]);
      return route.continue();
    }
    return route.fulfill({ status: 204, body: '' });
  });

  return { setApplying: () => { applying = true; } };
}

async function openStylesGallery(page: Page) {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: /template gallery/i }).filter({ visible: true }).first().click();
  await expect(page.getByTestId('gallery-tab-layouts')).toBeVisible();
  await page.getByTestId('gallery-tab-styles').click();
}

test.describe('TPL.3b — Styles apply owns every button layer', () => {
  test('applying Neon Nights overwrites theme surface keys, block style, and resets per-item overrides', async ({ page }) => {
    const { setApplying } = await installMocks(page, { plan: 'pro' });
    await openStylesGallery(page);

    // Locate the Neon Nights card in the legacy Styles grid.
    const card = page
      .locator('div.grid.grid-cols-2.sm\\:grid-cols-3 > div.group')
      .filter({ hasText: 'Neon Nights' });
    await expect(card).toBeVisible();

    const themePatch = page.waitForRequest((r) => r.url().includes('/rest/v1/pages') && r.method() === 'PATCH');
    const blocksPatch = page.waitForRequest((r) => r.url().includes('/rest/v1/blocks') && r.method() === 'PATCH');
    const itemsPatch = page.waitForRequest((r) => r.url().includes('/rest/v1/block_items') && r.method() === 'PATCH');

    // Flip the read-hijack on, then apply.
    setApplying();
    await card.hover();
    await card.getByRole('button', { name: 'Apply' }).click();

    // Read the written payloads straight off the resolved requests — waitForRequest
    // resolves on issuance, so a route-handler capture could race the assertion.
    const themeBody = (await themePatch).postDataJSON();
    const blockBody = (await blocksPatch).postDataJSON();
    const itemBody = (await itemsPatch).postDataJSON();

    // ── Theme layer: FS.SURFACE surface keys owned from the template ──────────
    const themeButtons = themeBody.theme_json.buttons;
    expect(themeButtons.variant).toBe('outline'); // Neon Nights blockStyles variant
    expect(themeButtons.outline_width).toBe(3); // = blockStyles.border_width (TPL.3c: 2.5 → 3)
    expect(themeButtons.background_opacity).toBe(0);
    // No stale orange anywhere in the written buttons object.
    expect(JSON.stringify(themeButtons)).not.toContain(STALE.replace('#', ''));
    // BUG.THEME.1: structural non-button keys survive the merge untouched.
    expect(themeBody.theme_json.heroConfig).toEqual(SEED_THEME.heroConfig);

    // ── Block layer: title style fully replaced, no residue of old keys ───────
    const blockStyle = JSON.parse(blockBody.title).style;
    expect(blockStyle).toEqual({
      variant: 'outline',
      font_style: 'mono',
      letter_spacing: 0.02,
      background_opacity: 0,
      border_width: 3, // TPL.3c: 2.5 → 3
      border_color: '#00ff88',
    });
    expect(blockStyle.border_color).not.toBe(STALE);

    // ── Item layer: appearance overrides cleared, content preserved ───────────
    expect(itemBody.bg_color).toBeNull();
    expect(itemBody.title_color).toBeNull();
    const nextStyle = itemBody.style_json;
    expect(nextStyle.border_color).toBeUndefined();
    expect(nextStyle.border_width).toBeUndefined();
    expect(nextStyle.bg_gradient).toBeUndefined();
    // The leading-icon content key is NOT an appearance key → preserved.
    expect(nextStyle.icon_source).toBe('avatar');
  });
});
