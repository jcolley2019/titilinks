// CarouselEditor — edits a Carousel block (Pass 5). Modeled on GalleryEditor:
// block-level settings (section title, card size, auto-scroll + speed) live in
// block.title JSON; each card is a block_items row (url / label / image_url).
// A card defaults its image to the icon derived from the link; a creator can
// upload a custom photo per card (ThumbnailUpload, optional).

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
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThumbnailUpload } from '@/components/editors/ThumbnailUpload';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, GalleryHorizontalEnd, Link as LinkChainIcon } from 'lucide-react';
import { platformFromUrl } from '@/lib/platform-from-url';
import { PlatformIcon } from '@/components/PlatformIcon';
import type { Tables } from '@/integrations/supabase/types';

const MAX_ITEMS = 12;

type BlockItem = Tables<'block_items'>;

interface CarouselLink {
  id: string;
  url: string;
  label: string;
  image_url: string;
}

interface CarouselEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
}

const inputCls =
  'w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#C9A55C]/50';

/** The icon a photo-less card defaults to — platform glyph or generic link. */
function previewIcon(url: string | null | undefined, size: number) {
  const p = platformFromUrl(url || '');
  return p ? <PlatformIcon label={p} size={size} color="#C9A55C" /> : <LinkChainIcon size={size} color="#C9A55C" />;
}

