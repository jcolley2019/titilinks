// FRAGILE.WRITES.1 — every save checks its result; reorder is one write;
// Reset page snapshots first (AUDIT.FRAGILE.1 E2, E3, E4, O3).
//
// supabase-js never throws on a failed table write or rpc — it RETURNS
// { error }. Before this brick the reorder loops, two editors' Saves, the
// header name save and onboarding's step writes awaited the call, ignored the
// result and announced success anyway. These tests answer those writes with a
// failure and assert the app now says so and takes none of its success steps.
//
// FIXTURE MODEL (the spec 52 pattern) — battery account, zero real writes in
// the mocked tests. `blocks` and `block_items` are answered from an in-memory
// row list; pages/modes GETs go to the network and are passed through. Every
// write the app sends is answered here (success or failure) and recorded, so
// nothing reaches the database and no allowWrites() opt-in is needed.
//
// The LIVE block at the bottom is the one exception: it proves the two prod
// functions, as the battery account, under allowWrites() for exactly those two
// rpc paths, and every call it makes either raises or rewrites the order that
// is already there — the battery's visible order is unchanged.
//
// Desktop viewport + DPR 1 in every editor test (spec 52's reasoning): the
// device frame is width-gated, and scoping canvas queries to
// getByTestId('device-frame') keeps the CSS-hidden mobile render out of reach.

import { randomUUID } from 'node:crypto';
import { test, expect, allowWrites, type Page, type Route } from './fixtures';
import { translations } from '../src/hooks/useLanguage';
import { TEST_HANDLE, PINNED_TEST_USER_ID, loginAsTestUser } from './helpers/auth';

test.use({ deviceScaleFactor: 1 });

// A save's onRefresh can still be re-reading through a passthrough route
// (route.fetch) when the test ends; drop the routes so that read is ignored
// instead of failing the test with "Target page … has been closed".
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

const DESKTOP = { width: 1440, height: 1000 };
const EN = translations.en as Record<string, string>;
const ES = translations.es as Record<string, string>;

const SOCIAL_ID = 's91-social';
const ICONS_ID = 's91-icons';
const LINKS_ID = 's91-links';
const BIO_ID = 's91-bio';
const CTA_ID = 's91-cta';
const CONTENT_ID = 's91-content';
const ITEM_A = 's91-item-a';
const ITEM_B = 's91-item-b';
const ITEM_C = 's91-item-c';

interface Row {
  id: string;
  mode_id: string;
  type: string;
  title: string | null;
  is_enabled: boolean;
  order_index: number;
}

const item = (id: string, blockId: string, label: string, order: number) => ({
  id,
  block_id: blockId,
  label,
  url: `https://fixture.titilinks.test/${id}`,
  order_index: order,
  archived_at: null,
  badge: null,
  bg_color: null,
  compare_at_price: null,
  created_at: '2026-11-23T00:00:00Z',
  cta_label: null,
  currency: null,
  ends_at: null,
  image_url: null,
  is_adult: false,
  price: null,
  size: null,
  starts_at: null,
  style_json: null,
  subtitle: null,
  title_color: null,
  updated_at: '2026-11-23T00:00:00Z',
});

type Sent = { method: string; path: string; body: unknown };

interface Fake {
  /** Every write the app sent, in order, with its path (no host) and body. */
  writes: Sent[];
  /** GET reads of the editor's block list (`mode_id=eq.` + `select=*`). */
  blockListReads: () => number;
  /** Answer the next writes on these keys with a failure. */
  fail: Set<'blocksPatch' | 'pagesPatch' | 'reorderBlocks' | 'reorderItems' | 'snapshotInsert'>;
}

const pgError = (route: Route, status = 500) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'P0001', message: 'S91 probe failure', details: null, hint: null }),
  });

/**
 * Seed the editor with a small fixed page and answer every write. `extra` adds
 * rows (a content_section block, a social_icon_row block).
 */
