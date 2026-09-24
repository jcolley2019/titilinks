// TL.SEO.PRERENDER.1 — build-time static HTML for /, /templates, /terms and
// /privacy (scripts/prerender-marketing.ts + src/lib/seo-marketing-html.ts),
// per docs/SEO-AUDIT-2026-09.md finding #2.
//
// Part A — the pure builder, imported inside a page served by the dev server.
// Always green against the working tree. For each route: exactly one <title>
// and one www canonical, og:type website, one og:image, JSON-LD that parses
// with the expected @type(s), the h1, the homepage's $7 / $9 / $15 pricing, and
// every script / modulepreload / stylesheet tag of the shell preserved verbatim
// (the prerendered file must boot the same app).
//
// Part B — the LIVE deployment on https://www.titilinks.com, fetched with a
// Playwright APIRequestContext (no JavaScript, like a share scraper or an AI
// crawler). GREEN ONLY AFTER the push has deployed; before that the marketing
// routes serve the bare shell and Part B is red. It also re-checks what the
// app.html switch could break: SPA routes still get the pristine shell, and a
// creator page still gets middleware.ts's own HTML.
//
// Writes: none. Part A runs a pure function; Part B is read-only HTTP.
// Desktop only, like spec 73: nothing here depends on the browser engine.

import { test, expect } from './fixtures';

const WWW = 'https://www.titilinks.com';
const BATTERY_HANDLE = 'joey2019pwtestbattery';
const SHELL_TITLE = 'TitiLinks — Your Entire Brand. One Powerful Link.';

const H1: Record<string, string> = {
  '/': 'One link. All of you.',
  '/templates': 'Find your perfect template',
  '/terms': 'Terms of Service',
  '/privacy': 'Privacy Policy',
};
const TITLE: Record<string, string> = {
  '/': 'TitiLinks — Link in Bio Page Builder for Creators',
  '/templates': 'Link-in-Bio Templates | TitiLinks',
  '/terms': 'Terms of Service | TitiLinks',
  '/privacy': 'Privacy Policy | TitiLinks',
};

// Mimics dist/index.html as built: the JS-hide script/style, the data-rh tags
// Helmet owns, the unmarked homepage share tags, the asset tags, empty #root.
// The canonical / og:url carry a STALE apex value on purpose: the homepage
// legitimately re-emits the www one, so a www fixture tag could never be "gone".
const HOMEPAGE_TAGS = [
  '<meta name="description" content="TitiLinks is the premium biolink platform." data-rh="true" />',
  '<link rel="canonical" href="https://titilinks.com/" data-rh="true" />',
  `<meta property="og:title" content="${SHELL_TITLE}" data-rh="true" />`,
  '<meta property="og:url" content="https://titilinks.com/" data-rh="true" />',
  '<meta property="og:type" content="website" />',
  '<meta property="og:image" content="https://titilinks.com/old-og.png" />',
  '<meta name="twitter:card" content="summary_large_image" />',
];
const ASSET_TAGS = [
  "<script>document.documentElement.classList.add('js')</script>",
  '<script type="module" crossorigin src="/assets/index-abc123.js"></script>',
  '<link rel="modulepreload" crossorigin href="/assets/vendor-react-def456.js">',
  '<link rel="stylesheet" crossorigin href="/assets/index-ghi789.css">',
];
const FIXTURE_SHELL = [
  '<!doctype html>',
  '<html lang="en" class="dark">',
  '  <head>',
  '    <meta charset="UTF-8" />',
  `    ${ASSET_TAGS[0]}`,
  '    <style>.js #seo-summary{display:none}</style>',
  `    <title>${SHELL_TITLE}</title>`,
  ...HOMEPAGE_TAGS.map((t) => `    ${t}`),
  '    <meta name="twitter:site" content="@TitiLinks" />',
  ...ASSET_TAGS.slice(1).map((t) => `    ${t}`),
  '  </head>',
  '  <body>',
  '    <div id="root"></div>',
  '  </body>',
  '</html>',
].join('\n');
const LEGAL_INTRO = 'Welcome to TitiLinks. These Terms are an agreement between you and TitiLinks.';

type Built = Record<string, string>;

