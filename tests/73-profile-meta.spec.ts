// TL.SEO.META.1 — server-side metadata for creator pages (middleware.ts +
// src/lib/seo-profile-html.ts), per docs/SEO-AUDIT-2026-09.md finding #1.
//
// Part A — the pure builders, imported inside a page served by the dev server
// (the module is edge code, not app code, so nothing in the app imports it).
// Always green against the working tree:
//   1. candidateHandle accepts exactly one lowercase handle-shaped segment.
//   2. buildProfileHtml escapes every value, keeps exactly one title and one
//      canonical, drops non-http(s) and 18+-gated links, keeps </script> out of
//      the JSON-LD, puts the summary inside #root, and leaves none of the
//      shell's homepage tags behind (marked OR unmarked share tags).
//   3. buildNotFoundHtml → noindex, 'Page not found' title, no canonical.
//
// Part B — the LIVE middleware on https://www.titilinks.com, fetched with a
// Playwright APIRequestContext (no JavaScript, like a share scraper or an AI
// crawler). GREEN ONLY AFTER middleware.ts is pushed and Vercel has deployed
// it; before that the domain serves the bare SPA shell and Part B is red.
//
// Writes: none. Part A runs pure functions; Part B is read-only HTTP.
// Desktop only, like spec 59: nothing here depends on the browser engine.

import { test, expect } from './fixtures';

const WWW = 'https://www.titilinks.com';
const BATTERY_HANDLE = 'joey2019pwtestbattery';
// HANDLE_PATTERN allows 3–30 characters, so an unknown handle has to be short
// enough to reach the page lookup at all; anything longer is not a candidate.
const UNKNOWN_HANDLE = 'no-such-handle-9x7q';
const HOMEPAGE_TITLE = 'TitiLinks — Your Entire Brand. One Powerful Link.';

// Mimics index.html as built: the data-rh tags Helmet owns, the unmarked
// homepage share tags, and the empty #root.
const HELMET_TAGS = [
  '<meta name="description" content="TitiLinks is the premium biolink platform for creators." data-rh="true" />',
  '<link rel="canonical" href="https://www.titilinks.com/" data-rh="true" />',
  `<meta property="og:title" content="${HOMEPAGE_TITLE}" data-rh="true" />`,
  '<meta property="og:description" content="TitiLinks is the premium biolink platform for creators." data-rh="true" />',
  '<meta property="og:url" content="https://www.titilinks.com/" data-rh="true" />',
];
const UNMARKED_SHARE_TAGS = [
  '<meta property="og:type" content="website" />',
  '<meta property="og:site_name" content="TitiLinks" />',
  '<meta property="og:image" content="https://www.titilinks.com/og-image.png" />',
  '<meta property="og:image:width" content="1200" />',
  '<meta name="twitter:card" content="summary_large_image" />',
  '<meta name="twitter:image" content="https://www.titilinks.com/og-image.png" />',
];
const FIXTURE_SHELL = [
  '<!doctype html>',
  '<html lang="en" class="dark">',
  '  <head>',
  '    <meta charset="UTF-8" />',
  `    <title>${HOMEPAGE_TITLE}</title>`,
  `    ${HELMET_TAGS[0]}`,
  '    <meta name="author" content="TitiLinks" />',
  `    ${HELMET_TAGS[1]}`,
  '    <link rel="icon" type="image/x-icon" href="/favicon.ico" />',
  `    ${HELMET_TAGS[2]}`,
  `    ${HELMET_TAGS[3]}`,
  `    ${UNMARKED_SHARE_TAGS[0]}`,
  `    ${HELMET_TAGS[4]}`,
  ...UNMARKED_SHARE_TAGS.slice(1).map((t) => `    ${t}`),
  '    <meta name="twitter:site" content="@TitiLinks" />',
  '    <script type="module" crossorigin src="/assets/index-abc123.js"></script>',
  '  </head>',
  '  <body>',
  '    <div id="root"></div>',
  '  </body>',
  '</html>',
].join('\n');

type Mod = {
  candidateHandle: (p: string) => string | null;
  buildProfileHtml: (shell: string, p: unknown) => string;
  buildNotFoundHtml: (shell: string, handle: string) => string;
};

const count = (hay: string, re: RegExp) => (hay.match(re) ?? []).length;
const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
const tagsOf = (html: string, re: RegExp) => html.match(re) ?? [];
const jsonLdOf = (html: string) =>
  /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

