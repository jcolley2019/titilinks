// TP.F3 — the name options in the Name & Handle hub. TP.F4 extends this file.
//
// TP.F3 adds three catalog fonts (src/lib/fonts.ts + src/lib/fonts.css): DM
// Sans, Barlow Condensed and Source Serif 4. Every picker maps FONT_OPTIONS,
// so the hub's Font tab is the surface under test. For each new font:
//   1. its button is listed in the hub Font tab;
//   2. clicking it puts that family first in the computed font-family of the
//      name on the canvas — the unsaved hub font draft (L4) previews there;
//   3. document.fonts holds a FontFace of that family whose status is
//      'loaded', paired with document.fonts.check (spec 76: check() alone is
//      also true for a family with no @font-face at all);
//   4. no request went to fonts.googleapis.com or fonts.gstatic.com.
// The panel then closes without saving and the canvas name goes back to the
// font it had before the hub opened.
//
// The battery account, signed in. Nothing is saved and nothing is opted in:
// the hub only moves a draft until Keep, and Keep is never pressed. Desktop
// and mobile — the canvas name is the visible EditableProfileView's (the
// desktop device frame or the mobile lg:hidden branch; the other is
// display:none, so filter({ visible: true }) picks the right one).

import { test, expect, type Page } from './fixtures';

const NEW_FONTS = [
  { label: 'DM Sans', family: 'DM Sans' },
  { label: 'Barlow Condensed', family: 'Barlow Condensed' },
  { label: 'Source Serif 4', family: 'Source Serif 4' },
] as const;

const isGoogle = (url: string) => /googleapis|gstatic/.test(new URL(url).host);
const firstFamily = (stack: string) => stack.split(',')[0].trim().replace(/["']/g, '');

/** The inline-editable name on the visible canvas (its placeholder is the @handle). */
const canvasName = (page: Page) => page.locator('input[placeholder^="@"]').filter({ visible: true }).first();

/** The slide-in panel (ProfileDashboard). */
const panel = (page: Page) => page.locator('.fixed.top-16');

const nameFont = (page: Page) =>
  canvasName(page).evaluate((el) => {
    const cs = getComputedStyle(el);
    return { stack: cs.fontFamily, weight: cs.fontWeight };
  });

/** document.fonts.check for `spec`, and whether a FontFace of `family` has actually loaded. */
const fontState = (page: Page, family: string, spec: string) =>
  page.evaluate(
    ({ family, spec }) => ({
      check: document.fonts.check(spec),
      loaded: [...document.fonts].some(
        (f) => f.family.replace(/["']/g, '') === family && f.status === 'loaded',
      ),
    }),
    { family, spec },
  );

/** The spec 83 route: Edit Profile → Name & Handle → Font. */
async function openFontTab(page: Page) {
  await page.getByRole('button', { name: 'Edit Profile' }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: /name & handle/i }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Font', exact: true }).click();
}

test.describe('TP.F3 — the three new catalog fonts in the hub Font tab', () => {
  for (const font of NEW_FONTS) {
    test(`${font.label}: listed, previews on the canvas name, loads self-hosted`, async ({ page }) => {
      const urls: string[] = [];
      page.on('request', (r) => urls.push(r.url()));

      await page.goto('/dashboard/editor');
      await page.waitForLoadState('networkidle');
      await expect(canvasName(page)).toBeVisible({ timeout: 20_000 });
      const before = await nameFont(page);

      await openFontTab(page);

      // 1. Listed.
      const button = panel(page).getByRole('button', { name: font.label, exact: true });
      await expect(button).toBeVisible();

      // 2. The draft previews on the canvas name.
      await button.click();
      await expect.poll(async () => firstFamily((await nameFont(page)).stack), {
        message: `the canvas name's font-family starts with '${font.family}'`,
      }).toBe(font.family);

      // 3. A real face of that family loaded (at the name's own weight).
      const { weight } = await nameFont(page);
      const spec = `${weight} 1em '${font.family}'`;
      await expect.poll(async () => (await fontState(page, font.family, spec)).loaded, {
        message: `a '${font.family}' FontFace reached status 'loaded'`,
      }).toBe(true);
      expect((await fontState(page, font.family, spec)).check, `document.fonts.check("${spec}")`).toBe(true);

      // 4. Never from Google.
      expect(urls.filter(isGoogle), 'no Google Fonts request').toEqual([]);

      // Close without saving: the draft dies and the saved font comes back.
      await panel(page).locator(':scope > div').first().getByRole('button').last().click();
      await expect(panel(page)).toHaveCount(0);
      await expect.poll(async () => (await nameFont(page)).stack, {
        message: 'the canvas name is back on its saved font',
      }).toBe(before.stack);
    });
  }
});
