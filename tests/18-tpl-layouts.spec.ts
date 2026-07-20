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

    // TPL.3d: hover the actriz card → the Apply button reveals → click it.
    // One gesture, no confirm dialog — parity with the Styles tab.
    const card = page.getByTestId('tpl-layout-card').first();
    await card.hover();
    const applyBtn = card.getByRole('button', { name: 'Apply' });
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();

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

    // Success toast now carries the backup reassurance the dialog used to.
    await expect(page.getByText('Layout applied — backup saved in Snapshots')).toBeVisible();
  });

  test('TPL.5: a double-click on Apply runs the engine once (one snapshot POST)', async ({ page }) => {
    await installMocks(page, { plan: 'pro' });
    await openEditProfile(page);
    await openGallery(page);

    // Count every auto safety-net POST — one per real engine run.
    let snapPosts = 0;
    page.on('request', (r) => {
      if (r.url().includes('/rest/v1/profile_snapshots') && r.method() === 'POST') snapPosts++;
    });

    const card = page.getByTestId('tpl-layout-card').first();
    await card.hover();
    const applyBtn = card.getByRole('button', { name: 'Apply' });
    await expect(applyBtn).toBeVisible();

    // Two rapid clicks. The synchronous ref lock (plus the engine's per-mode
    // backstop) must collapse them into ONE run — a second run would capture a
    // second snapshot and insert a duplicate composition (the GALERÍA field bug).
    await applyBtn.click();
    await applyBtn.click({ force: true, timeout: 1000 }).catch(() => {});

    await expect(page.getByText('Layout applied — backup saved in Snapshots')).toBeVisible();
    // Let any errant second run reach the network before asserting.
    await page.waitForTimeout(400);
    expect(snapPosts).toBe(1);
  });

  test('hovering a card without clicking Apply writes nothing', async ({ page }) => {
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

    // Revealing the Apply button on hover is inert — only a click applies, so
    // hovering alone must issue zero writes (no snapshot, no theme, no blocks).
    const card = page.getByTestId('tpl-layout-card').first();
    await card.hover();
    await expect(card.getByRole('button', { name: 'Apply' })).toBeVisible();

    expect(writes).toBe(0);
  });

  test('ES: tabs and the hover-reveal Apply render in Spanish', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('titilinks-language', 'es'));
    await installMocks(page, { plan: 'pro' });
    await openEditProfile(page, /editar perfil/i);
    await openGallery(page, /galería de plantillas/i);

    // Tab labels localized.
    await expect(page.getByTestId('gallery-tab-layouts')).toHaveText('Diseños');
    await expect(page.getByTestId('gallery-tab-styles')).toHaveText('Estilos');

    // Hovering a card reveals the shared Apply button in Spanish ("Aplicar") —
    // no confirm dialog.
    const card = page.getByTestId('tpl-layout-card').first();
    await card.hover();
    await expect(card.getByRole('button', { name: 'Aplicar' })).toBeVisible();
  });
});

/**
 * TPL.4 — the shelf is filled: the Layouts grid now carries all eight presets,
 * and the leading "All" chip + per-category chips filter it. No per-preset apply
 * round-trips here — the apply engine is already covered by the TPL.3 apply spec
 * above and the tpl-apply unit suite.
 */
test.describe('Template Gallery — the full Layouts shelf (TPL.4)', () => {
  test('the Layouts grid renders all 8 preset cards', async ({ page }) => {
    await installMocks(page, { plan: 'pro' });
    await openEditProfile(page);
    await openGallery(page);

    // Default category is "All" → the whole shelf.
    await expect(page.getByTestId('tpl-layout-card')).toHaveCount(8);
  });

  test('category chips filter the shelf (Music → Música, Store → Tienda)', async ({ page }) => {
    await installMocks(page, { plan: 'pro' });
    await openEditProfile(page);
    await openGallery(page);

    // Each category holds exactly one preset — a chip narrows the grid to it.
    await page.getByRole('button', { name: 'Music', exact: true }).click();
    await expect(page.getByTestId('tpl-layout-card')).toHaveCount(1);
    await expect(page.getByTestId('tpl-layout-card')).toContainText('Música');

    await page.getByRole('button', { name: 'Store', exact: true }).click();
    await expect(page.getByTestId('tpl-layout-card')).toHaveCount(1);
    await expect(page.getByTestId('tpl-layout-card')).toContainText('Tienda');
  });
});