async function seed(page: Page, opts: { extra?: Row[]; withSocialLinks?: boolean } = {}): Promise<Fake> {
  const fake: Fake = { writes: [], blockListReads: () => listReads, fail: new Set() };
  let listReads = 0;
  const rows: Row[] = [
    ...(opts.withSocialLinks === false
      ? []
      : [{ id: SOCIAL_ID, mode_id: '', type: 'social_links', title: 'Social Links', is_enabled: true, order_index: 0 }]),
    { id: LINKS_ID, mode_id: '', type: 'links', title: 'Links', is_enabled: true, order_index: 1 },
    { id: BIO_ID, mode_id: '', type: 'bio', title: 'Bio', is_enabled: true, order_index: 2 },
    { id: CTA_ID, mode_id: '', type: 'primary_cta', title: 'Primary CTA', is_enabled: true, order_index: 3 },
    ...(opts.extra ?? []),
  ];
  const items = [
    item(ITEM_A, LINKS_ID, 'S91 Alpha', 0),
    item(ITEM_B, LINKS_ID, 'S91 Bravo', 1),
    item(ITEM_C, LINKS_ID, 'S91 Charlie', 2),
  ];
  const record = (route: Route) => {
    const req = route.request();
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    fake.writes.push({ method: req.method(), path: new URL(req.url()).pathname, body });
  };

  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() === 'GET') return route.fallback();
    record(route);
    if (fake.fail.has('pagesPatch')) return pgError(route);
    return route.fulfill({ status: 204, body: '' });
  });

  await page.route('**/rest/v1/modes*', async (route) => {
    if (route.request().method() !== 'GET') {
      record(route);
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    const res = await route.fetch();
    const body = await res.json();
    const arr = Array.isArray(body) ? body : [body];
    const modeId = (arr.find((m) => m?.type === 'page1') ?? arr[0])?.id ?? '';
    for (const r of rows) r.mode_id = modeId;
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });

  await page.route('**/rest/v1/blocks*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() !== 'GET') {
      record(route);
      if (req.method() === 'PATCH' && fake.fail.has('blocksPatch')) return pgError(route);
      if (req.method() === 'PATCH') {
        const id = (url.searchParams.get('id') ?? '').replace(/^eq\./, '');
        const row = rows.find((r) => r.id === id);
        if (row) Object.assign(row, req.postDataJSON() ?? {});
        return route.fulfill({ status: 204, body: '' });
      }
      if (req.method() === 'DELETE') return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    const idParam = url.searchParams.get('id') ?? '';
    const typeParam = url.searchParams.get('type') ?? '';
    const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    if (idParam.startsWith('eq.')) {
      const row = rows.find((r) => r.id === idParam.slice(3));
      return route.fulfill({ json: wantsObject ? row ?? null : row ? [row] : [] });
    }
    // TL.EVNT.SGL graft probe (`type=in.(…)`): nothing to graft.
    if (typeParam.startsWith('in.')) return route.fulfill({ json: [] });
    if (typeParam.startsWith('eq.')) {
      return route.fulfill({ json: rows.filter((r) => r.type === typeParam.slice(3)) });
    }
    if ((url.searchParams.get('mode_id') ?? '').startsWith('eq.') && url.searchParams.get('select') === '*') {
      listReads += 1;
    }
    return route.fulfill({ json: [...rows].sort((a, b) => a.order_index - b.order_index) });
  });

  await page.route('**/rest/v1/block_items*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() !== 'GET') {
      record(route);
      if (req.method() === 'DELETE') return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    const blockParam = url.searchParams.get('block_id') ?? '';
    if (blockParam.startsWith('eq.')) {
      return route.fulfill({ json: items.filter((i) => i.block_id === blockParam.slice(3)) });
    }
    return route.fulfill({ json: [...items].sort((a, b) => a.order_index - b.order_index) });
  });

  await page.route('**/rest/v1/rpc/reorder_blocks', async (route) => {
    record(route);
    if (fake.fail.has('reorderBlocks')) return pgError(route);
    return route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/rest/v1/rpc/reorder_block_items', async (route) => {
    record(route);
    if (fake.fail.has('reorderItems')) return pgError(route);
    return route.fulfill({ status: 204, body: '' });
  });

  await page.route('**/rest/v1/profile_snapshots*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.fulfill({ json: [] }); // pruneAuto: nothing to prune
    record(route);
    if (req.method() === 'POST' && fake.fail.has('snapshotInsert')) return pgError(route);
    const sent = (req.postDataJSON() ?? {}) as Record<string, unknown>;
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: randomUUID(), created_at: '2026-11-23T00:00:00Z', ...sent }),
    });
  });

  return fake;
}

