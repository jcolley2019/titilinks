// sitemap — public, read-only. Emits the XML sitemap Google/Bing fetch at
// https://www.titilinks.com/sitemap.xml (vercel.json rewrites that path here).
//
// Auth: NONE by design — crawlers send no headers. config.toml records
// verify_jwt = false for this function (the stripe-webhook precedent) and the
// deploy line passes --no-verify-jwt. It reads with the service client so the
// listing does not depend on RLS, and it only ever emits handles.
//
// What is listed: the marketing pages plus one URL per creator page whose
// owner has finished onboarding (pages has no published flag; every row is
// publicly readable by handle, so onboarding_complete is the "live" signal)
// AND that has content (TL.SEO.SITEMAP.3c/3d, rules.ts): an unarchived item on an enabled,
// non-social block (not social_links / social_icon_row / email_subscribe) whose url is a real
// http(s) link (not example.com, not a numberless wa.me) or that has an image.
// Never listed: /go/ hops (robots disallows them), /s/ short links, dashboard
// or auth routes, and the battery/test accounts (handle prefix below).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient } from "../_shared/auth.ts";
import { isContentItem } from "./rules.ts";

// Vercel redirects the apex to www (project domain setting) — list the canonical host.
const SITE = "https://www.titilinks.com";
// TL.SEO.I18N.1: the Spanish marketing twins have their own URLs.
const MARKETING = ["/", "/templates", "/terms", "/privacy", "/es", "/es/templates", "/es/terms", "/es/privacy"];
// TL.DOC.ROSTER.1 roster: joey2019pwtestbattery / +free / +onb are harness
// accounts with real public pages — keep them out of the index.
const EXCLUDED_HANDLE_PREFIX = "joey2019pwtest";
// The content query returns one row per item; hosted PostgREST caps a
// response at max_rows (1000), so it is read in pages of this size.
const ITEM_PAGE_SIZE = 1000;

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export const buildSitemap = (handles: string[]): string => {
  const urls = [
    ...MARKETING.map((p) => `${SITE}${p}`),
    ...handles.map((h) => `${SITE}/${encodeURIComponent(h)}`),
  ];
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`).join("\n") +
    `\n</urlset>\n`
  );
};

serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  try {
    const svc = serviceClient();
    const { data: profiles, error: pErr } = await svc
      .from("profiles")
      .select("id")
      .eq("onboarding_complete", true);
    if (pErr) throw pErr;
    const live = new Set((profiles ?? []).map((p: { id: string }) => p.id));

    // Page ids with content: content items on enabled blocks, walked up to the page.
    const withContent = new Set<string>();
    for (let from = 0; ; from += ITEM_PAGE_SIZE) {
      const { data: items, error: iErr } = await svc
        .from("block_items")
        .select("id, url, image_url, blocks!inner(type, is_enabled, modes!inner(page_id))")
        .is("archived_at", null)
        .eq("blocks.is_enabled", true)
        .order("id", { ascending: true })
        .range(from, from + ITEM_PAGE_SIZE - 1);
      if (iErr) throw iErr;
      for (const it of (items ?? []) as unknown as {
        url: string | null;
        image_url: string | null;
        blocks: { type: string; modes: { page_id: string } | null } | null;
      }[]) {
        const pageId = it.blocks?.modes?.page_id;
        if (pageId && isContentItem(it, it.blocks?.type ?? "")) withContent.add(pageId);
      }
      if (!items || items.length < ITEM_PAGE_SIZE) break;
    }

    const { data: pages, error: gErr } = await svc
      .from("pages")
      .select("id,handle,user_id")
      .order("handle", { ascending: true });
    if (gErr) throw gErr;

    const handles = (pages ?? [])
      .filter((p: { id: string; handle: string; user_id: string }) =>
        live.has(p.user_id) && withContent.has(p.id) && p.handle &&
        !p.handle.startsWith(EXCLUDED_HANDLE_PREFIX))
      .map((p: { handle: string }) => p.handle);

    const body = req.method === "HEAD" ? null : buildSitemap(handles);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        // Vercel's edge caches the rewrite target; an hour is plenty for a sitemap.
        "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
        "X-Robots-Tag": "noindex", // the sitemap file itself is not a page
      },
    });
  } catch (e) {
    console.error("[sitemap] failed:", e instanceof Error ? e.message : String(e));
    return new Response("sitemap unavailable", { status: 500, headers: { "Content-Type": "text/plain" } });
  }
});
