// TL.SEO.META.1 — the server-side HTML for a creator page.
//
// middleware.ts (repo root, Vercel Routing Middleware) fetches the built
// index.html shell, looks the handle up, and hands both to the builders here.
// They swap the homepage's head tags for the creator's own title, description,
// canonical, Open Graph / Twitter card and ProfilePage JSON-LD, and put a
// plain-HTML summary (name, bio, links) inside <div id="root"> for readers that
// run no JavaScript. React's createRoot().render clears #root on load, and every
// inserted head tag carries data-rh="true" so Helmet takes it over client-side.
//
// PURE: string in, string out. No DOM, no Node APIs, no browser-only imports —
// it runs on the edge and, for spec 73, inside a page served by the dev server.
// Its three imports are pure too (handle-rules → reserved-slugs; adult-gate →
// platform-catalog, platform-from-url, safe-url), checked for TL.SEO.META.1.
//
// Adult links: the app never lets a gated destination reach the DOM, a path or
// a query string where a crawler could read it (src/lib/adult-gate.ts). The
// summary and sameAs obey the same rule through isEffectivelyGated.

import { HANDLE_PATTERN } from './handle-rules';
import { isEffectivelyGated } from './adult-gate';

export const SITE = 'https://www.titilinks.com';
const PLACEHOLDER_IMAGE = `${SITE}/placeholder.svg`;
const DEFAULT_DESCRIPTION = 'Check out my links, products, and more on TitiLinks.';
const MAX_DESCRIPTION = 160;
const MAX_LINKS = 30;

/** First path segments that belong to the app or to static files, never to a creator. */
export const RESERVED_FIRST_SEGMENTS: readonly string[] = [
  'login', 'onboarding', 'dashboard', 'billing', 'goodbye', 's', 'go', 'es',
  'templates', 'terms', 'privacy', 'sitemap.xml', 'robots.txt', 'llms.txt',
  'index.html', 'app.html', 'assets', 'models', 'favicon.ico',
];

/**
 * The lowercase handle when `pathname` is exactly one segment (`/x` or `/x/`),
 * has no '.', is not reserved and matches HANDLE_PATTERN; otherwise null.
 */
export function candidateHandle(pathname: string): string | null {
  const m = /^\/([^/]+)\/?$/.exec(pathname);
  if (!m) return null;
  const segment = m[1].toLowerCase();
  if (segment.includes('.')) return null;
  if (RESERVED_FIRST_SEGMENTS.includes(segment)) return null;
  return HANDLE_PATTERN.test(segment) ? segment : null;
}

/** Escape & < > " ' for text and double-quoted attribute values. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type ProfileSeo = {
  handle: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  /** isAdult mirrors block_items.is_adult; gated links never reach the HTML. */
  links: { label: string; url: string; isAdult?: boolean | null }[];
};

/** The trimmed URL when it is an absolute http(s) URL, else null. */
function httpUrl(u: string | null | undefined): string | null {
  const s = (u ?? '').trim();
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    new URL(s);
    return s;
  } catch {
    return null;
  }
}

function isTitiLinksUrl(u: string): boolean {
  try {
    const host = new URL(u).hostname.toLowerCase();
    return host === 'titilinks.com' || host.endsWith('.titilinks.com');
  } catch {
    return false;
  }
}

