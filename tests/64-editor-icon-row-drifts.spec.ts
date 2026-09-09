// TL.SOC.7 — the editor's icon row behaves like the live page's.
//
// Joey's ruling: while the icons fit on one line, NOTHING changes — icons and
// the "+" sit on one centred line exactly as before. Only when the icons ALONE
// would exceed the phone width does the row become the public page's drifting
// strip (IR.1's HeaderIconRow) and the "+" drop to a centred circle beneath it.
// Before this the edit row was `flex-wrap`, so a wide roster folded onto a
// second line that the public page never shows.
//
// The card now feeds its per-item nodes to the same HeaderIconRow the public
// mount uses, passing the "+" as an optional `trailing` child. Overflow is
// measured on the icons alone (the trailing width is subtracted), so the flip
// point is "icons don't fit", not "icons plus the '+' don't fit".
//
// Fixture injection follows 47-bigo-image-mark / 48-urlless-social-rows: the
// real page and modes rows pass through, blocks/block_items are answered with
// a fixture, and every write is swallowed so the shared account is never
// mutated. The drift measurement is spec 45's: sample scrollLeft twice over a
// window, never touching the strip (a pointer pauses it for 8 s).

import { test, expect, type Page, type Route, type Locator } from './fixtures';
import { TEST_HANDLE } from './helpers/auth';

const PROFILE = `/${TEST_HANDLE}`;
const BLOCK = 'soc7-block';

const routeFetchWithRetry = async (route: Route, attempts = 4) => {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await route.fetch({ timeout: 20_000 }); } catch (e) { lastErr = e; }
  }
  throw lastErr instanceof Error ? lastErr : new Error('route.fetch failed after retries');
};

type Row = { id: string; label: string; url: string };

// Medium chips are 44px + 6px gap. At the 402px stage the row is 354px wide
// (24px header inset each side): 4 icons + "+" = 244px fits; 12 icons = 594px
// overflows on its own.
//
// TL.SOC.8: that arithmetic only holds because ICON_CIRCLE_CLASS carries
// shrink-0. Before it, the circles were plain flex items and the browser
// squeezed a dozen of them to ~28px rather than overflow — the strip did not
// engage until ~40 rows forced glyph min-content past the width, on the edit
// canvas AND the public row alike. Assertion (e) pins the fix: every circle in
// the strip is as wide as it is tall, and as wide as the "+" (same class).
const FOUR: Row[] = ['Instagram', 'TikTok', 'YouTube', 'Spotify'].map((label, i) => ({
  id: `soc7-${i}`, label, url: `https://example.com/${i}`,
}));
const TWELVE: Row[] = [
  'Instagram', 'TikTok', 'YouTube', 'Facebook', 'X (Twitter)', 'Snapchat',
  'Threads', 'Pinterest', 'Bluesky', 'Reddit', 'Spotify', 'Twitch',
].map((label, i) => ({ id: `soc7-${i}`, label, url: `https://example.com/${i}` }));
// (c): one URL-less row inside the overflowing strip.
const TWELVE_ONE_EMPTY: Row[] = TWELVE.map((r) => (r.label === 'Twitch' ? { ...r, url: '' } : r));

const seed = async (page: Page, rows: Row[]) => {
  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') { await route.fulfill({ status: 204, body: '' }); return; }
    const res = await routeFetchWithRetry(route);
    await route.fulfill({ response: res, body: JSON.stringify(await res.json()) });
  });

  let modeId = '';
  await page.route('**/rest/v1/modes*', async (route) => {
    const res = await routeFetchWithRetry(route);
    const body = await res.json();
    const arr = Array.isArray(body) ? body : [body];
    modeId = arr.find((m: any) => m?.type === 'page1')?.id ?? arr[0]?.id ?? '';
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });

  await page.route('**/rest/v1/blocks*', async (route) => {
    if (route.request().method() !== 'GET') { await route.fulfill({ status: 204, body: '' }); return; }
    await route.fulfill({
      json: [{ id: BLOCK, mode_id: modeId, type: 'social_links', title: null, is_enabled: true, order_index: 0 }],
    });
  });

  await page.route('**/rest/v1/block_items*', async (route) => {
    if (route.request().method() !== 'GET') { await route.fulfill({ status: 204, body: '' }); return; }
    await route.fulfill({
      json: rows.map((r, i) => ({
        id: r.id, block_id: BLOCK, label: r.label, url: r.url,
        is_adult: false, order_index: i, subtitle: null, badge: null, image_url: null,
      })),
    });
  });
};

