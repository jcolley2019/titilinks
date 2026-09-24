// TL.SEO.FONTS.1 — every web font is self-hosted (src/lib/fonts.css, woff2 from
// the Fontsource packages); no page talks to fonts.googleapis.com or
// fonts.gstatic.com any more.
//
//   1. '/' — after document.fonts.ready: no Google Fonts request, Playfair
//      Display 700 and DM Sans are loaded, and at least one .woff2 came from the
//      dev origin. The woff2 files and bytes actually downloaded are logged
//      ([fonts] line) and attached, for the Google-vs-self-hosted comparison.
//   2. '/joey2019pwtestbattery' — no Google Fonts request; the name <h1>'s own
//      font family (read from the DOM, never hard-coded account data) is loaded.
//   3. Screenshots for the visual gate: tests/screenshots/fonts-home-desktop.png,
//      fonts-home-mobile.png (390×844) and fonts-battery-desktop.png.
//
// document.fonts.check() alone is not proof — it is also true for a family with
// no @font-face at all — so each check is paired with a FontFace whose status
// is 'loaded'.
//
// Writes: none (anonymous page views; the profile's view event is the fixture
// write guard's business, as in spec 03). Desktop only.

import { test, expect, type Page } from './fixtures';

const BATTERY_HANDLE = 'joey2019pwtestbattery';
const SHOTS = 'tests/screenshots';
const SELF_HOSTED = [
  'Playfair Display', 'DM Sans', 'Bebas Neue', 'Pacifico', 'Abril Fatface', 'Orbitron',
  'Caveat', 'Archivo Black', 'Lora', 'Patrick Hand', 'Space Grotesk',
];

type FontReq = { url: string; bytes: number };

/** Every request URL, plus each .woff2 response's size, for the life of the page. */
function recordRequests(page: Page) {
  const urls: string[] = [];
  const pending: Promise<FontReq | null>[] = [];
  page.on('request', (r) => urls.push(r.url()));
  page.on('response', (r) => {
    if (!new URL(r.url()).pathname.endsWith('.woff2')) return;
    pending.push(r.body().then((b) => ({ url: r.url(), bytes: b.length })).catch(() => null));
  });
  return {
    urls,
    fonts: async () => (await Promise.all(pending)).filter((x): x is FontReq => x !== null),
  };
}

const isGoogle = (url: string) => /googleapis|gstatic/.test(new URL(url).host);

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

const settle = async (page: Page) => {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Entry animations (framer-motion) settle before a screenshot.
  await page.waitForTimeout(800);
};

test.describe('TL.SEO.FONTS.1 — self-hosted web fonts', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'font loading is engine-independent — one project only');
  });

  test('1. / loads Playfair Display and DM Sans from the app origin, never from Google', async ({ page }) => {
    const rec = recordRequests(page);
    await page.goto('/');
    await settle(page);

    expect(rec.urls.filter(isGoogle), 'no Google Fonts request').toEqual([]);

    const playfair = await fontState(page, 'Playfair Display', "700 1em 'Playfair Display'");
    expect(playfair.check, "document.fonts.check(\"700 1em 'Playfair Display'\")").toBe(true);
    expect(playfair.loaded, 'a Playfair Display face loaded').toBe(true);
    const dmSans = await fontState(page, 'DM Sans', "1em 'DM Sans'");
    expect(dmSans.check, "document.fonts.check(\"1em 'DM Sans'\")").toBe(true);
    expect(dmSans.loaded, 'a DM Sans face loaded').toBe(true);

    const origin = new URL(page.url()).origin;
    const fonts = await rec.fonts();
    expect(fonts.filter((f) => f.url.startsWith(origin)).length, 'a .woff2 from the app origin').toBeGreaterThan(0);

    const total = fonts.reduce((n, f) => n + f.bytes, 0);
    const detail = fonts.map((f) => `${new URL(f.url).pathname.split('/').pop()} ${f.bytes}`).join(', ');
    console.log(`[fonts] / woff2: ${fonts.length} file(s), ${total} bytes — ${detail}`);
    test.info().annotations.push({ type: 'woff2 on /', description: `${fonts.length} files, ${total} bytes: ${detail}` });

    await page.screenshot({ path: `${SHOTS}/fonts-home-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await settle(page);
    await page.screenshot({ path: `${SHOTS}/fonts-home-mobile.png` });
  });

  test('2. the battery profile renders its name in its own font, never from Google', async ({ page }) => {
    const rec = recordRequests(page);
    await page.goto(`/${BATTERY_HANDLE}`);
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible({ timeout: 20_000 });
    await settle(page);

    expect(rec.urls.filter(isGoogle), 'no Google Fonts request').toEqual([]);

    const stack = await h1.evaluate((el) => getComputedStyle(el).fontFamily);
    const family = stack.split(',')[0].trim().replace(/["']/g, '');
    expect(family, `the h1 has a font family (stack: ${stack})`).not.toBe('');
    expect(stack.replace(/["']/g, ''), 'the computed stack starts with that family').toMatch(new RegExp(`^${family}`));

    const state = await fontState(page, family, `1em '${family}'`);
    expect(state.check, `document.fonts.check("1em '${family}'")`).toBe(true);
    if (SELF_HOSTED.includes(family)) {
      expect(state.loaded, `a self-hosted '${family}' face loaded`).toBe(true);
    }
    test.info().annotations.push({ type: 'battery h1 font', description: `${stack} → loaded=${state.loaded}` });

    await page.screenshot({ path: `${SHOTS}/fonts-battery-desktop.png` });
  });
});
