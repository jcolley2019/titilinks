// TL.SEO.I18N.1 — Spanish marketing pages get their own URLs, hreflang and
// prerender (docs/SEO-AUDIT-2026-09.md finding #6). URL scheme, fixed:
//   /  /templates  /terms  /privacy   ↔   /es  /es/templates  /es/terms  /es/privacy
//
// Part A — the pure builder (src/lib/seo-marketing-html.ts), imported inside a
// page served by the dev server; always green against the working tree. For
// every route the Spanish output carries <html lang="es">, the Spanish title
// straight from translations.es, canonical + og:url on the Spanish path, the
// hreflang trio and og:locale es_LA; the English output carries the same trio
// and its FAQ questions are exactly spec 74's.
//
// Part B — the app honours the URL (dev server, JavaScript on). With no saved
// language and an en-US browser, /es/templates renders Spanish with its own
// canonical and the trio; the navbar toggle swaps to /templates and back with
// client-side navigation (a window marker proves there was no reload), and
// Back from /templates lands on /es/templates in Spanish (LanguageUrlSync).
//
// Part C — the LIVE deployment, fetched with no JavaScript. GREEN ONLY AFTER the
// push has deployed; before that /es is a soft-404 creator lookup and Part C is red.
//
// Writes: none. Desktop only, like specs 73 and 74.

import { test, expect } from './fixtures';

const WWW = 'https://www.titilinks.com';
const BATTERY_HANDLE = 'joey2019pwtestbattery';
const ROUTES = ['/', '/templates', '/terms', '/privacy'] as const;
type Route = (typeof ROUTES)[number];
const TITLE_KEY: Record<Route, string> = {
  '/': 'seo.home.title',
  '/templates': 'seo.templates.title',
  '/terms': 'seo.terms.title',
  '/privacy': 'seo.privacy.title',
};
const enUrl = (r: Route) => `${WWW}${r}`;
const esUrl = (r: Route) => (r === '/' ? `${WWW}/es` : `${WWW}/es${r}`);
// Spec 74's English FAQ, unchanged by the move to dictionary keys.
const EN_FAQ = [
  'What is TitiLinks?',
  'Is TitiLinks free?',
  'How much is Pro?',
  'Is it available in Spanish?',
  'How do I start?',
];
// translations.es hero.title1 + ' ' + hero.title2, for the no-JS live check.
const ES_HOME_H1 = 'Un solo link. Todo lo que eres.';

const FIXTURE_SHELL = [
  '<!doctype html>',
  '<html lang="en" class="dark">',
  '  <head>',
  '    <meta charset="UTF-8" />',
  "    <script>document.documentElement.classList.add('js')</script>",
  '    <style>.js #seo-summary{display:none}</style>',
  '    <title>TitiLinks — Your Entire Brand. One Powerful Link.</title>',
  '    <meta name="description" content="Old." data-rh="true" />',
  '    <link rel="canonical" href="https://titilinks.com/" data-rh="true" />',
  '    <meta property="og:type" content="website" />',
  '    <script type="module" crossorigin src="/assets/index-abc123.js"></script>',
  '  </head>',
  '  <body>',
  '    <div id="root"></div>',
  '  </body>',
  '</html>',
].join('\n');

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
const tagsOf = (html: string, re: RegExp) => html.match(re) ?? [];
const titleOf = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
const canonicalsOf = (html: string) =>
  tagsOf(html, /<link\b[^>]*rel="canonical"[^>]*>/g).map((t) => attr(t, 'href'));
const hreflangOf = (html: string) =>
  Object.fromEntries(
    tagsOf(html, /<link\b[^>]*rel="alternate"[^>]*>/g).map((t) => [attr(t, 'hreflang'), attr(t, 'href')]),
  );
const summaryOf = (html: string) => /<main id="seo-summary"[\s\S]*?<\/main>/.exec(html)?.[0] ?? '';

type Dict = Record<'en' | 'es', Record<string, string>>;

