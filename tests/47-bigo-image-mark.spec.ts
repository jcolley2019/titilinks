// TL.POLISH.1d — Bigo Live's full-color image mark is a DROP-IN for a path mark.
//
// Bigo's mascot cannot survive being flattened to one color (three monochrome
// traces proved it), so PlatformIcon grew a registry-declared `image` mark. The
// risk of that exception is divergence: an image that sizes, aligns or scales
// differently from the 50-odd path marks it sits beside. RasterMark defuses it
// by painting the bitmap inside the SAME 24x24 <svg> shell, so every rule that
// already governs a platform glyph — the size prop, and CSS like
// `.lb-social svg { width: 22px }` — keeps applying untouched.
//
// This spec pins that parity where it is load-bearing (the header icon row and
// the button leading-icon slot) and captures the screenshot sheet for the
// visual gate: picker row, header row over all four chip backgrounds, and the
// leading icon at each of its three real sizes.
//
// Fixture injection follows 26-icon-contrast / 46-social-picker: the real page
// and modes rows pass through, blocks/block_items are answered with a fixture,
// and every write is swallowed so the shared test account is never mutated.

import { test, expect } from '@playwright/test';
import { TEST_HANDLE } from './helpers/auth';

const PROFILE = `/${TEST_HANDLE}`;
const SOCIAL_BLOCK = 'bigo-social-block';
const LINKS_BLOCK = 'bigo-links-block';
const BIGO_URL = 'https://www.bigo.tv/user/titi';
const IG_URL = 'https://www.instagram.com/titi';
// A 1x1 slate PNG — just enough for a `small` card to count as having media,
// which is the only surface that renders the leading icon at its raw 14px.
const THUMB =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// TEST.FLAKE.26 — the passthrough re-fetch stalls intermittently under a full
// battery; retry it so a transient stall never fails the feature.
const routeFetchWithRetry = async (route: import('@playwright/test').Route, attempts = 4) => {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await route.fetch({ timeout: 20_000 });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('route.fetch failed after retries');
};

const SOCIALS = ['Bigo Live', 'Instagram', 'TikTok', 'Spotify'];

