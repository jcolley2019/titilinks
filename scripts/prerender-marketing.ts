// TL.SEO.PRERENDER.1 + TL.SEO.I18N.1 — build-time static HTML for the marketing
// routes, English and Spanish.
//
// Runs after `vite build` (package.json "build": "vite build && tsx scripts/prerender-marketing.ts"):
//   dist/app.html            ← byte-identical copy of the pristine Vite shell. vercel.json's
//                              catch-all rewrites every other route here, and middleware.ts
//                              fetches it as the shell for creator pages.
//   dist/index.html          ← buildMarketingHtml(shell, '/')   (served for / by the filesystem)
//   dist/templates.html      ← '/templates'                     (vercel.json rewrite)
//   dist/terms.html          ← '/terms'   + the terms intro paragraph
//   dist/privacy.html        ← '/privacy' + the privacy intro paragraph
//   dist/es/index.html       ← the same four in Spanish, from the same pristine shell,
//   dist/es/templates.html     with Spanish legal intros (vercel.json rewrites /es,
//   dist/es/terms.html         /es/templates, /es/terms, /es/privacy here)
//   dist/es/privacy.html
//   dist/signup.html, dist/es/registro.html   ← the signup money pages (SEO.TITILINKS.MONEYPAGE.1)
//   dist/blog.html, dist/es/blog.html         ← the blog indexes (SEO.TITILINKS.BLOG.1), listing
//   dist/blog/<slug>.html,                       every content/blog/<lang>/<slug>.md, and one
//   dist/es/blog/<slug>.html                     page per post (buildBlogPostHtml)
//
// Fails LOUDLY (exit 1) on any missing input, missing translation, unparseable
// price or broken output, so a bad prerender fails the Vercel build instead of
// deploying a half-built site. Re-running it without a fresh `vite build` is
// safe: a dist/index.html that is already a prerender is never used as the
// shell — the pristine dist/app.html is.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MARKETING_LANGS,
  MARKETING_ROUTES,
  blogBodyWithCta,
  buildBlogPostHtml,
  buildMarketingHtml,
  marketingPath,
  type MarketingLang,
  type MarketingRoute,
} from '@/lib/seo-marketing-html';
import { blogPostPath, parsePost, type BlogPost } from '@/lib/blog';
import { renderMarkdown } from '@/lib/blog-html';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join('/');

/**
 * dist-relative output path, derived from the public path so the two can never
 * drift: '/templates' → 'templates.html', '/es/templates' → 'es/templates.html',
 * '/' → 'index.html', '/es' → 'es/index.html', '/es/registro' → 'es/registro.html'
 * (SEO.TITILINKS.MONEYPAGE.1 — the signup twin has its own Spanish slug).
 * vercel.json rewrites each public path to its file.
 */
const outputOf = (route: MarketingRoute, lang: MarketingLang) => {
  const p = marketingPath(route, lang);
  if (p === '/') return 'index.html';
  if (p === '/es') return 'es/index.html';
  return `${p.slice(1)}.html`;
};
const LEGAL_SOURCE: Partial<Record<MarketingRoute, string>> = { '/terms': 'terms', '/privacy': 'privacy' };

function fail(message: string): never {
  console.error(`[prerender] FAILED: ${message}`);
  process.exit(1);
}

function read(file: string): string {
  if (!fs.existsSync(file)) fail(`missing input ${rel(file)}`);
  return fs.readFileSync(file, 'utf8');
}

/** Links, bold, italics and code spans reduced to their text; whitespace collapsed. */
function stripMarkdown(s: string): string {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The first prose paragraph: headings are skipped, and so is a paragraph that is
 * nothing but one bold label — every legal doc opens with "**Effective date: …**"
 * / "**Fecha de entrada en vigor: …**", which is metadata, not an introduction.
 */
function legalIntro(markdown: string): string {
  for (const para of markdown.split(/\r?\n\s*\r?\n/)) {
    const p = para.trim();
    if (!p || p.startsWith('#')) continue;
    if (/^\*\*[^*]+\*\*$/.test(p)) continue;
    return stripMarkdown(p);
  }
  return '';
}

/**
 * SEO.TITILINKS.BLOG.1 — every content/blog/<lang>/<slug>.md, parsed and
 * validated (parsePost throws on bad front matter or a slug/lang that disagrees
 * with the path). A twin must exist in the other language and name this post back.
 */
function readPosts(): BlogPost[] {
  const posts: BlogPost[] = [];
  for (const lang of MARKETING_LANGS) {
    const dir = path.join(ROOT, 'content', 'blog', lang);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
      const file = `content/blog/${lang}/${name}`;
      posts.push(parsePost(read(path.join(ROOT, file)), file));
    }
  }
  for (const p of posts) {
    if (!p.twin) continue;
    const other = p.lang === 'en' ? 'es' : 'en';
    const twin = posts.find((q) => q.lang === other && q.slug === p.twin);
    if (!twin) fail(`content/blog/${p.lang}/${p.slug}.md names twin "${p.twin}", but content/blog/${other}/${p.twin}.md does not exist`);
    if (twin.twin !== p.slug) fail(`content/blog/${other}/${p.twin}.md must name "${p.slug}" back as its twin`);
  }
  return posts;
}

