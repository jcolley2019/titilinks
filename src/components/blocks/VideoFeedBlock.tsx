import { useEffect, useState } from 'react';
import { Play, Loader2, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ThumbnailImage } from '@/components/ThumbnailImage';
import type { ThemedBlockProps } from './types';

interface FeedVideo {
  video_id: string;
  title: string;
  published: string | null;
  thumbnail: string;
  url: string;
  duration?: string | null;
  views?: number | null;
}

interface FeedConfig {
  source: 'channel' | 'playlist';
  channel_id: string | null;
  playlist_id: string | null;
}

interface FeedResponse {
  channel_title?: string | null;
  channel_avatar?: string | null;
  channel_url?: string | null;
  videos?: FeedVideo[];
}

function parseConfig(title: string | null): { config: FeedConfig | null; limit: number } {
  try {
    const parsed = JSON.parse(title || '{}');
    const f = parsed.feed;
    if (!f) return { config: null, limit: 6 };
    const source: 'channel' | 'playlist' = f.source === 'playlist' ? 'playlist' : 'channel';
    const channel_id = typeof f.channel_id === 'string' ? f.channel_id : null;
    const playlist_id = typeof f.playlist_id === 'string' ? f.playlist_id : null;
    const limit = Number.isFinite(f.limit) ? f.limit : 6;
    if (source === 'playlist' && !playlist_id && !channel_id) return { config: null, limit };
    if (source === 'channel' && !channel_id) return { config: null, limit };
    return { config: { source, channel_id, playlist_id }, limit };
  } catch {
    return { config: null, limit: 6 };
  }
}

function formatViews(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return `${n}`;
}

