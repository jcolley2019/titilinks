// unfurl — fetch a page's metadata (OG/Twitter + oEmbed + favicon fallbacks)
// so the Featured Links editor can auto-fill a link's title + image.
//
// SECURITY: This function is a server-side fetcher of USER-SUPPLIED URLs, so it
// is a Server-Side Request Forgery (SSRF) target. The SSRF guard below is
// MANDATORY and ships in this same file/commit — never as a follow-up:
//   - http/https only
//   - host (or raw-IP host) must NOT resolve into private/loopback/link-local/
//     internal ranges or the cloud-metadata IP (169.254.169.254)
//   - redirects are followed MANUALLY, re-validating each hop's host
//   - ~5s timeout, ~1.5MB streamed body cap, <=5 redirects
//
// Auth: relies on the platform default verify_jwt=true. Do NOT add an
// [functions.unfurl] entry to config.toml; never set verify_jwt=false here.
//
// KNOWN RESIDUAL (v1, accepted): the range check does not fully close DNS
// rebinding (the host could resolve to a public IP at validation time and a
// private IP at fetch time). Hardened later by pinning the validated IP.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEOUT_MS = 5_000;
const MAX_BYTES = 1.5 * 1024 * 1024; // ~1.5MB hard cap on streamed body
const HEAD_PARSE_LIMIT = 512 * 1024; // only scan the first ~512KB for <head>
const MAX_REDIRECTS = 5;
const USER_AGENT =
  "Mozilla/5.0 (compatible; TitiLinksUnfurl/1.0; +https://titilinks.com)";

interface UnfurlResult {
  title: string | null;
  image: string | null;
  description: string | null;
  favicon: string | null;
  siteName: string | null;
}

// ─── SSRF guard: IP range checks ─────────────────────────────────────────────

function ipv4Blocked(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return true; // malformed → block (fail closed)
  const [a, b, c, d] = parts.map((p) => Number(p));
  for (const n of [a, b, c, d]) {
    if (!Number.isInteger(n) || n < 0 || n > 255) return true;
  }
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local incl. metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved + 255 broadcast
  return false;
}

function ipv6Blocked(ipRaw: string): boolean {
  // Normalize to 8 hextets BEFORE any range check so expanded / non-canonical
  // forms (e.g. "0:0:0:0:0:0:0:1", "fe80:0:0:0:0:0:0:1") are handled and we
  // never depend on the input being compressed by new URL()/Deno.resolveDns.
  let s = ipRaw.toLowerCase().trim();
  const pct = s.indexOf("%");
  if (pct >= 0) s = s.slice(0, pct); // strip zone id (e.g. %eth0)

  // Fold a trailing embedded IPv4 (e.g. ::ffff:1.2.3.4) into two hextets.
  const v4: number[] = [];
  if (s.includes(".")) {
    const idx = s.lastIndexOf(":");
    if (idx < 0) return true; // dotted but no colon → not valid IPv6
    const parts = s.slice(idx + 1).split(".");
    if (parts.length !== 4) return true;
    const nums = parts.map((p) => Number(p));
    for (const n of nums) {
      if (!Number.isInteger(n) || n < 0 || n > 255) return true;
    }
    v4.push((nums[0] << 8) | nums[1], (nums[2] << 8) | nums[3]);
    s = s.slice(0, idx); // remaining IPv6 prefix (may end in ':')
  }

  // Expand a single "::" into the right number of zero groups.
  let head: string[];
  let tail: string[];
  const dbl = s.indexOf("::");
  if (dbl >= 0) {
    if (s.indexOf("::", dbl + 1) >= 0) return true; // more than one "::" → invalid
    const before = s.slice(0, dbl);
    const after = s.slice(dbl + 2);
    head = before ? before.split(":") : [];
    tail = after ? after.split(":") : [];
  } else {
    head = s ? s.split(":") : [];
    tail = [];
  }

  const parseHextet = (g: string): number =>
    /^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : -1;

  const groups: number[] = [];
  for (const g of head) { const n = parseHextet(g); if (n < 0) return true; groups.push(n); }
  if (dbl >= 0) {
    const fill = 8 - (head.length + tail.length + v4.length);
    if (fill < 1) return true; // "::" must compress at least one group
    for (let i = 0; i < fill; i++) groups.push(0);
  }
  for (const g of tail) { const n = parseHextet(g); if (n < 0) return true; groups.push(n); }
  for (const n of v4) groups.push(n);

  if (groups.length !== 8) return true; // malformed → block (fail closed)

  // Range checks on the normalized hextets.
  if (groups.every((g) => g === 0)) return true; // :: unspecified
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1 loopback
  if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  // IPv4-mapped (::ffff:a.b.c.d) → validate the embedded IPv4
  if (
    groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 &&
    groups[4] === 0 && groups[5] === 0xffff
  ) {
    const ip = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    return ipv4Blocked(ip);
  }
  return false;
}

