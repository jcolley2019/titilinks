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
import {
  parseTextConfig,
  defaultTextConfig,
  type TextConfig,
  type ElementStyle,
  type TextAlign,
  type TextSize,
} from '@/lib/text-block-config';

const BODY_MAX = 1000;
const HEADING_MAX = 80;

type Target = 'heading' | 'body';

interface TextBlockEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
  onTitleDraftChange?: (title: string | null) => void;
}

export function TextBlockEditor({ blockId, open, onOpenChange, onSave, panelMode, onTitleDraftChange }: TextBlockEditorProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<TextConfig>(defaultTextConfig());
  const [target, setTarget] = useState<Target>('heading');

  useEffect(() => {
    if (open) fetchText();
  }, [open, blockId]);

  // Live-mirror (L3): push the in-progress config to the preview on every change (after load).
  useEffect(() => {
    if (loading) return;
    onTitleDraftChange?.(JSON.stringify(config));
  }, [config, loading]);
  // Clear the mirror when the editor unmounts (cancel / close).
  useEffect(() => () => { onTitleDraftChange?.(null); }, []);

  const fetchText = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('blocks')
        .select('title')
        .eq('id', blockId)
        .single();
      if (error) throw error;
      setConfig(parseTextConfig(data?.title));
    } catch (error) {
      console.error('Error fetching text block:', error);
      toast.error(t('blockEditor.textLoadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const clean: TextConfig = {
        ...config,
        heading: config.heading.trim(),
        body: config.body.trim(),
      };
      const { error } = await supabase
        .from('blocks')
        .update({ title: JSON.stringify(clean) })
        .eq('id', blockId);
      if (error) throw error;

      toast.success(t('blockEditor.textSaved'));
      onSave?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving text block:', error);
      toast.error(t('blockEditor.textSaveError'));
    } finally {
      setSaving(false);
    }
  };

  const activeStyle: ElementStyle = target === 'heading' ? config.headingStyle : config.bodyStyle;

  const updateActive = (patch: Partial<ElementStyle>) =>
    setConfig((prev) =>
      target === 'heading'
        ? { ...prev, headingStyle: { ...prev.headingStyle, ...patch } }
        : { ...prev, bodyStyle: { ...prev.bodyStyle, ...patch } }
    );

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

  const ringClass = (active: boolean) =>
    active ? 'ring-1 ring-[#C9A55C]/70 border-[#C9A55C]/50' : 'border-white/10';

  const innerContent = (
    <>
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-white/60">{t('blockEditor.heading')}</label>
            <input
              value={config.heading}
              onChange={(e) => setConfig({ ...config, heading: e.target.value })}
              onFocus={() => setTarget('heading')}
              maxLength={HEADING_MAX}
              placeholder={t('blockEditor.headingPlaceholder')}
              className={cn(
                'w-full rounded-lg bg-white/5 border px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none',
                ringClass(target === 'heading')
              )}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-white/60">{t('blockEditor.text')}</label>
            <textarea
              value={config.body}
              onChange={(e) => setConfig({ ...config, body: e.target.value })}
              onFocus={() => setTarget('body')}
              maxLength={BODY_MAX}
              rows={5}
              placeholder={t('blockEditor.textPlaceholder')}
              className={cn(
                'w-full rounded-lg bg-white/5 border px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none resize-none',
                ringClass(target === 'body')
              )}
            />
            <p className="text-xs text-white/30 text-right">{config.body.length}/{BODY_MAX}</p>
          </div>

          <div className="rounded-lg border border-white/10 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">{t('blockEditor.styling')}</span>
              <div className="flex gap-1">
                {(['heading', 'body'] as Target[]).map((tg) => (
                  <button
                    key={tg}
                    type="button"
                    onClick={() => setTarget(tg)}
                    className={cn(
                      'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                      target === tg ? 'bg-[#C9A55C] text-black' : 'bg-white/5 text-white/60 hover:bg-white/10'
                    )}
                  >
                    {tg === 'heading' ? t('blockEditor.headingTab') : t('blockEditor.textTab')}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-white/60">{t('blockEditor.font')}</label>
              <select
                value={activeStyle.font}
                onChange={(e) => updateActive({ font: e.target.value })}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C9A55C]/50"
                style={{ fontFamily: resolveFontFamily(activeStyle.font) || undefined }}
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
                  onClick={() => updateActive({ bold: !activeStyle.bold })}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                    activeStyle.bold
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
                      onClick={() => updateActive({ size: opt.value })}
                      className={cn(
                        'flex-1 rounded-lg border px-2 py-2 text-xs transition-colors',
                        activeStyle.size === opt.value
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
                      onClick={() => updateActive({ align: opt.value })}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                        activeStyle.align === opt.value
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

          <div className="sticky bottom-0 z-10 flex gap-2 justify-end pt-3 mt-2 border-t border-white/10 bg-[#0e0c09]">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-white/60 hover:text-white hover:bg-white/10">
              {t('blockEditor.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#C9A55C] text-black hover:bg-[#C9A55C]/90">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('blockEditor.save')}
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
      <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{t('blocks.text.title')}</DialogTitle>
          <DialogDescription className="text-white/50">
            {t('blocks.text.subtitle')}
          </DialogDescription>
        </DialogHeader>
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