async function gotoEditor(page: Page, opts: { lang?: 'en' | 'es' } = {}) {
  await page.setViewportSize(DESKTOP);
  if (opts.lang === 'es') {
    await page.addInitScript(() => localStorage.setItem('titilinks-language', 'es'));
  }
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
}

const frame = (page: Page) => page.getByTestId('device-frame');

/** The canvas card for a block, found by its type label. */
const card = (page: Page, label: string) =>
  frame(page).locator('div.mx-4.mb-4.rounded-2xl').filter({ has: page.locator('span.uppercase', { hasText: label }) }).first();

/** Canvas block labels, top to bottom. innerText applies the CSS uppercase. */
const canvasOrder = (page: Page) => frame(page).locator('span.uppercase').allInnerTexts();

/** The seeded blocks' ids in canvas order (label → id; other labels ignored). */
const canvasBlockIds = async (page: Page) => {
  const byLabel = new Map([
    [EN['blocks.links.title'].toLowerCase(), LINKS_ID],
    [EN['blocks.bio.title'].toLowerCase(), BIO_ID],
    [EN['blocks.primary_cta.title'].toLowerCase(), CTA_ID],
  ]);
  return (await canvasOrder(page))
    .map((s) => byLabel.get(s.trim().toLowerCase()))
    .filter((id): id is string => !!id);
};

/** The seeded link items' ids in canvas order. */
const canvasItemIds = async (page: Page) => {
  const byLabel = new Map([['S91 Alpha', ITEM_A], ['S91 Bravo', ITEM_B], ['S91 Charlie', ITEM_C]]);
  const texts = await frame(page).getByText(/^S91 (Alpha|Bravo|Charlie)$/).allInnerTexts();
  return texts.map((s) => byLabel.get(s.trim())).filter((id): id is string => !!id);
};

/** dnd-kit KeyboardSensor: pick up, move one slot down, drop. */
async function keyboardMoveDown(page: Page, handle: ReturnType<Page['locator']>) {
  await handle.focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  await page.keyboard.press('Space');
}

const rpcCalls = (fake: Fake, name: string) => fake.writes.filter((w) => w.path.endsWith(`/rpc/${name}`));
const toast = (page: Page, text: string) => page.locator('[data-sonner-toast]').filter({ hasText: text });

