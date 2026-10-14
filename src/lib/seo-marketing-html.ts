// TL.SEO.PRERENDER.1 + TL.SEO.I18N.1 — build-time static HTML for the four
// marketing routes, in English and Spanish (docs/SEO-AUDIT-2026-09.md findings
// #2 and #6).
//
// scripts/prerender-marketing.ts runs this after `vite build`: it takes the
// pristine dist/index.html shell and writes dist/index.html, templates.html,
// terms.html, privacy.html and their Spanish twins under dist/es/, each carrying
// its own <title>, description, canonical, hreflang pair, Open Graph / Twitter
// card, page-level JSON-LD and a real-HTML summary inside #root for readers
// that run no JavaScript. With JavaScript the inline script in index.html hides
// #seo-summary before first paint and React's createRoot().render replaces it,
// so users see the site as before.
//
// URL scheme (TL.SEO.I18N.1, fixed): /, /templates, /terms, /privacy in English;
// /es, /es/templates, /es/terms, /es/privacy in Spanish. No redirect by browser
// language, ever — hreflang does the routing. The path helpers below are the
// single source of that scheme for the pages, the navbar, the footer, the
// language toggle and the prerender script.
//
// PURE: no DOM, no Node APIs (same rule as seo-profile-html.ts, whose strip /
// insert helpers it reuses). Specs 74 and 75 import it through the dev server.
//
// Copy: every visible string comes from the dictionary in useLanguage.tsx, from
// src/lib/pricing.ts, or from public/llms.txt wording (now dictionary keys) —
// nothing is new marketing copy. A missing dictionary key or an unparseable
// price THROWS, so a renamed string fails the build instead of shipping an empty
// tag. JSON-LD Offer.description stays English: it is schema data, not copy.

import { translations } from '@/hooks/useLanguage';
import { PRO_ANCHOR_PRICE, PRO_PRICE, proFeatures, proFoundingLabel } from '@/lib/pricing';
import { blogPostPath, formatPostDate, newestFirst, withInlineCta, type BlogPost } from '@/lib/blog';
import {
  SITE,
  SUMMARY_STYLE,
  beforeHeadClose,
  escapeHtml,
  intoRoot,
  jsonLdScript,
  stripHelmetTags,
  stripShareTags,
} from '@/lib/seo-profile-html';

export type MarketingRoute = '/' | '/templates' | '/terms' | '/privacy' | '/signup' | '/blog';
export type MarketingLang = 'en' | 'es';

// SEO.TITILINKS.BLOG.1 — /blog and /es/blog are the per-language post indexes;
// the posts themselves (/blog/<slug>, /es/blog/<slug>) are built by
// buildBlogPostHtml below from content/blog/<lang>/<slug>.md.
export const MARKETING_ROUTES: readonly MarketingRoute[] = ['/', '/templates', '/terms', '/privacy', '/signup', '/blog'];

// SEO.TITILINKS.MONEYPAGE.1 — the signup money page is the one route whose
// Spanish twin is not the English path under /es: /signup ↔ /es/registro, so
// each language has a URL in its own words. /login?mode=signup stays as an alias.
const ES_SLUG: Partial<Record<MarketingRoute, string>> = { '/signup': '/registro' };
export const MARKETING_LANGS: readonly MarketingLang[] = ['en', 'es'];

// ─── URL scheme ─────────────────────────────────────────────────────────────

/** The path of a marketing route in a language: '/templates' + 'es' → '/es/templates', '/' + 'es' → '/es'. */
export function marketingPath(route: MarketingRoute, lang: MarketingLang): string {
  if (lang === 'en') return route;
  return route === '/' ? '/es' : `/es${ES_SLUG[route] ?? route}`;
}

/** The absolute URL on the canonical host: marketingUrl('/', 'en') → 'https://www.titilinks.com/'. */
export function marketingUrl(route: MarketingRoute, lang: MarketingLang): string {
  return `${SITE}${marketingPath(route, lang)}`;
}

/**
 * SEO.TITILINKS.MONEYPAGE.1 — where a signup CTA points from the current URL:
 * '/es/…' → '/es/registro', anywhere else → '/signup'. One helper for the
 * navbar, the landing CTAs and the templates gallery.
 */
export function signupPathFor(pathname: string): string {
  return marketingPath('/signup', isEsPath(pathname) ? 'es' : 'en');
}

/** True for '/es' and anything under '/es/'. React Router matches case-insensitively, so this does too. */
export function isEsPath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return p === '/es' || p.startsWith('/es/');
}

