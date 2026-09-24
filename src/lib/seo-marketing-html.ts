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

export type MarketingRoute = '/' | '/templates' | '/terms' | '/privacy';
export type MarketingLang = 'en' | 'es';

export const MARKETING_ROUTES: readonly MarketingRoute[] = ['/', '/templates', '/terms', '/privacy'];
export const MARKETING_LANGS: readonly MarketingLang[] = ['en', 'es'];

// ─── URL scheme ─────────────────────────────────────────────────────────────

/** The path of a marketing route in a language: '/templates' + 'es' → '/es/templates', '/' + 'es' → '/es'. */
export function marketingPath(route: MarketingRoute, lang: MarketingLang): string {
  if (lang === 'en') return route;
  return route === '/' ? '/es' : `/es${route}`;
}

/** The absolute URL on the canonical host: marketingUrl('/', 'en') → 'https://www.titilinks.com/'. */
export function marketingUrl(route: MarketingRoute, lang: MarketingLang): string {
  return `${SITE}${marketingPath(route, lang)}`;
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

function headBlock(m: Meta, route: MarketingRoute, lang: MarketingLang, jsonLd: unknown): string {
  const e = escapeHtml;
  return [
    `<title>${e(m.title)}</title>`,
    `<meta name="description" content="${e(m.description)}" data-rh="true" />`,
    `<link rel="canonical" href="${e(m.canonical)}" data-rh="true" />`,
    ...hreflangLinks(route).map(
      (l) => `<link rel="alternate" hreflang="${l.hreflang}" href="${e(l.href)}" data-rh="true" />`,
    ),
    `<meta property="og:title" content="${e(m.title)}" data-rh="true" />`,
    `<meta property="og:description" content="${e(m.description)}" data-rh="true" />`,
    `<meta property="og:url" content="${e(m.canonical)}" data-rh="true" />`,
    `<meta property="og:type" content="website" data-rh="true" />`,
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
 * Vite-only); omitted, the paragraph is simply left out.
 */
export function buildMarketingHtml(
  shell: string,
  route: MarketingRoute,
  extras?: { legalIntro?: string },
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
        ['/login', t('nav.signup')],
        [path('/'), 'TitiLinks'],
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

  const localized = lang === 'en' ? shell : shell.replace('<html lang="en"', () => `<html lang="${lang}"`);
  const html = beforeHeadClose(stripShareTags(stripHelmetTags(localized)), headBlock(m, route, lang, jsonLd));
  return intoRoot(html, summary(body));
}