test.describe('FRAGILE.WRITES.1 — reorder is one write (E2)', () => {
  // The drag is driven through dnd-kit's KeyboardSensor (focus the grip, Space,
  // ArrowDown, Space) — the one deterministic way to fire onDragEnd from a
  // spec. On the mobile project (WebKit, touch) the sensor never activates
  // from a synthetic Space, so no drag ends and nothing is sent; a touch drag
  // is a different input path that no spec drives today. The handlers under
  // test are input-agnostic (they receive the new id order), so desktop
  // coverage is the proof; the phone project skips rather than fakes it.
  test.skip(({ isMobile }) => isMobile, 'keyboard drag does not activate dnd-kit on the WebKit/touch project');

  test('block reorder sends ONE reorder_blocks call in the new order and no per-row PATCH', async ({ page }) => {
    const fake = await seed(page);
    await gotoEditor(page);
    await expect(card(page, EN['blocks.links.title'])).toBeVisible();

    await keyboardMoveDown(page, card(page, EN['blocks.links.title']).locator('button').first());

    await expect.poll(() => rpcCalls(fake, 'reorder_blocks').length).toBe(1);
    // The keyboard sensor may land the tall links card one or two slots down;
    // either way the ONE call carries the whole new order, exactly as the
    // canvas now shows it.
    const sent = (rpcCalls(fake, 'reorder_blocks')[0].body as { p_ids: string[] }).p_ids;
    expect([...sent].sort()).toEqual([BIO_ID, CTA_ID, LINKS_ID].sort());
    expect(sent).not.toEqual([LINKS_ID, BIO_ID, CTA_ID]);
    expect(sent[0]).not.toBe(LINKS_ID);
    expect(await canvasBlockIds(page)).toEqual(sent);
    expect(fake.writes.filter((w) => w.method === 'PATCH' && w.path.endsWith('/blocks'))).toEqual([]);
    await expect(toast(page, EN['editor.failedReorder'])).toHaveCount(0);
  });

  test('reorder_blocks answering 500 → the reorder-failed toast shows and the blocks are re-read', async ({ page }) => {
    const fake = await seed(page);
    fake.fail.add('reorderBlocks');
    await gotoEditor(page);
    await expect(card(page, EN['blocks.links.title'])).toBeVisible();
    const readsBefore = fake.blockListReads();

    await keyboardMoveDown(page, card(page, EN['blocks.links.title']).locator('button').first());

    await expect(toast(page, EN['editor.failedReorder'])).toBeVisible();
    expect(rpcCalls(fake, 'reorder_blocks')).toHaveLength(1);
    await expect.poll(() => fake.blockListReads()).toBeGreaterThan(readsBefore);
    // The re-read restores the stored order.
    await expect.poll(async () => (await canvasOrder(page))[0]?.toLowerCase()).toBe(EN['blocks.links.title'].toLowerCase());
  });

  test('link reorder sends ONE reorder_block_items call in the new order and no per-row PATCH', async ({ page }) => {
    const fake = await seed(page);
    await gotoEditor(page);
    const handle = frame(page).getByRole('button', { name: EN['linksBlock.reorderLink'] }).first();
    await expect(handle).toBeVisible();

    await keyboardMoveDown(page, handle);

    await expect.poll(() => rpcCalls(fake, 'reorder_block_items').length).toBe(1);
    const body = rpcCalls(fake, 'reorder_block_items')[0].body as { p_block_id: string; p_ids: string[] };
    expect(body.p_block_id).toBe(LINKS_ID);
    expect([...body.p_ids].sort()).toEqual([ITEM_A, ITEM_B, ITEM_C].sort());
    expect(body.p_ids[0]).not.toBe(ITEM_A);
    expect(await canvasItemIds(page)).toEqual(body.p_ids);
    expect(fake.writes.filter((w) => w.method === 'PATCH' && w.path.endsWith('/block_items'))).toEqual([]);
    await expect(toast(page, EN['editor.failedReorderLinks'])).toHaveCount(0);
  });

  test('reorder_block_items answering 500 → the translated toast shows and the blocks are re-read', async ({ page }) => {
    const fake = await seed(page);
    fake.fail.add('reorderItems');
    await gotoEditor(page);
    const handle = frame(page).getByRole('button', { name: EN['linksBlock.reorderLink'] }).first();
    await expect(handle).toBeVisible();
    const readsBefore = fake.blockListReads();

    await keyboardMoveDown(page, handle);

    await expect(toast(page, EN['editor.failedReorderLinks'])).toBeVisible();
    expect(rpcCalls(fake, 'reorder_block_items')).toHaveLength(1);
    await expect.poll(() => fake.blockListReads()).toBeGreaterThan(readsBefore);
  });

  // FRAGILE.WRITES.1a — an open links editor mirrors its unsaved draft ('new-'
  // id) into the preview, so a drag in that block hands the draft id to
  // handleItemsReorder. The real function raises on an id with no row; only the
  // persisted ids may be sent.
  test('link reorder with an unsaved draft link in the preview sends only the real item ids', async ({ page }) => {
    const fake = await seed(page);
    await gotoEditor(page);
    const handle = frame(page).getByRole('button', { name: EN['linksBlock.reorderLink'] }).first();
    await expect(handle).toBeVisible();

    // Canvas "+ Add link" → links editor opens straight on a new, unsaved link.
    await frame(page).getByRole('button', { name: `+ ${EN['linksBlock.addLink']}` }).click();
    const label = page.getByPlaceholder(EN['linksEditor.myLink']).filter({ visible: true }).first();
    await expect(label).toBeVisible();
    await label.fill('S91 Draft');
    await expect(frame(page).getByText('S91 Draft', { exact: true })).toBeVisible();
    await expect(frame(page).getByRole('button', { name: EN['linksBlock.reorderLink'] })).toHaveCount(4);

    await keyboardMoveDown(page, handle);

    await expect.poll(() => rpcCalls(fake, 'reorder_block_items').length).toBe(1);
    await page.waitForTimeout(300);
    expect(rpcCalls(fake, 'reorder_block_items')).toHaveLength(1);
    const body = rpcCalls(fake, 'reorder_block_items')[0].body as { p_block_id: string; p_ids: string[] };
    expect(body.p_block_id).toBe(LINKS_ID);
    expect(body.p_ids.filter((id) => id.startsWith('new-'))).toEqual([]);
    expect([...body.p_ids].sort()).toEqual([ITEM_A, ITEM_B, ITEM_C].sort());
    expect(body.p_ids[0]).not.toBe(ITEM_A);
    await expect(toast(page, EN['editor.failedReorderLinks'])).toHaveCount(0);
  });
});