export function CarouselEditor({ blockId, open, onOpenChange, onSave, panelMode }: CarouselEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [links, setLinks] = useState<CarouselLink[]>([]);
  const [existingItems, setExistingItems] = useState<BlockItem[]>([]);
  const [sectionTitle, setSectionTitle] = useState('');
  const [cardSize, setCardSize] = useState<'big' | 'small'>('big');
  const [autoScroll, setAutoScroll] = useState(true);
  const [speed, setSpeed] = useState<'slow' | 'medium' | 'fast'>('medium');

  // Representative card for the top-of-menu size preview (first card with data).
  const previewLink = links.find((l) => l.url || l.label || l.image_url);

  useEffect(() => {
    if (open) fetchData();
  }, [open, blockId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: blockRow } = await supabase
        .from('blocks')
        .select('title')
        .eq('id', blockId)
        .maybeSingle();
      try {
        const parsed = JSON.parse(blockRow?.title || '');
        if (parsed && typeof parsed === 'object') {
          setSectionTitle(typeof parsed.section_title === 'string' ? parsed.section_title : '');
          setCardSize(parsed.cardSize === 'small' ? 'small' : 'big');
          setAutoScroll(parsed.autoScroll !== false);
          setSpeed(parsed.speed === 'fast' || parsed.speed === 'slow' ? parsed.speed : 'medium');
        }
      } catch { /* plain title => defaults */ }

      const { data, error } = await supabase
        .from('block_items')
        .select('*')
        .eq('block_id', blockId)
        .order('order_index', { ascending: true });
      if (error) throw error;

      setExistingItems(data || []);
      setLinks(
        (data || []).map((item) => ({
          id: item.id,
          url: item.url || '',
          label: item.label || '',
          image_url: item.image_url || '',
        }))
      );
    } catch (error) {
      console.error('Error fetching carousel:', error);
      toast.error('Failed to load carousel');
    } finally {
      setLoading(false);
    }
  };

  const addLink = () => {
    if (links.length >= MAX_ITEMS) {
      toast.error(`Maximum ${MAX_ITEMS} cards`);
      return;
    }
    setLinks((prev) => [...prev, { id: `new-${Date.now()}-${Math.random()}`, url: '', label: '', image_url: '' }]);
  };

  const updateLink = (id: string, patch: Partial<CarouselLink>) => {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const deleteLink = (id: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  };

  const handleSave = async () => {
    // A card needs a destination — drop fully-empty rows, keep those with a URL.
    const kept = links.map((l) => ({ ...l, url: l.url.trim(), label: l.label.trim() })).filter((l) => l.url);
    setSaving(true);
    try {
      // Delete removed items.
      const keptIds = kept.filter((l) => !l.id.startsWith('new-')).map((l) => l.id);
      const toDelete = existingItems.filter((ei) => !keptIds.includes(ei.id));
      for (const item of toDelete) {
        const { error } = await supabase.from('block_items').delete().eq('id', item.id);
        if (error) throw error;
      }

      // Upsert kept items in display order.
      for (let i = 0; i < kept.length; i++) {
        const l = kept[i];
        if (l.id.startsWith('new-')) {
          const { error } = await supabase.from('block_items').insert({
            block_id: blockId,
            url: l.url,
            label: l.label,
            image_url: l.image_url || null,
            order_index: i,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('block_items')
            .update({ url: l.url, label: l.label, image_url: l.image_url || null, order_index: i })
            .eq('id', l.id);
          if (error) throw error;
        }
      }

      const { error: cfgError } = await supabase
        .from('blocks')
        .update({ title: JSON.stringify({ section_title: sectionTitle.trim(), cardSize, autoScroll, speed }) })
        .eq('id', blockId);
      if (cfgError) throw cfgError;

      toast.success('Carousel saved');
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving carousel:', error);
      toast.error(error.message || 'Failed to save');
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
        <div className="flex flex-col flex-1 min-h-0">
          {/* Card preview + size — a representative card at the selected size
              (top of menu) over Big/Small blocks, like the Featured Links Style
              selector. */}
          <div className="mb-4 space-y-3">
            <div className="flex justify-center pt-1">
              {/* Exact copy of the Featured Links card previews, inside a fixed
                  16/10 footprint so switching Large↔Small never moves the menu.
                  Large = the big cover card (16/10, full width). Small = a single
                  Featured Links Small card (renderPairSlot): aspect-[4/3] at half
                  width — NOT full width. The link's derived icon stands in for the
                  camera (a carousel card's photo is uploaded in the list below). */}
              <div className="relative w-full" style={{ aspectRatio: '16 / 10' }}>
                <div className="absolute inset-0 flex items-center justify-center">
                  {cardSize === 'small' ? (
                    <div
                      className="relative aspect-[4/3] overflow-hidden rounded-[14px]"
                      style={{ width: 'calc(50% - 5px)' }}
                    >
                      {previewLink?.image_url ? (
                        <img src={previewLink.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <div
                          className="absolute inset-0"
                          style={{ background: 'linear-gradient(180deg, rgba(201,165,92,0.10) 0%, rgba(255,255,255,0.02) 100%)' }}
                        />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center">
                        {previewIcon(previewLink?.url, 22)}
                      </div>
                      <div
                        className="absolute inset-x-0 bottom-0 px-2.5 pb-2 pt-6 text-left"
                        style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.72) 72%, rgba(0,0,0,0.85) 100%)' }}
                      >
                        <span className="text-[13px] font-bold text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                          {previewLink?.label || 'Title'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="relative w-full overflow-hidden border border-white/10"
                      style={{
                        aspectRatio: '16 / 10',
                        borderRadius: 16,
                        background: 'linear-gradient(180deg, rgba(201,165,92,0.10) 0%, rgba(255,255,255,0.02) 100%)',
                      }}
                    >
                      {previewLink?.image_url ? (
                        <img src={previewLink.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          {previewIcon(previewLink?.url, 34)}
                        </div>
                      )}
                      <div className="absolute left-4 right-4 bottom-3 text-left">
                        <span
                          className="font-bold text-white/90"
                          style={{ fontSize: 17, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
                        >
                          {previewLink?.label || 'Title'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs text-white/60 mb-2">Card size</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: 'big', label: 'Large' },
                  { key: 'small', label: 'Small' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCardSize(key)}
                    className={`py-2 text-xs font-semibold rounded-lg border-2 transition-all ${
                      cardSize === key
                        ? 'border-[#C9A55C] bg-[#C9A55C]/10 text-[#C9A55C]'
                        : 'border-white/10 text-white/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section title (optional) — shown above the carousel on the profile. */}
          <div className="mb-4">
            <p className="text-xs text-white/60 mb-1.5">Title (optional)</p>
            <input
              value={sectionTitle}
              onChange={(e) => setSectionTitle(e.target.value)}
              placeholder="e.g. My Latest Content"
              className={inputCls}
            />
          </div>

          {/* Auto-scroll + speed */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/60">Auto-scroll</span>
              <button
                type="button"
                onClick={() => setAutoScroll(!autoScroll)}
                className={`w-10 h-6 rounded-full relative transition-colors ${autoScroll ? 'bg-[#C9A55C]' : 'bg-white/10'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${autoScroll ? 'translate-x-4' : ''}`} />
              </button>
            </div>
            {autoScroll && (
              <div className="flex items-center gap-1.5">
                {(['slow', 'medium', 'fast'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeed(s)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                      speed === s ? 'bg-[#C9A55C] text-[#0e0c09]' : 'bg-white/5 text-foreground border border-white/10'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cards */}
          <ScrollArea className={panelMode ? 'flex-1 px-4 -mx-4' : 'flex-1 -mx-6 px-6'}>
            <div className="space-y-2.5">
              {links.length === 0 ? (
                <div className="text-center py-8 text-white/50">
                  <GalleryHorizontalEnd className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No cards yet. Add a link to get started.</p>
                </div>
              ) : (
                links.map((link) => (
                  <div key={link.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-start gap-3">
                      <ThumbnailUpload
                        value={link.image_url || null}
                        onChange={(url) => updateLink(link.id, { image_url: url || '' })}
                        label="Photo"
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <input
                          value={link.url}
                          onChange={(e) => updateLink(link.id, { url: e.target.value })}
                          placeholder="https://…"
                          className={`${inputCls} truncate`}
                        />
                        <input
                          value={link.label}
                          onChange={(e) => updateLink(link.id, { label: e.target.value })}
                          placeholder="Title (optional)"
                          className={inputCls}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteLink(link.id)}
                        aria-label="Remove card"
                        className="mt-1 h-7 w-7 flex-shrink-0 rounded-full bg-black/40 text-white/70 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {!link.image_url && (
                      <p className="mt-2 text-[11px] text-white/35">No photo → the card uses the icon from the link.</p>
                    )}
                  </div>
                ))
              )}

              {links.length < MAX_ITEMS && (
                <button
                  type="button"
                  onClick={addLink}
                  className="w-full rounded-xl border border-dashed border-[#C9A55C]/40 py-3 text-xs font-semibold text-[#C9A55C] hover:bg-[#C9A55C]/10 transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <Plus className="h-4 w-4" /> Add link
                </button>
              )}
            </div>
          </ScrollArea>

          {/* Actions — pinned to the bottom of the panel while content scrolls. */}
          <div className="sticky bottom-0 z-10 flex gap-3 pt-4 mt-4 border-t border-white/10 bg-[#0e0c09]">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 gradient-primary text-primary-foreground"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
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
      <div className="flex flex-col h-full bg-[#0e0c09] text-white px-4 py-4">
        {innerContent}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GalleryHorizontalEnd className="h-5 w-5 text-primary" />
            Carousel
          </DialogTitle>
          <DialogDescription>A swipeable row of link cards.</DialogDescription>
        </DialogHeader>
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
