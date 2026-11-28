/**
 * COLOR.PICK.1 — one colour picker everywhere. Every colour control under
 * src/components is the shared InlineColorPicker (src/components/ui/
 * color-picker.tsx, the Links editor's): the Name & handle hub's Color tab,
 * the Hero card, Main button (Primary CTA) and Social icons editors. No native
 * <input type="color"> is left (the guard's NO-NATIVE-COLOUR rule holds the
 * line in source; these tests hold it in the running app).
 *
 * FIXTURE MODEL — battery account, zero real writes.
 *   · Hub tests (the spec 92 model): the editor's own `pages` read is passed
 *     through with headerConfig.nameColor / handleColor pinned to the hub's
 *     defaults ('#ffffff' / '#ffffff99'; never assert stored account data as a
 *     baseline), and every `pages` write is answered here and recorded.
 *   · Editor tests (the spec 91 model): `blocks` and `block_items` are answered
 *     from an in-memory row list, pages/modes GETs pass through, and every
 *     write is answered here and recorded.
 *   Nothing reaches the database, so no allowWrites() opt-in is needed.
 *
 * Reachability today: the Main button opens from its Sections-rail row on any
 * page. The Hero card is a legacy block no menu creates any more; the rail
 * opens it on a page that already holds one. The Social icons editor opens
 * from the header icons only on a page whose header socials are an icon row
 * with no Social Links block. Those two pages are faked here, as spec 91 does.
 *
 * Desktop viewport + DPR 1 (spec 52's reasoning): canvas queries are scoped to
 * getByTestId('device-frame') so the CSS-hidden mobile render stays out of reach.
 */
import { test, expect, type Page, type Route } from './fixtures';
import { translations } from '../src/hooks/useLanguage';

test.use({ deviceScaleFactor: 1 });

// A save's onRefresh can still be re-reading through a passthrough route when
// the test ends; drop the routes so that read is ignored.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

const EN = translations.en as Record<string, string>;
const DESKTOP = { width: 1440, height: 1000 };
const PROBE = '12AB34';
const PROBE_RGB = 'rgb(18, 171, 52)';

const frame = (page: Page) => page.getByTestId('device-frame');
/** The shared picker's hex box, wherever it renders. */
const hexBox = (page: Page) => page.locator('.lb-inline-picker input').filter({ visible: true }).first();
const pickerSquare = (page: Page) =>
  page.locator('.lb-inline-picker .react-colorful__saturation').filter({ visible: true }).first();
const nativeColour = (page: Page) => page.locator('input[type="color"]');

// ── Name & handle hub ────────────────────────────────────────────────────────

/** theme_json of every pages PATCH the hub sent, in order. */
async function seedHub(page: Page): Promise<any[]> {
  const saves: any[] = [];
  await page.route((url) => url.pathname === '/rest/v1/pages', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      const res = await route.fetch();
      const body = await res.json();
      const pin = (row: any) => {
        if (!row || typeof row !== 'object' || !('theme_json' in row)) return row;
        const t = JSON.parse(JSON.stringify(row.theme_json && typeof row.theme_json === 'object' ? row.theme_json : {}));
        t.headerConfig = { ...(t.headerConfig || {}), nameColor: '#ffffff', handleColor: '#ffffff99' };
        return { ...row, theme_json: t };
      };
      const out = Array.isArray(body) ? body.map(pin) : pin(body);
      return route.fulfill({ response: res, body: JSON.stringify(out) });
    }
    let body: any = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    if (req.method() === 'PATCH') saves.push(body?.theme_json);
    return route.fulfill({ status: 204, body: '' });
  });
  return saves;
}

async function openHubColour(page: Page) {
  await page.setViewportSize(DESKTOP);
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await expect(frame(page)).toBeVisible({ timeout: 20_000 }); // the first WebKit load can be slow
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
  await page.getByText('Name & Handle', { exact: false }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: EN['typoHub.tabColor'], exact: true }).filter({ visible: true }).first().click();
}

const hubChip = (page: Page, key: 'typoHub.nameColor' | 'typoHub.handleColor') =>
  page.getByRole('button', { name: EN[key], exact: true }).filter({ visible: true }).first();

async function saveHub(page: Page, saves: any[]) {
  await page.getByRole('button', { name: EN['typoHub.save'], exact: true }).filter({ visible: true }).first().click();
  await expect.poll(() => saves.length, { timeout: 10_000 }).toBe(1);
  return saves[0]?.headerConfig ?? {};
}

