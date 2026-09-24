// TL.SEO.PRERENDER.1 — build-time static HTML for the four marketing routes
// (docs/SEO-AUDIT-2026-09.md finding #2, order-of-work step 3).
//
// scripts/prerender-marketing.ts runs this after `vite build`: it takes the
// pristine dist/index.html shell and writes dist/index.html, templates.html,
// terms.html and privacy.html, each carrying its own <title>, description,
// canonical, Open Graph / Twitter card, page-level JSON-LD and a real-HTML
// summary inside #root for readers that run no JavaScript. With JavaScript the
// inline script in index.html hides #seo-summary before first paint and
// React's createRoot().render replaces it, so users see the site as before.
//
// PURE: no DOM, no Node APIs (same rule as seo-profile-html.ts, whose strip /
// insert helpers it reuses). Spec 74 imports it through the dev server.
//
// Copy: every visible string comes from the EN dictionary in useLanguage.tsx,
// from src/lib/pricing.ts, or from public/llms.txt wording — nothing is new
// marketing copy. A missing dictionary key or an unparseable price THROWS, so a
// renamed string fails the build instead of shipping an empty tag. Spanish
// arrives with TL.SEO.I18N.1.

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

export const MARKETING_ROUTES: readonly MarketingRoute[] = ['/', '/templates', '/terms', '/privacy'];

const OG_IMAGE = `${SITE}/og-image.png`;
const SUFFIX = ' | TitiLinks';

// public/llms.txt, the summary paragraph — the one place the product states
// who it is built for in plain words.
const BILINGUAL_LLMS =
  'Bilingual (English / Spanish), built for Latin creators, athletes, artists, musicians, small businesses and side-hustlers.';

/** An EN string by key. Throws on a missing key so the build fails loudly. */
function t(key: string): string {
  const value = translations.en[key];
  if (!value) throw new Error(`seo-marketing-html: missing en translation "${key}"`);
  return value;
}

/** '$7' → '7'. Throws on anything else, so a pricing.ts format change fails the build. */
function amount(price: string): string {
  const m = /^\$(\d+(?:\.\d+)?)$/.exec(price.trim());
  if (!m) throw new Error(`seo-marketing-html: unparseable price "${price}" in src/lib/pricing.ts`);
  return m[1];
}

type Meta = { title: string; description: string; canonical: string };

function metaFor(route: MarketingRoute): Meta {
  switch (route) {
    case '/':
      return { title: t('seo.home.title'), description: t('seo.home.desc'), canonical: `${SITE}/` };
    case '/templates':
      return { title: t('seo.templates.title'), description: t('seo.templates.desc'), canonical: `${SITE}/templates` };
    case '/terms':
      return { title: t('seo.terms.title'), description: t('seo.legal.desc'), canonical: `${SITE}/terms` };
    case '/privacy':
      return { title: t('seo.privacy.title'), description: t('seo.legal.desc'), canonical: `${SITE}/privacy` };
    default:
      throw new Error(`seo-marketing-html: not a marketing route "${String(route)}"`);
  }
}

/** Pricing, assembled from pricing.ts plus the pricing.* dictionary keys. */
function pricing() {
  const annual = amount(PRO_PRICE.year);
  const monthly = amount(PRO_PRICE.month);
  amount(PRO_ANCHOR_PRICE); // validate the anchor's format too
  const annualTotal = String(Number(annual) * 12);
  // "$7/mo, billed annually ($84/year), or $9/month. Founding price — lock it in forever; list price $15/month."
  const proTerms =
    `${PRO_PRICE.year}${t('pricing.period.annual')} ($${annualTotal}/year), ` +
    `or ${PRO_PRICE.month}${t('pricing.period.monthly')}. ` +
    `${proFoundingLabel('en')}; list price ${PRO_ANCHOR_PRICE}${t('pricing.period.monthly')}.`;
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
function faq(proTerms: string): { q: string; a: string }[] {
  return [
    { q: 'What is TitiLinks?', a: t('seo.home.desc') },
    {
      q: 'Is TitiLinks free?',
      a: `${t('hero.freeForever')} ${t('hero.noCreditCard')} ${t('pricing.free')} — ${t('pricing.free.period')}.`,
    },
    { q: 'How much is Pro?', a: proTerms },
    { q: 'Is it available in Spanish?', a: `Yes. ${BILINGUAL_LLMS}` },
    {
      q: 'How do I start?',
      a: `${t('nav.signup')} and ${t('hero.cta').toLowerCase()} titilinks.com/${t('hero.handlePlaceholder')}. ${t('hero.stat1')}.`,
    },
  ];
}

function headBlock(m: Meta, jsonLd: unknown): string {
  const e = escapeHtml;
  return [
    `<title>${e(m.title)}</title>`,
    `<meta name="description" content="${e(m.description)}" data-rh="true" />`,
    `<link rel="canonical" href="${e(m.canonical)}" data-rh="true" />`,
    `<meta property="og:title" content="${e(m.title)}" data-rh="true" />`,
    `<meta property="og:description" content="${e(m.description)}" data-rh="true" />`,
    `<meta property="og:url" content="${e(m.canonical)}" data-rh="true" />`,
    `<meta property="og:type" content="website" data-rh="true" />`,
    `<meta property="og:site_name" content="TitiLinks" data-rh="true" />`,
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
 * The prerendered HTML for one marketing route. `extras.legalIntro` is the
 * first prose paragraph of the legal document (the build script reads it from
 * src/content/legal/*-en.md — `?raw` imports are Vite-only); omitted, the
 * paragraph is simply left out.
 */
export function buildMarketingHtml(
  shell: string,
  route: MarketingRoute,
  extras?: { legalIntro?: string },
): string {
  const e = escapeHtml;
  const m = metaFor(route);
  let jsonLd: unknown;
  let body: string;

  if (route === '/') {
    const p = pricing();
    const questions = faq(p.proTerms);
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
          url: `${SITE}/`,
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
      `<ul>${proFeatures('en').map((f) => `<li>${e(f)}</li>`).join('')}</ul>` +
      '<h2>FAQ</h2>' +
      questions.map(({ q, a }) => `<h3>${e(q)}</h3><p>${e(a)}</p>`).join('') +
      nav([
        ['/templates', t('nav.templates')],
        ['/login', t('nav.login')],
        ['/terms', t('footer.terms')],
        ['/privacy', t('footer.privacy')],
      ]);
  } else if (route === '/templates') {
    jsonLd = webPage(m);
    body =
      `<h1>${e(`${t('templates.title')} ${t('templates.title2')}`)}</h1>` +
      `<p>${e(t('templates.subtitle'))}</p>` +
      `<p>${e(t('seo.templates.desc'))}</p>` +
      nav([
        ['/login', t('nav.signup')],
        ['/', 'TitiLinks'],
      ]);
  } else {
    jsonLd = webPage(m);
    const intro = (extras?.legalIntro ?? '').trim();
    body =
      `<h1>${e(m.title.endsWith(SUFFIX) ? m.title.slice(0, -SUFFIX.length) : m.title)}</h1>` +
      `<p>${e(m.description)}</p>` +
      (intro ? `<p>${e(intro)}</p>` : '') +
      nav([['/', 'TitiLinks']]);
  }

  const html = beforeHeadClose(stripShareTags(stripHelmetTags(shell)), headBlock(m, jsonLd));
  return intoRoot(html, summary(body));
}
