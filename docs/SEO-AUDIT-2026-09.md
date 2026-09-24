# TitiLinks — Search & AI-Visibility Audit (2026-09-24)

Scope: titilinks.com as search engines (Google, Bing) and AI crawlers/answer engines (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) receive it, as of `c0fca41`. Read: `index.html`, `src/App.tsx`, `src/pages/PublicProfile.tsx` (the one `<Helmet>`), `src/pages/{Index,Templates,LegalPage,NotFound}.tsx`, `src/hooks/useLanguage.tsx`, `vercel.json`, `public/robots.txt`, `public/llms.txt` (untracked), the Vercel project domains, and the live responses of `/`, `/joeyc`, `/sitemap.xml`, `/robots.txt`, `/llms.txt` fetched WITHOUT JavaScript.

## Bottom line

TitiLinks is a client-rendered Vite SPA. Every URL — the homepage, every creator page, the legal pages — returns the same HTML shell: the generic title and description from `index.html` and an empty `<div id="root">`. Anything that does not execute JavaScript sees no content and no per-page metadata. That covers **every social-share scraper** (WhatsApp, iMessage, Facebook, X, LinkedIn, Slack, Discord), **every AI crawler**, and Bing's crawler most of the time. Google renders JS and will index the pages, but late and with weaker signals.

For a link-in-bio product that is a product problem before it is an SEO one: a creator who shares `titilinks.com/handle` on WhatsApp today gets the TitiLinks marketing card, not their own name and photo — the `<Helmet>` in `PublicProfile.tsx` never runs for the scraper.