test.describe('TL.SEO.I18N.1 — Part A: the language-aware builder (dev server)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'pure function — one project only');
    await page.goto('/');
  });

  test('1. every route has a Spanish twin with its own lang, title, canonical, hreflang and locale', async ({ page }) => {
    const { built, dict } = await page.evaluate(async (shell) => {
      // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
      const m = await import('/src/lib/seo-marketing-html.ts');
      // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
      const l = await import('/src/hooks/useLanguage.tsx');
      const built: Record<string, string> = {};
      for (const lang of ['en', 'es']) {
        for (const route of ['/', '/templates', '/terms', '/privacy']) {
          const extras = route === '/terms' || route === '/privacy' ? { legalIntro: `Intro ${lang}.` } : undefined;
          built[`${lang} ${route}`] = m.buildMarketingHtml(shell, route, extras, lang);
        }
      }
      return { built, dict: l.translations as Dict };
    }, FIXTURE_SHELL);

    for (const route of ROUTES) {
      const trio = { en: enUrl(route), es: esUrl(route), 'x-default': enUrl(route) };

      const es = built[`es ${route}`];
      expect(es, `es ${route}: <html lang="es">`).toContain('<html lang="es"');
      expect(titleOf(es), `es ${route}: Spanish title`).toBe(dict.es[TITLE_KEY[route]]);
      expect(canonicalsOf(es), `es ${route}: one canonical on the Spanish path`).toEqual([esUrl(route)]);
      const esOgUrl = tagsOf(es, /<meta\b[^>]*property="og:url"[^>]*>/g).map((t) => attr(t, 'content'));
      expect(esOgUrl, `es ${route}: og:url on the Spanish path`).toEqual([esUrl(route)]);
      expect(hreflangOf(es), `es ${route}: the hreflang trio`).toEqual(trio);
      expect(es, `es ${route}: og:locale es_LA`).toContain('<meta property="og:locale" content="es_LA"');

      const en = built[`en ${route}`];
      expect(en, `en ${route}: <html lang="en">`).toContain('<html lang="en"');
      expect(titleOf(en), `en ${route}: English title`).toBe(dict.en[TITLE_KEY[route]]);
      expect(canonicalsOf(en), `en ${route}: one canonical on the English path`).toEqual([enUrl(route)]);
      expect(hreflangOf(en), `en ${route}: the hreflang trio`).toEqual(trio);
      expect(en, `en ${route}: og:locale en_US`).toContain('<meta property="og:locale" content="en_US"');
    }

    // Homepage copy: Spanish h1 from the dictionary, English FAQ unchanged,
    // Spanish summary free of English glue, nav on the Spanish paths.
    const esHome = summaryOf(built['es /']);
    expect(esHome).toContain(`<h1>${dict.es['hero.title1']} ${dict.es['hero.title2']}</h1>`);
    for (const glue of [' or ', 'list price', '/year', 'billed annually']) {
      expect(esHome, `Spanish summary has no English "${glue}"`).not.toContain(glue);
    }
    for (const href of ['/es/templates', '/es/terms', '/es/privacy']) {
      expect(esHome, `Spanish nav links ${href}`).toContain(`<a href="${href}">`);
    }
    const enH3 = tagsOf(summaryOf(built['en /']), /<h3>[^<]*<\/h3>/g).map((h) => h.replace(/<\/?h3>/g, ''));
    expect(enH3, 'English FAQ questions are spec 74\'s').toEqual(EN_FAQ);
    // TL.SEO.I18N.1b — the "how do I start" answer is one dictionary sentence per language.
    expect(esHome, 'Spanish start answer').toContain(`<p>${dict.es['seo.faq.a.start']}</p>`);
    expect(summaryOf(built['en /']), 'English start answer').toContain(`<p>${dict.en['seo.faq.a.start']}</p>`);
  });
});

