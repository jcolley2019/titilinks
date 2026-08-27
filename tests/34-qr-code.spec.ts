// QR.1 — branded page QR code tool (/dashboard/qr).
//
// A dashboard tool that renders an on-brand, scannable QR for the account's
// single public page URL (origin + '/' + handle), with a light/dark style
// toggle, a gold-accent switch, and PNG (canvas) + SVG downloads. The wordmark
// and page handle render beneath the code (the exported card is WYSIWYG).
//
//   1. Tool renders its heading, a QR <canvas>, and the handle — in EN and ES.
//   2. Both download buttons render and are enabled.
//   3. The style toggle and gold-accent switch are interactive.
//   4. The sidebar exposes a link to /dashboard/qr.
//
// Mutation-verified: before QR.1 the /dashboard/qr route did not exist (it fell
// through to the catch-all NotFound — no heading, no canvas, no nav link), so
// every assertion below fails without the implementation.
//
// TOOLS.FIX.1 adds the geometry + decode probes (5–7):
//   5. The on-screen QR is a true square, backed by a square hi-res bitmap.
//   6. The exported PNG decodes to the page URL, with square finder geometry.
//   7. The exported SVG embeds a square QR at export resolution.
//
// Mutation-verified against the shipped bug: QR.1 passed `className` through to
// qrcode.react, whose inline `style={{width: size, height: size}}` beat the
// `w-full`/`h-auto` classes while the class `max-w-[220px]` still capped width —
// so the canvas laid out ~220 x 1024 (a tall "barcode"). Probe 5 fails on that
// build. Probes 6–7 were mutation-checked locally by squashing the export draw
// to a non-square rect, which flips the finder-geometry and width/height
// assertions red.
//
// The page handle is mocked at the REST layer (route-level fulfill, no live
// passthrough — HOUSE.1 flake lesson) so the tool is deterministic regardless
// of the shared test account's current state.

import fs from 'node:fs';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { test, expect, type Page } from '@playwright/test';
import { TEST_HANDLE } from './helpers/auth';

type Lang = 'en' | 'es';

// addInitScript runs before the app boots, so the language hook reads our value
// on first render — deterministic on both the desktop and mobile projects.
const bootLang = (page: Page, lang: Lang) =>
  page.addInitScript((l) => localStorage.setItem('titilinks-language', l), lang);

// Deterministic handle for the page-URL lookup (.from('pages').maybeSingle()).
async function routePagesHandle(page: Page, handle: string) {
  await page.route('**/rest/v1/pages*', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        json: { id: '00000000-0000-0000-0000-000000000001', handle },
      });
    }
    return route.continue();
  });
}

const preview = (page: Page) => page.locator('[data-testid="qr-preview"]');
const h1 = (page: Page) => page.getByRole('heading', { level: 1 });

const CASES = [
  { lang: 'en' as Lang, title: /QR code/i, png: /Download PNG/i, svg: /Download SVG/i },
  { lang: 'es' as Lang, title: /Código QR/i, png: /Descargar PNG/i, svg: /Descargar SVG/i },
];