/** The marketing route a pathname shows in either language, or null: '/es/terms' → '/terms', '/dashboard' → null. */
export function routeFromPath(pathname: string): MarketingRoute | null {
  const lower = pathname.toLowerCase();
  const trimmed = lower.length > 1 ? lower.replace(/\/+$/, '') || '/' : lower;
  const bare = trimmed === '/es' ? '/' : trimmed.startsWith('/es/') ? trimmed.slice(3) : trimmed;
  if (trimmed.startsWith('/es/')) {
    const slugged = MARKETING_ROUTES.find((r) => ES_SLUG[r] === bare);
    if (slugged) return slugged;
  }
  return (MARKETING_ROUTES as readonly string[]).includes(bare) ? (bare as MarketingRoute) : null;
}

export type HreflangLink = { hreflang: 'en' | 'es' | 'x-default'; href: string };

/** The hreflang trio every language of a route carries; x-default is the English page. */
export function hreflangLinks(route: MarketingRoute): HreflangLink[] {
  return [
    { hreflang: 'en', href: marketingUrl(route, 'en') },
    { hreflang: 'es', href: marketingUrl(route, 'es') },
    { hreflang: 'x-default', href: marketingUrl(route, 'en') },
  ];
}

/** The absolute URL of a post on the canonical host. */
export function blogPostUrl(lang: MarketingLang, slug: string): string {
  return `${SITE}${blogPostPath(lang, slug)}`;
}

/**
 * SEO.TITILINKS.BLOG.1 — a post with a twin carries the same trio as the
 * marketing twins (x-default = the English post). A post without one lists only
 * itself: its own language plus x-default, both pointing at its own URL.
 */
export function blogHreflangLinks(post: Pick<BlogPost, 'lang' | 'slug' | 'twin'>): HreflangLink[] {
  const own = blogPostUrl(post.lang, post.slug);
  if (!post.twin) return [{ hreflang: post.lang, href: own }, { hreflang: 'x-default', href: own }];
  const other = blogPostUrl(post.lang === 'en' ? 'es' : 'en', post.twin);
  const en = post.lang === 'en' ? own : other;
  const es = post.lang === 'es' ? own : other;
  return [
    { hreflang: 'en', href: en },
    { hreflang: 'es', href: es },
    { hreflang: 'x-default', href: en },
  ];
}

/** A post's <title>: the post title plus ' | TitiLinks' while that fits in 60 characters, else the title alone. */
export function blogPostTitle(post: Pick<BlogPost, 'title'>): string {
  const full = `${post.title}${SUFFIX}`;
  return full.length <= 60 ? full : post.title;
}

/**
 * The post body with the in-body money-page link the template owns (posts never
 * write their own CTA): the language's signup page, anchor text exactly
 * seo.signup.cta (docs/SEO.md), placed within the first third by withInlineCta.
 */
export function blogBodyWithCta(post: Pick<BlogPost, 'lang' | 'body'>): string {
  const t = reader(post.lang);
  const cta = `**[${t('seo.signup.cta')}](${marketingPath('/signup', post.lang)})**${t('blog.cta.inlineAfter')}`;
  return withInlineCta(post.body, cta);
}

// ─── Builder ────────────────────────────────────────────────────────────────

const OG_IMAGE = `${SITE}/og-image.png`;
const OG_LOCALE: Record<MarketingLang, string> = { en: 'en_US', es: 'es_LA' };
const SUFFIX = ' | TitiLinks';

type T = (key: string) => string;

/** A dictionary reader for one language. Throws on a missing key so the build fails loudly. */
function reader(lang: MarketingLang): T {
  return (key) => {
    const value = translations[lang][key];
    if (!value) throw new Error(`seo-marketing-html: missing ${lang} translation "${key}"`);
    return value;
  };
}

/** '$7' → '7'. Throws on anything else, so a pricing.ts format change fails the build. */
function amount(price: string): string {
  const m = /^\$(\d+(?:\.\d+)?)$/.exec(price.trim());
  if (!m) throw new Error(`seo-marketing-html: unparseable price "${price}" in src/lib/pricing.ts`);
  return m[1];
}

type Meta = { title: string; description: string; canonical: string };

function metaFor(route: MarketingRoute, lang: MarketingLang, t: T): Meta {
  const canonical = marketingUrl(route, lang);
  switch (route) {
    case '/':
      return { title: t('seo.home.title'), description: t('seo.home.desc'), canonical };
    case '/templates':
      return { title: t('seo.templates.title'), description: t('seo.templates.desc'), canonical };
    case '/terms':
      return { title: t('seo.terms.title'), description: t('seo.legal.desc'), canonical };
    case '/privacy':
      return { title: t('seo.privacy.title'), description: t('seo.legal.desc'), canonical };
    case '/signup':
      return { title: t('seo.signup.title'), description: t('seo.signup.desc'), canonical };
    case '/blog':
      return { title: t('seo.blog.title'), description: t('seo.blog.desc'), canonical };
    default:
      throw new Error(`seo-marketing-html: not a marketing route "${String(route)}"`);
  }
}

