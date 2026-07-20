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

/**
 * AIS.0b — pin the page state the wizard's success screen reads.
 *
 * The wizard gathers its reality snapshot with two narrow queries
 * (`blocks?select=id,type` then `block_items?select=id,block_id,url`), and the
 * section navigation resolves a block with `blocks?select=id&type=eq.<t>`. Only
 * those exact shapes are intercepted — every other blocks/block_items read still
 * passes through to the mocks installed above, so the rest of the editor behaves
 * normally. Registered AFTER installMocks so these handlers win.
 */
async function mockReality(
  page: Page,
  blocks: { id: string; type: string }[],
  items: { id: string; block_id: string; url: string | null }[],
) {
  await page.route('**/rest/v1/blocks*', async (route) => {
    const url = decodeURIComponent(route.request().url());
    if (route.request().method() !== 'GET') return route.fallback();

    // The wizard's reality read.
    if (url.includes('select=id,type')) return asJson(route, blocks);

    // resolveBlockId's find-or-create lookup (maybeSingle → object accept).
    const typeMatch = url.match(/type=eq\.([^&]+)/);
    if (url.includes('select=id') && typeMatch) {
      const found = blocks.find((b) => b.type === typeMatch[1]);
      const row = found ? { id: found.id } : null;
      if (wantsObject(route)) return row ? asJson(route, row) : asJson(route, null);
      return asJson(route, row ? [row] : []);
    }
    return route.fallback();
  });

  await page.route('**/rest/v1/block_items*', async (route) => {
    const url = decodeURIComponent(route.request().url());
    if (route.request().method() === 'GET' && url.includes('select=id,block_id,url')) {
      return asJson(route, items);
    }
    return route.fallback();
  });
}