test.describe('FRAGILE.WRITES.1 — every save looks at its result (E3)', () => {
  test('ContentSectionEditor: blocks PATCH failing → failure toast, no "saved", panel stays open', async ({ page }) => {
    const fake = await seed(page, {
      extra: [{ id: CONTENT_ID, mode_id: '', type: 'content_section', title: JSON.stringify({ section_title: 'S91' }), is_enabled: true, order_index: 4 }],
    });
    fake.fail.add('blocksPatch');
    await gotoEditor(page);

    await page.getByRole('button', { name: /Edit Profile|Editar perfil/i }).first().click();
    await page.getByTestId('section-row').filter({ hasText: EN['blocks.content_section.title'] }).getByRole('button').first().click();
    const title = page.getByPlaceholder(EN['contentSectionEditor.sectionTitlePlaceholder']);
    await expect(title).toBeVisible();
    await title.fill('S91 changed');
    const save = page.getByRole('button', { name: EN['blockEditor.save'], exact: true }).filter({ visible: true }).last();
    await save.click();

    await expect(toast(page, 'S91 probe failure')).toBeVisible();
    await expect(toast(page, EN['contentSectionEditor.saved'])).toHaveCount(0);
    await expect(title).toBeVisible(); // panel still open
    // The failed block write stopped the save: no item writes followed it.
    expect(fake.writes.filter((w) => w.path.endsWith('/block_items'))).toEqual([]);
  });

  test('SocialIconRowEditor: blocks PATCH failing → failure toast, no "saved", panel stays open', async ({ page }) => {
    const fake = await seed(page, {
      withSocialLinks: false,
      extra: [{ id: ICONS_ID, mode_id: '', type: 'social_icon_row', title: 'Social Icons', is_enabled: true, order_index: 0 }],
    });
    fake.fail.add('blocksPatch');
    await gotoEditor(page);

    // With no social_links block, the header "+" opens the icon-row block's editor.
    await frame(page).getByTestId('icon-row-add').first().click();
    const themeSwitch = page.locator('.fixed.top-16').getByRole('switch').first();
    await expect(themeSwitch).toBeVisible();
    await themeSwitch.click();
    const save = page.getByRole('button', { name: EN['blockEditor.save'], exact: true }).filter({ visible: true }).last();
    await save.click();

    await expect(toast(page, 'S91 probe failure')).toBeVisible();
    await expect(toast(page, EN['socialIconRowEditor.saved'])).toHaveCount(0);
    await expect(themeSwitch).toBeVisible(); // panel still open
    expect(fake.writes.filter((w) => w.path.endsWith('/block_items'))).toEqual([]);
  });

  for (const lang of ['en', 'es'] as const) {
    test(`header name save failing → the translated editor.saveFailed text, never the raw key (${lang})`, async ({ page }) => {
      const dict = lang === 'es' ? ES : EN;
      const fake = await seed(page);
      fake.fail.add('pagesPatch');
      await gotoEditor(page, { lang });

      const name = frame(page).locator('input[placeholder^="@"]').first();
      await expect(name).toBeVisible();
      await name.fill('S91 name probe');
      await name.press('Enter');

      await expect(toast(page, dict['editor.saveFailed']).first()).toBeVisible();
      await expect(page.getByText('editor.saveFailed')).toHaveCount(0);
      expect(fake.writes.some((w) => w.method === 'PATCH' && w.path.endsWith('/pages'))).toBe(true);
    });
  }
});

