# SEO.TITILINKS.POST.3 — first EN blog post

Read first: docs/SEO.md, BLOG_BRIEF.md, and one existing post (content/blog/es/link-en-bio-para-creadores.md) so the new file matches the pipeline exactly.

## The post
- Path: content/blog/en/link-in-bio-for-latin-creators.md
- URL: /blog/link-in-bio-for-latin-creators
- Front matter: title "Link in bio for Latin creators: bilingual pages that convert"; description (under 155 chars, contains "link in bio for Latin creators"); date 2026-10-14; lang en; slug link-in-bio-for-latin-creators; no twin (solo post); faq with 4 Q&As (see below).
- Target search question: "link in bio for Latin creators" / "bilingual link in bio". Use "link in bio for Latin creators" once in the H1-equivalent title, once in the first 100 words, once in a subheading. Do not stuff it.
- Length 900–1,200 words, English, written for a US-based creator whose audience is split between English and Spanish speakers. Plain, concrete, no hype.
- Do NOT write any CTA or link to /signup — buildBlogPostHtml injects both money-page links. Do not link to competitors.

## Honesty constraint (non-negotiable)
What TitiLinks actually does: the page UI (buttons, labels, the signup flow, system text) follows the visitor's browser language, EN or ES. The creator's own content — link titles, bio text — is NOT auto-translated; the creator writes it. Describe it exactly that way. Never claim "your page is translated automatically" or "fully bilingual page". The word "bilingual" in the title refers to the experience a creator can build (bilingual UI + the creator's own EN/ES or Spanglish link titles), and the body must make that explicit in its first section.

## Outline
1. Why a split EN/ES audience breaks a normal link-in-bio page (one language wins, the other half bounces).
2. What "bilingual" means here — the honesty paragraph above, stated plainly.
3. Five concrete tactics: write link titles both ways or in natural Spanglish; order links for the platform the traffic comes from; one page, not two accounts; name buttons by outcome ("Mi curso / My course"); keep the top three links stable.
4. A short example layout for a creator (music or lifestyle), as a bulleted list.
5. What to measure in the first month (clicks per link, by platform referrer) and one change to make from it.
Use H2s for sections. One table is fine (table styles exist in Blog.tsx PROSE).

## FAQ (front matter faq, also used for FAQPage JSON-LD)
- Does TitiLinks translate my links automatically? (No — UI follows browser language; you write your own titles.)
- Can I have one page for English and Spanish followers? (Yes, one URL.)
- Is TitiLinks free to start? (answer from docs/SEO.md / current pricing copy only; if unsure, say there is a free plan and nothing more specific)
- What's the difference from Linktree for Latin creators? (UI in Spanish for Spanish-speaking visitors; don't claim features you can't verify in the repo)

## Pipeline
1. Create the markdown file.
2. vercel.json: add the rewrite for /blog/link-in-bio-for-latin-creators matching the existing post rewrites.
3. supabase/functions/sitemap/xml.ts: add the BLOG_POSTS row (lang en, real date, no alternate twin).
4. Run /humanizer on the draft; apply its edits; keep facts and the honesty paragraph intact.
5. npm run build (hreflang-dist.test.mjs must pass; solo post = en + x-default).
6. npx supabase functions deploy sitemap --project-ref ohmvlypcbrfkuudcuqub --no-verify-jwt
7. Commit (stage the four files by path: the .md, vercel.json, xml.ts, and any dist/prerender outputs the repo tracks) with "seo: POST.3 EN link in bio for Latin creators", push to main.
8. After Vercel finishes: curl -s https://www.titilinks.com/blog/link-in-bio-for-latin-creators and https://www.titilinks.com/sitemap.xml for the live checks below. If the deploy isn't done after 3 minutes, report the dist checks as pass and the live checks as "pending".

## Verification table (print pass/fail)
- Built HTML (dist) for the post contains: <title> with the post title; meta description; Article JSON-LD; FAQPage JSON-LD with 4 questions; both injected money-page links ("Create my link in bio" → /signup and the ES anchor → /es/registro); hreflang en + x-default and no es alternate.
- Built /blog index lists the post with its date and no longer shows the "no posts yet" state.
- Grep the markdown: no "/signup" or "/es/registro" written by the post itself; no phrase "translated automatically" / "fully bilingual".
- hreflang-dist test passed inside npm run build.
- Sitemap function deployed; live sitemap.xml contains the post URL.
- Live post URL returns 200 with the title in the HTML.
- Existing ES posts' built HTML unchanged (hreflang still es + x-default).