test.describe('COLOR.PICK.1 — Name & handle hub, Color tab', () => {
  test('Name: the shared picker, no native input; a typed hex recolours the canvas name and saves', async ({ page }) => {
    const saves = await seedHub(page);
    await openHubColour(page);

    await expect(hubChip(page, 'typoHub.nameColor')).toHaveAttribute('aria-pressed', 'true');
    await expect(hubChip(page, 'typoHub.handleColor')).toHaveAttribute('aria-pressed', 'false');
    await expect(pickerSquare(page)).toBeVisible();
    await expect(nativeColour(page)).toHaveCount(0);

    await hexBox(page).fill(PROBE);
    // The live preview follows the draft before any save.
    await expect(frame(page).locator('input[placeholder^="@"]').first()).toHaveCSS('color', PROBE_RGB);
    expect(saves).toHaveLength(0);

    const hc = await saveHub(page, saves);
    expect(hc.nameColor).toBe('#12ab34');
    expect(hc.handleColor).toBe('#ffffff99');
  });

  test('Handle: the picker edits the six digits and keeps the stored alpha suffix', async ({ page }) => {
    const saves = await seedHub(page);
    await openHubColour(page);

    await hubChip(page, 'typoHub.handleColor').click();
    await expect(hubChip(page, 'typoHub.handleColor')).toHaveAttribute('aria-pressed', 'true');
    // The picker is shown the opaque form of '#ffffff99'.
    await expect(hexBox(page)).toHaveValue(/^#?ffffff$/i);
    await hexBox(page).fill(PROBE);

    const hc = await saveHub(page, saves);
    expect(hc.handleColor).toBe('#12ab3499');
    expect(hc.nameColor).toBe('#ffffff');
  });

  test('the Black quick colour sets the name to #000000', async ({ page }) => {
    const saves = await seedHub(page);
    await openHubColour(page);

    await page.getByRole('button', { name: EN['dashboard.textFx.colorBlack'], exact: true }).filter({ visible: true }).first().click();
    await expect(hexBox(page)).toHaveValue(/^#?000000$/i);

    const hc = await saveHub(page, saves);
    expect(hc.nameColor).toBe('#000000');
    expect(hc.handleColor).toBe('#ffffff99');
  });
});

// ── The three block editors ──────────────────────────────────────────────────

const ICONS_ID = 's104-icons';
const CTA_ID = 's104-cta';
const HERO_ID = 's104-hero';
const CTA_ITEM = 's104-cta-item';
const HERO_ITEM = 's104-hero-item';

interface Row { id: string; mode_id: string; type: string; title: string | null; is_enabled: boolean; order_index: number }
type Sent = { method: string; path: string; query: string; body: any };

const item = (id: string, blockId: string, label: string, extra: Record<string, unknown> = {}) => ({
  id, block_id: blockId, label, url: `https://fixture.titilinks.test/${id}`, order_index: 0,
  archived_at: null, badge: null, bg_color: null, compare_at_price: null, created_at: '2026-11-27T00:00:00Z',
  cta_label: null, currency: null, ends_at: null, image_url: null, is_adult: false, price: null, size: null,
  starts_at: null, style_json: null, subtitle: null, title_color: null, updated_at: '2026-11-27T00:00:00Z',
  ...extra,
});

/** A small fixed page — an icon-row header (no Social Links block), a Main
 *  button and a legacy Hero card — with every write answered and recorded. */
async function seedEditors(page: Page): Promise<Sent[]> {
  const writes: Sent[] = [];
  const rows: Row[] = [
    { id: ICONS_ID, mode_id: '', type: 'social_icon_row', title: JSON.stringify({ use_theme_color: false, custom_color: '#ffffff' }), is_enabled: true, order_index: 0 },
    { id: CTA_ID, mode_id: '', type: 'primary_cta', title: 'Primary CTA', is_enabled: true, order_index: 1 },
    { id: HERO_ID, mode_id: '', type: 'hero_card', title: 'Hero Card', is_enabled: true, order_index: 2 },
  ];
  const items = [
    item('s104-icon-ig', ICONS_ID, 'Instagram'),
    item(CTA_ITEM, CTA_ID, 'S104 CTA'),
    item(HERO_ITEM, HERO_ID, 'S104 Hero', { url: '#', badge: JSON.stringify({ text_color: '#ffffff' }) }),
  ];
  const record = (route: Route) => {
    const req = route.request();
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    const url = new URL(req.url());
    writes.push({ method: req.method(), path: url.pathname, query: url.search, body });
  };

  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() === 'GET') return route.fallback();
    record(route);
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
      return req.method() === 'POST'
        ? route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
        : route.fulfill({ status: 204, body: '' });
    }
    const idParam = url.searchParams.get('id') ?? '';
    const typeParam = url.searchParams.get('type') ?? '';
    const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    if (idParam.startsWith('eq.')) {
      const row = rows.find((r) => r.id === idParam.slice(3));
      return route.fulfill({ json: wantsObject ? row ?? null : row ? [row] : [] });
    }
    if (typeParam.startsWith('in.')) return route.fulfill({ json: [] });
    if (typeParam.startsWith('eq.')) return route.fulfill({ json: rows.filter((r) => r.type === typeParam.slice(3)) });
    return route.fulfill({ json: [...rows].sort((a, b) => a.order_index - b.order_index) });
  });
  await page.route('**/rest/v1/block_items*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() !== 'GET') {
      record(route);
      return req.method() === 'POST'
        ? route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
        : route.fulfill({ status: 204, body: '' });
    }
    const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const blockParam = url.searchParams.get('block_id') ?? '';
    if (blockParam.startsWith('eq.')) {
      const mine = items.filter((i) => i.block_id === blockParam.slice(3));
      return route.fulfill({ json: wantsObject ? mine[0] ?? null : mine });
    }
    return route.fulfill({ json: items });
  });
  for (const rpc of ['reorder_blocks', 'reorder_block_items']) {
    await page.route(`**/rest/v1/rpc/${rpc}`, async (route) => {
      record(route);
      return route.fulfill({ status: 204, body: '' });
    });
  }
  await page.route('**/rest/v1/profile_snapshots*', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    record(route);
    return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
  return writes;
}

