import { test, expect, type Page } from './fixtures';
import { TEST_HANDLE } from './helpers/auth';

test.describe('Public Profile', () => {
  test('profile page loads on mobile', async ({ page }) => {
    // Uses the test account handle
    await page.goto(`/${TEST_HANDLE}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: 'tests/screenshots/mobile-public-profile.png',
      fullPage: true
    });
  });

  test('no duplicate social icons', async ({ page }) => {
    await page.goto(`/${TEST_HANDLE}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    // Count TikTok icons — should be 1 not 2
    const tiktokIcons = await page.locator('text=TikTok').count();
    expect(tiktokIcons).toBeLessThanOrEqual(1);
  });
});

// TL.POLISH.1a — hero name legibility. The public name/handle carry NO text
// shadow by design; a scrim switches on only when the hero band behind them
// samples light (src/lib/hero-luminance.ts). Both visits are ANONYMOUS (empty
// storageState — the fixture deny layer still rides the context) and READ
// ONLY: nothing on either account is written.
test.describe('TL.POLISH.1a — conditional name scrim', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('/mecivietnam (white logo hero) → scrim ON, h1 text-shadow set', async ({ page }) => {
    await page.goto('/mecivietnam');
    await page.waitForLoadState('networkidle');
    const wrap = page.locator('[data-name-scrim]').first();
    await expect(wrap).toHaveAttribute('data-name-scrim', 'on', { timeout: 15_000 });
    const shadow = await wrap.locator('h1').evaluate((el) => getComputedStyle(el).textShadow);
    expect(shadow).not.toBe('none');
  });

  test(`/${TEST_HANDLE} (light-banded hero) → scrim ON, recorded`, async ({ page }) => {
    // RECORDED, not presumed: the battery hero was expected to be dark, but
    // the name band (bottom 35%, middle 60%) sampled at lum ≈ 0.67 on
    // 2026-09-02 — over the 0.55 threshold — so this page scrims too. The
    // "off" case is /joeyc (lum ≈ 0.18, screenshot only, no spec). If the
    // battery hero is ever re-seeded darker, flip this to 'off'.
    await page.goto(`/${TEST_HANDLE}`);
    await page.waitForLoadState('networkidle');
    const wrap = page.locator('[data-name-scrim]').first();
    await expect(wrap).toHaveAttribute('data-name-scrim', 'on', { timeout: 15_000 });
    const shadow = await wrap.locator('h1').evaluate((el) => getComputedStyle(el).textShadow);
    expect(shadow).not.toBe('none');
  });
});

// TL.POLISH.1b — auto-Fit for logo-like heroes. A page that NEVER chose a
// display mode (no `fit` in its raw theme_json hero slot) renders Fit when the
// hero samples logo-like (src/lib/logo-detect.ts: 2 of {≤96 colours, ≥0.5 flat
// border, near-square}). An explicit fit — 'fill' included — always wins. All
// three visits are ANONYMOUS and READ ONLY: render-time only, nothing written.
test.describe('TL.POLISH.1b — auto-Fit for logo-like heroes', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const expectHero = async (
    page: Page,
    handle: string,
    autofit: 'on' | 'off',
    fit: 'fit' | 'fill',
  ) => {
    await page.goto(`/${handle}`);
    await page.waitForLoadState('networkidle');
    const hero = page.locator('[data-testid="hero-sticky"]').first();
    await expect(hero).toHaveAttribute('data-hero-autofit', autofit, { timeout: 15_000 });
    // The resolved framing string is "scale;posX;posY;fit;box" — pin the mode.
    // Page-wide, not scoped to the sticky hero: /joeyc is a full_bleed page,
    // whose framed <img> is the background layer (fit pinned to 'fill' there).
    await expect(page.locator('[data-hero-framing]').first()).toHaveAttribute(
      'data-hero-framing', new RegExp(`;${fit};`), { timeout: 15_000 },
    );
  };

  test('/mecivietnam (140 px logo, no heroConfig) → autofit ON, renders ;fit;', async ({ page }) => {
    await expectHero(page, 'mecivietnam', 'on', 'fit');
  });

  test('/joeyc (photo, explicit fit:fill) → autofit OFF, renders ;fill;', async ({ page }) => {
    await expectHero(page, 'joeyc', 'off', 'fill');
  });

  test(`/${TEST_HANDLE} (photo, no heroConfig) → autofit OFF, renders ;fill;`, async ({ page }) => {
    await expectHero(page, TEST_HANDLE, 'off', 'fill');
  });
});

// TL.POLISH.1d — a label that IS a URL renders as a clean name. All six of
// mecivietnam's links were saved on 2026-08-19 with the address in the Title
// field (recon 1d.0), so the public page showed
// "https://www.pinterest.com/pin/1084945366506614118/" across a button. The
// rule lives in src/lib/link-label.ts and is applied at RENDER, so those rows
// read correctly on sight with no write to them. Both visits are ANONYMOUS
// (empty storageState) and READ ONLY. Viewport pinned to 390 so both projects
// measure the same phone-width page.
test.describe('TL.POLISH.1d — bare-URL labels render as a clean name', () => {
  test.use({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 390, height: 844 },
  });

  const buttonTitles = async (page: Page) =>
    (await page.locator('.lb-title').allInnerTexts()).map((s) => s.trim()).filter(Boolean);

  test('/mecivietnam — both Pinterest buttons read "pinterest.com"', async ({ page }) => {
    await page.goto('/mecivietnam');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.lb-title').first()).toBeVisible({ timeout: 15_000 });

    const shown = await buttonTitles(page);
    // The two pins (…614118 and …614334) collapse to one hostname each.
    expect(shown.filter((s) => s === 'pinterest.com'), 'two Pinterest buttons').toHaveLength(2);
    // The other four rows are hostnames too — no label is an address.
    expect(shown.filter((s) => /^https?:\/\//i.test(s)), 'no label is a raw URL').toEqual([]);
    expect(shown, 'the website and plurk rows resolve too')
      .toEqual(expect.arrayContaining(['mecivietnam.com', 'plurk.com']));

    await page.screenshot({ path: 'tests/screenshots/polish1d-mecivietnam.png', fullPage: true });
  });

  test(`/${TEST_HANDLE} — ordinary titles are untouched`, async ({ page }) => {
    await page.goto(`/${TEST_HANDLE}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.lb-title').first()).toBeVisible({ timeout: 15_000 });

    // Recorded from the live rows on 2026-09-03, before the change. None is
    // URL-shaped, so every one must survive verbatim. (Playwright runs en-US,
    // so content-i18n leaves these English seeds alone.)
    const shown = await buttonTitles(page);
    for (const label of ['My Website', 'Latest Blog Post', 'Work With Me']) {
      expect(shown, `battery label "${label}" unchanged`).toContain(label);
    }
    expect(shown.filter((s) => /^https?:\/\//i.test(s)), 'no battery label is a raw URL').toEqual([]);
  });
});