/** Tags of the shell that must reach every output unchanged: scripts, modulepreloads, stylesheets. */
function assetTags(html: string): string[] {
  return html.match(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*rel="(?:modulepreload|stylesheet)"[^>]*>/g) ?? [];
}

function main(): void {
  const indexPath = path.join(DIST, 'index.html');
  const appPath = path.join(DIST, 'app.html');

  let shell = read(indexPath);
  if (shell.includes('id="seo-summary"')) {
    shell = read(appPath);
    if (shell.includes('id="seo-summary"')) fail(`${rel(appPath)} is not a pristine shell — run vite build first`);
  }
  for (const marker of ['<title>', '</head>', '<div id="root"></div>', '<html lang="en"']) {
    if (!shell.includes(marker)) fail(`the shell has no ${marker}`);
  }
  const assets = assetTags(shell);
  if (!assets.some((tag) => tag.includes('type="module"'))) fail('the shell has no module script');

  fs.writeFileSync(appPath, shell);
  fs.mkdirSync(path.join(DIST, 'es'), { recursive: true });

  const written: string[] = ['index.html', 'app.html'];
  /** Check one output and write it. `hreflangs` is 3 (a twin's trio) or 2 (a post with no twin). */
  const emit = (out: string, html: string, lang: MarketingLang, hreflangs: 2 | 3) => {
    const count = (re: RegExp) => (html.match(re) ?? []).length;
    if (count(/<title\b/g) !== 1) fail(`${out}: expected exactly one <title>`);
    if (count(/rel="canonical"/g) !== 1) fail(`${out}: expected exactly one canonical`);
    if (count(/<link rel="alternate" hreflang="/g) !== hreflangs) fail(`${out}: expected ${hreflangs} hreflang links`);
    if (!html.includes(`<html lang="${lang}"`)) fail(`${out}: expected <html lang="${lang}"`);
    if (!html.includes('<div id="root"><main id="seo-summary"')) fail(`${out}: no summary inside #root`);
    if (!html.includes('<script type="application/ld+json">')) fail(`${out}: no JSON-LD`);
    for (const tag of assets) {
      if (!html.includes(tag)) fail(`${out}: lost a shell tag: ${tag.slice(0, 120)}`);
    }
    fs.mkdirSync(path.dirname(path.join(DIST, out)), { recursive: true });
    fs.writeFileSync(path.join(DIST, out), html);
    if (out !== 'index.html') written.push(out);
  };

  const posts = readPosts();
  for (const lang of MARKETING_LANGS) {
    for (const route of MARKETING_ROUTES) {
      const doc = LEGAL_SOURCE[route];
      let extras: { legalIntro?: string; posts?: readonly BlogPost[] } | undefined;
      if (doc) {
        const source = `src/content/legal/${doc}-${lang}.md`;
        const intro = legalIntro(read(path.join(ROOT, source)));
        if (!intro) fail(`no intro paragraph in ${source}`);
        extras = { legalIntro: intro };
      }
      if (route === '/blog') extras = { posts };
      emit(outputOf(route, lang), buildMarketingHtml(shell, route, extras, lang), lang, 3);
    }
  }

  // SEO.TITILINKS.BLOG.1 — one page per post, its markdown rendered with the
  // template's in-body CTA already placed.
  for (const post of posts) {
    const html = buildBlogPostHtml(shell, post, renderMarkdown(blogBodyWithCta(post)));
    emit(`${blogPostPath(post.lang, post.slug).slice(1)}.html`, html, post.lang, post.twin ? 3 : 2);
  }

  for (const file of written) {
    const bytes = fs.statSync(path.join(DIST, file)).size;
    console.log(`[prerender] dist/${file.padEnd(18)} ${String(bytes).padStart(7)} B`);
  }
}

try {
  main();
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
