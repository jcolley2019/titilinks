// TL.SEO.HYG.1 — SEO hygiene, per docs/SEO-AUDIT-2026-09.md:
//   #2 (per-route half) the four marketing routes carry their own <Helmet>
//      title, description, canonical and og:title/og:description/og:url;
//   #3 canonical host is https://www.titilinks.com (Vercel redirects the apex);
//   #4 private routes are Disallowed in robots.txt, in the * group AND in
//      every AI group (a crawler obeys only the most specific group naming
//      it), and served with X-Robots-Tag: noindex from vercel.json. /s/ short
//      links are NOT Disallowed, so Google can fetch them and see that header;
//   #5 llms.txt ships with www URLs, and robots names the AI crawlers;
//   #7 the profile OG fallback no longer points at titilinks.lovable.app.
//
//   1. '/', '/templates', '/terms', '/privacy' → EN title, exactly ONE
//      canonical on the www URL for that route, exactly one non-empty
//      description (Helmet must REPLACE index.html's static tags, not sit
//      beside them — two canonicals is worse than none). index.html marks
//      its canonical, description, og:title, og:description and og:url with
//      data-rh="true", Helmet's ownership marker, which is what lets it
//      replace them; without the marker every route carried two canonicals
//      and a creator page's first one pointed at the homepage.
//   2. /joey2019pwtestbattery (the battery's own page) → canonical and og:url
//      are the www URL; no meta content mentions lovable.app.
//   3. Node-side: every robots group (* and the five AI bots) Disallows the
//      private routes and none Disallows /s/; llms.txt on www; vercel.json
//      noindex header ordered before the catch-all.
//
// Runs logged out (a crawler has no session) with the language pinned to EN
// through the same localStorage key spec 31 uses. Desktop only, like spec 59:
// head tags are engine-independent, so mobile reports skipped by design.
//
// Writes: none. Page visits only; the public profile's view event is the
// fixture write guard's business, exactly as in spec 03.

import fs from 'fs';
import path from 'path';
import { test, expect, type Page } from './fixtures';

const WWW = 'https://www.titilinks.com';
const BATTERY_HANDLE = 'joey2019pwtestbattery';

const ROUTES = [
  { path: '/', title: 'TitiLinks — Link in Bio Page Builder for Creators', canonical: `${WWW}/` },
  { path: '/templates', title: 'Link-in-Bio Templates | TitiLinks', canonical: `${WWW}/templates` },
  { path: '/terms', title: 'Terms of Service | TitiLinks', canonical: `${WWW}/terms` },
  { path: '/privacy', title: 'Privacy Policy | TitiLinks', canonical: `${WWW}/privacy` },
];

const bootEnglish = (page: Page) =>
  page.addInitScript(() => localStorage.setItem('titilinks-language', 'en'));

const readRepoFile = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8');

/**
 * robots.txt rules keyed by user-agent. A crawler obeys ONLY the most specific
 * group naming it, so each AI group must carry its own Disallows. Stacked
 * User-agent lines share one group; a User-agent line after a rule opens a new
 * group; blank, comment and Sitemap lines carry no group rules.
 */
function robotsGroups(text: string): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  let agents: string[] = [];
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const ua = line.match(/^User-agent:\s*(.+)$/i);
    if (ua) {
      if (!lastWasAgent) agents = [];
      agents.push(ua[1]);
      if (!groups.has(ua[1])) groups.set(ua[1], []);
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (/^Sitemap:/i.test(line)) continue;
    for (const a of agents) groups.get(a)!.push(line);
  }
  return groups;
}

test.describe('TL.SEO.HYG.1 — SEO hygiene', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(() => {
    test.skip(
      test.info().project.name !== 'desktop',
      'head tags are engine-independent — one project only',
    );
  });

  test('1. each marketing route carries its own title, one www canonical and one description', async ({ page }) => {
    await bootEnglish(page);
    for (const r of ROUTES) {
      await page.goto(r.path);
      await expect(page, `${r.path} title`).toHaveTitle(r.title);

      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical, `${r.path} carries exactly one canonical`).toHaveCount(1);
      await expect(canonical, `${r.path} canonical`).toHaveAttribute('href', r.canonical);

      const description = page.locator('meta[name="description"]');
      await expect(description, `${r.path} carries exactly one description`).toHaveCount(1);
      const content = (await description.getAttribute('content')) ?? '';
      expect(content.trim().length, `${r.path} description is non-empty`).toBeGreaterThan(0);
    }
  });

  test('2. the battery profile canonicalises to its www URL, with no lovable.app leftovers', async ({ page }) => {
    await bootEnglish(page);
    await page.goto(`/${BATTERY_HANDLE}`);
    const url = `${WWW}/${BATTERY_HANDLE}`;

    // The shell's static canonical is "/" until the profile loads and its
    // Helmet commits — wait for the profile URL first, then pin the count.
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical, 'profile canonical').toHaveAttribute('href', url, { timeout: 20_000 });
    await expect(canonical, 'profile carries exactly one canonical').toHaveCount(1);

    const ogUrl = page.locator('meta[property="og:url"]');
    await expect(ogUrl, 'profile carries exactly one og:url').toHaveCount(1);
    await expect(ogUrl, 'profile og:url').toHaveAttribute('content', url);

    const contents = await page.locator('meta[content]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('content') ?? ''),
    );
    expect(contents.filter((c) => c.includes('lovable.app')), 'no meta points at lovable.app').toEqual([]);
  });

  test('3. robots.txt, llms.txt and vercel.json carry the hygiene rules', () => {
    const robots = readRepoFile('public/robots.txt');
    const groups = robotsGroups(robots);
    const PRIVATE = ['/go/', '/dashboard', '/login', '/onboarding', '/billing'];
    for (const agent of ['*', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended']) {
      const rules = groups.get(agent) ?? [];
      expect(rules, `robots has a group for ${agent}`).toContain('Allow: /');
      for (const p of PRIVATE) {
        expect(rules, `the ${agent} group Disallows ${p}`).toContain(`Disallow: ${p}`);
      }
    }
    // Short links stay crawlable, or Google never sees their X-Robots-Tag noindex.
    expect(robots, 'no group Disallows /s/').not.toMatch(/^Disallow: \/s\//m);
    expect(robots.trim().split(/\r?\n/).pop(), 'the Sitemap line is last').toBe(
      'Sitemap: https://www.titilinks.com/sitemap.xml',
    );

    const llms = readRepoFile('public/llms.txt');
    expect(llms, 'llms.txt has no apex URL').not.toContain('https://titilinks.com');
    expect(llms, 'llms.txt names the www host').toContain('www.titilinks.com');

    const vercel = JSON.parse(readRepoFile('vercel.json')) as {
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    const sources = vercel.headers.map((h) => h.source);
    const dash = vercel.headers.find((h) => h.source === '/dashboard/:path*');
    expect(dash, 'vercel.json has a /dashboard/:path* headers entry').toBeTruthy();
    expect(
      dash!.headers.some((h) => h.key === 'X-Robots-Tag' && /noindex/.test(h.value)),
      '/dashboard/:path* carries X-Robots-Tag noindex',
    ).toBe(true);
    expect(sources.indexOf('/sitemap.xml'), 'the /sitemap.xml entry exists').toBeGreaterThanOrEqual(0);
    expect(
      sources.indexOf('/sitemap.xml') < sources.indexOf('/(.*)'),
      'the /sitemap.xml entry still precedes /(.*)',
    ).toBe(true);
  });
});