test.describe('TL.SEO.I18N.1 — Part B: the app honours the URL (dev server)', () => {
  test.use({ storageState: { cookies: [], origins: [] }, locale: 'en-US' });

  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'one navbar toggle to drive — desktop only');
  });

  test('2. /es/templates is Spanish, and the toggle swaps URL and language without a reload', async ({ page }) => {
    await page.goto('/es/templates');
    const dict: Dict = await page.evaluate(async () => {
      // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
      const l = await import('/src/hooks/useLanguage.tsx');
      return l.translations;
    });
    const pathname = () => new URL(page.url()).pathname;
    const htmlLang = () => page.evaluate(() => document.documentElement.lang);
    const canonical = page.locator('link[rel="canonical"]');
    const alt = (lang: string) => page.locator(`link[rel="alternate"][hreflang="${lang}"]`);

    // Spanish from the URL alone: no saved language, en-US browser.
    await expect(page).toHaveTitle(dict.es['seo.templates.title']);
    await expect.poll(htmlLang).toBe('es');
    await expect(canonical).toHaveCount(1);
    await expect(canonical).toHaveAttribute('href', `${WWW}/es/templates`);
    for (const [lang, href] of [['en', `${WWW}/templates`], ['es', `${WWW}/es/templates`], ['x-default', `${WWW}/templates`]]) {
      await expect(alt(lang), `hreflang=${lang}`).toHaveCount(1);
      await expect(alt(lang), `hreflang=${lang}`).toHaveAttribute('href', href);
    }

    // A marker that survives only if the swap is client-side.
    await page.evaluate(() => {
      (window as unknown as { __i18nNoReload?: boolean }).__i18nNoReload = true;
    });
    const marker = () =>
      page.evaluate(() => (window as unknown as { __i18nNoReload?: boolean }).__i18nNoReload === true);

    await page.getByRole('button', { name: 'ES', exact: true }).click();
    await expect.poll(pathname).toBe('/templates');
    await expect(page).toHaveTitle(dict.en['seo.templates.title']);
    await expect.poll(htmlLang).toBe('en');
    await expect(canonical).toHaveAttribute('href', `${WWW}/templates`);
    expect(await marker(), 'EN swap was client-side').toBe(true);

    // TL.SEO.I18N.1b — Back returns to the Spanish URL, and LanguageUrlSync makes
    // the UI follow it (the provider only reads the URL at mount).
    await page.goBack();
    await expect.poll(pathname).toBe('/es/templates');
    await expect.poll(htmlLang).toBe('es');
    await expect(page).toHaveTitle(dict.es['seo.templates.title']);
    expect(await marker(), 'Back was client-side').toBe(true);

    // And the toggle still works from there: to English, then back to Spanish.
    await page.getByRole('button', { name: 'ES', exact: true }).click();
    await expect.poll(pathname).toBe('/templates');
    await expect.poll(htmlLang).toBe('en');

    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect.poll(pathname).toBe('/es/templates');
    await expect(page).toHaveTitle(dict.es['seo.templates.title']);
    await expect.poll(htmlLang).toBe('es');
    await expect(canonical).toHaveAttribute('href', `${WWW}/es/templates`);
    expect(await marker(), 'ES swap was client-side').toBe(true);
  });
});

test.describe('TL.SEO.I18N.1 — Part C: the LIVE deployment (green only after push + deploy)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'live HTTP probe — one project only');
    test.setTimeout(60_000);
  });

  test('3. /es and /es/templates are prerendered Spanish, / links its twin, creator pages untouched', async ({ playwright }) => {
    const crawler = await playwright.request.newContext();
    try {
      const home = await crawler.get(`${WWW}/es`);
      const homeHtml = await home.text();
      expect(home.status(), '/es must be 200').toBe(200);
      expect(homeHtml, '/es: <html lang="es">').toContain('<html lang="es"');
      expect(summaryOf(homeHtml), '/es: Spanish h1').toContain(`<h1>${ES_HOME_H1}</h1>`);
      expect(canonicalsOf(homeHtml), '/es: its own canonical').toEqual([`${WWW}/es`]);

      const tpl = await crawler.get(`${WWW}/es/templates`);
      const tplHtml = await tpl.text();
      expect(tpl.status(), '/es/templates must be 200').toBe(200);
      expect(canonicalsOf(tplHtml), '/es/templates: its own canonical').toEqual([`${WWW}/es/templates`]);

      const root = await crawler.get(`${WWW}/`);
      expect(hreflangOf(await root.text())['es'], '/ links its Spanish twin').toBe(`${WWW}/es`);

      const creator = await crawler.get(`${WWW}/${BATTERY_HANDLE}`);
      expect(await creator.text(), 'creator pages are still ProfilePages').toContain('"@type":"ProfilePage"');
    } finally {
      await crawler.dispose();
    }
  });
});
