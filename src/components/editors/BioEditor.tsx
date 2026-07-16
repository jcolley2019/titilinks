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
import { toast } from 'sonner';
import { Loader2, AlignLeft, AlignCenter, AlignRight, Bold } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { cn } from '@/lib/utils';
import { FONT_OPTIONS, resolveFontFamily } from '@/lib/fonts';
import type { ElementStyle, TextAlign, TextSize } from '@/lib/text-block-config';
import type { Tables } from '@/integrations/supabase/types';
import type { LinkItem } from '@/components/editors/LinksEditor';

type BlockItem = Tables<'block_items'>;

const BIO_MAX = 300;
const DEFAULT_STYLE: ElementStyle = { font: '', bold: false, size: 'base', align: 'center' };

interface BioEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
  onTitleDraftChange?: (title: string | null) => void;
  onDraftChange?: (item: LinkItem | null) => void;
}

export function BioEditor({ blockId, open, onOpenChange, onSave, panelMode, onTitleDraftChange, onDraftChange }: BioEditorProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bioText, setBioText] = useState('');
  const [existingItem, setExistingItem] = useState<BlockItem | null>(null);
  const [style, setStyle] = useState<ElementStyle>(DEFAULT_STYLE);

  useEffect(() => {
    if (open) fetchBio();
  }, [open, blockId]);

  // Live-mirror (L3): push the in-progress style to the preview on every change (after load).
  useEffect(() => {
    if (loading) return;
    onTitleDraftChange?.(JSON.stringify(style));
  }, [style, loading]);
  // Clear the mirror when the editor unmounts (cancel / close).
  useEffect(() => () => { onTitleDraftChange?.(null); }, []);

  // Live-mirror (L2): push the in-progress bio TEXT to the preview via the item channel
  // (bio text lives in block_items[0].label, not block.title), after load.
  useEffect(() => {
    if (loading) return;
    onDraftChange?.({ id: existingItem?.id ?? '__bio_draft__', label: bioText, url: existingItem?.url ?? '' });
  }, [bioText, loading, existingItem]);
  useEffect(() => () => { onDraftChange?.(null); }, []);

  const fetchBio = async () => {
    setLoading(true);
    try {
      const { data: items, error: itemsError } = await supabase
        .from('block_items')
        .select('*')
        .eq('block_id', blockId)
        .order('order_index', { ascending: true })
        .limit(1);
      if (itemsError) throw itemsError;

      const item = items?.[0] || null;
      setExistingItem(item);
      setBioText(item?.label || '');

      const { data: blockData, error: blockError } = await supabase
        .from('blocks')
        .select('title')
        .eq('id', blockId)
        .single();
      if (blockError) throw blockError;

      let nextStyle: ElementStyle = { ...DEFAULT_STYLE };
      if (blockData?.title) {
        try {
          nextStyle = { ...DEFAULT_STYLE, ...JSON.parse(blockData.title) };
        } catch {
          // No JSON config — keep defaults.
        }
      }
      setStyle(nextStyle);
    } catch (error) {
      console.error('Error fetching bio:', error);
      toast.error(t('blockEditor.bioLoadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (existingItem) {
        const { error } = await supabase
          .from('block_items')
          .update({ label: bioText.trim() })
          .eq('id', existingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('block_items')
          .insert({
            block_id: blockId,
            label: bioText.trim(),
            url: '',
            image_url: '',
            order_index: 0,
          });
        if (error) throw error;
      }

      const { error: styleError } = await supabase
        .from('blocks')
        .update({ title: JSON.stringify(style) })
        .eq('id', blockId);
      if (styleError) throw styleError;

      toast.success(t('blockEditor.bioSaved'));
      onSave?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving bio:', error);
      toast.error(t('blockEditor.bioSaveError'));
    } finally {
      setSaving(false);
    }
  };

  const update = (patch: Partial<ElementStyle>) => setStyle((prev) => ({ ...prev, ...patch }));

  const alignOptions: { value: TextAlign; icon: typeof AlignLeft; label: string }[] = [
    { value: 'left', icon: AlignLeft, label: t('blockEditor.left') },
    { value: 'center', icon: AlignCenter, label: t('blockEditor.center') },
    { value: 'right', icon: AlignRight, label: t('blockEditor.right') },
  ];
  const sizeOptions: { value: TextSize; label: string }[] = [
    { value: 'sm', label: t('blockEditor.small') },
    { value: 'base', label: t('blockEditor.medium') },
    { value: 'lg', label: t('blockEditor.large') },
  ];

  const innerContent = (
    <>
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          <div className="space-y-1">
            <label className="text-xs text-white/60">{t('blockEditor.bio')}</label>
            <textarea
              value={bioText}
              onChange={(e) => setBioText(e.target.value)}
              maxLength={BIO_MAX}
              rows={4}
              placeholder={t('blockEditor.bioPlaceholder')}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#C9A55C]/50 resize-none"
            />
            <p className="text-xs text-white/30 text-right">{bioText.length}/{BIO_MAX}</p>
          </div>

          <div className="rounded-lg border border-white/10 p-3 space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-white/60">{t('blockEditor.font')}</label>
              <select
                value={style.font}
                onChange={(e) => update({ font: e.target.value })}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C9A55C]/50"
                style={{ fontFamily: resolveFontFamily(style.font) || undefined }}
              >
                <option value="" style={{ fontFamily: 'inherit', color: '#111', backgroundColor: '#fff' }}>{t('blockEditor.defaultFont')}</option>
                {FONT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value} style={{ fontFamily: f.fontFamily, color: '#111', backgroundColor: '#fff' }}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-white/60">{t('blockEditor.weight')}</label>
                <button
                  type="button"
                  onClick={() => update({ bold: !style.bold })}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                    style.bold
                      ? 'bg-[#C9A55C] text-black border-[#C9A55C]'
                      : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
                  )}
                >
                  <Bold className="h-4 w-4" />
                  {t('blockEditor.bold')}
                </button>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-white/60">{t('blockEditor.size')}</label>
                <div className="flex gap-1">
                  {sizeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update({ size: opt.value })}
                      className={cn(
                        'flex-1 rounded-lg border px-2 py-2 text-xs transition-colors',
                        style.size === opt.value
                          ? 'bg-[#C9A55C] text-black border-[#C9A55C]'
                          : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-white/60">{t('blockEditor.alignment')}</label>
              <div className="flex gap-2">
                {alignOptions.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update({ align: opt.value })}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                        style.align === opt.value
                          ? 'bg-[#C9A55C] text-black border-[#C9A55C]'
                          : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 z-10 mt-auto flex gap-3 -mx-4 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-[#0e0c09]">
            <Button onClick={() => onOpenChange(false)} className="flex-1 h-12 rounded-xl bg-white/10 text-white border border-white/20 hover:bg-white/20">
              {t('blockEditor.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 h-12 rounded-xl bg-[#C9A55C] text-black font-semibold hover:bg-[#C9A55C]/90 disabled:opacity-40">
              {saving ? (<><Loader2 className="h-4 w-4 animate-spin" />{t('blockEditor.saving')}</>) : t('blockEditor.save')}
            </Button>
          </div>
        </div>
      )}
    </>
  );

  if (panelMode) {
    return (
      <div className="flex flex-1 flex-col bg-[#0e0c09] text-white px-4 pt-4">
        {innerContent}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{t('blocks.bio.title')}</DialogTitle>
          <DialogDescription className="text-white/50">
            {t('blocks.bio.subtitle')}
          </DialogDescription>
        </DialogHeader>
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
