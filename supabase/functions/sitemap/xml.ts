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

// Vercel redirects the apex to www (project domain setting) — list the canonical host.
export const SITE = "https://www.titilinks.com";

/** [English path, Spanish path] for every marketing page. */
export const MARKETING_TWINS: readonly (readonly [string, string])[] = [
  ["/", "/es"],
  ["/templates", "/es/templates"],
  ["/terms", "/es/terms"],
  ["/privacy", "/es/privacy"],
  ["/signup", "/es/registro"],
];

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** One marketing <url>: its <loc> plus the twin's hreflang trio. */
const marketingUrl = (path: string, [en, es]: readonly [string, string]): string =>
  `  <url>\n    <loc>${escapeXml(SITE + path)}</loc>\n` +
  ([["en", en], ["es", es], ["x-default", en]] as const)
    .map(([lang, p]) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${escapeXml(SITE + p)}"/>`)
    .join("\n") +
  `\n  </url>`;

export const buildSitemap = (handles: string[]): string => {
  const urls = [
    // English pages first, then Spanish — the order the listing has always had.
    ...MARKETING_TWINS.map((twin) => marketingUrl(twin[0], twin)),
    ...MARKETING_TWINS.map((twin) => marketingUrl(twin[1], twin)),
    ...handles.map((h) => `  <url><loc>${escapeXml(`${SITE}/${encodeURIComponent(h)}`)}</loc></url>`),
  ];
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    urls.join("\n") +
    `\n</urlset>\n`
  );
};
