import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * TPL.3 — Template Gallery: Layouts + Styles tabs, live preset applies.
 *
 * Same non-destructive harness as suite 17 (SNAP.1d): profile_snapshots is a
 * mocked in-memory store, every content-tree write (pages PATCH / blocks /
 * block_items / modes) is no-op'd, and reads (GET) pass through to real Supabase
 * — so a Layout apply is exercised end-to-end without ever mutating the real
 * page. Auth rides the shared project-level storageState.
 */

type Plan = 'free' | 'pro' | 'business';

/** Synthetic page id a seeded snapshot would carry — kept for parity with
 *  suite 17's pages GET mock (no restore path runs here, so it is never hit). */
const PAGE_ID = '00000000-0000-0000-0000-000000000000';

interface SnapRow {
  id: string;
  user_id: string;
  page_id: string;
  name: string;
  kind: 'manual' | 'auto';
  payload: unknown;
  created_at: string;
}

let seq = 0;
function makeRow(over: Partial<SnapRow> = {}): SnapRow {
  seq += 1;
  return {
    id: `snap-${seq}`,
    user_id: 'test-user',
    page_id: PAGE_ID,
    name: `Snapshot ${seq}`,
    kind: 'manual',
    payload: { v: 1, theme_json: {}, modes: [] },
    created_at: new Date(Date.now() - seq * 1000).toISOString(),
    ...over,
  };
}

const wantsObject = (route: Route) =>
  (route.request().headers()['accept'] || '').includes('application/vnd.pgrst.object+json');

const asJson = (route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) =>
  route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });

/** Install the snapshot + write-guard mocks (subset of suite 17's installer). */
async function installMocks(page: Page, opts: { plan?: Plan } = {}) {
  const plan: Plan = opts.plan ?? 'pro';
  const store: SnapRow[] = [];

  // profiles — answer only the plan query; let anything else hit real Supabase.
  await page.route('**/rest/v1/profiles*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    if (!route.request().url().includes('select=plan')) return route.continue();
    return asJson(route, wantsObject(route) ? { plan } : [{ plan }]);
  });

  // profile_snapshots — fully mocked, stateful.
  await page.route('**/rest/v1/profile_snapshots*', async (route) => {
    const method = route.request().method();
    const url = route.request().url();

    if (method === 'HEAD') {
      const manual = store.filter((r) => r.kind === 'manual').length;
      return route.fulfill({ status: 200, headers: { 'content-range': `*/${manual}` }, body: '' });
    }
    if (method === 'POST') {
      const raw = route.request().postDataJSON();
      const input = Array.isArray(raw) ? raw[0] : raw;
      const row = makeRow({
        user_id: input.user_id,
        page_id: input.page_id,
        name: input.name,
        kind: input.kind ?? 'manual',
        payload: input.payload,
        created_at: new Date().toISOString(),
      });
      store.unshift(row);
      return asJson(route, wantsObject(route) ? row : [row], 201);
    }
    if (method === 'DELETE') {
      for (let i = store.length - 1; i >= 0; i--) if (url.includes(store[i].id)) store.splice(i, 1);
      return route.fulfill({ status: 204, body: '' });
    }
    const rows = [...store].sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (wantsObject(route)) {
      const m = url.match(/id=eq\.([^&]+)/);
      const found = m ? store.find((r) => r.id === decodeURIComponent(m[1])) : rows[0];
      return found ? asJson(route, found) : route.fulfill({ status: 406, body: '' });
    }
    return asJson(route, rows);
  });

  // pages: GET passes through (the real page powers capture + theme read),
  // EXCEPT the synthetic snapshot page id; any PATCH is no-op'd.
  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    if (route.request().url().includes(`id=eq.${PAGE_ID}`)) {
      const row = { user_id: 'test-user', theme_json: {} };
      return asJson(route, wantsObject(route) ? row : [row]);
    }
    return route.continue();
  });

  // Content-tree writes no-op'd (reads pass through) — a Layout apply never
  // mutates the real page.
  for (const tbl of ['modes', 'blocks', 'block_items']) {
    await page.route(`**/rest/v1/${tbl}*`, async (route) => {
      if (route.request().method() === 'GET') return route.continue();
      return route.fulfill({ status: 204, body: '' });
    });
  }
}

async function openEditProfile(page: Page, editLabel: string | RegExp = 'Edit Profile') {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: editLabel }).filter({ visible: true }).first().click();
}

async function openGallery(page: Page, galleryLabel: string | RegExp = /template gallery/i) {
  await page.getByRole('button', { name: galleryLabel }).filter({ visible: true }).first().click();
  await expect(page.getByTestId('gallery-tab-layouts')).toBeVisible();
}