function formatRelative(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const sec = Math.floor((Date.now() - then) / 1000);
  const units: [number, string][] = [
    [31536000, 'year'], [2592000, 'month'], [604800, 'week'],
    [86400, 'day'], [3600, 'hour'], [60, 'minute'],
  ];
  for (const [s, label] of units) {
    const v = Math.floor(sec / s);
    if (v >= 1) return `${v} ${label}${v > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

export function VideoFeedBlock({ block, onOutboundClick, theme }: ThemedBlockProps) {
  const { config, limit } = parseConfig(block.title);

  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [meta, setMeta] = useState<{ title: string | null; avatar: string | null; url: string | null }>({
    title: null, avatar: null, url: null,
  });
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const fetchKey = config ? `${config.source}:${config.playlist_id || config.channel_id}:${limit}` : null;

  useEffect(() => {
    if (!config || !fetchKey) return;
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    setPlaying(false);
    const body =
      config.source === 'playlist' && config.playlist_id
        ? { playlist_id: config.playlist_id, limit }
        : { channel_id: config.channel_id, limit };
    supabase.functions
      .invoke('youtube-feed', { body })
      .then(({ data, error }) => {
        if (cancelled) return;
        const res = data as FeedResponse | null;
        const list = res?.videos;
        if (error || !Array.isArray(list) || list.length === 0) {
          setErrored(true);
          setVideos([]);
        } else {
          setVideos(list);
          setActiveId(list[0].video_id);
          setMeta({
            title: res?.channel_title ?? null,
            avatar: res?.channel_avatar ?? null,
            url: res?.channel_url ?? null,
          });
        }
      })
      .catch(() => { if (!cancelled) setErrored(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  if (!config) return null;

  const radius = theme.buttons.shape === 'square' ? '6px' : '16px';
  const textColor = theme.typography.text_color;
  const accent = theme.buttons.fill_color;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin opacity-50" style={{ color: textColor }} />
      </div>
    );
  }
  if (errored || videos.length === 0) return null;

  const activeVideo = videos.find((v) => v.video_id === activeId) ?? videos[0];

  // Returns true when the click should activate (view mode). In edit mode the
  // handler returns false; we do nothing and let the click bubble up to open
  // the block editor.
  const tryActivate = (video: FeedVideo): boolean =>
    onOutboundClick(block.type, block.id, video.video_id, video.url, false);

  const playVideo = (video: FeedVideo) => {
    if (tryActivate(video)) {
      setActiveId(video.video_id);
      setPlaying(true);
    }
  };

  const onWatchAnchor = (e: React.MouseEvent) => {
    if (!onOutboundClick(block.type, block.id, activeVideo.video_id, activeVideo.url, false)) {
      e.preventDefault();
    }
  };

  const onChannelAnchor = (e: React.MouseEvent) => {
    if (!meta.url || !onOutboundClick(block.type, block.id, 'channel', meta.url, false)) {
      e.preventDefault();
    }
  };

  const views = formatViews(activeVideo.views);
  const when = formatRelative(activeVideo.published);

  return (
    <div className="space-y-3">
      {(meta.title || meta.avatar) && (
        <div className="flex items-center gap-3">
          {meta.avatar && (
            <img
              src={meta.avatar}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
              style={{ border: `2px solid ${accent}` }}
            />
          )}
          <div className="min-w-0 flex-1">
            {meta.title && (
              <p className="font-semibold truncate" style={{ color: textColor }}>{meta.title}</p>
            )}
            {meta.url && (
              <a
                href={meta.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onChannelAnchor}
                className="text-xs opacity-60 hover:opacity-100 transition-opacity inline-flex items-center gap-1"
                style={{ color: textColor }}
              >
                View channel <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}

      <div className="relative overflow-hidden" style={{ borderRadius: radius, border: `1px solid ${accent}33` }}>
        <div className="relative aspect-video bg-black/30">
          {playing ? (
            <iframe
              key={activeVideo.video_id}
              src={`https://www.youtube.com/embed/${activeVideo.video_id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
              title={activeVideo.title}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              onClick={() => playVideo(activeVideo)}
              className="group absolute inset-0 w-full h-full text-left"
              aria-label={`Play ${activeVideo.title}`}
            >
              <ThumbnailImage
                src={activeVideo.thumbnail}
                alt={activeVideo.title}
                className="group-hover:scale-105 transition-transform duration-300 motion-reduce:transition-none"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-black/55 rounded-full p-4 group-hover:scale-110 transition-transform">
                  <Play className="h-7 w-7 text-white fill-white" />
                </div>
              </div>
              {activeVideo.duration && (
                <span className="absolute bottom-2 right-2 text-[11px] font-medium px-1.5 py-0.5 rounded bg-black/80 text-white">
                  {activeVideo.duration}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="px-0.5">
        <p className="font-semibold leading-snug" style={{ color: textColor }}>{activeVideo.title}</p>
        <div className="mt-1 flex items-center gap-2 text-xs opacity-60" style={{ color: textColor }}>
          {views && <span>{views} views</span>}
          {views && when && <span>•</span>}
          {when && <span>{when}</span>}
          <a
            href={activeVideo.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onWatchAnchor}
            className="ml-auto inline-flex items-center gap-1 opacity-80 hover:opacity-100"
            style={{ color: textColor }}
          >
            Watch on YouTube <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {videos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5 snap-x" style={{ scrollbarWidth: 'none' }}>
          {videos.map((v) => {
            const isActive = v.video_id === activeVideo.video_id;
            return (
              <button
                key={v.video_id}
                type="button"
                onClick={() => playVideo(v)}
                className="relative shrink-0 w-28 overflow-hidden snap-start transition-transform active:scale-95"
                style={{ borderRadius: '10px', outline: isActive ? `2px solid ${accent}` : '2px solid transparent' }}
                aria-label={`Play ${v.title}`}
              >
                <div className="relative aspect-video bg-black/30">
                  <ThumbnailImage src={v.thumbnail} alt={v.title} />
                  {!isActive && <div className="absolute inset-0 bg-black/30" />}
                  {v.duration && (
                    <span className="absolute bottom-1 right-1 text-[9px] px-1 rounded bg-black/80 text-white">
                      {v.duration}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
