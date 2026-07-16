// CarouselEditor — edits a Carousel block (Pass 5). Modeled on GalleryEditor:
// block-level settings (section title, card size, auto-scroll + speed) live in
// block.title JSON; each card is a block_items row (url / label / image_url).
// The cards are edited as a tile grid + tap-a-tile-to-edit (matching the Gallery
// and Products editors); a card defaults its image to the icon derived from the
// link, and a creator can upload a custom photo per card (optional).

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
import { useLanguage } from '@/hooks/useLanguage';
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
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [links, setLinks] = useState<CarouselLink[]>([]);
  const [existingItems, setExistingItems] = useState<BlockItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sectionTitle, setSectionTitle] = useState('');
  const [cardSize, setCardSize] = useState<'big' | 'small'>('big');
  const [autoScroll, setAutoScroll] = useState(true);
  const [speed, setSpeed] = useState<'slow' | 'medium' | 'fast'>('medium');

  const selected = links.find((l) => l.id === selectedId) || null;
  // The top preview shows the card being edited, else the first card with data.
  const previewCard = selected || links.find((l) => l.url || l.label || l.image_url) || null;

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

  // "+" adds an empty card and selects it so its Link/Title fields open below
  // (a carousel card's photo is optional — it falls back to the link's icon).
  const addLink = () => {
    if (links.length >= MAX_ITEMS) {
      toast.error(`Maximum ${MAX_ITEMS} cards`);
      return;
    }
    const id = `new-${Date.now()}-${Math.random()}`;
    setLinks((prev) => [...prev, { id, url: '', label: '', image_url: '' }]);
    setSelectedId(id);
  };

  const updateLink = (id: string, patch: Partial<CarouselLink>) => {
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const deleteLink = (id: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== id));
    if (selectedId === id) setSelectedId(null);
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
          {/* Card preview + size — the card being edited at the selected size,
              over Large/Small blocks, like the Featured Links Style selector. */}
          <div className="mb-4 space-y-3">
            <div className="flex justify-center pt-1">
              {/* Exact copy of the Featured Links card previews, inside a fixed
                  16/10 footprint so switching Large↔Small never moves the menu.
                  Large = the big cover card (16/10, full width). Small = a single
                  Featured Links Small card (renderPairSlot): aspect-[4/3] at half
                  width — NOT full width. */}
              <div className="relative w-full" style={{ aspectRatio: '16 / 10' }}>
                <div className="absolute inset-0 flex items-center justify-center">
                  {cardSize === 'small' ? (
                    <div
                      className="relative aspect-[4/3] overflow-hidden rounded-[14px]"
                      style={{ width: 'calc(50% - 5px)' }}
                    >
                      {previewCard?.image_url ? (
                        <img src={previewCard.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <div
                          className="absolute inset-0"
                          style={{ background: 'linear-gradient(180deg, rgba(201,165,92,0.10) 0%, rgba(255,255,255,0.02) 100%)' }}
                        />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center">
                        {previewIcon(previewCard?.url, 22)}
                      </div>
                      <div
                        className="absolute inset-x-0 bottom-0 px-2.5 pb-2 pt-6 text-left"
                        style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.72) 72%, rgba(0,0,0,0.85) 100%)' }}
                      >
                        <span className="text-[13px] font-bold text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                          {previewCard?.label || 'Title'}
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
                      {previewCard?.image_url ? (
                        <img src={previewCard.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          {previewIcon(previewCard?.url, 34)}
                        </div>
                      )}
                      <div className="absolute left-4 right-4 bottom-3 text-left">
                        <span
                          className="font-bold text-white/90"
                          style={{ fontSize: 17, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
                        >
                          {previewCard?.label || 'Title'}
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
                className={`w-[33px] h-[18px] rounded-full relative transition-colors ${autoScroll ? 'bg-[#C9A55C]' : 'bg-white/10'}`}
              >
                <span className={`absolute top-[1.5px] left-[1.5px] w-[15px] h-[15px] rounded-full bg-white transition-transform ${autoScroll ? 'translate-x-[15px]' : ''}`} />
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

          {/* Cards — tile grid (like Gallery/Products) + tap-a-tile to edit it. */}
          <ScrollArea className={panelMode ? 'flex-1 min-h-0 px-4 -mx-4' : 'flex-1 min-h-0 -mx-6 px-6'}>
            <div>
              <div className="grid grid-cols-2 gap-3">
                {links.length < MAX_ITEMS && (
                  <button
                    type="button"
                    onClick={addLink}
                    className="aspect-square rounded-xl border-2 border-dashed border-[#C9A55C]/40 flex flex-col items-center justify-center gap-2 hover:border-[#C9A55C]/70 hover:bg-[#C9A55C]/5 transition-colors"
                  >
                    <Plus className="h-7 w-7 text-[#C9A55C]/70" />
                    <span className="text-xs font-medium text-[#C9A55C]/80">Add link</span>
                  </button>
                )}
                {links.map((link) => {
                  const isSel = link.id === selectedId;
                  return (
                    <div
                      key={link.id}
                      onClick={() => setSelectedId(link.id)}
                      className={`group relative aspect-square rounded-xl overflow-hidden bg-white/5 border-2 cursor-pointer transition-colors ${
                        isSel ? 'border-[#C9A55C]' : 'border-transparent'
                      }`}
                    >
                      {link.image_url ? (
                        <img src={link.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          {previewIcon(link.url, 26)}
                        </div>
                      )}
                      {link.label && (
                        <span className="absolute inset-x-0 bottom-0 z-[1] px-2 pb-1.5 pt-5 text-left bg-gradient-to-t from-black/75 to-transparent">
                          <span className="block truncate text-[11px] font-semibold text-white">{link.label}</span>
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteLink(link.id); }}
                        aria-label="Remove card"
                        className="absolute top-1.5 right-1.5 z-[2] h-6 w-6 rounded-full bg-black/60 text-white/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {links.length === 0 && (
                <p className="mt-3 text-center text-xs text-white/40">
                  Tap “Add link”, then enter the link &amp; title.
                </p>
              )}

              {/* Selected card's fields. */}
              {selected && (
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
                  <div className="space-y-1">
                    <p className="text-xs text-white/60">Link *</p>
                    <input
                      value={selected.url}
                      onChange={(e) => updateLink(selected.id, { url: e.target.value })}
                      placeholder="https://…"
                      className={`${inputCls} truncate`}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-white/60">Title (optional)</p>
                    <input
                      value={selected.label}
                      onChange={(e) => updateLink(selected.id, { label: e.target.value })}
                      placeholder="Card title"
                      className={inputCls}
                    />
                  </div>
                  <div className="flex items-start gap-3 pt-1">
                    <ThumbnailUpload
                      value={selected.image_url || null}
                      onChange={(url) => updateLink(selected.id, { image_url: url || '' })}
                      label="Photo"
                    />
                    <p className="text-[11px] text-white/40 leading-relaxed">
                      Photo optional — with no photo the card shows the icon from the link.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Actions — pinned to the bottom of the panel while content scrolls. */}
          <div className="sticky bottom-0 z-10 mt-auto flex gap-3 -mx-4 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-[#0e0c09]">
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-12 rounded-xl bg-white/10 text-white border border-white/20 hover:bg-white/20"
            >
              {t('blockEditor.cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 h-12 rounded-xl bg-[#C9A55C] text-black font-semibold hover:bg-[#C9A55C]/90 disabled:opacity-40"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('blockEditor.saving')}
                </>
              ) : (
                t('blockEditor.save')
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  );

  if (panelMode) {
    return (
      <div className="flex flex-1 flex-col min-h-0 bg-[#0e0c09] text-white px-4 pt-4">
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