const count = (hay: string, re: RegExp) => (hay.match(re) ?? []).length;
const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
const tagsOf = (html: string, re: RegExp) => html.match(re) ?? [];
const summaryOf = (html: string) => /<main id="seo-summary"[\s\S]*?<\/main>/.exec(html)?.[0] ?? '';
const jsonLdOf = (html: string) =>
  /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
/** Every @type in the JSON-LD, top level or in @graph. */
const ldTypes = (ld: Record<string, unknown>): string[] =>
  Array.isArray(ld['@graph']) ? (ld['@graph'] as { '@type': string }[]).map((n) => n['@type']) : [String(ld['@type'])];

test.describe('TL.SEO.PRERENDER.1 — Part A: the pure builder (dev server)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'pure function — one project only');
    await page.goto('/');
  });

  test('1. every marketing route gets its own head, JSON-LD and summary, and keeps the shell booting', async ({ page }) => {
    const built: Built = await page.evaluate(
      async ({ shell, intro }) => {
        // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
        const m = await import('/src/lib/seo-marketing-html.ts');
        const out: Record<string, string> = {};
        for (const route of ['/', '/templates', '/terms', '/privacy']) {
          out[route] = m.buildMarketingHtml(shell, route, route === '/terms' ? { legalIntro: intro } : undefined);
        }
        return out;
      },
      { shell: FIXTURE_SHELL, intro: LEGAL_INTRO },
    );

    for (const route of ['/', '/templates', '/terms', '/privacy']) {
      const html = built[route];
      const canonical = route === '/' ? `${WWW}/` : `${WWW}${route}`;

      expect(count(html, /<title\b/g), `${route}: exactly one <title>`).toBe(1);
      expect(/<title>([^<]*)<\/title>/.exec(html)?.[1], `${route}: title`).toBe(TITLE[route]);

      const canonicals = tagsOf(html, /<link\b[^>]*rel="canonical"[^>]*>/g);
      expect(canonicals, `${route}: exactly one canonical`).toHaveLength(1);
      expect(attr(canonicals[0], 'href'), `${route}: canonical on www`).toBe(canonical);
      const ogUrls = tagsOf(html, /<meta\b[^>]*property="og:url"[^>]*>/g);
      expect(ogUrls.map((t) => attr(t, 'content')), `${route}: one og:url, the canonical`).toEqual([canonical]);

      const ogTypes = tagsOf(html, /<meta\b[^>]*property="og:type"[^>]*>/g).map((t) => attr(t, 'content'));
      expect(ogTypes, `${route}: og:type website, once`).toEqual(['website']);
      const ogImages = tagsOf(html, /<meta\b[^>]*property="og:image"[^>]*>/g).map((t) => attr(t, 'content'));
      expect(ogImages, `${route}: one og:image on www`).toEqual([`${WWW}/og-image.png`]);
      for (const t of HOMEPAGE_TAGS) expect(html, `${route}: the shell's ${t} is gone`).not.toContain(t);
      expect(html, `${route}: twitter:site is kept`).toContain('<meta name="twitter:site" content="@TitiLinks" />');

      const ld = JSON.parse(jsonLdOf(html));
      const types = ldTypes(ld);
      if (route === '/') {
        expect(types, '/: the @graph entities').toEqual(['Organization', 'WebSite', 'SoftwareApplication', 'FAQPage']);
      } else {
        expect(types, `${route}: a WebPage`).toEqual(['WebPage']);
        expect(ld.url, `${route}: WebPage url`).toBe(canonical);
      }
      expect(jsonLdOf(html), `${route}: no raw < in JSON-LD`).not.toContain('<');

      const summary = summaryOf(html);
      expect(html, `${route}: the summary sits inside #root`).toContain('<div id="root"><main id="seo-summary"');
      expect(summary, `${route}: h1`).toContain(`<h1>${H1[route]}</h1>`);

      for (const t of ASSET_TAGS) expect(html, `${route}: shell tag kept verbatim: ${t}`).toContain(t);
      expect(html, `${route}: the JS-hide rule is kept`).toContain('<style>.js #seo-summary{display:none}</style>');
    }

    // The homepage: real pricing and an FAQ that parses.
    const home = summaryOf(built['/']);
    for (const price of ['$7', '$9', '$15']) expect(home, `homepage summary shows ${price}`).toContain(price);
    const graph = JSON.parse(jsonLdOf(built['/']))['@graph'] as Record<string, unknown>[];
    const app = graph.find((n) => n['@type'] === 'SoftwareApplication') as { offers: { price: string }[] };
    expect(app.offers.map((o) => o.price), 'offers: Free, Pro annual, Pro monthly').toEqual(['0', '7', '9']);
    const faq = graph.find((n) => n['@type'] === 'FAQPage') as { mainEntity: { name: string }[] };
    expect(faq.mainEntity.length, 'FAQ has questions').toBeGreaterThan(0);
    expect(count(home, /<h3>/g), 'every FAQ question is in the summary').toBe(faq.mainEntity.length);

    // Legal: the intro paragraph lands when given, and not when omitted.
    expect(summaryOf(built['/terms']), '/terms carries the intro').toContain(`<p>${LEGAL_INTRO}</p>`);
    expect(summaryOf(built['/privacy']), '/privacy got no intro').not.toContain(LEGAL_INTRO);
  });
});

