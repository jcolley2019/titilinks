# SEO.TITILINKS.POST.4 — ES post: Cómo poner varios links en Instagram (2026)

Read first: docs/SEO.md, BLOG_BRIEF.md, POST3_BRIEF.md (pipeline lessons), and content/blog/es/link-en-bio-para-creadores.md for the ES voice and front-matter shape.

## The post
- Path: content/blog/es/como-poner-varios-links-en-instagram.md
- URL: /es/blog/como-poner-varios-links-en-instagram
- Front matter: title "Cómo poner varios links en Instagram (2026)"; description (under 155 chars, contains "varios links en Instagram"); date 2026-10-14; lang es; slug como-poner-varios-links-en-instagram; no twin (solo post: es + x-default); faq with 4 Q&As (below).
- Target phrase "cómo poner varios links en Instagram": in the title, in the first 100 words, in one H2. Secondary: "link en bio", "varios enlaces en la bio de Instagram". Do not stuff.
- 900–1,200 words, Spanish (neutral Latin American, tú), written for a creator in Latin America or the US who posts in Spanish or in both languages. Plain, concrete, no hype. /humanizer must keep it in Spanish.
- Do NOT write any CTA or link to /es/registro or /signup — the template injects the ES money-page links. No competitor links.

## Honesty constraints
- Instagram now lets accounts add several links directly in the bio. Before writing, check the current limit on Instagram's own help pages (help.instagram.com) and state it as it is today, with "a la fecha de este artículo". If you cannot verify, write "varios links (revisa el límite actual en tu app)" and never a number.
- The case for a link-in-bio page is therefore NOT "Instagram solo permite un link". It is: you choose the order; each button gets a real title (in two languages if you want); you see clicks per link; one URL works in Instagram, TikTok and YouTube; Instagram's native links show only the first one prominently and the rest behind a tap (verify this too — if unsure, leave it out).
- TitiLinks facts, same as POST.3: the page UI follows the visitor's browser language (EN/ES); link titles and bio are written by the creator and never auto-translated; Free plan = views, clicks, per-short-link clicks, one page; Pro = top destinations, traffic sources (TikTok / Instagram / otros), goal clicks, second page via ?page=2. Claim nothing beyond what the repo shows.

## Outline (H2s)
1. Las dos formas de poner varios links en Instagram — (a) los links nativos de la bio, paso a paso en la app (Editar perfil → Enlaces → Agregar enlace externo; verify the labels in Spanish against help.instagram.com and adjust), (b) una página de link en bio con un solo URL.
2. Cuándo basta con los links nativos y cuándo no (short, fair comparison; one table: criterio / links nativos / página de link en bio).
3. Cómo crear tu página de link en bio en 5 minutos — generic steps a creator would take in TitiLinks (crear cuenta, elegir tu URL, agregar links con título, ordenar, pegar el URL en Instagram). Describe only features that exist.
4. Cómo ordenar y titular tus links para que la gente haga clic (3–4 concrete tips; reuse the bilingual-title advice from the EN post, in Spanish).
5. Cómo saber qué link funciona (what Free vs Pro shows, by plan, honestly).

## FAQ (front matter faq → FAQPage JSON-LD)
- ¿Cuántos links puedo poner en la bio de Instagram? (the verified answer, dated)
- ¿Necesito una página de link en bio si Instagram ya permite varios links? (fair: depende; the three reasons above)
- ¿Puedo usar el mismo link en Instagram y TikTok? (sí, un URL)
- ¿TitiLinks es gratis? (plan gratis, sin tarjeta; keep to what docs/SEO.md and the pricing copy say)

## Pipeline
1. Create the markdown file.
2. vercel.json: add the rewrite for /es/blog/como-poner-varios-links-en-instagram matching the existing ES post rewrites.
3. supabase/functions/sitemap/xml.ts: add the BLOG_POSTS row (lang es, solo).
4. /humanizer on the draft; apply edits; Spanish stays Spanish; facts and the Instagram-limit sentence unchanged.
5. npm run build (hreflang-dist test must pass: 16 pages = 12 twins + 4 solo).
6. npx supabase functions deploy sitemap --project-ref ohmvlypcbrfkuudcuqub --no-verify-jwt
7. Commit the three files by path ("seo: POST.4 ES cómo poner varios links en Instagram") and push to main.
8. After Vercel deploys (up to 3 min): curl -s the live post and sitemap for the checks below; if not deployed yet, report live checks as "pending".

## Verification table (pass/fail)
- Built HTML for the post: <title> with the post title; meta description; Article JSON-LD; FAQPage JSON-LD with 4 questions; both injected ES money-page links ("Crear mi link en bio" → /es/registro); hreflang es + x-default, no en alternate.
- Built /es/blog index lists the new post first (date 2026-10-14) above the two older ES posts.
- Markdown greps: no "/es/registro" or "/signup"; no "solo permite un link"; no "traduce automáticamente".
- The Instagram link-limit sentence contains "a la fecha" and either a verified number or the no-number fallback.
- hreflang-dist test passed inside npm run build.
- Sitemap deployed; live sitemap.xml contains the new URL (19 URLs).
- Live post URL returns 200 with the title in the HTML.
- Spec 87 passes (it reads every ES post, so it now covers this one).
- POST.3 (EN) and the two older ES posts' built HTML unchanged.

Print the report between the lines "=== REPORT — SEO.TITILINKS.POST.4 ===" and "=== END REPORT ===": outcome/commit hash, departures with reasons, the verification table with pass/fail counts, git status, up to three worth-knowing notes. Under 60 lines, no diffs. Leave audit-scratch/, docs/TITILINKS_HANDOFF_rev12.md and reseed.sql untracked. Below END REPORT, print the final post markdown (after humanizer) so the architect can review the Spanish.