/**
 * GAL.TOUCH — touch devices get a real Apply affordance in BOTH gallery tabs.
 *
 * On coarse-pointer / no-hover devices the Apply button is ALWAYS visible (a
 * persistent bar at each card's bottom edge) — no hover gesture to discover. On
 * fine-pointer devices the hover-reveal overlay (TPL.3d) is unchanged and no
 * persistent bar renders. Detection is a single shared useCoarsePointer hook, so
 * both card types (LayoutCard + TemplateCard) share one mechanism.
 *
 * Every spec runs on both projects; each branches on the project's pointer type —
 * the `mobile` project (iPhone 14 Pro Max) is coarse/no-hover, `desktop` is fine.
 */
test.describe('Template Gallery — touch Apply affordance (GAL.TOUCH)', () => {
  test('the Apply affordance matches the pointer type (Layouts + Styles)', async ({ page }, testInfo) => {
    await installMocks(page, { plan: 'pro' });
    await openEditProfile(page);
    await openGallery(page);

    const touch = testInfo.project.name === 'mobile';

    // ── Layouts tab (LayoutCard) ──
    const layoutCard = page.getByTestId('tpl-layout-card').first();
    if (touch) {
      // Coarse/no-hover: the persistent Apply bar is visible with NO hover.
      await expect(layoutCard.getByTestId('tpl-touch-apply')).toBeVisible();
      await expect(layoutCard.getByRole('button', { name: 'Apply' })).toBeVisible();
    } else {
      // Fine pointer: no persistent bar; Apply stays hover-gated (TPL.3d intact).
      await expect(layoutCard.getByTestId('tpl-touch-apply')).toHaveCount(0);
      await expect(layoutCard.getByRole('button', { name: 'Apply' })).toHaveCount(0);
      await layoutCard.hover();
      await expect(layoutCard.getByRole('button', { name: 'Apply' })).toBeVisible();
    }

    // ── Styles tab (TemplateCard shares the same affordance) ──
    await page.getByTestId('gallery-tab-styles').click();
    const stylesCard = page.locator('div.grid.grid-cols-2.sm\\:grid-cols-3 > div.group').first();
    await expect(stylesCard).toBeVisible();
    if (touch) {
      await expect(stylesCard.getByTestId('tpl-touch-apply')).toBeVisible();
      await expect(stylesCard.getByRole('button', { name: 'Apply' })).toBeVisible();
    } else {
      await expect(stylesCard.getByTestId('tpl-touch-apply')).toHaveCount(0);
      await stylesCard.hover();
      await expect(stylesCard.getByRole('button', { name: 'Apply' })).toBeVisible();
    }
  });

  test('applying from the pointer-appropriate affordance writes (tap on touch)', async ({ page }, testInfo) => {
    await installMocks(page, { plan: 'pro' });
    await openEditProfile(page);
    await openGallery(page);

    const touch = testInfo.project.name === 'mobile';
    const snapPost = page.waitForRequest(
      (r) => r.url().includes('/rest/v1/profile_snapshots') && r.method() === 'POST',
    );

    const card = page.getByTestId('tpl-layout-card').first();
    if (touch) {
      // The crux: tap the persistent Apply DIRECTLY — no hover/reveal gesture.
      await card.getByRole('button', { name: 'Apply' }).click();
    } else {
      await card.hover();
      await card.getByRole('button', { name: 'Apply' }).click();
    }

    // The apply ran: the auto safety-net snapshot POST fired (mock-asserted), and
    // the success toast landed.
    const posted = (await snapPost).postDataJSON();
    const inserted = Array.isArray(posted) ? posted[0] : posted;
    expect(inserted.kind).toBe('auto');
    await expect(page.getByText('Layout applied — backup saved in Snapshots')).toBeVisible();
  });
});
