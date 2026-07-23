// LEGAL.2 — Terms of Service + Privacy Policy pages (EN/ES) + footer links.
//
// The docs live in src/content/legal/*.md, imported raw and rendered by
// react-markdown on the /terms and /privacy routes. Language follows the site
// toggle (titilinks-language in localStorage), so an ES session renders the
// Spanish doc, and flipping the navbar toggle re-renders live without a nav.
//
//   1. /terms and /privacy render an <h1> in EN and in ES.
//   2. The effective date placeholder is replaced (July 22, 2026 / 22 de julio).
//   3. Bare support@titilinks.com renders as a mailto: anchor (remark-gfm).
//   4. The landing footer's Terms / Privacy links navigate to the pages.
//   5. The language toggle switches the rendered doc live (no reload).
//
// Mutation-verified: pre-fix the routes did not exist (catch-all NotFound, no
// h1), the footer had no Terms/Privacy links, and the md still held
// [LAUNCH DATE] — so every assertion below fails without the implementation.

import { test, expect, type Page } from '@playwright/test';

type Lang = 'en' | 'es';

// addInitScript runs before the app boots, so the language hook reads our value
// on first render — a deterministic way to load a given language on both the
// desktop and mobile projects.
const bootLang = (page: Page, lang: Lang) =>
  page.addInitScript((l) => localStorage.setItem('titilinks-language', l), lang);

const h1 = (page: Page) => page.getByRole('heading', { level: 1 });

const CASES = [
  { path: '/terms', lang: 'en' as Lang, heading: /Terms of Service/i, date: 'July 22, 2026' },
  { path: '/terms', lang: 'es' as Lang, heading: /Términos de Servicio/i, date: '22 de julio de 2026' },
  { path: '/privacy', lang: 'en' as Lang, heading: /Privacy Policy/i, date: 'July 22, 2026' },
  { path: '/privacy', lang: 'es' as Lang, heading: /Política de Privacidad/i, date: '22 de julio de 2026' },
];

test.describe('LEGAL.2 — legal pages render in both languages', () => {
  for (const c of CASES) {
    test(`${c.path} renders its ${c.lang.toUpperCase()} heading + effective date`, async ({ page }) => {
      await bootLang(page, c.lang);
      await page.goto(c.path);

      await expect(h1(page)).toBeVisible();
      await expect(h1(page)).toContainText(c.heading);
      // Placeholder was replaced with the launch date, and the doc rendered it.
      await expect(page.getByText(c.date, { exact: false }).first()).toBeVisible();
    });
  }

  test('support email renders as a mailto: anchor', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto('/terms');
    const mailto = page.locator('a[href^="mailto:"]').first();
    await expect(mailto).toHaveAttribute('href', /support@titilinks\.com/);
  });
});

test.describe('LEGAL.2 — landing footer links navigate', () => {
  test('Terms of Service link → /terms', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto('/');
    await page.getByRole('link', { name: 'Terms of Service' }).first().click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(h1(page)).toContainText(/Terms of Service/i);
  });

  test('Privacy Policy link → /privacy', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto('/');
    await page.getByRole('link', { name: 'Privacy Policy' }).first().click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(h1(page)).toContainText(/Privacy Policy/i);
  });
});

test.describe('LEGAL.2 — language toggle switches the doc live', () => {
  test('/terms flips EN → ES via the navbar toggle', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto('/terms');
    await expect(h1(page)).toContainText(/Terms of Service/i);

    // The one visible LanguageToggle for this viewport (navbar renders a
    // desktop + a mobile instance, each hidden on the other project).
    await page.locator('button:visible', { hasText: 'EN' }).click();

    await expect(h1(page)).toContainText(/Términos de Servicio/i);
  });
});

// ─── LEGAL.3 — in-app legal links + back control ────────────────────────────

test.describe('LEGAL.3 — back control on legal pages', () => {
  const backBtn = (page: Page) => page.getByRole('button', { name: /back/i });

  test('back returns to the previous in-app page', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto('/');
    await page.getByRole('link', { name: 'Terms of Service' }).first().click();
    await expect(page).toHaveURL(/\/terms$/);

    await expect(backBtn(page)).toBeVisible();
    await backBtn(page).click();
    // Back to the landing page we came from.
    await expect(page).toHaveURL(/8080\/$/);
  });

  test('back falls back to / on a direct visit', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto('/privacy'); // fresh load → location.key === 'default'
    await expect(backBtn(page)).toBeVisible();
    await backBtn(page).click();
    await expect(page).toHaveURL(/8080\/$/);
  });
});

test.describe('LEGAL.3 — logged-in dashboard exposes legal links', () => {
  // The dashboard had no legal links before LEGAL.3, so a visible in-app link
  // that navigates is mutation-verified. On desktop the first match is the
  // sidebar row; on mobile it is the Settings-page-bottom row (sidebar hidden).
  test('a visible Terms link navigates to /terms', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto('/dashboard/settings');
    const terms = page.locator('a:visible', { hasText: 'Terms of Service' }).first();
    await expect(terms).toBeVisible();
    await terms.click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(h1(page)).toContainText(/Terms of Service/i);
  });

  test('a visible Privacy link navigates to /privacy', async ({ page }) => {
    await bootLang(page, 'en');
    await page.goto('/dashboard/settings');
    const privacy = page.locator('a:visible', { hasText: 'Privacy Policy' }).first();
    await expect(privacy).toBeVisible();
    await privacy.click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(h1(page)).toContainText(/Privacy Policy/i);
  });

  test('the sidebar itself carries both legal links', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'sidebar is behind the menu on mobile');
    await bootLang(page, 'en');
    await page.goto('/dashboard/settings');
    const aside = page.locator('aside');
    await expect(aside.getByRole('link', { name: 'Terms of Service' })).toBeVisible();
    await expect(aside.getByRole('link', { name: 'Privacy Policy' })).toBeVisible();
  });
});
