import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Youtube, Search } from 'lucide-react';

type FeedSource = 'channel' | 'playlist';

interface FeedVideo {
  video_id: string;
  title: string;
  published: string | null;
  thumbnail: string;
  url: string;
  duration?: string | null;
  views?: number | null;
}

interface ResolvedFeed {
  source: FeedSource;
  channel_id: string | null;
  channel_title: string | null;
  channel_avatar: string | null;
  playlist_id: string | null;
  videos: FeedVideo[];
}

interface VideoFeedEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
}

const COUNT_OPTIONS = [3, 6, 9, 12];

export function VideoFeedEditor({ blockId, open, onOpenChange, onSave, panelMode }: VideoFeedEditorProps) {
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [source, setSource] = useState<FeedSource>('channel');
  const [limit, setLimit] = useState(6);
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resolved, setResolved] = useState<ResolvedFeed | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setResolved(null);
      setResolveError(null);
      try {
        const { data, error } = await supabase
          .from('blocks')
          .select('title')
          .eq('id', blockId)
          .single();
        if (error) throw error;
        let savedInput = '';
        let savedSource: FeedSource = 'channel';
        let savedLimit = 6;
        try {
          const parsed = JSON.parse(data?.title || '{}');
          if (parsed.feed) {
            savedInput = parsed.feed.input_url || parsed.feed.channel_handle || parsed.feed.channel_id || '';
            if (parsed.feed.source === 'playlist' || parsed.feed.source === 'channel') savedSource = parsed.feed.source;
            if (Number.isFinite(parsed.feed.limit)) savedLimit = parsed.feed.limit;
          }
        } catch {
          /* no config yet */
        }
        if (!cancelled) {
          setInput(savedInput);
          setSource(savedSource);
          setLimit(savedLimit);
        }
      } catch {
        if (!cancelled) toast.error('Failed to load block data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, blockId]);

  const handleResolve = async () => {
    const value = input.trim();
    if (!value) {
      setResolveError(
        source === 'playlist'
          ? 'Enter a YouTube playlist URL or ID.'
          : 'Enter a YouTube channel URL, @handle, or ID.',
      );
      return;
    }
    setResolving(true);
    setResolveError(null);
    setResolved(null);
    try {
      const { data, error } = await supabase.functions.invoke('youtube-feed', { body: { input: value, limit } });
      const res = data as (ResolvedFeed & { error?: string }) | null;
      const ok = res && (res.channel_id || res.playlist_id) && Array.isArray(res.videos) && res.videos.length > 0;
      if (error || !ok) {
        setResolveError(res?.error || 'Could not find that. Try the full URL.');
      } else {
        setResolved({
          source: res!.source ?? source,
          channel_id: res!.channel_id ?? null,
          channel_title: res!.channel_title ?? null,
          channel_avatar: res!.channel_avatar ?? null,
          playlist_id: res!.playlist_id ?? null,
          videos: res!.videos,
        });
        if (res!.source) setSource(res!.source);
      }
    } catch {
      setResolveError('Something went wrong. Please try again.');
    } finally {
      setResolving(false);
    }
  };

  const handleSave = async () => {
    if (!resolved) {
      setResolveError('Preview first.');
      return;
    }
    setSaving(true);
    try {
      const configJson = {
        feed: {
          platform: 'youtube',
          source: resolved.source,
          channel_id: resolved.channel_id,
          playlist_id: resolved.playlist_id,
          channel_title: resolved.channel_title,
          channel_avatar: resolved.channel_avatar,
          channel_handle: input.trim().startsWith('@') ? input.trim() : null,
          input_url: input.trim(),
          limit,
        },
      };
      const { error } = await supabase
        .from('blocks')
        .update({ title: JSON.stringify(configJson) })
        .eq('id', blockId);
      if (error) throw error;
      toast.success('Video feed saved');
      onSave?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const segBtn = (active: boolean) =>
    active
      ? 'flex-1 gradient-primary text-primary-foreground'
      : 'flex-1 bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white';

  const innerContent = (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-white">Source</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className={segBtn(source === 'channel')}
                onClick={() => { setSource('channel'); setResolved(null); setResolveError(null); }}
              >
                Latest from channel
              </Button>
              <Button
                type="button"
                variant="outline"
                className={segBtn(source === 'playlist')}
                onClick={() => { setSource('playlist'); setResolved(null); setResolveError(null); }}
              >
                Playlist
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="yt-input" className="text-white">
              {source === 'playlist' ? 'YouTube playlist' : 'YouTube channel'}
            </Label>
            <div className="flex gap-2">
              <Input
                id="yt-input"
                className="bg-white/10 text-white placeholder:text-white/40 border-white/20"
                placeholder={
                  source === 'playlist'
                    ? 'https://youtube.com/playlist?list=...'
                    : 'https://youtube.com/@yourchannel'
                }
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setResolved(null);
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleResolve}
                disabled={resolving}
                className="bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white"
              >
                {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-white/60">
              {source === 'playlist'
                ? 'Paste a playlist URL or ID, then preview.'
                : 'Paste a channel URL, @handle, or channel ID, then preview.'}
            </p>
            {resolveError && <p className="text-sm text-destructive">{resolveError}</p>}
          </div>

          <div className="space-y-2">
            <Label className="text-white">Number of videos</Label>
            <div className="flex gap-2">
              {COUNT_OPTIONS.map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant="outline"
                  className={segBtn(limit === n)}
                  onClick={() => setLimit(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
          </div>

          {resolved && (
            <div className="p-4 rounded-lg border border-white/10 bg-white/5 space-y-3">
              <div className="flex items-center gap-3">
                {resolved.channel_avatar && (
                  <img src={resolved.channel_avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                )}
                <div>
                  <p className="text-sm font-medium text-white">{resolved.channel_title || 'Found'}</p>
                  <p className="text-xs text-white/50">
                    {resolved.source === 'playlist' ? 'Playlist' : 'Latest videos'}
                  </p>
                </div>
              </div>
              {resolved.videos.length > 0 ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {resolved.videos.slice(0, 3).map((v) => (
                      <div key={v.video_id} className="relative aspect-video rounded overflow-hidden bg-black/20">
                        <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" />
                        {v.duration && (
                          <span className="absolute bottom-1 right-1 text-[10px] px-1 rounded bg-black/80 text-white">
                            {v.duration}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-white/60">
                    Showing the latest {limit} videos. Updates automatically.
                  </p>
                </>
              ) : (
                <p className="text-xs text-white/60">Found — videos will appear on your page.</p>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !resolved}
              className="flex-1 gradient-primary text-primary-foreground"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  );

  if (panelMode) {
    return (
      <div className="flex flex-col h-full bg-[#0e0c09] text-white overflow-y-auto px-4 py-4">
        {innerContent}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="h-5 w-5 text-primary" />
            Video Feed
          </DialogTitle>
          <DialogDescription>
            Show your latest YouTube videos or a playlist. They update automatically.
          </DialogDescription>
        </DialogHeader>
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
