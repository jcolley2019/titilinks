import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * AIS.0 — "Set up my page" guided wizard.
 *
 * Same non-destructive harness as suites 17/18: profile_snapshots is a mocked
 * in-memory store, every content-tree write (pages PATCH / blocks / block_items /
 * modes) is no-op'd, reads pass through to real Supabase — so a preset apply from
 * the wizard is exercised end-to-end without mutating the real page. Auth rides
 * the shared project-level storageState.
 *
 * The mapper (recommendPresets) is exhaustively unit-tested in
 * scripts/ais-recommend.test.mjs; these specs verify the UI wiring: the dashboard
 * entry, the Q1→Q2→recommendation flow, that Apply drives the SAME engine path
 * as the gallery (snapshot POST → theme PATCH → blocks), and the goal checklist.
 */

type Plan = 'free' | 'pro' | 'business';

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

/** Snapshot + write-guard mocks (identical to suite 18's installer). */
async function installMocks(page: Page, opts: { plan?: Plan } = {}) {
  const plan: Plan = opts.plan ?? 'pro';
  const store: SnapRow[] = [];

  await page.route('**/rest/v1/profiles*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    if (!route.request().url().includes('select=plan')) return route.continue();
    return asJson(route, wantsObject(route) ? { plan } : [{ plan }]);
  });

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

  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, body: '' });
    if (route.request().url().includes(`id=eq.${PAGE_ID}`)) {
      const row = { user_id: 'test-user', theme_json: {} };
      return asJson(route, wantsObject(route) ? row : [row]);
    }
    return route.continue();
  });

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

/** Open the guided wizard from its My Links dashboard row. */
async function openWizard(page: Page, rowLabel: string | RegExp = /set up my page/i) {
  await page.getByRole('button', { name: rowLabel }).filter({ visible: true }).first().click();
  await expect(page.getByTestId('page-setup-wizard')).toBeVisible();
}

test.describe('Page Setup Wizard — AIS.0', () => {
  test('opens from the My Links dashboard row on Q1', async ({ page }) => {
    await installMocks(page, { plan: 'pro' });
    await openEditProfile(page);
    await openWizard(page);

    // Lands on the persona question with all eight persona chips.
    await expect(page.getByTestId('wizard-q1')).toBeVisible();
    await expect(page.getByTestId('wizard-persona-creator')).toBeVisible();
    await expect(page.locator('[data-testid^="wizard-persona-"]')).toHaveCount(8);
  });

  test('Q1 + Q2 yield a recommendation matching the mapper (creator + get_messages → Actriz / Reserva)', async ({ page }) => {
    await installMocks(page, { plan: 'pro' });
    await openEditProfile(page);
    await openWizard(page);

    // Q1: creator → advances to Q2 (three goal chips).
    await page.getByTestId('wizard-persona-creator').click();
    await expect(page.getByTestId('wizard-q2')).toBeVisible();
    await expect(page.locator('[data-testid^="wizard-goal-"]')).toHaveCount(3);

    // Q2: get_messages → recommendation.
    await page.getByTestId('wizard-goal-get_messages').click();
    await expect(page.getByTestId('wizard-reco')).toBeVisible();

    // recommendPresets({ creator, get_messages }) = { top: Actriz, alternate: Reserva }.
    await expect(page.getByTestId('wizard-top-name')).toHaveText('Actriz');
    await expect(page.getByTestId('wizard-alt-name')).toHaveText('Reserva');
  });

  test('applying the top pick snapshots first, then writes theme + blocks, then shows the checklist', async ({ page }) => {
    await installMocks(page, { plan: 'pro' });
    await openEditProfile(page);
    await openWizard(page);

    await page.getByTestId('wizard-persona-creator').click();
    await page.getByTestId('wizard-goal-get_messages').click();
    await expect(page.getByTestId('wizard-reco')).toBeVisible();

    // Record the write order across the apply (suite 18 convention).
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
    const blocksReq = page.waitForRequest(
      (r) => r.url().includes('/rest/v1/blocks') && (r.method() === 'POST' || r.method() === 'DELETE'),
    );

    // Apply the top pick — the primary gold action inside the top card.
    await page.getByTestId('wizard-top-card').getByRole('button', { name: 'Apply' }).click();

    // The same auto safety-net snapshot the gallery takes, named for the preset.
    const posted = (await snapPost).postDataJSON();
    const inserted = Array.isArray(posted) ? posted[0] : posted;
    expect(inserted.kind).toBe('auto');
    expect(inserted.name).toMatch(/^Before template:/);

    await themePatch;
    await blocksReq;

    // Snapshot POST lands BEFORE the theme PATCH (safety net first); blocks fire too.
    expect(order.indexOf('snapshot')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('theme')).toBeGreaterThan(order.indexOf('snapshot'));
    expect(order).toContain('blocks');

    // Success → the goal-driven checklist. get_messages → WhatsApp + booking CTA.
    await expect(page.getByTestId('wizard-done')).toBeVisible();
    await expect(page.getByTestId('wizard-checklist-item')).toHaveCount(2);
    await expect(page.getByTestId('wizard-checklist')).toContainText('Add your WhatsApp number');
    await expect(page.getByTestId('wizard-checklist')).toContainText('Set your booking CTA');
  });

  test('the checklist tracks the goal (sell → products + payout)', async ({ page }) => {
    await installMocks(page, { plan: 'pro' });
    await openEditProfile(page);
    await openWizard(page);

    // store + sell → alternate de-collides to local_business; checklist = sell's.
    await page.getByTestId('wizard-persona-store').click();
    await page.getByTestId('wizard-goal-sell').click();
    await expect(page.getByTestId('wizard-reco')).toBeVisible();
    await expect(page.getByTestId('wizard-top-name')).toHaveText('Tienda');

    await page.getByTestId('wizard-top-card').getByRole('button', { name: 'Apply' }).click();

    await expect(page.getByTestId('wizard-done')).toBeVisible();
    await expect(page.getByTestId('wizard-checklist')).toContainText('Add your products');
    await expect(page.getByTestId('wizard-checklist')).toContainText('Connect payout later');
  });

  test('ES: chips and checklist render in Spanish', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('titilinks-language', 'es'));
    await installMocks(page, { plan: 'pro' });
    await openEditProfile(page, /editar perfil/i);
    await openWizard(page, /configura mi página/i);

    // Q1 localized.
    await expect(page.getByTestId('wizard-q1')).toContainText('¿Qué te describe mejor?');

    await page.getByTestId('wizard-persona-creator').click();

    // Goal chips localized.
    await expect(page.getByTestId('wizard-goal-get_messages')).toHaveText('Recibir mensajes');

    await page.getByTestId('wizard-goal-get_messages').click();
    await expect(page.getByTestId('wizard-reco')).toBeVisible();

    // Apply → Spanish checklist.
    await page.getByTestId('wizard-top-card').getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByTestId('wizard-done')).toBeVisible();
    await expect(page.getByTestId('wizard-checklist')).toContainText('Añade tu número de WhatsApp');
    await expect(page.getByTestId('wizard-checklist')).toContainText('Configura tu botón de reservas');
  });
});
