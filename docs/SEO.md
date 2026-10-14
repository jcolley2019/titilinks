# SEO — money pages (SEO.TITILINKS.MONEYPAGE.1)

Two signup pages, one URL per language, each pre-rendered at build time
(`scripts/prerender-marketing.ts` → `dist/signup.html`, `dist/es/registro.html`;
`vercel.json` rewrites the paths to the files). `/login?mode=signup` stays as an alias.

| Language | Route | Title | H1 |
|---|---|---|---|
| EN | `/signup` | Create your link in bio — free \| TitiLinks | Create your link in bio — free, in English and Spanish |
| ES | `/es/registro` | Crea tu link en bio gratis \| TitiLinks | Crea tu link en bio gratis, en español e inglés |

Copy lives in `src/hooks/useLanguage.tsx` under `seo.signup.*` (both dictionaries).
Both URLs are listed by the `sitemap` edge function (`supabase/functions/sitemap/index.ts`).

## Target phrases

- EN: "link in bio", "linktree alternative", "bilingual link in bio"
- ES: "link en bio", "alternativa a linktree", "link en bio para creadores"

## CTA anchor text (posts must use exactly this, linking to the route above)

- EN: **Create my link in bio** → `https://www.titilinks.com/signup`
- ES: **Crear mi link en bio** → `https://www.titilinks.com/es/registro`

## Trust strip (only claims the code backs)

Free plan forever (`src/lib/pricing.ts`) · No credit card required (email/Google signup, checkout later) · Pages in English and Spanish.

hreflang (SEO.TITILINKS.HREFLANG.1): every marketing twin carries en/es/x-default (x-default = EN) on https://www.titilinks.com, the sitemap repeats them as `xhtml:link` alternates, and `scripts/hreflang-dist.test.mjs` fails `npm run build` when a prerendered page breaks that.