function looksLikeIpv4(host: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

// Returns true if the host must NOT be fetched. Fails CLOSED (blocks) when the
// host cannot be resolved/validated.
async function isBlockedHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost")) return true;

  // Literal IP hosts: validate directly, no DNS.
  if (looksLikeIpv4(host)) return ipv4Blocked(host);
  if (host.includes(":")) return ipv6Blocked(host); // bracketless IPv6 literal

  // Hostname: resolve and validate EVERY returned address.
  const ips: { ip: string; v6: boolean }[] = [];
  try {
    const a = await Deno.resolveDns(host, "A");
    for (const ip of a) ips.push({ ip, v6: false });
  } catch { /* no A records */ }
  try {
    const aaaa = await Deno.resolveDns(host, "AAAA");
    for (const ip of aaaa) ips.push({ ip, v6: true });
  } catch { /* no AAAA records */ }

  if (ips.length === 0) return true; // cannot verify → block
  for (const { ip, v6 } of ips) {
    if (v6 ? ipv6Blocked(ip) : ipv4Blocked(ip)) return true;
  }
  return false;
}

// Throws if the URL must not be fetched (bad scheme or blocked host).
async function assertFetchable(urlStr: string): Promise<URL> {
  const u = new URL(urlStr);
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("blocked: scheme");
  }
  if (await isBlockedHost(u.hostname)) {
    throw new Error("blocked: host");
  }
  return u;
}

// ─── Capped, redirect-manual fetch ───────────────────────────────────────────

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (received >= MAX_BYTES) {
        try { await reader.cancel(); } catch { /* ignore */ }
        break;
      }
    }
  }
  const all = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) { all.set(c, offset); offset += c.length; }
  return new TextDecoder("utf-8", { fatal: false }).decode(all);
}

// Fetches HTML following redirects MANUALLY, re-validating each hop's host
// against the SSRF guard before following. Returns the final URL + body text.
async function safeFetchHtml(startUrl: string): Promise<{ finalUrl: string; html: string }> {
  let current = startUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await assertFetchable(current); // re-validate EVERY hop (incl. redirects)

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(current, {
        redirect: "manual",
        signal: ac.signal,
        headers: {
          "User-Agent": USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        try { await res.body?.cancel(); } catch { /* ignore */ }
        if (!loc) return { finalUrl: current, html: "" };
        current = new URL(loc, current).toString(); // resolve relative redirects
        continue;
      }

      const html = await readCapped(res);
      return { finalUrl: current, html };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("too many redirects");
}

// ─── HTML parsing (regex over <head>) ────────────────────────────────────────

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .trim();
}

function headOf(html: string): string {
  const lower = html.toLowerCase();
  const end = lower.indexOf("</head>");
  if (end >= 0) return html.slice(0, end);
  return html.slice(0, Math.min(html.length, HEAD_PARSE_LIMIT));
}

// Build a map of meta property/name → content (first occurrence wins).
function metaMap(head: string): Record<string, string> {
  const map: Record<string, string> = {};
  const tagRe = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(head)) !== null) {
    const tag = m[0];
    const keyMatch = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i);
    const contentMatch = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i);
    if (!keyMatch || !contentMatch) continue;
    const key = keyMatch[1].toLowerCase();
    if (!(key in map)) map[key] = decodeEntities(contentMatch[1]);
  }
  return map;
}

