// SEO.TITILINKS.BLOG.1 — the first blog post, /es/blog/link-en-bio-para-creadores
// (content/blog/es/link-en-bio-para-creadores.md), and the template around it.
//
// Part A — the React page on the dev server, as a reader with JavaScript sees
// it: Spanish title / h1 / <html lang>, its own canonical, the no-twin hreflang
// shape (es + x-default, both itself), the visible FAQ, and the two money-page
// links the template injects — anchor text exactly "Crear mi link en bio"
// (docs/SEO.md), the first inside the first third of the body. /es/blog lists
// the post. No horizontal overflow at either project's width.
//
// Part B — the LIVE deployment with no JavaScript (a crawler's view): the same
// head, both links in the prerendered HTML, Article + FAQPage JSON-LD, the
// index listing it, and the sitemap function listing /blog, /es/blog and the
// post with matching alternates. GREEN ONLY AFTER the push has deployed and the
// sitemap function has been redeployed.
//
// Writes: none. Signed out on purpose — the blog is a public page.

import fs from 'fs';
import path from 'path';
import { test, expect } from './fixtures';

const WWW = 'https://www.titilinks.com';
const POST = '/es/blog/link-en-bio-para-creadores';
const TITLE = 'Link en bio para creadores: cómo crear uno gratis';
const CTA = 'Crear mi link en bio';
const SIGNUP = '/es/registro';
const SELF = `${WWW}${POST}`;
const SOLO_HREFLANG = [`es ${SELF}`, `x-default ${SELF}`];

/** VITE_SUPABASE_URL from process.env, .env.test or .env — same parser as spec 71. */
function viteEnv(name: string): string {
  if (process.env[name]) return process.env[name]!;
  for (const file of ['.env.test', '.env']) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[1] === name) return m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  throw new Error(`${name} not found in process.env, .env.test or .env`);
}

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
const hreflangOf = (html: string) =>
  (html.match(/<link\b[^>]*rel="alternate"[^>]*hreflang=[^>]*>/g) ?? []).map((t) => `${attr(t, 'hreflang')} ${attr(t, 'href')}`);

test.describe('SEO.TITILINKS.BLOG.1 — Part A: the post page with JavaScript (dev server)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('1. the post renders in Spanish with its own head, the FAQ and both money-page links', async ({ page }) => {
    await page.goto(POST);
    await expect(page.locator('h1')).toHaveText(TITLE);
    await expect(page).toHaveTitle(TITLE);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', SELF);
    const alts = await page
      .locator('link[rel="alternate"][hreflang]')
      .evaluateAll((ls) => ls.map((l) => `${l.getAttribute('hreflang')} ${l.getAttribute('href')}`));
    expect(alts, 'a post without a twin lists es + x-default, both itself').toEqual(SOLO_HREFLANG);

    const ctas = page.locator('main a', { hasText: new RegExp(`^${CTA}$`) });
    await expect(ctas, 'in-body link + end-of-post CTA').toHaveCount(2);
    for (const href of await ctas.evaluateAll((as) => as.map((a) => a.getAttribute('href')))) {
      expect(href).toBe(SIGNUP);
    }
    // The in-body link sits inside the first third of the post body: the words
    // of the article before it, against the words before the FAQ heading.
    const share = await page.locator('article').evaluate((article, cta) => {
      const words = (s: string) => (s.match(/\S+/g) ?? []).length;
      const link = [...article.querySelectorAll('a')].find((a) => a.textContent === cta)!;
      const faq = [...article.querySelectorAll('h2')].find((h) => h.textContent === 'Preguntas frecuentes')!;
      const range = (end: Node) => {
        const r = document.createRange();
        r.setStartAfter(article.querySelector('time')!.parentElement!);
        r.setEndBefore(end);
        return words(r.toString());
      };
      return range(link) / range(faq);
    }, CTA);
    expect(share, 'the in-body CTA is in the first third').toBeLessThanOrEqual(1 / 3);

    await expect(page.locator('article h3'), 'the four FAQ questions are visible').toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'no horizontal overflow').toBe(false);
  });

  test('2. /es/blog lists the post and links to it', async ({ page }) => {
    await page.goto('/es/blog');
    await expect(page.locator('h1')).toHaveText('El blog de TitiLinks');
    await expect(page.locator(`main a[href="${POST}"]`)).toHaveText(TITLE);
  });
});

test.describe('SEO.TITILINKS.BLOG.1 — Part B: the LIVE post with no JavaScript (green only after push + deploy)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'live HTTP probe — one project only');
    test.setTimeout(60_000);
  });

  test('3. the prerendered post carries head, h1, both links and Article + FAQPage JSON-LD', async ({ playwright }) => {
    const crawler = await playwright.request.newContext();
    try {
      const res = await crawler.get(`${WWW}${POST}`);
      const html = await res.text();
      expect(res.status(), `${POST} must be 200`).toBe(200);
      expect(html).toContain('<html lang="es"');
      expect(/<title>([^<]*)<\/title>/.exec(html)?.[1]).toBe(TITLE);
      expect(html).toContain(`<h1>${TITLE}</h1>`);
      expect((html.match(/<link\b[^>]*rel="canonical"[^>]*>/g) ?? []).map((t) => attr(t, 'href'))).toEqual([SELF]);
      expect(hreflangOf(html), 'es + x-default, both itself').toEqual(SOLO_HREFLANG);
      expect(html.split(`<a href="${SIGNUP}">${CTA}</a>`).length - 1, 'two money-page links, exact anchor text').toBe(2);

      const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '{}');
      const graph = (ld['@graph'] ?? []) as { '@type': string; headline?: string; mainEntity?: unknown[] }[];
      expect(graph.map((n) => n['@type'])).toEqual(['Article', 'FAQPage']);
      expect(graph[0].headline).toBe(TITLE);
      expect(graph[1].mainEntity, 'four FAQ entries').toHaveLength(4);

      const index = await crawler.get(`${WWW}/es/blog`);
      expect(index.status(), '/es/blog must be 200').toBe(200);
      expect(await index.text(), '/es/blog lists the post').toContain(`<a href="${POST}">${TITLE}</a>`);
    } finally {
      await crawler.dispose();
    }
  });

  test('4. the sitemap function lists /blog, /es/blog and the post with matching alternates', async ({ playwright }) => {
    const crawler = await playwright.request.newContext();
    try {
      const xml = await (await crawler.get(`${viteEnv('VITE_SUPABASE_URL')}/functions/v1/sitemap`)).text();
      const alternates = new Map(
        [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, body]) => [
          /<loc>([^<]*)<\/loc>/.exec(body)?.[1],
          [...body.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)].map((m) => `${m[1]} ${m[2]}`),
        ]),
      );
      const indexTrio = [`en ${WWW}/blog`, `es ${WWW}/es/blog`, `x-default ${WWW}/blog`];
      expect(alternates.get(`${WWW}/blog`), '/blog').toEqual(indexTrio);
      expect(alternates.get(`${WWW}/es/blog`), '/es/blog').toEqual(indexTrio);
      expect(alternates.get(SELF), POST).toEqual(SOLO_HREFLANG);
    } finally {
      await crawler.dispose();
    }
  });
});