test.describe('FRAGILE.WRITES.1 — Reset page takes a snapshot first (E4)', () => {
  async function openReset(page: Page) {
    await page.getByRole('button', { name: /Edit Profile|Editar perfil/i }).first().click();
    await page.locator('.fixed.top-16').getByText(EN['dashboard.pages'], { exact: true }).first().click();
    await page.getByRole('button', { name: new RegExp(`^${EN['pages.resetAction']}`) }).filter({ visible: true }).first().click();
    await page.getByRole('button', { name: EN['pages.resetConfirmYes'], exact: true }).filter({ visible: true }).click();
  }
  const isBlockDelete = (w: Sent) => w.method === 'DELETE' && /\/(blocks|block_items)$/.test(w.path);

  test('the auto snapshot is inserted before any block delete', async ({ page }) => {
    const fake = await seed(page);
    await gotoEditor(page);
    const before = fake.writes.length;
    await openReset(page);

    await expect(toast(page, EN['pages.resetDone'])).toBeVisible();
    fake.writes.splice(0, before); // only what the Reset gesture sent
    const snapAt = fake.writes.findIndex((w) => w.method === 'POST' && w.path.endsWith('/profile_snapshots'));
    const delAt = fake.writes.findIndex(isBlockDelete);
    expect(snapAt, 'a snapshot insert was sent').toBeGreaterThanOrEqual(0);
    expect(delAt, 'the reset deleted the old blocks').toBeGreaterThanOrEqual(0);
    expect(snapAt).toBeLessThan(delAt);
    const snap = fake.writes[snapAt].body as { kind: string; name: string };
    expect(snap.kind).toBe('auto');
    expect(snap.name).toBe(EN['snapshots.autoBeforeReset'].replace('{name}', EN['blockPreset.default.label']));
  });

  test('a failing snapshot insert → the backup-failed toast and NO delete at all', async ({ page }) => {
    const fake = await seed(page);
    fake.fail.add('snapshotInsert');
    await gotoEditor(page);
    // Load-time default-block seeding (ensureDefaultBlocks) is not the reset;
    // judge only what the Reset gesture sends.
    const before = fake.writes.length;
    await openReset(page);

    await expect(toast(page, EN['snapshots.autoFailed'])).toBeVisible();
    await page.waitForTimeout(500);
    const sent = fake.writes.slice(before);
    expect(sent.some((w) => w.method === 'POST' && w.path.endsWith('/profile_snapshots')), 'the snapshot was attempted').toBe(true);
    expect(sent.filter(isBlockDelete)).toEqual([]);
    expect(sent.filter((w) => w.method === 'POST' && w.path.endsWith('/blocks'))).toEqual([]);
    await expect(toast(page, EN['pages.resetDone'])).toHaveCount(0);
  });
});

// ── Onboarding O3 ────────────────────────────────────────────────────────────
// The battery account owns a page, so a fresh wizard jumps to step 4 (spec 89).
// From there Continue reaches Finish (528), and Back reaches step 2 (178) and
// step 1 (107). The profiles PATCH is answered 500; nothing reaches the wire.

async function openWizardAtStep4(page: Page): Promise<Sent[]> {
  const writes: Sent[] = [];
  await page.route('**/rest/v1/profiles*', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') return route.fallback();
    writes.push({ method: req.method(), path: new URL(req.url()).pathname, body: req.postDataJSON() });
    return pgError(route);
  });
  await page.goto('/dashboard/editor');
  await page.evaluate(() => {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith('onboarding:')) sessionStorage.removeItem(k);
  });
  await page.goto('/onboarding');
  await expect(
    page.getByText(EN['onboardingFlow.yourSocialPlatforms'], { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 20_000 });
  return writes;
}
const wizardButton = (page: Page, key: string) =>
  page.getByRole('button', { name: EN[key], exact: true }).filter({ visible: true }).first();

