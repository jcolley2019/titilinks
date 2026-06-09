import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ThumbnailImage } from '@/components/ThumbnailImage';
import type { ThemedBlockProps } from './types';

interface FeedVideo {
  video_id: string;
  title: string;
  published: string | null;
  thumbnail: string;
  url: string;
}

export function VideoFeedBlock({ block, onOutboundClick, theme }: ThemedBlockProps) {
  let channelId: string | null = null;
  try {
    const parsed = JSON.parse(block.title || '{}');
    if (parsed.feed && typeof parsed.feed.channel_id === 'string') {
      channelId = parsed.feed.channel_id;
    }
  } catch {
    /* not JSON — no feed configured */
  }

  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    supabase.functions
      .invoke('youtube-feed', { body: { channel_id: channelId } })
      .then(({ data, error }) => {
        if (cancelled) return;
        const list = (data as { videos?: FeedVideo[] } | null)?.videos;
        if (error || !Array.isArray(list)) {
          setErrored(true);
          setVideos([]);
        } else {
          setVideos(list);
        }
      })
      .catch(() => { if (!cancelled) setErrored(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [channelId]);

  if (!channelId) return null;

  const getButtonRadius = () => {
    switch (theme.buttons.shape) {
      case 'pill': return '9999px';
      case 'rounded': return '16px';
      case 'square': return '6px';
      default: return '16px';
    }
  };

  const handleClick = (e: React.MouseEvent, video: FeedVideo) => {
    const shouldNavigate = onOutboundClick(block.type, block.id, video.video_id, video.url, false);
    if (!shouldNavigate) e.preventDefault();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin opacity-50" style={{ color: theme.typography.text_color }} />
      </div>
    );
  }

  if (errored || videos.length === 0) return null;

  return (
    <div className="space-y-3">
      {videos.map((video) => (
        <a
          key={video.video_id}
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block group"
          onClick={(e) => handleClick(e, video)}
        >
          <motion.div
            whileTap={{ scale: 0.98 }}
            className="relative overflow-hidden transition-colors"
            style={{ borderRadius: getButtonRadius(), border: `1px solid ${theme.buttons.fill_color}20` }}
          >
            <div className="aspect-video">
              <ThumbnailImage
                src={video.thumbnail}
                alt={video.title}
                className="group-hover:scale-105 transition-transform duration-300 motion-reduce:transition-none"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-black/50 rounded-full p-3">
                  <Play className="h-6 w-6 text-white fill-white" />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <p className="font-semibold text-white">{video.title}</p>
              </div>
            </div>
          </motion.div>
        </a>
      ))}
    </div>
  );
}
