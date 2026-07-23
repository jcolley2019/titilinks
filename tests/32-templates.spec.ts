// TPL.PAGE.1 — Templates gallery of live phone mockups per category.
//
// /templates now renders the SAME hero phone mockups (shared PhoneMockup module)
// grouped under category chips. Each mockup carries a "Start with this style"
// CTA whose href hands a TPL preset id into signup (/login?mode=signup&template=).
//
//   1. Chips render for populated categories only (creator/music/fitness/store);
//      the four preset-only categories (booking/local_business/media/minimal)
//      have no persona and get NO chip.
//   2. All seven persona mockups render in the default "All" view.
//   3. A chip filters the gallery client-side (fitness → only the athlete mockup).
//   4. Each CTA href carries the persona's preset id.
//   5. EN/ES: chip labels + CTA copy follow the site language.
//
// Mutation-verified: the pre-TPL.PAGE.1 page showed hard-coded marketing chips
// (Fashion/Telegram/…), a "Coming Soon" line, NO phone mockups, none of the
// tpl-* testids, and CTAs linked to a bare /login — so every assertion below
// fails against the old page.

import { test, expect, type Page } from '@playwright/test';

type Lang = 'en' | 'es';

const bootLang = (page: Page, lang: Lang) =>
  page.addInitScript((l) => localStorage.setItem('titilinks-language', l), lang);

// persona key → the preset id its CTA must carry
const PERSONA_PRESET: Record<string, string> = {
  creator: 'actriz',
  travel: 'actriz',
  actriz: 'actriz',
  dj: 'musica',
  musician: 'musica',
  athlete: 'entrena',
  business: 'tienda',
};

test.describe('TPL.PAGE.1 — Templates gallery', () => {
  test('only populated category chips render (hidden ones absent)', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto('/templates');

    for (const id of ['all', 'creator', 'music', 'fitness', 'store']) {
      await expect(page.getByTestId(`tpl-chip-${id}`)).toBeVisible();
    }
    // No persona → no chip.
    for (const id of ['booking', 'local_business', 'media', 'minimal']) {
      await expect(page.getByTestId(`tpl-chip-${id}`)).toHaveCount(0);
    }
  });

  test('all seven persona mockups render in the default view', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto('/templates');
    for (const key of Object.keys(PERSONA_PRESET)) {
      await expect(page.getByTestId(`tpl-mockup-${key}`)).toBeVisible();
    }
  });

  test('a chip filters the gallery (fitness → only the athlete mockup)', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto('/templates');

    await page.getByTestId('tpl-chip-fitness').click();
    await expect(page.getByTestId('tpl-mockup-athlete')).toBeVisible();
    // Creator personas drop out of the filtered view.
    await expect(page.getByTestId('tpl-mockup-creator')).toHaveCount(0);
    await expect(page.getByTestId('tpl-mockup-business')).toHaveCount(0);

    // Creator chip surfaces its three personas and hides the athlete.
    await page.getByTestId('tpl-chip-creator').click();
    await expect(page.getByTestId('tpl-mockup-creator')).toBeVisible();
    await expect(page.getByTestId('tpl-mockup-travel')).toBeVisible();
    await expect(page.getByTestId('tpl-mockup-actriz')).toBeVisible();
    await expect(page.getByTestId('tpl-mockup-athlete')).toHaveCount(0);
  });

  test('every CTA href carries the persona preset id', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto('/templates');
    for (const [key, preset] of Object.entries(PERSONA_PRESET)) {
      const link = page.locator(`a[href="/login?mode=signup&template=${preset}"]`, {
        has: page.getByTestId(`tpl-start-${key}`),
      });
      await expect(link).toHaveCount(1);
    }
  });

  test('chip labels + CTA copy follow the language (EN)', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto('/templates');
    await expect(page.getByTestId('tpl-chip-all')).toContainText('All');
    await expect(page.getByTestId('tpl-chip-creator')).toContainText('Creator');
    await expect(page.getByTestId('tpl-start-athlete')).toContainText('Start with this style');
  });

  test('chip labels + CTA copy follow the language (ES)', async ({ page }) => {
    await bootLang(page, 'es');
    await page.goto('/templates');
    await expect(page.getByTestId('tpl-chip-all')).toContainText('Todas');
    await expect(page.getByTestId('tpl-chip-creator')).toContainText('Creador');
    await expect(page.getByTestId('tpl-start-athlete')).toContainText('Empieza con este estilo');
  });
});