function titleTag(head: string): string | null {
  const m = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]) : null;
}

function faviconHref(head: string): string | null {
  const linkRe = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(head)) !== null) {
    const tag = m[0];
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    if (!/\bicon\b/i.test(rel)) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (href) return decodeEntities(href);
  }
  return null;
}

function resolveUrl(value: string, base: string): string {
  try { return new URL(value, base).toString(); } catch { return value; }
}

// ─── oEmbed (known providers) ────────────────────────────────────────────────

function oembedEndpoint(u: URL): string | null {
  const h = u.hostname.replace(/^www\./, "").toLowerCase();
  const target = encodeURIComponent(u.toString());
  if (h === "youtube.com" || h.endsWith(".youtube.com") || h === "youtu.be") {
    return `https://www.youtube.com/oembed?format=json&url=${target}`;
  }
  if (h === "vimeo.com" || h.endsWith(".vimeo.com")) {
    return `https://vimeo.com/api/oembed.json?url=${target}`;
  }
  if (h === "spotify.com" || h.endsWith(".spotify.com")) {
    return `https://open.spotify.com/oembed?url=${target}`;
  }
  if (h === "soundcloud.com" || h.endsWith(".soundcloud.com")) {
    return `https://soundcloud.com/oembed?format=json&url=${target}`;
  }
  return null;
}

async function fetchOembed(endpoint: string): Promise<Partial<UnfurlResult>> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      signal: ac.signal,
      headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
    });
    if (!res.ok) return {};
    const data = await res.json();
    return {
      title: typeof data.title === "string" ? data.title : null,
      image: typeof data.thumbnail_url === "string" ? data.thumbnail_url : null,
      siteName: typeof data.author_name === "string" ? data.author_name : null,
    };
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

function json200(body: UnfurlResult | Record<string, never>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const url = (body as { url?: unknown }).url;
    if (typeof url !== "string" || !url.trim()) return json200({});

    let u: URL;
    try {
      u = new URL(url.trim());
    } catch {
      return json200({});
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return json200({});

    const result: UnfurlResult = {
      title: null, image: null, description: null, favicon: null, siteName: null,
    };

    // Layer (a): oEmbed for known providers — cleanest title/image/author.
    const endpoint = oembedEndpoint(u);
    if (endpoint) {
      const o = await fetchOembed(endpoint);
      if (o.title) result.title = o.title;
      if (o.image) result.image = o.image;
      if (o.siteName) result.siteName = o.siteName;
    }

    // Layer (b): OG/Twitter scrape — fills gaps oEmbed didn't cover. Any
    // failure here (incl. SSRF block) leaves earlier results intact.
    try {
      const { finalUrl, html } = await safeFetchHtml(u.toString());
      if (html) {
        const head = headOf(html);
        const meta = metaMap(head);

        const ogTitle = meta["og:title"] || meta["twitter:title"] || titleTag(head);
        const ogImage = meta["og:image"] || meta["og:image:url"] || meta["twitter:image"] ||
          meta["twitter:image:src"];
        const ogDesc = meta["og:description"] || meta["twitter:description"] ||
          meta["description"];
        const ogSite = meta["og:site_name"];
        const fav = faviconHref(head);

        if (!result.title && ogTitle) result.title = ogTitle;
        if (!result.image && ogImage) result.image = resolveUrl(ogImage, finalUrl);
        if (!result.description && ogDesc) result.description = ogDesc;
        if (!result.siteName && ogSite) result.siteName = ogSite;
        if (!result.favicon && fav) result.favicon = resolveUrl(fav, finalUrl);
      }
    } catch {
      // fetch blocked/failed/timed out — graceful, keep what we have
    }

    // Layer (c): favicon + hostname title as last resort.
    if (!result.favicon) {
      try { result.favicon = new URL("/favicon.ico", u.origin).toString(); } catch { /* ignore */ }
    }
    if (!result.title) {
      result.title = u.hostname.replace(/^www\./, "");
    }

    return json200(result);
  } catch (error) {
    console.error("unfurl error:", error);
    return json200({}); // never throw to the client
  }
});
