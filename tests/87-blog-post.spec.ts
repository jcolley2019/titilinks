// SEO.TITILINKS.BLOG.1 — the blog posts and the template around them. Since
// SEO.TITILINKS.POST.2 the spec runs over EVERY Spanish post: it reads
// content/blog/es/*.md with the same parser the build uses (src/lib/blog.ts),
// so a new post is covered the day its file lands, with no edit here.
//
// Part A — the React page on the dev server, as a reader with JavaScript sees
// it: Spanish title / h1 / <html lang>, its own canonical, the no-twin hreflang
// shape (es + x-default, both itself), the visible FAQ, and the two money-page
// links the template injects — anchor text exactly "Crear mi link en bio"
// (docs/SEO.md), the first inside the first third of the body. /es/blog lists
// every post, newest first. No horizontal overflow at either project's width.
//
// Part B — the LIVE deployment with no JavaScript (a crawler's view): the same
// head, both links in the prerendered HTML, Article + FAQPage JSON-LD, the
// index listing every post newest first, and the sitemap function listing
// /blog, /es/blog and each post with matching alternates. GREEN ONLY AFTER the
// push has deployed and the sitemap function has been redeployed.
//
// Writes: none. Signed out on purpose — the blog is a public page.

import fs from 'fs';
import path from 'path';
import { test, expect } from './fixtures';
import { blogPostPath, newestFirst, parsePost, type BlogPost } from '../src/lib/blog';

const WWW = 'https://www.titilinks.com';
const CTA = 'Crear mi link en bio';
const SIGNUP = '/es/registro';

/** Every Spanish post, newest first — the order /es/blog lists them in. */
const POSTS: BlogPost[] = (() => {
  const dir = path.resolve(process.cwd(), 'content/blog/es');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  return newestFirst(files.map((f) => parsePost(fs.readFileSync(path.join(dir, f), 'utf-8'), `content/blog/es/${f}`)));
})();

const urlOf = (post: BlogPost) => `${WWW}${blogPostPath(post.lang, post.slug)}`;
/** blogPostTitle (src/lib/seo-marketing-html.ts): the title plus ' | TitiLinks' while that fits in 60 characters. */
const pageTitle = (post: BlogPost) => (`${post.title} | TitiLinks`.length <= 60 ? `${post.title} | TitiLinks` : post.title);
/** A post without a twin lists es + x-default, both itself; one with a twin carries the en/es/x-default trio. */
const hreflangFor = (post: BlogPost) => {
  if (!post.twin) return [`es ${urlOf(post)}`, `x-default ${urlOf(post)}`];
  const en = `${WWW}${blogPostPath('en', post.twin)}`;
  return [`en ${en}`, `es ${urlOf(post)}`, `x-default ${en}`];
};
/** escapeHtml (src/lib/seo-profile-html.ts) — how the prerender writes text into the page. */
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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

test.describe('SEO.TITILINKS.BLOG.1 — Part A: the post pages with JavaScript (dev server)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const post of POSTS) {
    const POST = blogPostPath(post.lang, post.slug);

    test(`1. ${post.slug}: renders in Spanish with its own head, the FAQ and both money-page links`, async ({ page }) => {
      await page.goto(POST);
      await expect(page.locator('h1')).toHaveText(post.title);
      await expect(page).toHaveTitle(pageTitle(post));
      await expect(page.locator('html')).toHaveAttribute('lang', 'es');
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', urlOf(post));
      const alts = await page
        .locator('link[rel="alternate"][hreflang]')
        .evaluateAll((ls) => ls.map((l) => `${l.getAttribute('hreflang')} ${l.getAttribute('href')}`));
      expect(alts, 'without a twin: es + x-default, both itself; with one: the en/es/x-default trio').toEqual(hreflangFor(post));

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

      await expect(page.locator('article h3'), 'every FAQ question is visible').toHaveCount(post.faq.length);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), 'no horizontal overflow').toBe(false);
    });
  }

  test('2. /es/blog lists every Spanish post, newest first, each linking to it', async ({ page }) => {
    await page.goto('/es/blog');
    await expect(page.locator('h1')).toHaveText('El blog de TitiLinks');
    const links = page.locator('main a[href^="/es/blog/"]');
    await expect(links).toHaveCount(POSTS.length);
    expect(await links.evaluateAll((as) => as.map((a) => `${a.getAttribute('href')} ${a.textContent}`))).toEqual(
      POSTS.map((p) => `${blogPostPath(p.lang, p.slug)} ${p.title}`),
    );
  });
});

test.describe('SEO.TITILINKS.BLOG.1 — Part B: the LIVE posts with no JavaScript (green only after push + deploy)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'live HTTP probe — one project only');
    test.setTimeout(60_000);
  });

  for (const post of POSTS) {
    const POST = blogPostPath(post.lang, post.slug);

    test(`3. ${post.slug}: the prerendered post carries head, h1, both links and Article + FAQPage JSON-LD`, async ({ playwright }) => {
      const crawler = await playwright.request.newContext();
      try {
        const res = await crawler.get(`${WWW}${POST}`);
        const html = await res.text();
        expect(res.status(), `${POST} must be 200`).toBe(200);
        expect(html).toContain('<html lang="es"');
        expect(/<title>([^<]*)<\/title>/.exec(html)?.[1]).toBe(esc(pageTitle(post)));
        expect(html).toContain(`<h1>${esc(post.title)}</h1>`);
        expect((html.match(/<link\b[^>]*rel="canonical"[^>]*>/g) ?? []).map((t) => attr(t, 'href'))).toEqual([urlOf(post)]);
        expect(hreflangOf(html), 'without a twin: es + x-default, both itself; with one: the en/es/x-default trio').toEqual(hreflangFor(post));
        expect(html.split(`<a href="${SIGNUP}">${CTA}</a>`).length - 1, 'two money-page links, exact anchor text').toBe(2);

        const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '{}');
        const graph = (ld['@graph'] ?? []) as { '@type': string; headline?: string; mainEntity?: unknown[] }[];
        expect(graph.map((n) => n['@type'])).toEqual(['Article', 'FAQPage']);
        expect(graph[0].headline).toBe(post.title);
        expect(graph[1].mainEntity, 'one Question per front-matter FAQ entry').toHaveLength(post.faq.length);
      } finally {
        await crawler.dispose();
      }
    });
  }

  test('4. the prerendered /es/blog lists every Spanish post, newest first', async ({ playwright }) => {
    const crawler = await playwright.request.newContext();
    try {
      const index = await crawler.get(`${WWW}/es/blog`);
      expect(index.status(), '/es/blog must be 200').toBe(200);
      const listed = [...(await index.text()).matchAll(/<a href="(\/es\/blog\/[^"]+)">([^<]*)<\/a>/g)].map((m) => `${m[1]} ${m[2]}`);
      expect(listed).toEqual(POSTS.map((p) => `${blogPostPath(p.lang, p.slug)} ${esc(p.title)}`));
    } finally {
      await crawler.dispose();
    }
  });

  test('5. the sitemap function lists /blog, /es/blog and every Spanish post with matching alternates', async ({ playwright }) => {
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
      for (const post of POSTS) {
        expect(alternates.get(urlOf(post)), blogPostPath(post.lang, post.slug)).toEqual(hreflangFor(post));
      }
    } finally {
      await crawler.dispose();
    }
  });
});
