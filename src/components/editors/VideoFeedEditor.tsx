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

interface FeedVideo {
  video_id: string;
  title: string;
  published: string | null;
  thumbnail: string;
  url: string;
}

interface ResolvedFeed {
  channel_id: string;
  channel_title: string | null;
  videos: FeedVideo[];
}

interface VideoFeedEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
}

export function VideoFeedEditor({ blockId, open, onOpenChange, onSave, panelMode }: VideoFeedEditorProps) {
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
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
        try {
          const parsed = JSON.parse(data?.title || '{}');
          if (parsed.feed) {
            savedInput = parsed.feed.input_url || parsed.feed.channel_handle || parsed.feed.channel_id || '';
          }
        } catch {
          /* no config yet */
        }
        if (!cancelled) setInput(savedInput);
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
      setResolveError('Enter a YouTube channel URL, @handle, or ID.');
      return;
    }
    setResolving(true);
    setResolveError(null);
    setResolved(null);
    try {
      const { data, error } = await supabase.functions.invoke('youtube-feed', { body: { input: value } });
      const res = data as (ResolvedFeed & { error?: string }) | null;
      if (error || !res || !res.channel_id) {
        setResolveError(res?.error || 'Could not find that channel. Try the full channel URL.');
      } else {
        setResolved({ channel_id: res.channel_id, channel_title: res.channel_title ?? null, videos: res.videos || [] });
      }
    } catch {
      setResolveError('Something went wrong resolving that channel.');
    } finally {
      setResolving(false);
    }
  };

  const handleSave = async () => {
    if (!resolved) {
      setResolveError('Preview the channel first.');
      return;
    }
    setSaving(true);
    try {
      const configJson = {
        feed: {
          platform: 'youtube',
          channel_id: resolved.channel_id,
          channel_handle: input.trim().startsWith('@') ? input.trim() : null,
          input_url: input.trim(),
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

  const innerContent = (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="yt-input" className="text-white">YouTube channel</Label>
            <div className="flex gap-2">
              <Input
                id="yt-input"
                className="bg-white/10 text-white placeholder:text-white/40 border-white/20"
                placeholder="https://youtube.com/@yourchannel"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setResolved(null);
                }}
              />
              <Button type="button" variant="outline" onClick={handleResolve} disabled={resolving}>
                {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-white/60">Paste a channel URL, @handle, or channel ID, then preview.</p>
            {resolveError && <p className="text-sm text-destructive">{resolveError}</p>}
          </div>

          {resolved && (
            <div className="p-4 rounded-lg border border-white/10 bg-white/5 space-y-3">
              <p className="text-sm font-medium text-white">{resolved.channel_title || 'Channel found'}</p>
              {resolved.videos.length > 0 ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {resolved.videos.slice(0, 3).map((v) => (
                      <div key={v.video_id} className="aspect-video rounded overflow-hidden bg-black/20">
                        <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-white/60">
                    Showing the latest {resolved.videos.length} videos. Updates automatically when you post.
                  </p>
                </>
              ) : (
                <p className="text-xs text-white/60">Channel found — videos will appear on your page.</p>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1 bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white">
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
            Show your latest YouTube videos. They update automatically when you post.
          </DialogDescription>
        </DialogHeader>
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