const seed = async (
  page: import('@playwright/test').Page,
  headerConfig: Record<string, unknown>,
  socials: string[] = SOCIALS,
) => {
  await page.route('**/rest/v1/pages*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const res = await routeFetchWithRetry(route);
    let body = await res.json();
    const patch = (p: any) => {
      if (!p || typeof p !== 'object') return p;
      const theme = { ...(p.theme_json || {}) };
      theme.headerConfig = { ...(theme.headerConfig || {}), ...headerConfig };
      return { ...p, theme_json: theme };
    };
    body = Array.isArray(body) ? body.map(patch) : patch(body);
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });

  let modeId = '';
  await page.route('**/rest/v1/modes*', async (route) => {
    const res = await routeFetchWithRetry(route);
    const body = await res.json();
    const rows = Array.isArray(body) ? body : [body];
    modeId = rows.find((m: any) => m?.type === 'page1')?.id ?? rows[0]?.id ?? '';
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });

  await page.route('**/rest/v1/blocks*', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const rows = [
      { id: SOCIAL_BLOCK, mode_id: modeId, type: 'social_links', title: null, is_enabled: true, order_index: 0 },
      { id: LINKS_BLOCK, mode_id: modeId, type: 'links', title: null, is_enabled: true, order_index: 1 },
    ];
    // Honour `type=eq.X`. The editor's resolveBlockId narrows by type and calls
    // .maybeSingle() — hand it both blocks and supabase-js throws "multiple
    // rows returned", the panel never opens, and the failure looks like a UI
    // bug. Two-block fixtures must filter; a one-block fixture never had to.
    const type = new URL(req.url()).searchParams.get('type');
    const want = type?.startsWith('eq.') ? type.slice(3) : null;
    await route.fulfill({ json: want ? rows.filter((b) => b.type === want) : rows });
  });

  await page.route('**/rest/v1/block_items*', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const item = (o: Record<string, unknown>) => ({
      is_adult: false, subtitle: null, badge: null, image_url: null,
      size: 'medium', style_json: null, ...o,
    });
    // Honour the block_id filter: the public page asks for `in.(a,b)` but the
    // Manage Platforms editor asks for `eq.<social>`. Answering that one with
    // the link rows too would list them as platforms — a fixture artefact that
    // would read as a product bug on the gate sheet.
    const f = new URL(req.url()).searchParams.get('block_id') ?? '';
    const ids = f.startsWith('eq.') ? [f.slice(3)]
      : f.startsWith('in.') ? f.slice(3).replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, ''))
      : null;
    const rows = [
        ...socials.map((label, i) =>
          item({ id: `bigo-soc-${i}`, block_id: SOCIAL_BLOCK, label, url: `https://example.com/${i}`, order_index: i })),
        // The leading-icon slot at each of its three real sizes. `medium` and
        // `button` are CSS-sized (22 / 18px); only a `small` card with media
        // renders the icon at the raw 14px the prop asks for.
        item({ id: 'bigo-link-med', block_id: LINKS_BLOCK, label: 'Bigo Live — medium', url: BIGO_URL, order_index: 0 }),
        item({ id: 'ig-link-med', block_id: LINKS_BLOCK, label: 'Instagram — medium', url: IG_URL, order_index: 1 }),
        item({ id: 'bigo-link-btn', block_id: LINKS_BLOCK, label: 'Bigo Live — button', url: BIGO_URL, order_index: 2, size: 'button' }),
        item({ id: 'ig-link-btn', block_id: LINKS_BLOCK, label: 'Instagram — button', url: IG_URL, order_index: 3, size: 'button' }),
        item({ id: 'bigo-link-card', block_id: LINKS_BLOCK, label: 'Bigo Live — card', url: BIGO_URL, order_index: 4, size: 'small', image_url: THUMB }),
        item({ id: 'ig-link-card', block_id: LINKS_BLOCK, label: 'Instagram — card', url: IG_URL, order_index: 5, size: 'small', image_url: THUMB }),
    ];
    await route.fulfill({ json: ids ? rows.filter((r) => ids.includes(r.block_id)) : rows });
  });
};

const gotoProfile = async (page: import('@playwright/test').Page) => {
  await page.goto(PROFILE);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
};

const shot = (name: string) => `tests/screenshots/${name}.png`;
const suffix = (info: import('@playwright/test').TestInfo) => info.project.name;

/** The header icon-row glyph for a platform (an <a title="..."> wrapper). */
const rowGlyph = (page: import('@playwright/test').Page, label: string) =>
  page.locator(`a[title="${label}"] svg`).first();

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

// ─── 1. Header icon row — all four chip backgrounds ─────────────────────────
//
// 'default' + color mode is the theme-tinted "brand" chip; the other three are
// the named styles. Each pass proves the same two things: the image mark is an
// <svg> like its neighbours (not a bare <img> that CSS would miss), and its box
// measures identical to a path mark's in the same row.

const CHIPS: { style: string; name: string }[] = [
  { style: 'dark', name: 'dark' },
  { style: 'white', name: 'light' },
  { style: 'default', name: 'brand' },
  { style: 'glass', name: 'glass' },
];

for (const chip of CHIPS) {
  test(`header icon row — ${chip.name} chip: image mark matches a path mark`, async ({ page }, info) => {
    await seed(page, { iconColorMode: 'color', iconBgStyle: chip.style, iconSize: 'medium' });
    await gotoProfile(page);

    const bigo = rowGlyph(page, 'Bigo Live');
    await expect(bigo).toBeVisible();

    // Drop-in at the DOM level: same <svg> shell, bitmap carried by <image>.
    await expect(bigo.locator('image')).toHaveCount(1);

    // Drop-in at the layout level: identical box to a neighbouring path mark.
    const mine = await bigo.boundingBox();
    const theirs = await rowGlyph(page, 'Instagram').boundingBox();
    expect(mine).not.toBeNull();
    expect(Math.round(mine!.width)).toBe(Math.round(theirs!.width));
    expect(Math.round(mine!.height)).toBe(Math.round(theirs!.height));

    await page
      .locator(`a[title="Bigo Live"]`).first()
      .locator('xpath=..')
      .screenshot({ path: shot(`${suffix(info)}-bigo-chip-${chip.name}`) });
  });
}

