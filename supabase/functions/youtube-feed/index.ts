// youtube-feed — resolve a YouTube channel/playlist and return its latest
// videos (YouTube Data API v3, spends YOUTUBE_API_KEY quota per uncached call).
//
// TWO DOORS (TL.EDGE.1):
//   EDITOR (signed-in caller, getAuthedUser !== null — VideoFeedEditor and
//     the owner's own page view): unchanged resolution logic — a well-formed
//     playlist_id / channel_id, or free-form `input` (handle, URL, video URL)
//     resolved by scraping the YouTube page. Capped at
//     DAILY_LIMITS['youtube-feed'] uncached fetches per user per 24h via
//     ai_usage_events; over the cap → 429.
//   ANON (public page visitor, anon key only — VideoFeedBlock): a best-effort
//     per-IP limiter, then ONLY a regex-valid playlist_id or channel_id is
//     accepted; free-form `input` → 403. A cache hit is served as-is (it was
//     validated when it was filled). On a miss the id must appear in the saved
//     config of an ENABLED video_feed block (blocks.title JSON, read with the
//     service client) or the call is 403 — an anonymous caller can only spend
//     API quota on feeds that some page actually shows.
// The 15-min in-memory cache, the json200 response shape and the editor-path
// error strings are unchanged so VideoFeedEditor's `ok` check still holds.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAuthedUser, serviceClient } from "../_shared/auth.ts";
import { DAILY_LIMITS, overDailyQuota, recordUsage } from "../_shared/quota.ts";

const FN = "youtube-feed";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHANNEL_ID_RE = /^UC[\w-]{22}$/;
const PLAYLIST_ID_RE = /^(PL|UU|OL|FL|LL)[\w-]{10,}$/;
const FETCH_TIMEOUT_MS = 8000;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 15;
const CACHE_TTL_MS = 15 * 60 * 1000;

const cache = new Map<string, { at: number; data: unknown }>();

// Anonymous per-IP limiter. BEST-EFFORT ONLY: the map lives in this isolate,
// so it resets on cold start and is not shared across instances. It blunts a
// single-origin burst; the configured-source check below is the real gate.
const ipHits = new Map<string, { windowStart: number; n: number }>();
const IP_WINDOW_MS = 60_000;
const IP_MAX = 30;

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",")[0]?.trim();
  return first || "unknown";
}

/** True when this IP has exceeded IP_MAX anonymous calls in the current window. */
function overIpLimit(ip: string): boolean {
  const now = Date.now();
  const hit = ipHits.get(ip);
  if (!hit || now - hit.windowStart >= IP_WINDOW_MS) {
    ipHits.set(ip, { windowStart: now, n: 1 });
    return false;
  }
  hit.n += 1;
  return hit.n > IP_MAX;
}

