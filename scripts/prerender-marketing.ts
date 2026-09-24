// TL.SEO.PRERENDER.1 — build-time static HTML for /, /templates, /terms, /privacy.
//
// Runs after `vite build` (package.json "build": "vite build && tsx scripts/prerender-marketing.ts"):
//   dist/app.html        ← byte-identical copy of the pristine Vite shell. vercel.json's
//                          catch-all rewrites every other route here, and middleware.ts
//                          fetches it as the shell for creator pages.
//   dist/index.html      ← buildMarketingHtml(shell, '/')   (served for / by the filesystem)
//   dist/templates.html  ← '/templates'                     (vercel.json rewrite)
//   dist/terms.html      ← '/terms'   + the terms intro paragraph
//   dist/privacy.html    ← '/privacy' + the privacy intro paragraph
//
// Fails LOUDLY (exit 1) on any missing input, missing translation, unparseable
// price or broken output, so a bad prerender fails the Vercel build instead of
// deploying a half-built site. Re-running it without a fresh `vite build` is
// safe: a dist/index.html that is already a prerender is never used as the
// shell — the pristine dist/app.html is.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKETING_ROUTES, buildMarketingHtml, type MarketingRoute } from '@/lib/seo-marketing-html';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join('/');

const OUTPUT: Record<MarketingRoute, string> = {
  '/': 'index.html',
  '/templates': 'templates.html',
  '/terms': 'terms.html',
  '/privacy': 'privacy.html',
};
const LEGAL_SOURCE: Partial<Record<MarketingRoute, string>> = {
  '/terms': 'src/content/legal/terms-en.md',
  '/privacy': 'src/content/legal/privacy-en.md',
};

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
 * nothing but one bold label — both legal docs open with "**Effective date: …**",
 * which is metadata, not an introduction.
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
  for (const marker of ['<title>', '</head>', '<div id="root"></div>']) {
    if (!shell.includes(marker)) fail(`the shell has no ${marker}`);
  }
  const assets = assetTags(shell);
  if (!assets.some((tag) => tag.includes('type="module"'))) fail('the shell has no module script');

  fs.writeFileSync(appPath, shell);

  for (const route of MARKETING_ROUTES) {
    const source = LEGAL_SOURCE[route];
    let extras: { legalIntro?: string } | undefined;
    if (source) {
      const intro = legalIntro(read(path.join(ROOT, source)));
      if (!intro) fail(`no intro paragraph in ${source}`);
      extras = { legalIntro: intro };
    }

    const html = buildMarketingHtml(shell, route, extras);
    const count = (re: RegExp) => (html.match(re) ?? []).length;
    const out = OUTPUT[route];
    if (count(/<title\b/g) !== 1) fail(`${out}: expected exactly one <title>`);
    if (count(/rel="canonical"/g) !== 1) fail(`${out}: expected exactly one canonical`);
    if (!html.includes('<div id="root"><main id="seo-summary"')) fail(`${out}: no summary inside #root`);
    if (!html.includes('<script type="application/ld+json">')) fail(`${out}: no JSON-LD`);
    for (const tag of assets) {
      if (!html.includes(tag)) fail(`${out}: lost a shell tag: ${tag.slice(0, 120)}`);
    }
    fs.writeFileSync(path.join(DIST, out), html);
  }

  for (const file of ['index.html', 'app.html', 'templates.html', 'terms.html', 'privacy.html']) {
    const bytes = fs.statSync(path.join(DIST, file)).size;
    console.log(`[prerender] dist/${file.padEnd(15)} ${String(bytes).padStart(7)} B`);
  }
}

try {
  main();
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
