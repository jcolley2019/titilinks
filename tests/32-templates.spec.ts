// TPL.PAGE.1 — Templates gallery of live phone mockups per category.
//
// /templates now renders the SAME hero phone mockups (shared PhoneMockup module)
// grouped under category chips. Each mockup carries a "Start with this style"
// CTA whose href hands a TPL preset id into signup (/login?mode=signup&template=).
//
// TPL.PAGE.2 — all eight categories are populated: four templates-only personas
// (salon/cafe/photographer/minimal) join the hero's seven, and chips derive
// straight from the persona data.
//
//   1. All eight category chips render (chips come from the data — no hidden set).
//   2. All eleven persona mockups render in the default "All" view.
//   3. Every chip filters the gallery client-side to ≥1 mockup of its own
//      personas (spot-checks that other categories drop out).
//   4. Each CTA href carries the persona's preset id (incl. the new
//      reserva/negocio/estudio/minimal personas).
//   5. EN/ES: chip labels + CTA copy follow the site language.
//
// Mutation-verified: the pre-TPL.PAGE.1 page showed hard-coded marketing chips
// (Fashion/Telegram/…), a "Coming Soon" line, NO phone mockups, none of the
// tpl-* testids, and CTAs linked to a bare /login — so every assertion below
// fails against the old page. Against the pre-TPL.PAGE.2 page the
// booking/local_business/media/minimal chips did not render (count 0), the four
// new mockup/CTA testids did not exist, and the "All" view held seven mockups —
// so tests 1–4 fail there too.

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
  // TPL.PAGE.2 — templates-only personas
  salon: 'reserva',
  cafe: 'negocio',
  photographer: 'estudio',
  minimal: 'minimal',
};

// category chip → the persona mockups it must surface
const CATEGORY_PERSONAS: Record<string, string[]> = {
  creator: ['creator', 'travel', 'actriz'],
  booking: ['salon'],
  store: ['business'],
  music: ['dj', 'musician'],
  fitness: ['athlete'],
  local_business: ['cafe'],
  media: ['photographer'],
  minimal: ['minimal'],
};

test.describe('TPL.PAGE.1/2 — Templates gallery', () => {
  test('all eight category chips render from the data', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto('/templates');

    for (const id of ['all', ...Object.keys(CATEGORY_PERSONAS)]) {
      await expect(page.getByTestId(`tpl-chip-${id}`)).toBeVisible();
    }
  });

  test('all eleven persona mockups render in the default view', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto('/templates');
    for (const key of Object.keys(PERSONA_PRESET)) {
      await expect(page.getByTestId(`tpl-mockup-${key}`)).toBeVisible();
    }
  });

  test('every chip filters the gallery to its own personas', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto('/templates');

    for (const [category, keys] of Object.entries(CATEGORY_PERSONAS)) {
      await page.getByTestId(`tpl-chip-${category}`).click();
      for (const key of keys) {
        await expect(page.getByTestId(`tpl-mockup-${key}`)).toBeVisible();
      }
      // A persona from another category drops out of the filtered view.
      const outsider = category === 'fitness' ? 'creator' : 'athlete';
      await expect(page.getByTestId(`tpl-mockup-${outsider}`)).toHaveCount(0);
    }
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
