SEO.TITILINKS.BLOG.1

Goal: a minimal blog on titilinks.com built with the existing static pre-render, plus the first Spanish post. Read docs/SEO.md first.

Infrastructure
1. Posts live as markdown files with front matter in content/blog/<lang>/<slug>.md (lang = es or en). Front matter: title, description, date, lang, slug, twin (optional slug of the other-language version), faq (array of q/a).
2. Routes: /es/blog and /blog (index per language, newest first) and /es/blog/<slug>, /blog/<slug>. Build them through scripts/prerender-marketing.ts + seo-marketing-html.ts like the other pages, so every post is full HTML without JS. Add the vercel.json rewrites and the sitemap rows (xml.ts) the three-edit rule requires; posts and index pages go in the sitemap.
3. Post template: title as H1, date, body, FAQPage JSON-LD from the front-matter faq, Article JSON-LD, and two links to the language's money page from docs/SEO.md: one in-body in the first third ("crear mi link en bio" → /es/registro; EN "create my link in bio" → /signup) and one end-of-post CTA block with the same anchor text. Template injects these; posts don't write their own CTA.
4. hreflang: a post with a twin emits en/es/x-default like the marketing twins. A post without a twin emits only its own language plus x-default pointing at itself. Extend scripts/hreflang-dist.test.mjs to accept that shape for blog pages without weakening the check for twins.
5. Nav/footer: add a "Blog" link in both languages.

Post 1 (Spanish)
6. Title: "Link en bio para creadores: cómo crear uno gratis". Slug link-en-bio-para-creadores. 900–1,300 words, natural Latin American Spanish, no literal translation feel. Answer the title in the first 120 words, then: qué es un link en bio, por qué los creadores lo necesitan, cómo crear uno gratis en TitiLinks paso a paso (only steps the product actually has — check the onboarding code), qué poner primero, errores comunes. 4 FAQ entries. Mention TitiLinks is bilingual once; no Linktree bashing. Run /humanizer on the draft before saving; Spanish output must stay Spanish.
7. No EN twin for this post.

Verify: guard/tsc exit 0; npm run build passes including the hreflang check (now covering 10 marketing + 2 index + 1 post); live curl with no JS of /es/blog/link-en-bio-para-creadores shows title, H1, both money-page links with the exact anchor text, FAQPage and Article JSON-LD, lang="es", es + x-default hreflang; /es/blog lists it; sitemap (function direct) lists all three new URLs with correct alternates; redeploy the sitemap function as before; existing specs 71/73/74/75 pass; add one spec for the post page. Lighthouse SEO ≥ 90 on the post. Commit "SEO.TITILINKS.BLOG.1 — minimal blog + first ES post" and push; confirm Vercel production build succeeded.

Print the report between the lines "=== REPORT — SEO.TITILINKS.BLOG.1 ===" and "=== END REPORT ===": the files that make up the blog pipeline, how a future post is added (steps), the post's URL and word count, verification table, git status, up to three worth-knowing notes. Under 60 lines, no post body, no diffs.