/** Drive Q1 → Q2 → Apply, landing on the success step. */
async function applyAndReachDone(page: Page, persona: string, goal: string, applyLabel = 'Apply') {
  await page.getByTestId(`wizard-persona-${persona}`).click();
  await page.getByTestId(`wizard-goal-${goal}`).click();
  await expect(page.getByTestId('wizard-reco')).toBeVisible();
  await page.getByTestId('wizard-top-card').getByRole('button', { name: applyLabel }).click();
  await expect(page.getByTestId('wizard-done')).toBeVisible();
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

  // ── AIS.0b — standard footer ───────────────────────────────────────────────

  test('footer: Cancel on step 1, Back on step 2, with a step indicator on both', async ({ page }) => {
    await installMocks(page, { plan: 'pro' });
    await openEditProfile(page);
    await openWizard(page);

    // Q1 — the left action cancels out of the wizard; indicator reads step 1.
    await expect(page.getByTestId('wizard-back')).toHaveText('Cancel');
    await expect(page.getByTestId('wizard-step')).toHaveText('Step 1 of 2');

    // Q2 — the same slot becomes Back; indicator advances.
    await page.getByTestId('wizard-persona-creator').click();
    await expect(page.getByTestId('wizard-q2')).toBeVisible();
    await expect(page.getByTestId('wizard-back')).toHaveText('Back');
    await expect(page.getByTestId('wizard-step')).toHaveText('Step 2 of 2');

    // Back actually walks back to Q1.
    await page.getByTestId('wizard-back').click();
    await expect(page.getByTestId('wizard-q1')).toBeVisible();
    await expect(page.getByTestId('wizard-back')).toHaveText('Cancel');
  });

  test('footer: the recommendation step keeps Back but drops the step indicator', async ({ page }) => {
    await installMocks(page, { plan: 'pro' });
    await openEditProfile(page);
    await openWizard(page);

    await page.getByTestId('wizard-persona-creator').click();
    await page.getByTestId('wizard-goal-get_messages').click();
    await expect(page.getByTestId('wizard-reco')).toBeVisible();

    await expect(page.getByTestId('wizard-back')).toHaveText('Back');
    await expect(page.getByTestId('wizard-step')).toHaveCount(0);
  });

  test('footer: the success step is a single Done CTA, always enabled', async ({ page }) => {
    await installMocks(page, { plan: 'pro' });
    // Nothing set up at all — Done must still be enabled (guided, never forced).
    await mockReality(page, [], []);
    await openEditProfile(page);
    await openWizard(page);
    await applyAndReachDone(page, 'creator', 'get_messages');

    const done = page.getByTestId('wizard-finish');
    await expect(done).toHaveText('Done');
    await expect(done).toBeEnabled();
    // The Q-step controls are gone on the success step.
    await expect(page.getByTestId('wizard-back')).toHaveCount(0);
    await expect(page.getByTestId('wizard-step')).toHaveCount(0);

    // Every row is unchecked, and Done is still enabled.
    await expect(page.locator('[data-testid="wizard-checklist-item"][data-done="true"]')).toHaveCount(0);
    await expect(done).toBeEnabled();
  });

  // ── AIS.0b — live guided checklist ─────────────────────────────────────────

  test('checklist: an unmet item renders unchecked and routes into its editor on tap', async ({ page }) => {
    await installMocks(page, { plan: 'pro' });
    // A links block whose seeded wa.me link carries NO number, and no CTA item.
    await mockReality(
      page,
      [{ id: 'b-links', type: 'links' }, { id: 'b-cta', type: 'primary_cta' }],
      [{ id: 'wa-1', block_id: 'b-links', url: 'https://wa.me/' }],
    );
    await openEditProfile(page);
    await openWizard(page);
    await applyAndReachDone(page, 'creator', 'get_messages');

    // Seeded-but-empty wa.me → unchecked. Booking CTA has no item → unchecked.
    await expect(page.locator('[data-item="whatsapp"]')).toHaveAttribute('data-done', 'false');
    await expect(page.locator('[data-item="bookingCta"]')).toHaveAttribute('data-done', 'false');

    // Tapping routes into the Primary CTA editor; the wizard yields the panel.
    await page.getByTestId('wizard-checklist-open-bookingCta').click();
    await expect(page.getByTestId('page-setup-wizard')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Primary CTA' })).toBeVisible();
  });

  test('checklist: reality drives the check — a wa.me link with a number renders checked', async ({ page }) => {
    await installMocks(page, { plan: 'pro' });
    // Same page, except the WhatsApp link now carries a real number.
    await mockReality(
      page,
      [{ id: 'b-links', type: 'links' }, { id: 'b-cta', type: 'primary_cta' }],
      [
        { id: 'wa-1', block_id: 'b-links', url: 'https://wa.me/573001234567?text=Hola' },
        { id: 'cta-1', block_id: 'b-cta', url: 'https://cal.com/me' },
      ],
    );
    await openEditProfile(page);
    await openWizard(page);
    await applyAndReachDone(page, 'creator', 'get_messages');

    await expect(page.locator('[data-item="whatsapp"]')).toHaveAttribute('data-done', 'true');
    await expect(page.locator('[data-item="bookingCta"]')).toHaveAttribute('data-done', 'true');
    // Nothing is persisted — the checks are a reading of the page.
    await expect(page.getByTestId('wizard-finish')).toBeEnabled();
  });

  test('checklist: the payout row is informational — no chevron, not tappable', async ({ page }) => {
    await installMocks(page, { plan: 'pro' });
    await mockReality(page, [], []);
    await openEditProfile(page);
    await openWizard(page);
    // sell → products + payout.
    await applyAndReachDone(page, 'store', 'sell');

    // Products is a real route; payout is a dead end and renders flat.
    await expect(page.getByTestId('wizard-checklist-open-products')).toBeVisible();
    await expect(page.getByTestId('wizard-checklist-open-payout')).toHaveCount(0);
    await expect(page.locator('[data-item="payout"]')).toHaveAttribute('data-done', 'false');
  });

  // ── PHOTO.ROUTE.1 — the photo half of "a profile photo or video" ───────────

  // SELF-FLAG (FIX.MEDIA.1): both specs below asserted PHOTO.ROUTE.1's photo
  // button in the Video Profile menu. That button is gone — a photo's home is
  // the camera icon on the hero preview, and a second door into the same flow
  // read as redundant. The checklist route itself is unchanged, so the first
  // spec keeps its real subject (the row still lands on Video Profile) and drops
  // only the button assertions; the second is replaced by the affordance that
  // took its place — the preview frame is itself the picker (covered in full by
  // tests/23-hero-framing.spec.ts).
  test('checklist: the photo-or-video row routes to Video Profile', async ({ page }) => {
    await installMocks(page, { plan: 'pro' });
    await mockReality(page, [], []);
    await openEditProfile(page);
    await openWizard(page);
    // grow_audience → socials + the photo-or-video row.
    await applyAndReachDone(page, 'creator', 'grow_audience');

    // The row is present and tappable whatever its check state — the photo half
    // of the check reads pages.avatar_url, which this harness deliberately does
    // not pin (mockReality covers blocks/items only).
    await expect(page.locator('[data-item="profileMedia"]')).toBeVisible();

    // The video destination is unchanged — this is the row's one job.
    await page.getByTestId('wizard-checklist-open-profileMedia').click();
    await expect(page.getByRole('heading', { name: 'Video Profile' })).toBeVisible();

    // And it lands on the media frame, which is where both halves now start.
    await expect(page.getByTestId('hero-video-frame')).toBeVisible();
    await expect(page.getByTestId('hero-edit-photo')).toHaveCount(0);
  });

  test('ES: the retitled photo-or-video row and footer read in Spanish', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('titilinks-language', 'es'));
    await installMocks(page, { plan: 'pro' });
    await mockReality(page, [], []);
    await openEditProfile(page, /editar perfil/i);
    await openWizard(page, /configura mi página/i);

    // Footer, localized.
    await expect(page.getByTestId('wizard-back')).toHaveText('Cancelar');
    await expect(page.getByTestId('wizard-step')).toHaveText('Paso 1 de 2');

    // grow_audience → socials + the retitled photo-or-video row.
    await applyAndReachDone(page, 'creator', 'grow_audience', 'Aplicar');
    await expect(page.getByTestId('wizard-checklist')).toContainText('Añade tus redes sociales');
    await expect(page.getByTestId('wizard-checklist')).toContainText('Sube una foto o video de perfil');
    await expect(page.getByTestId('wizard-finish')).toHaveText('Listo');
  });
});