/** Collapse whitespace and cut to `max` characters, ending in an ellipsis when cut. */
function clip(s: string, max: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** http(s) only, never gated, first occurrence of each URL, at most MAX_LINKS. */
function publicLinks(links: ProfileSeo['links']): { label: string; url: string }[] {
  const seen = new Set<string>();
  const out: { label: string; url: string }[] = [];
  for (const l of links) {
    const url = httpUrl(l.url);
    if (!url || seen.has(url)) continue;
    if (isEffectivelyGated({ url, is_adult: l.isAdult ?? null })) continue;
    seen.add(url);
    out.push({ label: (l.label ?? '').trim() || url, url });
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

// The shell is index.html as built: one tag per line, so single-line patterns.
const TITLE_RE = /<title\b[^>]*>[\s\S]*?<\/title>\s*/gi;
const HELMET_META_RE = /<meta\b[^>]*\bdata-rh="true"[^>]*>\s*/gi;
// Every canonical, marked or not — a page must never carry two.
const CANONICAL_RE = /<link\b[^>]*\brel="canonical"[^>]*>\s*/gi;
// The homepage's UNMARKED share tags (og:type website, the 1200×630 og:image,
// twitter:card summary_large_image …). A profile re-declares every one of them,
// and scrapers read the FIRST og:image / og:type, so they have to go too.
// twitter:site (@TitiLinks) is not re-declared and stays.
const SHARE_META_RE = /<meta\b[^>]*\b(?:property="og:[^"]*"|name="twitter:(?:card|title|description|image)")[^>]*>\s*/gi;

// ─── Shared with seo-marketing-html.ts (TL.SEO.PRERENDER.1) ───────────────────

/** Remove the shell's <title>, every data-rh meta and every canonical. */
export function stripHelmetTags(shell: string): string {
  return shell.replace(TITLE_RE, '').replace(HELMET_META_RE, '').replace(CANONICAL_RE, '');
}

/** Remove the shell's unmarked og:* and twitter card/title/description/image tags. */
export function stripShareTags(html: string): string {
  return html.replace(SHARE_META_RE, '');
}

/** Insert before </head>. A replacer function, so '$&' in user text stays literal. */
export function beforeHeadClose(html: string, block: string): string {
  return html.replace('</head>', () => `${block}\n  </head>`);
}

/** Put `inner` inside the empty #root. A replacer function, for the same reason. */
export function intoRoot(html: string, inner: string): string {
  return html.replace('<div id="root"></div>', () => `<div id="root">${inner}</div>`);
}

/** A JSON-LD script tag; '<' is escaped so no value can close the script early. */
export function jsonLdScript(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

/** The no-JS summary's inline style. index.html hides #seo-summary once JS runs. */
export const SUMMARY_STYLE =
  'min-height:100vh;background:#0e0c09;color:#f5f0e6;' +
  'font-family:system-ui,sans-serif;padding:32px 20px;max-width:640px;margin:0 auto';

export function buildProfileHtml(shell: string, p: ProfileSeo): string {
  const handle = p.handle.toLowerCase();
  const canonical = `${SITE}/${encodeURIComponent(handle)}`;
  const name = (p.displayName ?? '').trim() || handle;
  const bio = (p.bio ?? '').trim();
  const description = bio ? clip(bio, MAX_DESCRIPTION) : DEFAULT_DESCRIPTION;
  const avatar = httpUrl(p.avatarUrl);
  const image = avatar ?? PLACEHOLDER_IMAGE;
  const title = `${name} | TitiLinks`;
  const links = publicLinks(p.links);
  const sameAs = links.map((l) => l.url).filter((u) => /^https:\/\//i.test(u) && !isTitiLinksUrl(u));

  const person: Record<string, unknown> = { '@type': 'Person', name, url: canonical };
  if (bio) person.description = bio;
  if (avatar) person.image = avatar;
  if (sameAs.length) person.sameAs = sameAs;
  const jsonLd = jsonLdScript({
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: canonical,
    mainEntity: person,
  });

  const e = escapeHtml;
  const head = [
    `<title>${e(title)}</title>`,
    `<meta name="description" content="${e(description)}" data-rh="true" />`,
    `<link rel="canonical" href="${e(canonical)}" data-rh="true" />`,
    `<meta property="og:title" content="${e(title)}" data-rh="true" />`,
    `<meta property="og:description" content="${e(description)}" data-rh="true" />`,
    `<meta property="og:url" content="${e(canonical)}" data-rh="true" />`,
    `<meta property="og:type" content="profile" data-rh="true" />`,
    `<meta property="og:site_name" content="TitiLinks" data-rh="true" />`,
    `<meta property="og:image" content="${e(image)}" data-rh="true" />`,
    `<meta name="twitter:card" content="summary" data-rh="true" />`,
    `<meta name="twitter:title" content="${e(title)}" data-rh="true" />`,
    `<meta name="twitter:description" content="${e(description)}" data-rh="true" />`,
    `<meta name="twitter:image" content="${e(image)}" data-rh="true" />`,
    jsonLd,
  ].map((t) => `    ${t}`).join('\n');

  const items = links
    .map((l) => `<li><a href="${e(l.url)}" rel="nofollow noopener">${e(l.label)}</a></li>`)
    .join('');
  const summary =
    `<main id="seo-summary" style="${SUMMARY_STYLE}">` +
    `<h1>${e(name)}</h1>` +
    (bio ? `<p>${e(bio)}</p>` : '') +
    (items ? `<ul>${items}</ul>` : '') +
    '</main>';

  return intoRoot(beforeHeadClose(stripShareTags(stripHelmetTags(shell)), head), summary);
}

/**
 * The shell for a handle-shaped path with no page behind it, served with 404.
 * `handle` is accepted for symmetry with buildProfileHtml; nothing about an
 * unknown handle is echoed into the page.
 */
export function buildNotFoundHtml(shell: string, handle: string): string {
  void handle;
  return beforeHeadClose(
    stripHelmetTags(shell),
    '    <title>Page not found | TitiLinks</title>\n    <meta name="robots" content="noindex" />',
  );
}