test.describe('Template Gallery — Layouts + Styles (TPL.3)', () => {
  test('gallery opens on the Layouts tab with the actriz card', async ({ page }) => {
    await installMocks(page, { plan: 'pro' });
    await openEditProfile(page);
    await openGallery(page);

    // Both tabs present.
    await expect(page.getByTestId('gallery-tab-layouts')).toBeVisible();
    await expect(page.getByTestId('gallery-tab-styles')).toBeVisible();

    // Layouts is the default tab → the actriz preset card renders with its
    // translated (EN) description.
    const card = page.getByTestId('tpl-layout-card').filter({ hasText: 'Actriz' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Editorial dark theme for actors and on-camera creators');

    // TPL.3c: the gold frame reaches the preview — actriz's bars carry a solid
    // 2px brand-gold (#C9A55C = rgb(201,165,92)) border in BOTH renditions.
    const bar = card.getByTestId('tpl-card-bar').first();
    await expect(bar).toHaveCSS('border-top-width', '2px');
    await expect(bar).toHaveCSS('border-top-color', 'rgb(201, 165, 92)');
  });

  test('the Styles tab still shows the legacy template grid', async ({ page }) => {
    await installMocks(page, { plan: 'pro' });
    await openEditProfile(page);
    await openGallery(page);

    await page.getByTestId('gallery-tab-styles').click();

    // The legacy grid (grid-cols-2 sm:grid-cols-3) + a `.group` card survive
    // verbatim, and the legacy category chip row is present.
    const grid = page.locator('div.grid.grid-cols-2.sm\\:grid-cols-3');
    await expect(grid).toBeVisible();
    await expect(grid.locator('> div.group').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /fashion/i })).toBeVisible();
  });

  test('applying the actriz layout snapshots first, then writes theme + blocks', async ({ page }) => {
    await installMocks(page, { plan: 'pro' });
    await openEditProfile(page);
    await openGallery(page);

    // Record the write order across the apply.
    const order: string[] = [];
    page.on('request', (r) => {
      const u = r.url();
      const m = r.method();
      if (u.includes('/rest/v1/profile_snapshots') && m === 'POST') order.push('snapshot');
      else if (u.includes('/rest/v1/pages') && m === 'PATCH') order.push('theme');
      else if (u.includes('/rest/v1/blocks') && (m === 'POST' || m === 'DELETE')) order.push('blocks');
    });

    const snapPost = page.waitForRequest(
      (r) => r.url().includes('/rest/v1/profile_snapshots') && r.method() === 'POST',
    );
    const themePatch = page.waitForRequest(
      (r) => r.url().includes('/rest/v1/pages') && r.method() === 'PATCH',
    );
    // The composition-replace requests fire only AFTER the theme PATCH resolves,
    // so wait for a blocks write explicitly — waitForRequest resolves when a
    // request is issued, not when the prior one's response returns.
    const blocksReq = page.waitForRequest(
      (r) => r.url().includes('/rest/v1/blocks') && (r.method() === 'POST' || r.method() === 'DELETE'),
    );

    // Tap the actriz card → confirm dialog → confirm.
    await page.getByTestId('tpl-layout-card').first().click();
    await expect(page.getByTestId('tpl-apply-confirm')).toBeVisible();
    await page.getByTestId('tpl-apply-confirm-go').click();

    // The auto safety-net snapshot is captured, named for the template.
    const posted = (await snapPost).postDataJSON();
    const inserted = Array.isArray(posted) ? posted[0] : posted;
    expect(inserted.kind).toBe('auto');
    expect(inserted.name).toMatch(/^Before template:/);

    await themePatch;
    await blocksReq;

    // The snapshot POST lands BEFORE the theme PATCH (safety net first), and the
    // composition-replace blocks requests fire too.
    expect(order.indexOf('snapshot')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('theme')).toBeGreaterThan(order.indexOf('snapshot'));
    expect(order).toContain('blocks');

    // Success toast + the confirm dialog closes.
    await expect(page.getByText('Layout applied!')).toBeVisible();
    await expect(page.getByTestId('tpl-apply-confirm')).toBeHidden();
  });

  test('cancelling the confirm dialog writes nothing', async ({ page }) => {
    await installMocks(page, { plan: 'pro' });
    await openEditProfile(page);
    await openGallery(page);

    // Count every mutating request to the content tree / snapshots from here on.
    let writes = 0;
    page.on('request', (r) => {
      const m = r.method();
      if (m === 'GET' || m === 'HEAD') return;
      if (/\/rest\/v1\/(profile_snapshots|pages|blocks|block_items|modes)/.test(r.url())) writes++;
    });

    await page.getByTestId('tpl-layout-card').first().click();
    await expect(page.getByTestId('tpl-apply-confirm')).toBeVisible();
    await page.getByTestId('tpl-apply-confirm-cancel').click();
    await expect(page.getByTestId('tpl-apply-confirm')).toBeHidden();

    expect(writes).toBe(0);
  });

  test('ES: tabs and the confirm dialog render in Spanish', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('titilinks-language', 'es'));
    await installMocks(page, { plan: 'pro' });
    await openEditProfile(page, /editar perfil/i);
    await openGallery(page, /galería de plantillas/i);

    // Tab labels localized.
    await expect(page.getByTestId('gallery-tab-layouts')).toHaveText('Diseños');
    await expect(page.getByTestId('gallery-tab-styles')).toHaveText('Estilos');

    // Confirm dialog localized.
    await page.getByTestId('tpl-layout-card').first().click();
    await expect(page.getByTestId('tpl-apply-confirm')).toBeVisible();
    await expect(page.getByText('¿Aplicar este diseño?')).toBeVisible();
  });
});
