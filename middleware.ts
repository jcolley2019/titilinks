// TL.SEO.META.1 — Vercel Routing Middleware: server-side metadata for creator pages.
//
// What it does: for a GET of a handle-shaped path (/joeyc — one segment, no
// dot, not an app route, matching HANDLE_PATTERN) it fetches the pristine SPA
// shell (dist/app.html — since TL.SEO.PRERENDER.1 dist/index.html is the
// prerendered homepage) and the page row, and answers with that shell carrying
// the creator's own <title>, description, canonical, Open Graph / Twitter card
// and ProfilePage JSON-LD, plus a plain-HTML summary (name, bio, links) inside
// #root. A handle with no page gets the shell with noindex and HTTP 404 instead
// of the SPA's soft 404. Everything else passes straight through with next().
// The HTML itself is built by src/lib/seo-profile-html.ts (pure, tested by
// spec 73).
//
// Why every client gets it: share scrapers (WhatsApp, iMessage, Facebook, X,
// LinkedIn, Slack, Discord) and AI crawlers run no JavaScript, so the
// client-side <Helmet> in PublicProfile.tsx never reaches them
// (docs/SEO-AUDIT-2026-09.md finding #1). There is no user-agent sniffing and
// no cloaking: people and bots receive byte-identical HTML, and React replaces
// the summary with the live page on load.
//
// Fail-open policy: missing env, a failed shell or page fetch, or any thrown
// error returns next(), so the SPA serves the page exactly as before. The links
// query is optional on top of that: if it fails the page still renders, just
// without links. Only a successful lookup that finds NO page produces a 404.

import { next } from '@vercel/functions';
import { candidateHandle, buildProfileHtml, buildNotFoundHtml } from './src/lib/seo-profile-html';

// Edge runtime env. Declared locally rather than pulling @types/node in for
// one property.
declare const process: { env: Record<string, string | undefined> };

// One shot for extensionless paths; the function bails fast on anything but a handle.
export const config = { matcher: ['/((?!assets/|models/|api/|.*\\..*).*)'] };

type BlockRow = {
  block_items?: { label: string; url: string; order_index: number; archived_at: string | null; is_adult: boolean | null }[];
};

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const handle = candidateHandle(url.pathname);
  if (!handle || request.method !== 'GET') return next();

  const base = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) return next(); // fail open: the SPA still works
  const H = { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };

  try {
    // The pristine shell, a static file; the matcher skips it (it has a dot), so no recursion.
    const shellRes = await fetch(new URL('/app.html', request.url));
    if (!shellRes.ok) return next();
    const shell = await shellRes.text();

    const pageRes = await fetch(
      `${base}/rest/v1/pages?handle=eq.${encodeURIComponent(handle)}&select=id,handle,display_name,bio,avatar_url&limit=1`,
      { headers: H },
    );
    if (!pageRes.ok) return next(); // a failed lookup is not "no such page"
    const pages = await pageRes.json();

    const sec = {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    };

    if (!Array.isArray(pages) || !pages.length) {
      return new Response(buildNotFoundHtml(shell, handle), {
        status: 404,
        headers: { ...sec, 'Cache-Control': 'public, max-age=0, s-maxage=60' },
      });
    }
    const page = pages[0];

    let links: { label: string; url: string; isAdult: boolean | null }[] = [];
    try {
      // Page 1's enabled link-bearing blocks and their items, one embedded
      // query; any failure → no links, never no page. social_links is the
      // header social row — the creator's own profiles, the best sameAs source.
      const r = await fetch(
        `${base}/rest/v1/blocks?select=id,type,order_index,block_items(label,url,order_index,archived_at,is_adult),modes!inner(page_id,type)` +
          `&modes.page_id=eq.${page.id}&modes.type=eq.page1&is_enabled=eq.true` +
          `&type=in.(links,social_links,social_icon_row,primary_cta)&order=order_index.asc`,
        { headers: H },
      );
      if (r.ok) {
        const blocks: BlockRow[] = await r.json();
        links = blocks
          .flatMap((b) =>
            (b.block_items || [])
              .filter((i) => !i.archived_at && i.url)
              .sort((a, c) => a.order_index - c.order_index)
              .map((i) => ({ label: i.label, url: i.url, isAdult: i.is_adult })),
          )
          .slice(0, 30);
      }
    } catch {
      /* links are optional */
    }

    const html = buildProfileHtml(shell, {
      handle: page.handle,
      displayName: page.display_name,
      bio: page.bio,
      avatarUrl: page.avatar_url,
      links,
    });
    return new Response(html, {
      status: 200,
      headers: { ...sec, 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600' },
    });
  } catch (e) {
    console.error('[middleware] profile meta failed:', e instanceof Error ? e.message : String(e));
    return next();
  }
}
