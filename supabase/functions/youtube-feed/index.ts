import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHANNEL_ID_RE = /^UC[\w-]{22}$/;
const FETCH_TIMEOUT_MS = 8000;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 15;
const CACHE_TTL_MS = 15 * 60 * 1000;

const cache = new Map<string, { at: number; data: unknown }>();

function json200(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchText(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TitiLinks/1.0)" },
        redirect: "follow",
      });
      if (res.ok) return await res.text();
    } catch {
      /* fall through to retry */
    } finally {
      clearTimeout(t);
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

function normalizeInput(raw: string): { channelId?: string; pageUrl?: string } {
  let s = (raw || "").trim();
  if (!s) return {};
  if (CHANNEL_ID_RE.test(s)) return { channelId: s };
  if (!/^https?:\/\//i.test(s) && !s.startsWith("@") && !s.includes("/")) {
    s = "@" + s.replace(/^@/, "");
  }
  if (s.startsWith("@")) return { pageUrl: `https://www.youtube.com/${s}` };
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    if (!/(^|\.)youtube\.com$/.test(u.hostname) && u.hostname !== "youtu.be") return {};
    const chMatch = u.pathname.match(/\/channel\/(UC[\w-]{22})/);
    if (chMatch) return { channelId: chMatch[1] };
    return { pageUrl: u.toString() };
  } catch {
    return {};
  }
}

async function resolveChannelId(pageUrl: string): Promise<string | null> {
  try {
    const u = new URL(pageUrl);
    if (!/(^|\.)youtube\.com$/.test(u.hostname) && u.hostname !== "youtu.be") return null;
  } catch {
    return null;
  }
  const html = await fetchText(pageUrl);
  if (!html) return null;
  // Video pages (watch / shorts / youtu.be): the owner's channelId is the
  // reliable signal. Channel pages: use page-own metadata only (NOT the
  // generic channelId, which on a channel page can match a featured channel).
  const isVideoPage = /\/watch|\/shorts\/|youtu\.be/.test(pageUrl);
  const patterns = isVideoPage
    ? [/"channelId":"(UC[\w-]{22})"/]
    : [
        /rel="canonical"[^>]+href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
        /"externalId":"(UC[\w-]{22})"/,
        /property="og:url"[^>]+content="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
        /itemprop="identifier"[^>]+content="(UC[\w-]{22})"/,
      ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function parseFeed(xml: string, limit: number) {
  const channelTitleMatch = xml.match(/<title>([^<]*)<\/title>/);
  const channelTitle = channelTitleMatch ? decodeEntities(channelTitleMatch[1]) : null;
  const entries = xml.split("<entry>").slice(1);
  const videos: Array<Record<string, unknown>> = [];
  for (const e of entries) {
    if (videos.length >= limit) break;
    const idM = e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!idM) continue;
    const videoId = idM[1];
    const titleM = e.match(/<title>([^<]*)<\/title>/);
    const pubM = e.match(/<published>([^<]+)<\/published>/);
    const thumbM = e.match(/<media:thumbnail[^>]+url="([^"]+)"/);
    videos.push({
      video_id: videoId,
      title: titleM ? decodeEntities(titleM[1]) : "",
      published: pubM ? pubM[1] : null,
      thumbnail: thumbM ? thumbM[1] : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }
  return { channelTitle, videos };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  let channelId: string | null = null;
  if (typeof body.channel_id === "string" && CHANNEL_ID_RE.test(body.channel_id.trim())) {
    channelId = body.channel_id.trim();
  } else if (typeof body.input === "string") {
    const norm = normalizeInput(body.input);
    if (norm.channelId) channelId = norm.channelId;
    else if (norm.pageUrl) channelId = await resolveChannelId(norm.pageUrl);
  }

  if (!channelId) {
    return json200({ videos: [], error: "Could not resolve a YouTube channel from that input." });
  }

  const cached = cache.get(channelId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return json200(cached.data);

  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  if (!xml) return json200({ videos: [], channel_id: channelId, error: "Feed fetch failed." });

  const { channelTitle, videos } = parseFeed(xml, limit);
  const data = { channel_id: channelId, channel_title: channelTitle, videos };
  cache.set(channelId, { at: Date.now(), data });
  return json200(data);
});