| # | Finding | Who is affected | Fix | Size |
|---|---------|-----------------|-----|------|
| 1 | **Creator pages have no server-side metadata.** Title/OG/Twitter are set client-side only; scrapers and AI bots get the homepage card. Unknown handles return HTTP 200 with "404" text (soft 404). | Share cards everywhere; Bing; all AI bots; Google (delayed) | Vercel Edge Middleware on `/:handle`: read the page row, rewrite `<title>`, description, OG/Twitter, canonical, add `ProfilePage`/`Person` JSON-LD and a plain-HTML summary block; return a real 404 for unknown handles | M |
| 2 | **Marketing pages are empty without JS.** `/`, `/templates`, `/terms`, `/privacy` have no prerendered content, no per-route title, no canonical, no JSON-LD, no `<h1>` in the shell. | Bing; AI bots; Google (delayed) | Prerender the four routes at build time (Playwright is already a devDependency) and add per-route `<Helmet>` titles/descriptions plus `Organization` + `WebSite` + `SoftwareApplication` JSON-LD | M |
| 3 | **Canonical host and redirect.** Vercel redirects apex → `www` with **307 (temporary)**. `index.html` has no `<link rel="canonical">`; OG image URLs and onboarding's "you're live" URL use the apex. | Google/Bing canonicalisation | Set the domain redirect to **308** in Vercel (Joey, dashboard); canonical on every route; OG/placeholder URLs on `www` | S |
| 4 | **Private routes are crawlable and indexable.** `robots.txt` only disallows `/go/`; `/dashboard/*`, `/login`, `/onboarding`, `/billing/*`, `/s/*` carry no `noindex`. | Index hygiene | `Disallow` them in robots; `X-Robots-Tag: noindex` on them via `vercel.json` headers | S |
| 5 | **`llms.txt` is not deployed** (untracked, so not in the build — `/llms.txt` serves the SPA shell). Content is good; URLs use the apex. | AI answer engines | Commit it with `www` URLs; reference it from robots via a comment; keep it in sync with pricing copy | S |
| 6 | **Spanish is invisible to search.** Language is chosen from `navigator.language` + localStorage on the same URL; there are no `/es` URLs or `hreflang`, so Google (en-US crawler) only ever sees English — for a product "built for Latin creators". | Spanish-language search, the core market | `?lang=es` or `/es/` marketing routes with `hreflang` pairs and prerendered ES copy (depends on #2) | M/L |
| 7 | **Stale fallback URL.** OG image fallback on profiles is `https://titilinks.lovable.app/placeholder.svg`. | Share cards for creators without a photo | Point at `https://www.titilinks.com/placeholder.svg` | XS |
| 8 | **Fonts.** Two Google Fonts stylesheets on every page and a 10-family one on profiles, render-blocking; only the page's own theme fonts are needed. | LCP / Core Web Vitals | Load only the theme's fonts; consider self-hosting the two brand faces | S/M |

Done this week: dynamic `sitemap.xml` on the canonical host (7 URLs, `application/xml`, test accounts excluded), `robots.txt` `Sitemap:` line, Search Console + Bing submissions.

## What each crawler sees today (fetched without JS)

- `https://www.titilinks.com/` → title "TitiLinks — Your Entire Brand. One Powerful Link.", description, OG tags; **no body text, no h1, no canonical, no JSON-LD**.
- `https://www.titilinks.com/joeyc` → **identical** to the homepage. No creator name, bio or photo anywhere in the HTML.
- `https://www.titilinks.com/llms.txt` → the SPA shell (file not deployed).
- `https://titilinks.com/*` → 307 to `www`.
- `sitemap.xml`, `robots.txt` → correct (this week's work).

## Order of work

1. **TL.SEO.HYG.1** (S, one brick, no design decisions): canonical `<link>` on `www` in `index.html`; OG/twitter image on `www`; placeholder fallback on `www`; `<Helmet>` title + description on Templates, Terms, Privacy, Index; robots `Disallow` for `/dashboard/`, `/login`, `/onboarding`, `/billing/`, `/s/`, explicit `Allow` stanzas for GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot; `X-Robots-Tag: noindex` headers on those paths in `vercel.json`; commit `llms.txt` with `www` URLs; onboarding "you're live" URL on `www` (one string — the mobile onboarding flow is otherwise untouched). Joey: flip the apex redirect to 308 in Vercel → Domains.
2. **TL.SEO.META.1** (M): Edge Middleware for `/:handle` — per-creator title/description/OG/canonical/JSON-LD injected into the shell for every client, plain-HTML summary (name, bio, links) for non-JS readers, HTTP 404 for unknown handles. Spec: fetch a creator URL and a bogus handle with a non-JS client and assert both. This is the share-card fix.
3. **TL.SEO.PRERENDER.1** (M): build-time snapshots of `/`, `/templates`, `/terms`, `/privacy` into `dist/` (Vercel serves static files before the SPA rewrite), with `Organization`/`WebSite`/`SoftwareApplication` JSON-LD on the homepage and an FAQ block on pricing. Spec: the four HTML files contain the h1 text without JS.
4. **TL.SEO.I18N.1** (M/L): Spanish URLs + `hreflang`, on top of #3.
5. **TL.SEO.FONTS.1** (S/M): per-theme font loading.

## AI-visibility notes

- AI answer engines cite what they can read without JS and what is stated plainly. After #2/#3 the homepage should carry a one-paragraph "What is TitiLinks" in real HTML (the `llms.txt` summary is the right text), the pricing in plain numbers, and the JSON-LD above.
- `robots.txt` currently allows every bot by `*`; keep it that way and add the explicit AI-bot stanzas so the intent is visible (some crawlers look for their own name).
- Creator pages become citable entities only with #2 (`Person`/`ProfilePage` JSON-LD with `sameAs` links to their socials — the data is already in `block_items`).

## Sources
- Google Search Central — JavaScript SEO basics; Sitemaps; Consolidate duplicate URLs (canonical, 301/308)
- Vercel docs — Project domains & redirects; Edge Middleware (framework-agnostic); Rewrites vs static files order
- Open Graph protocol; Twitter Cards; schema.org `ProfilePage`, `Person`, `Organization`, `SoftwareApplication`
- llmstxt.org — llms.txt proposal
