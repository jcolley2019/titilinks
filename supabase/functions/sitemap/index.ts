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
// publicly readable by handle, so onboarding_complete is the "live" signal).
// Never listed: /go/ hops (robots disallows them), /s/ short links, dashboard
// or auth routes, and the battery/test accounts (handle prefix below).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient } from "../_shared/auth.ts";

// Vercel redirects the apex to www (project domain setting) — list the canonical host.
const SITE = "https://www.titilinks.com";
// TL.SEO.I18N.1: the Spanish marketing twins have their own URLs.
const MARKETING = ["/", "/templates", "/terms", "/privacy", "/es", "/es/templates", "/es/terms", "/es/privacy"];
// TL.DOC.ROSTER.1 roster: joey2019pwtestbattery / +free / +onb are harness
// accounts with real public pages — keep them out of the index.
const EXCLUDED_HANDLE_PREFIX = "joey2019pwtest";

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

    const { data: pages, error: gErr } = await svc
      .from("pages")
      .select("handle,user_id")
      .order("handle", { ascending: true });
    if (gErr) throw gErr;

    const handles = (pages ?? [])
      .filter((p: { handle: string; user_id: string }) =>
        live.has(p.user_id) && p.handle && !p.handle.startsWith(EXCLUDED_HANDLE_PREFIX))
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