async function gotoEditor(page: Page) {
  await page.setViewportSize(DESKTOP);
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await expect(frame(page)).toBeVisible({ timeout: 20_000 }); // the first WebKit load can be slow
}

async function openRailRow(page: Page, titleKey: string) {
  await page.getByRole('button', { name: /Edit Profile|Editar perfil/i }).first().click();
  await page.getByTestId('section-row').filter({ hasText: EN[titleKey] }).getByRole('button').first().click();
}

const saveButton = (page: Page) =>
  page.getByRole('button', { name: EN['blockEditor.save'], exact: true }).filter({ visible: true }).last();

/** The last write to `path` whose query names `id`. */
const lastWrite = (writes: Sent[], path: string, id: string) =>
  [...writes].reverse().find((w) => w.method === 'PATCH' && w.path.endsWith(path) && w.query.includes(id));

test.describe('COLOR.PICK.1 — block editors use the shared picker', () => {
  test('Main button: Border Color is the shared picker and a typed hex reaches the save', async ({ page }) => {
    const writes = await seedEditors(page);
    await gotoEditor(page);
    await openRailRow(page, 'blocks.primary_cta.title');
    await page.getByRole('button', { name: EN['primaryCtaEditor.styleVariants'] }).filter({ visible: true }).first().click();
    await expect(page.getByText(EN['primaryCtaEditor.borderColor'], { exact: true }).filter({ visible: true }).first()).toBeVisible();

    await expect(nativeColour(page)).toHaveCount(0);
    await expect(pickerSquare(page)).toBeVisible();
    await hexBox(page).fill(PROBE);
    await saveButton(page).click();

    await expect.poll(() => !!lastWrite(writes, '/blocks', CTA_ID), { timeout: 10_000 }).toBe(true);
    const sent = JSON.parse(lastWrite(writes, '/blocks', CTA_ID)!.body.title);
    expect(String(sent.style.border_color).toLowerCase()).toBe('#12ab34');
  });

  test('Hero card: Text Color is the shared picker and a typed hex reaches the save', async ({ page }) => {
    const writes = await seedEditors(page);
    await gotoEditor(page);
    await openRailRow(page, 'blocks.hero_card.title');
    await expect(page.getByText(EN['design.textColor'], { exact: true }).filter({ visible: true }).first()).toBeVisible();

    await expect(nativeColour(page)).toHaveCount(0);
    await expect(pickerSquare(page)).toBeVisible();
    await hexBox(page).fill(PROBE);
    await saveButton(page).click();

    await expect.poll(() => !!lastWrite(writes, '/block_items', HERO_ITEM), { timeout: 10_000 }).toBe(true);
    const sent = JSON.parse(lastWrite(writes, '/block_items', HERO_ITEM)!.body.badge);
    expect(String(sent.text_color).toLowerCase()).toBe('#12ab34');
  });

  test('Social icons: Custom Color is the shared picker and a typed hex reaches the save', async ({ page }) => {
    const writes = await seedEditors(page);
    await gotoEditor(page);
    // With no social_links block, the header "+" opens the icon-row block's editor.
    await frame(page).getByTestId('icon-row-add').first().click();
    await expect(page.getByText(EN['socialIconRowEditor.customColor'], { exact: true }).filter({ visible: true }).first()).toBeVisible();

    await expect(nativeColour(page)).toHaveCount(0);
    await expect(pickerSquare(page)).toBeVisible();
    await hexBox(page).fill(PROBE);
    await saveButton(page).click();

    await expect.poll(() => !!lastWrite(writes, '/blocks', ICONS_ID), { timeout: 10_000 }).toBe(true);
    const sent = JSON.parse(lastWrite(writes, '/blocks', ICONS_ID)!.body.title);
    expect(String(sent.custom_color).toLowerCase()).toBe('#12ab34');
    expect(sent.use_theme_color).toBe(false);
  });
});