/** Pricing, assembled from pricing.ts plus the pricing.* / seo.price.* dictionary keys. */
function pricing(lang: MarketingLang, t: T) {
  const annual = amount(PRO_PRICE.year);
  const monthly = amount(PRO_PRICE.month);
  amount(PRO_ANCHOR_PRICE); // validate the anchor's format too
  const annualTotal = String(Number(annual) * 12);
  // en: "$7/mo, billed annually ($84/year), or $9/month. Founding price — lock it in forever; list price $15/month."
  const proTerms =
    `${PRO_PRICE.year}${t('pricing.period.annual')} ($${annualTotal}${t('seo.price.year')}), ` +
    `${t('seo.price.or')} ${PRO_PRICE.month}${t('pricing.period.monthly')}. ` +
    `${proFoundingLabel(lang)}; ${t('seo.price.list')} ${PRO_ANCHOR_PRICE}${t('pricing.period.monthly')}.`;
  return {
    freeLine: `${t('pricing.free')} — ${t('pricing.free.period')}`,
    proLine: `${t('pricing.pro')} — ${proTerms}`,
    proTerms,
    offers: [
      { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'USD' },
      {
        '@type': 'Offer',
        name: 'Pro (annual)',
        price: annual,
        priceCurrency: 'USD',
        description: `per month, billed annually ($${annualTotal}/year); founding price`,
      },
      {
        '@type': 'Offer',
        name: 'Pro (monthly)',
        price: monthly,
        priceCurrency: 'USD',
        description: `per month; founding price; list price ${PRO_ANCHOR_PRICE}/month`,
      },
    ],
  };
}

/** Homepage FAQ. Every answer is existing copy; a question with no sourced answer is left out. */
function faq(t: T, proTerms: string): { q: string; a: string }[] {
  return [
    { q: t('seo.faq.q.what'), a: t('seo.home.desc') },
    {
      q: t('seo.faq.q.free'),
      a: `${t('hero.freeForever')} ${t('hero.noCreditCard')} ${t('pricing.free')} — ${t('pricing.free.period')}.`,
    },
    { q: t('seo.faq.q.pro'), a: proTerms },
    { q: t('seo.faq.q.spanish'), a: `${t('seo.faq.yes')} ${t('seo.faq.bilingual')}` },
    { q: t('seo.faq.q.start'), a: t('seo.faq.a.start') },
  ];
}

function headBlock(
  m: Meta,
  links: HreflangLink[],
  lang: MarketingLang,
  jsonLd: unknown,
  ogType: 'website' | 'article' = 'website',
): string {
  const e = escapeHtml;
  return [
    `<title>${e(m.title)}</title>`,
    `<meta name="description" content="${e(m.description)}" data-rh="true" />`,
    `<link rel="canonical" href="${e(m.canonical)}" data-rh="true" />`,
    ...links.map(
      (l) => `<link rel="alternate" hreflang="${l.hreflang}" href="${e(l.href)}" data-rh="true" />`,
    ),
    `<meta property="og:title" content="${e(m.title)}" data-rh="true" />`,
    `<meta property="og:description" content="${e(m.description)}" data-rh="true" />`,
    `<meta property="og:url" content="${e(m.canonical)}" data-rh="true" />`,
    `<meta property="og:type" content="${ogType}" data-rh="true" />`,
    `<meta property="og:site_name" content="TitiLinks" data-rh="true" />`,
    `<meta property="og:locale" content="${OG_LOCALE[lang]}" data-rh="true" />`,
    `<meta property="og:image" content="${OG_IMAGE}" data-rh="true" />`,
    `<meta property="og:image:width" content="1200" data-rh="true" />`,
    `<meta property="og:image:height" content="630" data-rh="true" />`,
    `<meta name="twitter:card" content="summary_large_image" data-rh="true" />`,
    `<meta name="twitter:title" content="${e(m.title)}" data-rh="true" />`,
    `<meta name="twitter:description" content="${e(m.description)}" data-rh="true" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" data-rh="true" />`,
    jsonLdScript(jsonLd),
  ].map((tag) => `    ${tag}`).join('\n');
}

const webPage = (m: Meta) => ({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: m.title,
  description: m.description,
  url: m.canonical,
  isPartOf: { '@type': 'WebSite', url: `${SITE}/` },
});

