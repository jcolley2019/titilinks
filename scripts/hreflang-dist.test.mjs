// SEO.TITILINKS.HREFLANG.1 — the hreflang gate on the BUILT site. It runs at
// the end of `npm run build`, after scripts/prerender-marketing.ts, so a
// prerendered page that ships without a correct hreflang cluster fails the
// Vercel build. Runner: tsx (it imports the sitemap's .ts builder).
//   npx tsx scripts/hreflang-dist.test.mjs        (after a build)
//
// Independent of the page builder on purpose: it reads dist/ the way a crawler
// reads the served HTML, maps each file to its public URL through vercel.json's
// rewrites, and runs the sitemap function's own XML builder for the sitemap
// side. A new page is caught by its file, not by a route list it could be
// missing from.
//
// Every prerendered page (dist/**/*.html carrying #seo-summary) must:
//   (a) carry exactly one hreflang="en", one "es" and one "x-default"
//   (b) use only absolute URLs on the canonical host https://www.titilinks.com
//       (the apex 308s there; spec 71 test 3 pins it live): https, no query or
//       fragment, no trailing slash except the root's
//   (c) list itself, under its own <html lang>, and its twin
//   (d) be listed back: the twin is a dist page carrying the same set
//   (e) have exactly one canonical, its own URL, never the twin's
//   (f) point x-default at the English page
//   (g) agree with the sitemap string-for-string: a <url> whose <loc> is the
//       canonical, carrying the same alternates
// and every sitemap entry that carries alternates must be a dist page.
//
// SEO.TITILINKS.BLOG.1 — one exception, for blog posts (/blog/<slug>,
// /es/blog/<slug>) only: a post with NO other-language alternate is a post
// without a twin, and must carry exactly two links instead — its own language
// and x-default, both its own URL ((a), (c), (f) read that way; (d) has no twin
// to ask). A post that does name a twin gets every twin check above, unchanged,
// and so does every page that is not a post.

import fs from 'node:fs';
import path from 'node:path';
import { buildSitemap } from '../supabase/functions/sitemap/xml.ts';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://www.titilinks.com';
const URL_RE = /^https:\/\/www\.titilinks\.com(?:\/|(?:\/[A-Za-z0-9._~%-]+)+)$/;
const LANGS = ['en', 'es'];
const POST_RE = /^(?:\/es)?\/blog\/[^/]+$/;
// The money pages (docs/SEO.md): a dist without them is not a full build.
const MUST_HAVE = ['/signup', '/es/registro'];

const fail = (m) => { console.error(`FAIL - ${m}`); process.exit(1); };
if (!fs.existsSync(path.join(DIST, 'app.html'))) fail('dist/app.html missing — run `npm run build` first');

const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag);
  return m ? m[1].replace(/&amp;/g, '&') : undefined;
};
const tags = (html, re) => html.match(re) ?? [];
/** hreflang → href, as a sorted 'lang href' list for set comparisons. */
const setKey = (alts) => JSON.stringify(alts.map(([l, h]) => `${l} ${h}`).sort());

// ── dist file → public path, through vercel.json ────────────────────────────
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const routeOf = new Map([['index.html', '/']]);
for (const r of vercel.rewrites ?? []) {
  if (r.source.includes('(') || !/^\/.+\.html$/.test(r.destination)) continue;
  routeOf.set(r.destination.slice(1), r.source);
}

const htmlFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return htmlFiles(p);
    return d.name.endsWith('.html') ? [path.relative(DIST, p).split(path.sep).join('/')] : [];
  });

const errors = [];
const pages = new Map(); // public path → parsed head
for (const file of htmlFiles(DIST)) {
  const html = fs.readFileSync(path.join(DIST, file), 'utf8');
  if (!html.includes('id="seo-summary"')) continue;
  const route = routeOf.get(file);
  if (!route) { errors.push(`dist/${file} is prerendered but no vercel.json rewrite serves it`); continue; }
  const head = html.slice(0, html.indexOf('</head>'));
  pages.set(route, {
    file,
    lang: attr(tags(head, /<html\b[^>]*>/i)[0] ?? '', 'lang'),
    canonicals: tags(head, /<link\b[^>]*\brel="canonical"[^>]*>/gi).map((t) => attr(t, 'href')),
    alts: tags(head, /<link\b[^>]*\brel="alternate"[^>]*>/gi)
      .filter((t) => attr(t, 'hreflang') !== undefined)
      .map((t) => [attr(t, 'hreflang'), attr(t, 'href')]),
  });
}
for (const p of MUST_HAVE) if (!pages.has(p)) errors.push(`money page ${p} is not in dist`);
if (pages.size < 2) fail(`only ${pages.size} prerendered page(s) in dist — nothing to check`);