test.describe('TL.SEO.META.1 — Part A: the pure builders (dev server)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'pure functions — one project only');
    await page.goto('/');
  });

  test('1. candidateHandle takes exactly one handle-shaped segment', async ({ page }) => {
    const cases = ['/joeyc', '/Joey-C/', '/', '/templates', '/dashboard', '/a.b', '/x/y', '/-bad'];
    const got = await page.evaluate(async (paths) => {
      // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
      const m = (await import('/src/lib/seo-profile-html.ts')) as Mod;
      return paths.map((p) => m.candidateHandle(p));
    }, cases);
    expect(Object.fromEntries(cases.map((c, i) => [c, got[i]]))).toEqual({
      '/joeyc': 'joeyc',
      '/Joey-C/': 'joey-c',
      '/': null,
      '/templates': null,
      '/dashboard': null,
      '/a.b': null,
      '/x/y': null,
      '/-bad': null,
    });
  });

  test('2. buildProfileHtml escapes, dedupes and swaps the homepage tags for the creator', async ({ page }) => {
    const { out, dollars } = await page.evaluate(async (shell) => {
      // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
      const m = (await import('/src/lib/seo-profile-html.ts')) as Mod;
      const out = m.buildProfileHtml(shell, {
        handle: 'titi-test',
        displayName: 'Titi <script>',
        bio: 'a & b',
        avatarUrl: 'https://cdn.example.com/titi.png',
        links: [
          { label: 'My site', url: 'https://example.com/me' },
          { label: 'Evil', url: 'javascript:alert(1)' },
          { label: 'My site again', url: 'https://example.com/me' },
          { label: 'Flagged 18+', url: 'https://example.org/private', isAdult: true },
          { label: 'Adult domain', url: 'https://onlyfans.com/titi' },
          { label: 'Other TitiLinks page', url: 'https://www.titilinks.com/friend' },
        ],
      });
      // A replacement string would expand $& and $' — user text must stay literal.
      const dollars = m.buildProfileHtml(shell, {
        handle: 'titi-test', displayName: "$& $' $`", bio: null, avatarUrl: null, links: [],
      });
      return { out, dollars };
    }, FIXTURE_SHELL);

    const canonical = `${WWW}/titi-test`;

    // One title, escaped.
    expect(count(out, /<title\b/g), 'exactly one <title>').toBe(1);
    expect(/<title>([^<]*)<\/title>/.exec(out)?.[1]).toBe('Titi &lt;script&gt; | TitiLinks');

    // One canonical on www + handle; og:url equal to it.
    const canonicals = tagsOf(out, /<link\b[^>]*rel="canonical"[^>]*>/g);
    expect(canonicals, 'exactly one canonical').toHaveLength(1);
    expect(attr(canonicals[0], 'href')).toBe(canonical);
    const ogUrls = tagsOf(out, /<meta\b[^>]*property="og:url"[^>]*>/g);
    expect(ogUrls, 'exactly one og:url').toHaveLength(1);
    expect(attr(ogUrls[0], 'content')).toBe(canonical);

    // The share card is the creator's, not the homepage's.
    const ogImages = tagsOf(out, /<meta\b[^>]*property="og:image"[^>]*>/g);
    expect(ogImages, 'exactly one og:image').toHaveLength(1);
    expect(attr(ogImages[0], 'content')).toBe('https://cdn.example.com/titi.png');
    expect(tagsOf(out, /<meta\b[^>]*property="og:type"[^>]*>/g).map((t) => attr(t, 'content'))).toEqual(['profile']);
    expect(tagsOf(out, /<meta\b[^>]*name="twitter:card"[^>]*>/g).map((t) => attr(t, 'content'))).toEqual(['summary']);
    expect(out, 'twitter:site is not re-declared, so it stays').toContain('<meta name="twitter:site" content="@TitiLinks" />');
    for (const t of [...HELMET_TAGS, ...UNMARKED_SHARE_TAGS]) {
      expect(out, `the shell's ${t} is gone`).not.toContain(t);
    }
    expect(out, 'no homepage title anywhere').not.toContain(HOMEPAGE_TITLE);

    // JSON-LD: no raw '<' (so no </script> injection), and it round-trips.
    const ld = jsonLdOf(out);
    expect(ld, 'JSON-LD escapes < as \\u003c').toContain('\\u003cscript');
    expect(ld, 'JSON-LD carries no raw <script').not.toContain('<script');
    const parsed = JSON.parse(ld);
    expect(parsed['@type']).toBe('ProfilePage');
    expect(parsed.url).toBe(canonical);
    expect(parsed.mainEntity.name).toBe('Titi <script>');
    expect(parsed.mainEntity.description).toBe('a & b');
    expect(parsed.mainEntity.sameAs, 'sameAs = https links off titilinks.com, gated ones never').toEqual([
      'https://example.com/me',
    ]);

    // The summary sits inside #root; links are http(s), deduped and never gated.
    expect(out).toContain('<div id="root"><main id="seo-summary"');
    expect(out).toContain('<h1>Titi &lt;script&gt;</h1>');
    expect(out).toContain('<p>a &amp; b</p>');
    expect(count(out, /<a href="https:\/\/example\.com\/me"/g), 'the https link, once').toBe(1);
    expect(out, 'a titilinks.com link stays in the list').toContain('<a href="https://www.titilinks.com/friend"');
    expect(out, 'no javascript: link anywhere').not.toContain('javascript:');
    expect(out, 'no is_adult-flagged link').not.toContain('example.org/private');
    expect(out, 'no adult-domain link').not.toContain('onlyfans.com');

    // '$&' and friends are literal text, not replacement patterns.
    expect(dollars).toContain("<h1>$&amp; $&#39; $`</h1>");
  });

  test('3. buildNotFoundHtml is noindex, titled "Page not found" and has no canonical', async ({ page }) => {
    const out = await page.evaluate(async (shell) => {
      // @ts-expect-error vite runtime path — served by the dev server, unresolvable by tsc
      const m = (await import('/src/lib/seo-profile-html.ts')) as Mod;
      return m.buildNotFoundHtml(shell, 'no-such-page');
    }, FIXTURE_SHELL);

    expect(out).toContain('<meta name="robots" content="noindex" />');
    expect(count(out, /<title\b/g), 'exactly one <title>').toBe(1);
    expect(/<title>([^<]*)<\/title>/.exec(out)?.[1]).toBe('Page not found | TitiLinks');
    expect(out, 'no canonical on a 404').not.toMatch(/rel="canonical"/);
    for (const t of HELMET_TAGS) expect(out, `the shell's ${t} is gone`).not.toContain(t);
  });
});