// ─── 2. The button leading-icon slot ────────────────────────────────────────
//
// `.lb-social svg { width: 22px }` (18px at `button` size) re-sizes the glyph
// from CSS. An <img> twin would sail straight past that rule; the <svg> shell
// inherits it, so the image mark lands at the same size as every path mark.

test('leading icon obeys the same CSS sizing as a path mark', async ({ page }, info) => {
  await seed(page, { iconColorMode: 'color', iconBgStyle: 'default', iconSize: 'medium' });
  await gotoProfile(page);

  const slot = (label: string) => page.locator(`a:has-text("${label}") .lb-social svg`).first();

  // Boxes are measured, not asserted against literal px: on desktop the public
  // page lives inside DESK.STAGE.1's scaled phone stage, so 22px CSS measures
  // ~17 device px. Parity with the path mark is the invariant, and it is the
  // one that breaks if CSS ever misses the image mark — a missed rule would
  // leave the bitmap at its raw 14px prop while Instagram stayed at 22.
  const widths: number[] = [];
  for (const [bigoLabel, igLabel] of [
    ['Bigo Live — medium', 'Instagram — medium'],
    ['Bigo Live — button', 'Instagram — button'],
  ] as const) {
    const b = await slot(bigoLabel).boundingBox();
    const i = await slot(igLabel).boundingBox();
    expect(b, `${bigoLabel} has a leading icon`).not.toBeNull();
    expect(Math.round(b!.width), `${bigoLabel} matches ${igLabel}`).toBe(Math.round(i!.width));
    expect(Math.round(b!.height)).toBe(Math.round(i!.height));
    widths.push(b!.width);
  }
  // The CSS tier really applies: `medium` (22px) is bigger than `button` (18px).
  expect(widths[0]).toBeGreaterThan(widths[1]);

  // The raw-prop surface: an image card's overlay chip is not `.lb-social`, so
  // the 14px size prop reaches the glyph untouched — smaller than both CSS
  // tiers, and again identical to the path mark beside it.
  const card = await page.locator(`a:has-text("Bigo Live — card") svg`).first().boundingBox();
  const cardIg = await page.locator(`a:has-text("Instagram — card") svg`).first().boundingBox();
  expect(Math.round(card!.width)).toBe(Math.round(cardIg!.width));
  expect(card!.width).toBeLessThan(widths[1]);

  await page.locator('.lb-velvet').first().locator('xpath=..')
    .screenshot({ path: shot(`${suffix(info)}-bigo-leading-icons`) });
});

// ─── 3. The picker row (editor) ─────────────────────────────────────────────

test('platform picker row renders the image mark', async ({ page }, info) => {
  // Seed WITHOUT Bigo so the picker row renders in its normal addable state —
  // an already-added row is dimmed, which is not what the gate is judging.
  await seed(page, { iconColorMode: 'color', iconBgStyle: 'default', iconSize: 'medium' },
    ['Instagram', 'TikTok', 'Spotify']);

  await page.goto('/dashboard/editor');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
  // The menu row is a <button>; target the role, not its inner <p>, and let it
  // finish animating in before the tap.
  const menuRow = page.getByRole('button', { name: /Manage Platforms/ }).filter({ visible: true }).first();
  await expect(menuRow).toBeVisible();
  await menuRow.click();
  await expect(page.getByRole('button', { name: 'Add Platform' })).toBeVisible({ timeout: 15_000 });

  // The saved-row list first (icon at 20px), then the picker row (22px).
  await page.screenshot({ path: shot(`${suffix(info)}-bigo-editor-rows`) });

  await page.getByRole('button', { name: 'Add Platform' }).click();
  await page.getByPlaceholder('Search platforms...').fill('Bigo');
  const row = page.getByRole('button', { name: 'Bigo Live', exact: true }).first();
  await expect(row).toBeVisible();
  await expect(row.locator('svg image')).toHaveCount(1);
  await row.screenshot({ path: shot(`${suffix(info)}-bigo-picker-row`) });
});