const shot = (name: string) => `tests/screenshots/${name}.png`;

const gotoEditor = async (page: Page) => {
  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(900);
};

// The editor mounts two EditableProfileViews (desktop + mobile branches,
// CSS-hidden, not unmounted) — always take the visible one.
const strip = (page: Page) => page.locator('[data-icon-row]').filter({ visible: true }).first();
const addBtn = (page: Page) => page.getByTestId('icon-row-add').filter({ visible: true }).first();

/** Icon chips inside the strip: the linked <a title> and the URL-less <button data-needs-link>. */
const chips = (row: Locator) => row.locator(':scope > a, :scope > button[data-needs-link]');

/** spec 45's sampler: two scrollLeft readings over `ms`, lap-corrected. */
const measure = async (row: Locator, ms = 1500) => row.evaluate(async (el, window_ms) => {
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  const s0 = el.scrollLeft;
  await new Promise((r) => setTimeout(r, window_ms));
  const s1 = el.scrollLeft;
  const oneCopy = el.scrollWidth / 2;
  let dx = s1 - s0;
  if (dx < 0) dx += oneCopy;
  return { moved: dx, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
}, ms);

/** offsetWidth/offsetHeight per element — layout px, unaffected by the stage's transform scale. */
const sizes = (loc: Locator) =>
  loc.evaluateAll((els) => els.map((e) => ({ w: (e as HTMLElement).offsetWidth, h: (e as HTMLElement).offsetHeight })));

/** (e) TL.SOC.8: every circle kept its width — as wide as tall, and as wide as `ref` when given. */
const expectFullCircles = async (loc: Locator, ref?: number) => {
  const list = await sizes(loc);
  expect(list.length).toBeGreaterThan(0);
  for (const { w, h } of list) {
    expect(Math.abs(w - h)).toBeLessThanOrEqual(1);
    if (ref !== undefined) expect(Math.abs(w - ref)).toBeLessThanOrEqual(1);
  }
};

const tops = async (loc: Locator) => {
  const boxes = await loc.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  return boxes;
};

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

// ─── (a) fits: one centred line, "+" inline, nothing moves ───────────────────

test('4 rows: icons and "+" share one centred line and the row never scrolls', async ({ page }, info) => {
  await seed(page, FOUR);
  await gotoEditor(page);

  const row = strip(page);
  await expect(row).toBeVisible();
  await expect(chips(row)).toHaveCount(4);
  // The "+" rides INSIDE the row as its last child.
  const add = addBtn(page);
  await expect(add).toBeVisible();
  await expect(row.locator(':scope > [data-testid="icon-row-add"]')).toHaveCount(1);
  await expect(row).toHaveClass(/justify-center/);
  await expect(row).not.toHaveClass(/overflow-x-auto/);

  // Same top for every icon and the "+", within 2px.
  const ys = [...(await tops(chips(row))), ...(await tops(add))];
  for (const y of ys) expect(Math.abs(y - ys[0])).toBeLessThanOrEqual(2);

  // Centred: the group of five is symmetric inside the row.
  const rowBox = (await row.boundingBox())!;
  const first = (await chips(row).first().boundingBox())!;
  const last = (await add.boundingBox())!;
  const groupCenter = (first.x + last.x + last.width) / 2;
  expect(Math.abs(groupCenter - (rowBox.x + rowBox.width / 2))).toBeLessThan(4);

  const m = await measure(row);
  expect(m.moved).toBe(0);
  expect(await row.evaluate((el) => el.scrollLeft)).toBe(0);

  await page.screenshot({ path: shot(`${info.project.name}-soc7-fits`) });
});

// ─── (b) overflow: drifting strip, "+" beneath and centred ───────────────────

test('12 rows: the strip drifts like the live page and the "+" drops beneath it', async ({ page }, info) => {
  await seed(page, TWELVE);
  await gotoEditor(page);

  const row = strip(page);
  await expect(row).toBeVisible();
  await expect(row).toHaveClass(/overflow-x-auto/);
  // Doubled for the seamless wrap: 12 originals + 12 inert copies.
  await expect(chips(row)).toHaveCount(24);

  const m = await measure(row);
  expect(m.scrollWidth).toBeGreaterThan(m.clientWidth);
  expect(m.moved).toBeGreaterThan(4);

  // A single line: every chip shares one top.
  const ys = await tops(chips(row));
  for (const y of ys) expect(Math.abs(y - ys[0])).toBeLessThanOrEqual(2);

  // The "+" is visible, OUTSIDE the strip, below it, and centred on it.
  const add = addBtn(page);
  await expect(add).toBeVisible();
  await expect(row.locator('[data-testid="icon-row-add"]')).toHaveCount(0);
  // Scoped to the visible row: the editor's CSS-hidden twin EPV measures 0px
  // wide, so it stays "fitted" and legitimately keeps its inline trailing "+".
  await expect(row.locator('[data-icon-trailing]')).toHaveCount(0);
  const rowBox = (await row.boundingBox())!;
  const addBox = (await add.boundingBox())!;
  expect(addBox.y).toBeGreaterThan(rowBox.y + rowBox.height - 1);
  expect(Math.abs((addBox.x + addBox.width / 2) - (rowBox.x + rowBox.width / 2))).toBeLessThan(4);

  // (e) the circles did not shrink: same width as the fitted-case circle (the
  // "+" wears the same ICON_CIRCLE_CLASS and sits in an unsqueezed box).
  const [{ w: addW }] = await sizes(add);
  await expectFullCircles(chips(row), addW);

  await page.screenshot({ path: shot(`${info.project.name}-soc7-overflow`) });
});

// ─── (c) a URL-less row inside the strip keeps its "needs link" dress ────────

test('12 rows with one URL-less: the placeholder keeps data-needs-link and its dashed ring in the strip', async ({ page }) => {
  await seed(page, TWELVE_ONE_EMPTY);
  await gotoEditor(page);

  const row = strip(page);
  await expect(row).toHaveClass(/overflow-x-auto/);
  // Original + inert duplicate, both still dressed as unfinished.
  const ph = row.locator('[data-needs-link][title^="Twitch"]');
  await expect(ph).toHaveCount(2);
  await expect(ph.first()).toHaveClass(/border-dashed/);
  await expect(ph.first()).toHaveClass(/border-\[#C9A55C\]\/70/);
  await expect(ph.nth(1)).toHaveAttribute('aria-hidden', 'true');
});

// ─── (d) the public page is untouched ────────────────────────────────────────

test('public page: the strip is present, no "+" and no trailing marker', async ({ browser }) => {
  // An anonymous visitor: a context with no storageState. Every non-GET to
  // Supabase is aborted here — this context sits outside the fixture's
  // default-deny guard, so it carries its own.
  const ctx = await browser.newContext({ storageState: undefined });
  const page = await ctx.newPage();
  await page.route(/supabase\.co\//, (route) =>
    route.request().method() === 'GET' ? route.fallback() : route.abort(),
  );
  await seed(page, TWELVE);
  await page.goto(PROFILE);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  const row = page.locator('[data-icon-row]');
  await expect(row).toHaveCount(1);
  await expect(row).toBeVisible();
  await expect(row).toHaveClass(/overflow-x-auto/);
  await expect(page.getByTestId('icon-row-add')).toHaveCount(0);
  await expect(page.locator('[data-icon-trailing]')).toHaveCount(0);
  await expect(page.locator('[data-needs-link]')).toHaveCount(0);
  // (e) on the public strip too: 12 rows drift at full circle size.
  await expect(row.locator(':scope > a')).toHaveCount(24);
  await expectFullCircles(row.locator(':scope > a'));
  const pm = await measure(row);
  expect(pm.moved).toBeGreaterThan(4);

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.close();
});