test.describe('TL.SEO.META.1 — Part B: the LIVE middleware (green only after push + deploy)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'live HTTP probe — one project only');
    test.setTimeout(60_000);
  });

  test('4. a creator page is served with its own head, JSON-LD and summary — no JavaScript needed', async ({ playwright }) => {
    const crawler = await playwright.request.newContext();
    try {
      const res = await crawler.get(`${WWW}/${BATTERY_HANDLE}`);
      const html = await res.text();
      expect(res.status(), `/${BATTERY_HANDLE} must be 200`).toBe(200);
      expect(res.headers()['content-type'] ?? '').toMatch(/^text\/html/);

      const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
      expect(title, 'the creator title').toMatch(/\| TitiLinks$/);
      expect(title, 'not the homepage title').not.toBe(HOMEPAGE_TITLE);

      const canonicals = tagsOf(html, /<link\b[^>]*rel="canonical"[^>]*>/g);
      expect(canonicals, 'exactly one canonical').toHaveLength(1);
      expect(attr(canonicals[0], 'href')).toBe(`${WWW}/${BATTERY_HANDLE}`);

      expect(html).toContain('application/ld+json');
      expect(html).toContain('"@type":"ProfilePage"');
      expect(html).toContain('id="seo-summary"');
    } finally {
      await crawler.dispose();
    }
  });

  test('5. an unknown handle is a real 404 with noindex', async ({ playwright }) => {
    const crawler = await playwright.request.newContext();
    try {
      const res = await crawler.get(`${WWW}/${UNKNOWN_HANDLE}`);
      expect(res.status(), `/${UNKNOWN_HANDLE} must be 404`).toBe(404);
      expect(await res.text()).toContain('noindex');
    } finally {
      await crawler.dispose();
    }
  });

  test('6. a marketing route is left alone', async ({ playwright }) => {
    const crawler = await playwright.request.newContext();
    try {
      const res = await crawler.get(`${WWW}/templates`);
      expect(res.status()).toBe(200);
      const html = await res.text();
      expect(html, '/templates is not treated as a handle').not.toContain('"@type":"ProfilePage"');
      expect(html, '/templates is the prerendered marketing page').toContain('<link rel="canonical" href="https://www.titilinks.com/templates"');
    } finally {
      await crawler.dispose();
    }
  });
});