function json200(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Escape LIKE metacharacters. The ids are already regex-validated to [\w-],
// so this is defensive only.
function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

/**
 * Is this playlist/channel id saved in the config of an ENABLED video_feed
 * block on some page? The config is JSON in blocks.title (VideoFeedEditor
 * writes `"channel_id":"UC…"` / `"playlist_id":"PL…"` with no whitespace, so
 * a substring match on the exact key:value pair is precise enough). Service
 * client: the anon caller's own blocks policy would also work, but this must
 * not depend on RLS shape.
 */
async function isConfiguredSource(
  key: "playlist_id" | "channel_id",
  id: string,
): Promise<boolean> {
  const svc = serviceClient();
  const pattern = `%"${key}":"${likeEscape(id)}"%`;
  const { data, error } = await svc
    .from("blocks")
    .select("id")
    .eq("type", "video_feed")
    .eq("is_enabled", true)
    .like("title", pattern)
    .limit(1);
  if (error) {
    console.error(`[${FN}] configured-source lookup failed:`, error);
    return false; // fail CLOSED for anon: no lookup, no fetch
  }
  return Array.isArray(data) && data.length > 0;
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

function normalizeInput(raw: string): { channelId?: string; pageUrl?: string; playlistId?: string } {
  let s = (raw || "").trim();
  if (!s) return {};
  if (CHANNEL_ID_RE.test(s)) return { channelId: s };
  if (PLAYLIST_ID_RE.test(s)) return { playlistId: s };
  if (!/^https?:\/\//i.test(s) && !s.startsWith("@") && !s.includes("/")) {
    s = "@" + s.replace(/^@/, "");
  }
  if (s.startsWith("@")) return { pageUrl: `https://www.youtube.com/${s}` };
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    if (!/(^|\.)youtube\.com$/.test(u.hostname) && u.hostname !== "youtu.be") return {};
    // Only an explicit /playlist URL is treated as a playlist — a /watch URL
    // that merely carries &list= should still resolve to the video's channel.
    if (u.pathname.startsWith("/playlist")) {
      const list = u.searchParams.get("list");
      if (list && PLAYLIST_ID_RE.test(list)) return { playlistId: list };
    }
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

function formatDuration(iso: string): string | null {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const h = Number(m[1] || 0), min = Number(m[2] || 0), s = Number(m[3] || 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(min)}:${pad(s)}` : `${min}:${pad(s)}`;
}

interface FeedItem {
  video_id: string;
  title: string;
  published: string | null;
  thumbnail: string;
  url: string;
}

async function fetchPlaylistItems(
  playlistId: string,
  limit: number,
  apiKey: string,
): Promise<{ ownerChannelId: string | null; ownerTitle: string | null; items: FeedItem[] } | null> {
  const url =
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet` +
    `&maxResults=${limit}&playlistId=${playlistId}&key=${apiKey}`;
  const raw = await fetchText(url);
  if (!raw) return null;
  let json: any;
  try { json = JSON.parse(raw); } catch { return null; }
  if (!json || !Array.isArray(json.items)) return null;
  const items: FeedItem[] = json.items
    .map((it: any) => {
      const sn = it?.snippet ?? {};
      const videoId = sn?.resourceId?.videoId;
      if (!videoId) return null;
      if (sn.title === "Private video" || sn.title === "Deleted video") return null;
      const thumbs = sn?.thumbnails ?? {};
      const thumb =
        (thumbs.maxres || thumbs.high || thumbs.medium || thumbs.default || {}).url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      return {
        video_id: videoId,
        title: sn?.title ?? "",
        published: sn?.publishedAt ?? null,
        thumbnail: thumb,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
    })
    .filter(Boolean)
    .slice(0, limit);
  const first = json.items[0]?.snippet ?? {};
  const ownerChannelId = first.videoOwnerChannelId ?? first.channelId ?? null;
  const ownerTitle = first.videoOwnerChannelTitle ?? first.channelTitle ?? null;
  return { ownerChannelId, ownerTitle, items };
}

async function fetchVideoDetails(
  ids: string[],
  apiKey: string,
): Promise<Record<string, { duration: string | null; views: number | null }>> {
  const out: Record<string, { duration: string | null; views: number | null }> = {};
  if (!ids.length) return out;
  const url =
    `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics` +
    `&id=${ids.join(",")}&key=${apiKey}`;
  const raw = await fetchText(url);
  if (!raw) return out;
  let json: any;
  try { json = JSON.parse(raw); } catch { return out; }
  if (!json || !Array.isArray(json.items)) return out;
  for (const it of json.items) {
    const id = it?.id;
    if (!id) continue;
    const views = Number(it?.statistics?.viewCount);
    out[id] = {
      duration: formatDuration(it?.contentDetails?.duration ?? ""),
      views: Number.isFinite(views) ? views : null,
    };
  }
  return out;
}

async function fetchChannelMeta(
  channelId: string,
  apiKey: string,
): Promise<{ title: string | null; avatar: string | null } | null> {
  const url =
    `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${apiKey}`;
  const raw = await fetchText(url);
  if (!raw) return null;
  let json: any;
  try { json = JSON.parse(raw); } catch { return null; }
  const sn = json?.items?.[0]?.snippet;
  if (!sn) return null;
  const thumbs = sn.thumbnails ?? {};
  const avatar = (thumbs.medium || thumbs.default || thumbs.high || {}).url ?? null;
  return { title: sn.title ?? null, avatar };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  // Which door? A real session (Authorization: Bearer <user jwt>) is the
  // editor; the anon key alone (or nothing) is the public page.
  const user = await getAuthedUser(req);
  if (!user && overIpLimit(clientIp(req))) {
    return jsonError(429, "Too many requests. Please try again in a minute.");
  }

  let source: "channel" | "playlist" = "channel";
  let channelId: string | null = null;
  let playlistId: string | null = null;
  // EDITOR only: built lazily, and the quota is checked at most once per call.
  let svc: ReturnType<typeof serviceClient> | null = null;

  if (typeof body.playlist_id === "string" && PLAYLIST_ID_RE.test(body.playlist_id.trim())) {
    playlistId = body.playlist_id.trim();
    source = "playlist";
  } else if (typeof body.channel_id === "string" && CHANNEL_ID_RE.test(body.channel_id.trim())) {
    channelId = body.channel_id.trim();
    source = "channel";
  } else if (!user) {
    // ANON: only a well-formed id is accepted. Free-form `input` (which
    // costs a page scrape to resolve) is the editor's privilege.
    return jsonError(403, "Sign in to resolve a new feed.");
  } else if (typeof body.input === "string") {
    // EDITOR: resolution may scrape a YouTube page, so the quota gates it.
    svc = serviceClient();
    if (await overDailyQuota(svc, user.id, FN, DAILY_LIMITS[FN])) {
      return jsonError(429, "Daily video-feed limit reached. Please try again tomorrow.");
    }
    const norm = normalizeInput(body.input);
    if (norm.playlistId) { playlistId = norm.playlistId; source = "playlist"; }
    else if (norm.channelId) { channelId = norm.channelId; source = "channel"; }
    else if (norm.pageUrl) { channelId = await resolveChannelId(norm.pageUrl); source = "channel"; }
  }

  const targetPlaylist = playlistId ?? (channelId ? "UU" + channelId.slice(2) : null);
  if (!targetPlaylist) {
    return json200({ videos: [], error: "Could not resolve a YouTube channel or playlist from that input." });
  }

  // A cache hit was validated (and, for the editor, counted) when it was
  // filled — serve it to either door without another lookup or fetch.
  const cacheKey = `${source}:${targetPlaylist}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return json200(cached.data);

  if (user) {
    // EDITOR: one uncached fetch = one quota unit (already checked above when
    // the call came in as free-form `input`).
    if (!svc) {
      svc = serviceClient();
      if (await overDailyQuota(svc, user.id, FN, DAILY_LIMITS[FN])) {
        return jsonError(429, "Daily video-feed limit reached. Please try again tomorrow.");
      }
    }
  } else {
    // ANON: the id must be the saved source of an enabled video_feed block.
    const configured = playlistId
      ? await isConfiguredSource("playlist_id", playlistId)
      : await isConfiguredSource("channel_id", channelId!);
    if (!configured) return jsonError(403, "This feed is not configured on any page.");
  }

  const apiKey = Deno.env.get("YOUTUBE_API_KEY");
  if (!apiKey) return json200({ videos: [], error: "Server missing YOUTUBE_API_KEY." });

  const feed = await fetchPlaylistItems(targetPlaylist, limit, apiKey);
  if (!feed || feed.items.length === 0) {
    return json200({ videos: [], error: "Feed fetch failed." });
  }

  const ownerChannelId = channelId ?? feed.ownerChannelId;
  const [details, meta] = await Promise.all([
    fetchVideoDetails(feed.items.map((v) => v.video_id), apiKey),
    ownerChannelId ? fetchChannelMeta(ownerChannelId, apiKey) : Promise.resolve(null),
  ]);

  const videos = feed.items.map((v) => ({
    ...v,
    duration: details[v.video_id]?.duration ?? null,
    views: details[v.video_id]?.views ?? null,
  }));

  const data = {
    source,
    channel_id: ownerChannelId ?? null,
    channel_title: meta?.title ?? feed.ownerTitle ?? null,
    channel_avatar: meta?.avatar ?? null,
    channel_url: ownerChannelId ? `https://www.youtube.com/channel/${ownerChannelId}` : null,
    playlist_id: source === "playlist" ? targetPlaylist : null,
    videos,
  };

  cache.set(cacheKey, { at: Date.now(), data });
  if (user && svc) await recordUsage(svc, user.id, FN);
  return json200(data);
});