test.describe('QR.1 — branded page QR tool', () => {
  for (const c of CASES) {
    test(`renders the QR, handle, and enabled downloads in ${c.lang.toUpperCase()}`, async ({ page }) => {
      await bootLang(page, c.lang);
      await routePagesHandle(page, TEST_HANDLE);
      await page.goto('/dashboard/qr');
      await page.waitForLoadState('networkidle');

      // Heading in the active language.
      await expect(h1(page)).toContainText(c.title);

      // QR present (a real <canvas>) with the handle beneath it (WYSIWYG card).
      await expect(preview(page).locator('canvas')).toBeVisible();
      await expect(preview(page)).toContainText(TEST_HANDLE);

      // Both downloads render and are enabled.
      const png = page.getByRole('button', { name: c.png });
      const svg = page.getByRole('button', { name: c.svg });
      await expect(png).toBeVisible();
      await expect(png).toBeEnabled();
      await expect(svg).toBeVisible();
      await expect(svg).toBeEnabled();
    });
  }

  test('style toggle and gold-accent switch are interactive', async ({ page }) => {
    await bootLang(page, 'en');
    await routePagesHandle(page, TEST_HANDLE);
    await page.goto('/dashboard/qr');
    await page.waitForLoadState('networkidle');

    // Dark style selects (radix ToggleGroup items are <button> tags with a
    // non-"button" ARIA role, so target by tag + text rather than by role).
    const dark = page.locator('button', { hasText: 'Dark' });
    await dark.click();
    await expect(dark).toHaveAttribute('data-state', 'on');

    // Gold accent switch flips on.
    const gold = page.locator('#qr-gold');
    await expect(gold).not.toBeChecked();
    await gold.click();
    await expect(gold).toBeChecked();

    // The QR is still present after re-styling.
    await expect(preview(page).locator('canvas')).toBeVisible();
  });

  // --- TOOLS.FIX.1 — geometry + decode probes -----------------------------

  /** Boot the tool with a deterministic handle and wait for the QR to mount. */
  async function openTool(page: Page) {
    await bootLang(page, 'en');
    await routePagesHandle(page, TEST_HANDLE);
    await page.goto('/dashboard/qr');
    await page.waitForLoadState('networkidle');
    await expect(preview(page).locator('canvas')).toBeVisible();
  }

  test('the on-screen QR is a true square', async ({ page }) => {
    await openTool(page);
    const canvas = preview(page).locator('canvas');

    // Laid-out box: the pre-fix build rendered ~220 x 1024 (stretched barcode).
    const box = (await canvas.boundingBox())!;
    expect(box.width).toBeGreaterThan(0);
    expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(1);

    // Backing bitmap: square, and hi-res enough to be the PNG export source.
    const bitmap = await canvas.evaluate((el: HTMLCanvasElement) => ({
      w: el.width,
      h: el.height,
    }));
    expect(bitmap.w).toBe(bitmap.h);
    expect(bitmap.w).toBeGreaterThanOrEqual(1024);
  });

  test('the exported PNG decodes to the page URL', async ({ page }, testInfo) => {
    await openTool(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download PNG/i }).click(),
    ]);
    const file = testInfo.outputPath('qr-export.png');
    await download.saveAs(file);

    const png = PNG.sync.read(fs.readFileSync(file));
    expect(Math.min(png.width, png.height)).toBeGreaterThanOrEqual(1024);

    // Decoding at all proves the three finder patterns survived the export.
    const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(decoded, 'exported PNG must contain a decodable QR').not.toBeNull();
    expect(decoded!.data).toBe(new URL(`/${TEST_HANDLE}`, page.url()).toString());

    // Finder geometry square => the exported code is not stretched either.
    const { topLeftCorner: tl, topRightCorner: tr, bottomLeftCorner: bl } = decoded!.location;
    const w = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const h = Math.hypot(bl.x - tl.x, bl.y - tl.y);
    expect(Math.abs(w - h) / Math.max(w, h)).toBeLessThan(0.02);
  });

  test('the exported SVG embeds a square QR', async ({ page }, testInfo) => {
    await openTool(page);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download SVG/i }).click(),
    ]);
    const file = testInfo.outputPath('qr-export.svg');
    await download.saveAs(file);
    const svg = fs.readFileSync(file, 'utf-8');

    // The nested <svg> holding the code: square at export resolution...
    const inner = svg.match(/<svg x="\d+" y="\d+" width="(\d+)" height="(\d+)" viewBox="([^"]+)"/);
    expect(inner, 'branded SVG must nest the QR at an explicit size').not.toBeNull();
    expect(inner![1]).toBe(inner![2]);
    expect(Number(inner![1])).toBeGreaterThanOrEqual(1024);

    // ...over a square viewBox, so the modules cannot be scaled anisotropically.
    const [, , vbW, vbH] = inner![3].trim().split(/\s+/).map(Number);
    expect(vbW).toBe(vbH);
  });

  test('sidebar links to the QR tool', async ({ page }) => {
    await routePagesHandle(page, TEST_HANDLE);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    // Desktop sidebar renders the link in the DOM on both projects.
    await expect(page.locator('a[href="/dashboard/qr"]').first()).toHaveCount(1);
  });
});