test.describe('FRAGILE.WRITES.1 — onboarding steps stop on a failed write (O3)', () => {
  test('Finish: onboarding_complete failing → toast, stays on /onboarding, wizard state kept', async ({ page }) => {
    const writes = await openWizardAtStep4(page);
    await wizardButton(page, 'onboardingFlow.continue').click();
    await expect(page.getByText(EN['onboardingFlow.youreLive'], { exact: true }).filter({ visible: true }).first()).toBeVisible();

    await wizardButton(page, 'onboardingFlow.goToDashboard').click();

    await expect(toast(page, EN['onboardingFlow.saveFailed'])).toBeVisible();
    expect(writes.some((w) => (w.body as Record<string, unknown>)?.onboarding_complete === true)).toBe(true);
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/onboarding$/);
    const kept = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('onboarding:')).length);
    expect(kept, 'the persisted wizard state was not cleared').toBeGreaterThan(0);
  });

  test('step 2 (178) and step 1 (107): a failed profiles write does not advance', async ({ page }) => {
    const writes = await openWizardAtStep4(page);
    // 4 → 3 → 2
    await wizardButton(page, 'onboardingFlow.back').click();
    await wizardButton(page, 'onboardingFlow.back').click();
    const nameInput = page.getByPlaceholder(EN['onboardingFlow.displayNamePlaceholder']).filter({ visible: true });
    await expect(nameInput).toBeVisible();
    await nameInput.fill('S91 Probe');
    const handle = `s91probe${Date.now().toString(36)}`;
    await page.getByPlaceholder(EN['onboardingFlow.usernamePlaceholder']).filter({ visible: true }).fill(handle);
    const cont = wizardButton(page, 'onboardingFlow.continue');
    await expect(cont).toBeEnabled({ timeout: 10_000 });
    await cont.click();

    await expect(toast(page, EN['onboardingFlow.saveFailed'])).toBeVisible();
    expect(writes.some((w) => (w.body as Record<string, unknown>)?.username === handle)).toBe(true);
    await expect(nameInput).toBeVisible(); // still on step 2

    // 2 → 1. On the phone project the failure toast sits over the wizard's
    // buttons and the tap that raised it leaves sonner hover-paused, so it
    // never times out and swallows every pointer click. dispatchEvent fires
    // the button's own click handler without a pointer.
    await wizardButton(page, 'onboardingFlow.back').dispatchEvent('click');
    const step1Continue = wizardButton(page, 'onboardingFlow.continue');
    await expect(nameInput).toHaveCount(0); // back on step 1
    if (await step1Continue.isDisabled()) {
      // No style picked in a fresh wizard: pick the first card.
      await page.locator('button.rounded-xl.border-2').filter({ visible: true }).first().dispatchEvent('click');
      await expect(step1Continue).toBeEnabled();
    }
    const before = writes.length;
    await step1Continue.dispatchEvent('click');
    await expect.poll(() => writes.slice(before).some((w) => 'page_style' in ((w.body as object) ?? {}))).toBe(true);
    await expect(toast(page, EN['onboardingFlow.saveFailed']).first()).toBeVisible();
    await page.waitForTimeout(400);
    await expect(nameInput).toHaveCount(0); // did not advance to step 2
    await expect(step1Continue).toBeVisible();
  });
});

// ── Live proof of the two prod functions ─────────────────────────────────────

/** Run supabase-js inside the page using the app's own signed-in client (spec 54). */
const sb = <T,>(page: Page, body: string, arg?: unknown): Promise<T> =>
  page.evaluate(
    async ({ body, a }) => {
      // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
      const m = await import('/src/integrations/supabase/client.ts');
      return (0, eval)(`(async (sb, arg) => { ${body} })`)((m as any).supabase, a);
    },
    { body, a: arg ?? null },
  );

interface LiveTarget {
  userId: string;
  modeId: string;
  linksBlockId: string;
}

async function liveTarget(page: Page): Promise<LiveTarget> {
  await page.goto('/');
  const signedIn = () => sb<string | null>(page, `const { data } = await sb.auth.getUser(); return data?.user?.id ?? null;`);
  if (!(await signedIn())) {
    await loginAsTestUser(page);
    await page.goto('/');
  }
  return sb<LiveTarget>(page, `
    const { data: auth } = await sb.auth.getUser();
    if (!auth?.user?.id) throw new Error('no battery session');
    const { data: pg, error: pe } = await sb.from('pages').select('id').eq('handle', arg.handle).single();
    if (pe) throw pe;
    const { data: mode, error: me } = await sb.from('modes').select('id').eq('page_id', pg.id).eq('type', 'page1').single();
    if (me) throw me;
    const { data: links, error: le } = await sb.from('blocks').select('id')
      .eq('mode_id', mode.id).eq('type', 'links').order('created_at', { ascending: true }).limit(1);
    if (le) throw le;
    return { userId: auth.user.id, modeId: mode.id, linksBlockId: links?.[0]?.id ?? '' };`, { handle: TEST_HANDLE });
}