test.describe('TL.SEO.PRERENDER.1 — Part B: the LIVE deployment (green only after push + deploy)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'live HTTP probe — one project only');
    test.setTimeout(60_000);
  });

  test('2. the four marketing routes are prerendered — no JavaScript needed', async ({ playwright }) => {
    const crawler = await playwright.request.newContext();
    try {
      for (const route of ['/', '/templates', '/terms', '/privacy']) {
        const res = await crawler.get(`${WWW}${route}`);
        const html = await res.text();
        expect(res.status(), `${route} must be 200`).toBe(200);
        expect(html, `${route}: summary`).toContain('<main id="seo-summary"');
        expect(summaryOf(html), `${route}: h1`).toContain(`<h1>${H1[route]}</h1>`);
        expect(html, `${route}: JSON-LD`).toContain('application/ld+json');
        expect(/<title>([^<]*)<\/title>/.exec(html)?.[1], `${route}: title`).toBe(TITLE[route]);
      }
    } finally {
      await crawler.dispose();
    }
  });

  test('3. SPA routes still get the pristine shell, and creator pages still get the middleware', async ({ playwright }) => {
    const crawler = await playwright.request.newContext();
    try {
      const spa = await crawler.get(`${WWW}/dashboard/editor`);
      const spaHtml = await spa.text();
      expect(spa.status(), '/dashboard/editor must be 200').toBe(200);
      expect(spaHtml, '/dashboard/editor: no summary').not.toContain('id="seo-summary"');
      expect(/<title>([^<]*)<\/title>/.exec(spaHtml)?.[1], '/dashboard/editor: the shell title').toBe(SHELL_TITLE);

      const shell = await crawler.get(`${WWW}/app.html`);
      const shellHtml = await shell.text();
      expect(shell.status(), '/app.html must be 200').toBe(200);
      expect(/<title>([^<]*)<\/title>/.exec(shellHtml)?.[1], '/app.html: the shell title').toBe(SHELL_TITLE);
      expect(shellHtml, '/app.html: #root is empty').toContain('<div id="root"></div>');

      // Middleware regression after the index.html → app.html switch. The
      // display name is stored account data (spec traps memo), so the title is
      // checked by shape, not by name.
      const creator = await crawler.get(`${WWW}/${BATTERY_HANDLE}`);
      const creatorHtml = await creator.text();
      expect(creator.status(), `/${BATTERY_HANDLE} must be 200`).toBe(200);
      const title = /<title>([^<]*)<\/title>/.exec(creatorHtml)?.[1] ?? '';
      expect(title, 'the creator title').toMatch(/\| TitiLinks$/);
      expect(title, 'not the shell title').not.toBe(SHELL_TITLE);
      expect(title, 'not the homepage prerender title').not.toBe(TITLE['/']);
      expect(creatorHtml, 'the creator summary').toContain('id="seo-summary"');
      expect(creatorHtml, 'a ProfilePage, not a marketing page').toContain('"@type":"ProfilePage"');
    } finally {
      await crawler.dispose();
    }
  });
});
