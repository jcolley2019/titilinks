// IR.1 — icon-row polish on the public header.
//
// Same fixture-injection precedent as 04-adult-gate: the real page + modes rows
// load, and blocks/block_items are answered with a fixture, so the whole render
// path (PublicProfile -> EditableProfileView header icon row) ships unchanged.
// Here we additionally patch the page's theme_json.headerConfig so a spec can
// drive the two IR.1 behaviours the public DOM can show:
//
//   1. The per-profile circle background option (Off / Glass / Dark / White /
//      Black), resolved through resolveIconBg. Unset stays the current look.
//   2. Overflow auto-drift that reuses the Gallery rAF loop and is disabled
//      under prefers-reduced-motion.
//
// The 18+ gating specs live in 04 and must stay green UNMODIFIED — that suite is
// the proof this polish never touched the gating branch, so nothing here asserts
// gating.

import { test, expect } from '@playwright/test';

const PROFILE = '/joeyc';
const SPOTIFY_URL = 'https://open.spotify.com/artist/ir-control';
const BLOCK_ID = 'ir-social-block';

// Patch page.theme_json.headerConfig, pass the real modes through (capturing the
// page1 mode id), then answer blocks/block_items with the fixture.
const seedIconRow = async (
  page: import('@playwright/test').Page,
  headerConfig: Record<string, unknown>,
  items: (blockId: string) => unknown[],
) => {
  await page.route('**/rest/v1/pages*', async (route) => {
    const res = await route.fetch();
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
    const res = await route.fetch();
    const body = await res.json();
    const rows = Array.isArray(body) ? body : [body];
    modeId = rows.find((m: any) => m?.type === 'page1')?.id ?? rows[0]?.id ?? '';
    await route.fulfill({ response: res, body: JSON.stringify(body) });
  });

  await page.route('**/rest/v1/blocks*', async (route) => {
    await route.fulfill({
      json: [{ id: BLOCK_ID, mode_id: modeId, type: 'social_links', title: null, is_enabled: true, order_index: 0 }],
    });
  });
  await page.route('**/rest/v1/block_items*', async (route) => {
    await route.fulfill({ json: items(BLOCK_ID) });
  });
};

const item = (id: string, label: string, url: string, order: number) => ({
  id, block_id: BLOCK_ID, label, url, is_adult: false, order_index: order,
  subtitle: null, badge: null, image_url: null,
});

const gotoSeeded = async (page: import('@playwright/test').Page) => {
  await page.goto(PROFILE);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
};

// ─── 1. Circle background option ─────────────────────────────────────────────

test.describe('icon row — circle background option', () => {
  const oneSpotify = (blockId: string) => [item('ir-spotify', 'Spotify', SPOTIFY_URL, 0)];

  test('Solid white paints the circle white', async ({ page }) => {
    await seedIconRow(page, { iconBgStyle: 'white' }, oneSpotify);
    await gotoSeeded(page);
    await expect(page.locator('a[title="Spotify"]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });

  test('Solid black paints the circle black', async ({ page }) => {
    await seedIconRow(page, { iconBgStyle: 'black' }, oneSpotify);
    await gotoSeeded(page);
    await expect(page.locator('a[title="Spotify"]')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  });

  test('Off makes the circle transparent', async ({ page }) => {
    await seedIconRow(page, { iconBgStyle: 'off' }, oneSpotify);
    await gotoSeeded(page);
    await expect(page.locator('a[title="Spotify"]')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  });

  test('Glass applies a translucent fill and a backdrop blur', async ({ page }) => {
    await seedIconRow(page, { iconBgStyle: 'glass' }, oneSpotify);
    await gotoSeeded(page);
    const icon = page.locator('a[title="Spotify"]');
    await expect(icon).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.14)');
    await expect(icon).toHaveCSS('backdrop-filter', 'blur(12px)');
  });
});

// ─── 2. Overflow auto-drift + reduced motion ─────────────────────────────────

// Enough distinct icons to overflow any viewport so the drift strip engages.
const manyIcons = (blockId: string) =>
  Array.from({ length: 40 }, (_, i) =>
    item(`ir-many-${i}`, `Ico${String(i).padStart(2, '0')}`, `https://example.com/i${i}`, i)
  );

const readScrollLeft = (page: import('@playwright/test').Page) =>
  page.locator('[data-icon-row]').first().evaluate((el) => (el as HTMLElement).scrollLeft);

test.describe('icon row — overflow drift', () => {
  test('a full row drifts on its own (rAF scroll advances)', async ({ page }) => {
    await seedIconRow(page, { iconSize: 'large' }, manyIcons);
    await gotoSeeded(page);
    // Give the overflow measurement + rAF a moment to engage.
    await page.waitForTimeout(500);
    const s0 = await readScrollLeft(page);
    await page.waitForTimeout(1500);
    const s1 = await readScrollLeft(page);
    // The strip advanced on its own — no user interaction happened.
    expect(s1).toBeGreaterThan(s0 + 2);
  });

  test('prefers-reduced-motion disables the drift (strip stays put)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedIconRow(page, { iconSize: 'large' }, manyIcons);
    await gotoSeeded(page);
    await page.waitForTimeout(500);
    const s0 = await readScrollLeft(page);
    await page.waitForTimeout(1500);
    const s1 = await readScrollLeft(page);
    // No rAF started, so scrollLeft never moves off zero.
    expect(s0).toBe(0);
    expect(s1).toBe(0);
  });
});