// ── sitemap, from the function's own builder ────────────────────────────────
const xml = buildSitemap([]);
const sitemap = new Map(); // <loc> → alternates
for (const [, body] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
  const loc = /<loc>([^<]*)<\/loc>/.exec(body)?.[1]?.replace(/&amp;/g, '&');
  const alts = tags(body, /<xhtml:link\b[^>]*>/g).map((t) => [attr(t, 'hreflang'), attr(t, 'href')]);
  if (alts.some(([l, h]) => l === undefined || h === undefined)) errors.push(`sitemap ${loc}: an alternate without hreflang or href`);
  sitemap.set(loc, alts);
}
if (!xml.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"')) errors.push('sitemap urlset does not declare xmlns:xhtml');

// ── (a)–(g), money pages first ──────────────────────────────────────────────
const order = [...MUST_HAVE, ...[...pages.keys()].filter((p) => !MUST_HAVE.includes(p)).sort()];
const rows = [];
for (const route of order) {
  const p = pages.get(route);
  if (!p) continue;
  const own = route === '/' ? `${SITE}/` : `${SITE}${route}`;
  const map = Object.fromEntries(p.alts);
  const otherLang = LANGS.find((l) => l !== p.lang);
  const twinUrl = otherLang ? map[otherLang] : undefined;
  const twinRoute = twinUrl && URL_RE.test(twinUrl) ? new URL(twinUrl).pathname : undefined;
  const twin = twinRoute ? pages.get(twinRoute) : undefined;
  const urls = [...p.canonicals, ...p.alts.map(([, h]) => h)];
  const sm = sitemap.get(own);
  const once = (langs) => langs.every((l) => p.alts.filter(([h]) => h === l).length === 1) && p.alts.length === langs.length;
  // A blog post naming no other-language version is a post without a twin.
  const solo = POST_RE.test(route) && LANGS.includes(p.lang) && !twinUrl;
  const check = solo
    ? {
        a: once([p.lang, 'x-default']),
        b: urls.length > 0 && urls.every((u) => typeof u === 'string' && URL_RE.test(u)),
        c: map[p.lang] === own,
        d: true, // no twin to list it back; (a) already forbids any other alternate
        e: p.canonicals.length === 1 && p.canonicals[0] === own,
        f: map['x-default'] === own,
        g: !!sm && setKey(sm) === setKey(p.alts),
      }
    : {
        a: once(['en', 'es', 'x-default']),
        b: urls.length > 0 && urls.every((u) => typeof u === 'string' && URL_RE.test(u)),
        c: LANGS.includes(p.lang) && map[p.lang] === own && !!twinUrl && twinUrl !== own,
        d: !!twin && setKey(twin.alts) === setKey(p.alts),
        e: p.canonicals.length === 1 && p.canonicals[0] === own && p.canonicals[0] !== twinUrl,
        f: !!map.en && map['x-default'] === map.en,
        g: !!sm && setKey(sm) === setKey(p.alts) && (!twinUrl || sitemap.has(twinUrl)),
      };
  const why = {
    a: solo
      ? `post without a twin has hreflang set ${JSON.stringify(p.alts.map(([l]) => l))}, want exactly ${p.lang}, x-default`
      : `hreflang set is ${JSON.stringify(p.alts.map(([l]) => l))}, want exactly en, es, x-default`,
    b: `a URL is not absolute on ${SITE} (or has a trailing slash/query): ${JSON.stringify(urls)}`,
    c: solo
      ? `post without a twin must list itself (${own}) under hreflang="${p.lang}"`
      : `<html lang="${p.lang}"> page must list itself (${own}) under hreflang="${p.lang}" and its twin under the other language`,
    d: twin ? `twin ${twinRoute} lists a different set back` : `twin ${twinUrl} is not a prerendered dist page`,
    e: `canonical(s) ${JSON.stringify(p.canonicals)}, want exactly [${own}]`,
    f: solo
      ? `post without a twin must point x-default at itself (${own}), got ${map['x-default']}`
      : `x-default ${map['x-default']} must equal the English page ${map.en}`,
    g: sm ? `sitemap alternates for ${own} differ from the page's: ${JSON.stringify(sm)}` : `sitemap has no <url> with <loc>${own}</loc>`,
  };
  for (const [k, okay] of Object.entries(check)) if (!okay) errors.push(`${route} (${p.file}) (${k}): ${why[k]}`);
  rows.push({
    page: route,
    lang: p.lang,
    shape: solo ? 'solo post' : 'twin',
    ...Object.fromEntries(Object.entries(check).map(([k, v]) => [k, v ? 'pass' : 'FAIL'])),
  });
}
for (const [loc, alts] of sitemap) {
  if (alts.length && !pages.has(new URL(loc).pathname)) errors.push(`sitemap lists ${loc} with alternates, but it is not a prerendered dist page`);
}

console.table(rows);
if (errors.length) {
  errors.forEach((e) => console.error(`FAIL - ${e}`));
  process.exit(1);
}
const solos = rows.filter((r) => r.shape === 'solo post').length;
console.log(
  `ok - ${rows.length} prerendered pages: ${rows.length - solos} twins with reciprocal en/es/x-default, ` +
    `${solos} post(s) without a twin listing only themselves; own canonical on ${SITE}, sitemap agrees`,
);