type OrderRow = { id: string; order_index: number };
const readBlocks = (page: Page, modeId: string) => sb<OrderRow[]>(page, `
  const { data, error } = await sb.from('blocks').select('id, order_index').eq('mode_id', arg)
    .order('order_index', { ascending: true }).order('id', { ascending: true });
  if (error) throw error;
  return data;`, modeId);
const readItems = (page: Page, blockId: string) => sb<OrderRow[]>(page, `
  const { data, error } = await sb.from('block_items').select('id, order_index').eq('block_id', arg)
    .order('order_index', { ascending: true }).order('id', { ascending: true });
  if (error) throw error;
  return data;`, blockId);
const callRpc = (page: Page, fn: string, args: Record<string, unknown>) => sb<{ ok: boolean; message: string | null }>(page, `
  const { error } = await sb.rpc(arg.fn, arg.args);
  return { ok: !error, message: error ? error.message : null };`, { fn, args });

test.describe('FRAGILE.WRITES.1 — the two prod functions, live (battery account)', () => {
  test.beforeEach(async ({ page }) => {
    await allowWrites(page, ['rest/v1/rpc/reorder_blocks', 'rest/v1/rpc/reorder_block_items']);
  });

  test('a random id raises and changes nothing; the current order round-trips unchanged', async ({ page }) => {
    const target = await liveTarget(page);
    expect(target.userId, 'running as the battery account').toBe(PINNED_TEST_USER_ID);
    expect(target.linksBlockId, 'the battery page1 has a links block').not.toBe('');

    const blocksBefore = await readBlocks(page, target.modeId);
    const itemsBefore = await readItems(page, target.linksBlockId);
    expect(blocksBefore.length).toBeGreaterThan(1);
    expect(itemsBefore.length).toBeGreaterThan(1);
    test.info().annotations.push({
      type: 'battery order before',
      description: `blocks ${JSON.stringify(blocksBefore.map((b) => b.order_index))}; items ${JSON.stringify(itemsBefore.map((i) => i.order_index))}`,
    });

    // (1) one random uuid → an error, and nothing moved.
    const rb = await callRpc(page, 'reorder_blocks', { p_ids: [randomUUID()] });
    expect(rb.ok).toBe(false);
    expect(rb.message).toMatch(/reorder_blocks: 0 of 1 rows updated/);
    const ri = await callRpc(page, 'reorder_block_items', { p_block_id: target.linksBlockId, p_ids: [randomUUID()] });
    expect(ri.ok).toBe(false);
    expect(ri.message).toMatch(/reorder_block_items: 0 of 1 rows updated/);
    expect(await readBlocks(page, target.modeId)).toEqual(blocksBefore);
    expect(await readItems(page, target.linksBlockId)).toEqual(itemsBefore);

    // (2) the links block's items in their CURRENT order → success, same order.
    const ri2 = await callRpc(page, 'reorder_block_items', {
      p_block_id: target.linksBlockId,
      p_ids: itemsBefore.map((i) => i.id),
    });
    expect(ri2, ri2.message ?? '').toEqual({ ok: true, message: null });
    expect((await readItems(page, target.linksBlockId)).map((i) => i.id)).toEqual(itemsBefore.map((i) => i.id));

    // (3) ALL page-1 blocks in their CURRENT order → success, same order.
    const rb2 = await callRpc(page, 'reorder_blocks', { p_ids: blocksBefore.map((b) => b.id) });
    expect(rb2, rb2.message ?? '').toEqual({ ok: true, message: null });
    expect((await readBlocks(page, target.modeId)).map((b) => b.id)).toEqual(blocksBefore.map((b) => b.id));
  });
});
