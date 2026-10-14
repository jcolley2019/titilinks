// sitemap XML (SEO.TITILINKS.HREFLANG.1) — pure, no imports, so the build-time
// hreflang gate (scripts/hreflang-dist.test.mjs) runs the exact builder this
// function serves and compares it with the prerendered pages in dist/.
//
// Marketing pages come in EN/ES twins (TL.SEO.I18N.1; the signup money page's
// Spanish slug is /es/registro, SEO.TITILINKS.MONEYPAGE.1). Each twin's <url>
// carries the same hreflang trio as the page's own <head> — en, es, and
// x-default = the English page — in the sitemap format search engines read:
// xmlns:xhtml on the urlset and one <xhtml:link rel="alternate"> per language.
// Creator pages have no twin, so they stay a bare <loc>.
//
// Blog posts (SEO.TITILINKS.BLOG.1) are listed one by one in BLOG_POSTS — the
// function cannot read content/blog/, and the build gate fails until every
// prerendered post has its row here. A post with a twin carries the trio; a
// post without one carries its own language plus x-default, both itself.

// Vercel redirects the apex to www (project domain setting) — list the canonical host.
export const SITE = "https://www.titilinks.com";

/** [English path, Spanish path] for every marketing page. */
export const MARKETING_TWINS: readonly (readonly [string, string])[] = [
  ["/", "/es"],
  ["/templates", "/es/templates"],
  ["/terms", "/es/terms"],
  ["/privacy", "/es/privacy"],
  ["/signup", "/es/registro"],
  ["/blog", "/es/blog"],
];

/** Every post: its language, its path, and its twin's path when it has one. */
export const BLOG_POSTS: readonly { lang: "en" | "es"; path: string; twin?: string }[] = [
  { lang: "es", path: "/es/blog/link-en-bio-para-creadores" },
  { lang: "es", path: "/es/blog/alternativa-a-linktree-en-espanol" },
  { lang: "en", path: "/blog/link-in-bio-for-latin-creators" },
];

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

type Alternate = readonly [hreflang: string, path: string];

/** The trio a pair of twins shares: en, es, and x-default = the English page. */
const trio = (en: string, es: string): Alternate[] => [["en", en], ["es", es], ["x-default", en]];

/** One <url>: its <loc> plus its hreflang alternates. */
const entry = (path: string, alternates: readonly Alternate[]): string =>
  `  <url>\n    <loc>${escapeXml(SITE + path)}</loc>\n` +
  alternates
    .map(([lang, p]) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${escapeXml(SITE + p)}"/>`)
    .join("\n") +
  `\n  </url>`;

const postAlternates = (post: (typeof BLOG_POSTS)[number]): Alternate[] => {
  if (!post.twin) return [[post.lang, post.path], ["x-default", post.path]];
  return post.lang === "en" ? trio(post.path, post.twin) : trio(post.twin, post.path);
};

export const buildSitemap = (handles: string[]): string => {
  const urls = [
    // English pages first, then Spanish — the order the listing has always had.
    ...MARKETING_TWINS.map(([en, es]) => entry(en, trio(en, es))),
    ...MARKETING_TWINS.map(([en, es]) => entry(es, trio(en, es))),
    ...BLOG_POSTS.map((post) => entry(post.path, postAlternates(post))),
    ...handles.map((h) => `  <url><loc>${escapeXml(`${SITE}/${encodeURIComponent(h)}`)}</loc></url>`),
  ];
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    urls.join("\n") +
    `\n</urlset>\n`
  );
};
