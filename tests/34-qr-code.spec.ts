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
// The page handle is mocked at the REST layer (route-level fulfill, no live
// passthrough — HOUSE.1 flake lesson) so the tool is deterministic regardless
// of the shared test account's current state.

import { test, expect, type Page } from '@playwright/test';

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
      await routePagesHandle(page, 'joeyc');
      await page.goto('/dashboard/qr');
      await page.waitForLoadState('networkidle');

      // Heading in the active language.
      await expect(h1(page)).toContainText(c.title);

      // QR present (a real <canvas>) with the handle beneath it (WYSIWYG card).
      await expect(preview(page).locator('canvas')).toBeVisible();
      await expect(preview(page)).toContainText('joeyc');

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
    await routePagesHandle(page, 'joeyc');
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

  test('sidebar links to the QR tool', async ({ page }) => {
    await routePagesHandle(page, 'joeyc');
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    // Desktop sidebar renders the link in the DOM on both projects.
    await expect(page.locator('a[href="/dashboard/qr"]').first()).toHaveCount(1);
  });
});