const link = (href: string, text: string) => `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
const nav = (links: [string, string][]) => `<nav>${links.map(([h, x]) => link(h, x)).join(' · ')}</nav>`;
const summary = (inner: string) => `<main id="seo-summary" style="${SUMMARY_STYLE}">${inner}</main>`;

/**
 * The prerendered HTML for one marketing route in one language. `extras.legalIntro`
 * is the first prose paragraph of the legal document in that language (the build
 * script reads it from src/content/legal/*-{en,es}.md — `?raw` imports are
 * Vite-only); omitted, the paragraph is simply left out. `extras.posts` feeds
 * the /blog index: the posts of every language (only `lang`'s are listed).
 */
export function buildMarketingHtml(
  shell: string,
  route: MarketingRoute,
  extras?: { legalIntro?: string; posts?: readonly BlogPost[] },
  lang: MarketingLang = 'en',
): string {
  const e = escapeHtml;
  const t = reader(lang);
  const m = metaFor(route, lang, t);
  const path = (r: MarketingRoute) => marketingPath(r, lang);
  let jsonLd: unknown;
  let body: string;

  if (route === '/') {
    const p = pricing(lang, t);
    const questions = faq(t, p.proTerms);
    jsonLd = {
      '@context': 'https://schema.org',
      '@graph': [
        // No sameAs: no TitiLinks social URL exists in Footer or Navbar.
        { '@type': 'Organization', name: 'TitiLinks', url: `${SITE}/`, logo: OG_IMAGE },
        { '@type': 'WebSite', name: 'TitiLinks', url: `${SITE}/`, inLanguage: ['en', 'es'] },
        {
          '@type': 'SoftwareApplication',
          name: 'TitiLinks',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          url: m.canonical,
          description: t('seo.home.desc'),
          offers: p.offers,
        },
        {
          '@type': 'FAQPage',
          mainEntity: questions.map(({ q, a }) => ({
            '@type': 'Question',
            name: q,
            acceptedAnswer: { '@type': 'Answer', text: a },
          })),
        },
      ],
    };
    body =
      `<h1>${e(`${t('hero.title1')} ${t('hero.title2')}`)}</h1>` +
      `<p>${e(t('hero.subtitle'))}</p>` +
      `<p>${e(t('seo.home.desc'))}</p>` +
      `<h2>${e(t('nav.pricing'))}</h2>` +
      `<ul><li>${e(p.freeLine)}</li><li>${e(p.proLine)}</li></ul>` +
      `<ul>${proFeatures(lang).map((f) => `<li>${e(f)}</li>`).join('')}</ul>` +
      `<h2>${e(t('seo.faq.heading'))}</h2>` +
      questions.map(({ q, a }) => `<h3>${e(q)}</h3><p>${e(a)}</p>`).join('') +
      nav([
        [path('/templates'), t('nav.templates')],
        ['/login', t('nav.login')],
        [path('/terms'), t('footer.terms')],
        [path('/privacy'), t('footer.privacy')],
      ]);
  } else if (route === '/templates') {
    jsonLd = webPage(m);
    body =
      `<h1>${e(`${t('templates.title')} ${t('templates.title2')}`)}</h1>` +
      `<p>${e(t('templates.subtitle'))}</p>` +
      `<p>${e(t('seo.templates.desc'))}</p>` +
      nav([
        [path('/signup'), t('nav.signup')],
        [path('/'), 'TitiLinks'],
      ]);
  } else if (route === '/signup') {
    // SEO.TITILINKS.MONEYPAGE.1 — the money page: promise h1, the three trust
    // claims the code backs, and the one CTA (anchor text = the dictionary key
    // every post must use, docs/SEO.md). Readers with no JS get a link into the
    // page itself; React mounts the form over this summary.
    jsonLd = webPage(m);
    body =
      `<h1>${e(t('seo.signup.h1'))}</h1>` +
      `<p>${e(t('seo.signup.sub'))}</p>` +
      `<ul>` +
      `<li>${e(t('seo.signup.trust.free'))}</li>` +
      `<li>${e(t('seo.signup.trust.bilingual'))}</li>` +
      `<li>${e(t('seo.signup.trust.noCard'))}</li>` +
      `</ul>` +
      `<p>${link(path('/signup'), t('seo.signup.cta'))}</p>` +
      nav([
        [path('/'), 'TitiLinks'],
        ['/login', t('nav.login')],
      ]);
  } else if (route === '/blog') {
    // SEO.TITILINKS.BLOG.1 — the language's posts, newest first. A language
    // with no posts yet points at the other language's blog instead.
    const posts = newestFirst((extras?.posts ?? []).filter((p) => p.lang === lang));
    const other: MarketingLang = lang === 'en' ? 'es' : 'en';
    jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: m.title,
      description: m.description,
      url: m.canonical,
      inLanguage: lang,
      blogPost: posts.map((p) => ({
        '@type': 'BlogPosting',
        headline: p.title,
        url: blogPostUrl(p.lang, p.slug),
        datePublished: p.date,
      })),
    };
    body =
      `<h1>${e(t('blog.h1'))}</h1>` +
      `<p>${e(m.description)}</p>` +
      (posts.length
        ? posts
            .map(
              (p) =>
                `<article><h2>${link(blogPostPath(p.lang, p.slug), p.title)}</h2>` +
                `<p><time datetime="${e(p.date)}">${e(formatPostDate(p.date, p.lang))}</time></p>` +
                `<p>${e(p.description)}</p></article>`,
            )
            .join('')
        : `<p>${e(t('blog.empty'))} ${link(marketingPath('/blog', other), t('blog.otherLang'))}</p>`) +
      nav([
        [path('/'), 'TitiLinks'],
        [path('/signup'), t('nav.signup')],
      ]);
  } else {
    jsonLd = webPage(m);
    const intro = (extras?.legalIntro ?? '').trim();
    body =
      `<h1>${e(m.title.endsWith(SUFFIX) ? m.title.slice(0, -SUFFIX.length) : m.title)}</h1>` +
      `<p>${e(m.description)}</p>` +
      (intro ? `<p>${e(intro)}</p>` : '') +
      nav([[path('/'), 'TitiLinks']]);
  }

  return assemble(shell, lang, headBlock(m, hreflangLinks(route), lang, jsonLd), body);
}

/** The shell in `lang`, its head tags swapped for `head`, `body` as the no-JS summary. */
function assemble(shell: string, lang: MarketingLang, head: string, body: string): string {
  const localized = lang === 'en' ? shell : shell.replace('<html lang="en"', () => `<html lang="${lang}"`);
  const html = beforeHeadClose(stripShareTags(stripHelmetTags(localized)), head);
  return intoRoot(html, summary(body));
}

/**
 * SEO.TITILINKS.BLOG.1 — the prerendered HTML for one post. `bodyHtml` is
 * blogBodyWithCta(post) rendered from markdown by the build script
 * (src/lib/blog-html.ts — react-dom/server stays out of this module, which the
 * app bundle imports). The template owns everything around it: the title as
 * h1, the date, the visible FAQ that backs the FAQPage JSON-LD, and the
 * end-of-post CTA block with the same anchor text as the in-body link.
 */
export function buildBlogPostHtml(shell: string, post: BlogPost, bodyHtml: string): string {
  const e = escapeHtml;
  const t = reader(post.lang);
  const canonical = blogPostUrl(post.lang, post.slug);
  const m: Meta = { title: blogPostTitle(post), description: post.description, canonical };
  const organization = { '@type': 'Organization', name: 'TitiLinks', url: `${SITE}/`, logo: OG_IMAGE };
  const graph: unknown[] = [
    {
      '@type': 'Article',
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      dateModified: post.date,
      inLanguage: post.lang,
      url: canonical,
      mainEntityOfPage: canonical,
      image: OG_IMAGE,
      author: organization,
      publisher: organization,
    },
  ];
  if (post.faq.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: post.faq.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    });
  }
  const signup = marketingPath('/signup', post.lang);
  const body =
    `<article>` +
    `<h1>${e(post.title)}</h1>` +
    `<p><time datetime="${e(post.date)}">${e(formatPostDate(post.date, post.lang))}</time></p>` +
    bodyHtml +
    (post.faq.length
      ? `<h2>${e(t('seo.faq.heading'))}</h2>` + post.faq.map(({ q, a }) => `<h3>${e(q)}</h3><p>${e(a)}</p>`).join('')
      : '') +
    `<section><h2>${e(t('blog.cta.heading'))}</h2><p>${e(t('seo.signup.sub'))}</p>` +
    `<p>${link(signup, t('seo.signup.cta'))}</p></section>` +
    `</article>` +
    nav([
      [marketingPath('/blog', post.lang), t('nav.blog')],
      [marketingPath('/', post.lang), 'TitiLinks'],
    ]);
  const jsonLd = { '@context': 'https://schema.org', '@graph': graph };
  return assemble(shell, post.lang, headBlock(m, blogHreflangLinks(post), post.lang, jsonLd, 'article'), body);
}
