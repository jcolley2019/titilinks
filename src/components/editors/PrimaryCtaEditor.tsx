import { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Loader2, MousePointer, Palette, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { translateContent } from '@/lib/content-i18n';
import type { Tables } from '@/integrations/supabase/types';
import { DEFAULT_BLOCK_STYLE, type BlockStyleConfig } from '@/lib/theme-defaults';
import { useEntitlements } from '@/hooks/useEntitlements';
import { ANIMATIONS, animationClass } from '@/lib/animations';
import { cn } from '@/lib/utils';

type BlockItem = Tables<'block_items'>;

interface CtaBlockConfig {
  style: BlockStyleConfig;
}

// Schema is a factory so its validation messages resolve through t() (the
// panel renders form.formState.errors.<field>.message directly).
const makeFormSchema = (t: (key: string) => string) => z.object({
  label: z.string().min(1, t('primaryCtaEditor.errLabelRequired')).max(50, t('primaryCtaEditor.errLabelTooLong')),
  url: z.string()
    .min(1, t('primaryCtaEditor.errUrlRequired'))
    .refine(
      (val) => val.startsWith('http://') || val.startsWith('https://'),
      t('primaryCtaEditor.errUrlProtocol')
    )
    .refine(
      (val) => {
        try {
          new URL(val);
          return true;
        } catch {
          return false;
        }
      },
      t('primaryCtaEditor.errUrlInvalid')
    ),
  subtitle: z.string().max(100, t('primaryCtaEditor.errSubtitleTooLong')).optional(),
  badge: z.string().max(20, t('primaryCtaEditor.errBadgeTooLong')).optional(),
});

type FormData = z.infer<ReturnType<typeof makeFormSchema>>;

interface PrimaryCtaEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
}

export function PrimaryCtaEditor({ blockId, open, onOpenChange, onSave, panelMode }: PrimaryCtaEditorProps) {
  const { t } = useLanguage();
  const { can } = useEntitlements();
  const canAnimations = can('linkAnimations');
  // ES.FIX.1 STEP 3: the preview mirrors the public render path — seeded default
  // content (label/subtitle/badge, incl. NEW→NUEVO) translates via content-i18n.
  // Input fields keep raw stored values; only this preview translates.
  const tc = (text: string | null | undefined) => translateContent(text, t);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingItem, setExistingItem] = useState<BlockItem | null>(null);
  const [styleConfig, setStyleConfig] = useState<BlockStyleConfig>(DEFAULT_BLOCK_STYLE);
  const [styleExpanded, setStyleExpanded] = useState(false);

  // ANIM.1: pick the CTA's motion effect. 'none' is free; the rest are PRO — a
  // free profile sees the picker but a locked pick raises the upsell instead of
  // writing (onSubmit strips it too). Stored on styleConfig.animation.
  const pickAnimation = (id: string) => {
    if (id !== 'none' && !canAnimations) {
      toast(t('linksEditor.animations'), { description: t('linksEditor.animationsUpsell') });
      return;
    }
    setStyleConfig((prev) => ({ ...prev, animation: id === 'none' ? undefined : id }));
  };

  const form = useForm<FormData>({
    resolver: zodResolver(makeFormSchema(t)),
    defaultValues: {
      label: '',
      url: '',
      subtitle: '',
      badge: '',
    },
  });

  useEffect(() => {
    if (open) {
      fetchBlockItem();
    }
  }, [open, blockId]);

  const fetchBlockItem = async () => {
    setLoading(true);
    try {
      // Fetch block to get style config from title
      const { data: blockData, error: blockError } = await supabase
        .from('blocks')
        .select('title')
        .eq('id', blockId)
        .single();
      
      if (blockError) throw blockError;
      
      // Parse style config from title
      try {
        const parsed = JSON.parse(blockData?.title || '{}');
        if (parsed.style) {
          setStyleConfig({ ...DEFAULT_BLOCK_STYLE, ...parsed.style });
        } else {
          setStyleConfig(DEFAULT_BLOCK_STYLE);
        }
      } catch {
        setStyleConfig(DEFAULT_BLOCK_STYLE);
      }

      const { data, error } = await supabase
        .from('block_items')
        .select('*')
        .eq('block_id', blockId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setExistingItem(data);
        form.reset({
          label: data.label,
          url: data.url,
          subtitle: data.subtitle || '',
          badge: data.badge || '',
        });
      } else {
        setExistingItem(null);
        form.reset({
          label: '',
          url: '',
          subtitle: '',
          badge: '',
        });
      }
    } catch (error) {
      console.error('Error fetching block item:', error);
      toast.error(t('primaryCtaEditor.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      // Save style config to block title. ANIM.1: strip the animation key at
      // SAVE for a non-entitled profile (belt-and-suspenders with the picker).
      const safeStyle =
        canAnimations || styleConfig.animation == null
          ? styleConfig
          : { ...styleConfig, animation: undefined };
      const configJson: CtaBlockConfig = { style: safeStyle };
      const { error: blockError } = await supabase
        .from('blocks')
        .update({ title: JSON.stringify(configJson) })
        .eq('id', blockId);
      
      if (blockError) throw blockError;

      if (existingItem) {
        // Update existing item
        const { error } = await supabase
          .from('block_items')
          .update({
            label: data.label,
            url: data.url,
            subtitle: data.subtitle || null,
            badge: data.badge || null,
          })
          .eq('id', existingItem.id);

        if (error) throw error;
      } else {
        // Create new item
        const { error } = await supabase
          .from('block_items')
          .insert({
            block_id: blockId,
            label: data.label,
            url: data.url,
            subtitle: data.subtitle || null,
            badge: data.badge || null,
            order_index: 0,
          });

        if (error) throw error;
      }

      toast.success(t('primaryCtaEditor.saveSuccess'));
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving block item:', error);
      toast.error(error.message || t('primaryCtaEditor.saveFailed'));
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4">
          {/* Style Variants Section */}
          <Collapsible open={styleExpanded} onOpenChange={setStyleExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-primary" />
                  <span>{t('primaryCtaEditor.styleVariants')}</span>
                </div>
                {styleExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-4">
              {/* Variant Select */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('primaryCtaEditor.buttonVariant')}</Label>
                  <Select
                    value={styleConfig.variant}
                    onValueChange={(value: 'filled' | 'outline' | 'glass' | 'minimal') =>
                      setStyleConfig(prev => ({ ...prev, variant: value }))
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="filled">{t('primaryCtaEditor.variantFilled')}</SelectItem>
                      <SelectItem value="outline">{t('primaryCtaEditor.variantOutline')}</SelectItem>
                      <SelectItem value="glass">{t('primaryCtaEditor.variantGlass')}</SelectItem>
                      <SelectItem value="minimal">{t('primaryCtaEditor.variantMinimal')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('primaryCtaEditor.fontStyle')}</Label>
                  <Select
                    value={styleConfig.font_style}
                    onValueChange={(value: 'normal' | 'mono' | 'serif') =>
                      setStyleConfig(prev => ({ ...prev, font_style: value }))
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">{t('primaryCtaEditor.fontNormal')}</SelectItem>
                      <SelectItem value="mono">{t('primaryCtaEditor.fontMono')}</SelectItem>
                      <SelectItem value="serif">{t('primaryCtaEditor.fontSerif')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Border Width & Color */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('primaryCtaEditor.borderWidth').replace('{value}', String(styleConfig.border_width))}</Label>
                  <Slider
                    value={[styleConfig.border_width]}
                    onValueChange={([value]) => setStyleConfig(prev => ({ ...prev, border_width: value }))}
                    min={0}
                    max={4}
                    step={1}
                    className="py-2"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('primaryCtaEditor.borderColor')}</Label>
                  <Input
                    type="color"
                    value={styleConfig.border_color || '#ffffff'}
                    onChange={(e) => setStyleConfig(prev => ({ ...prev, border_color: e.target.value }))}
                    className="h-8 p-1 w-full"
                  />
                </div>
              </div>

              {/* Background Opacity & Letter Spacing */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t('primaryCtaEditor.backgroundOpacity').replace('{value}', String(Math.round(styleConfig.background_opacity * 100)))}</Label>
                  <Slider
                    value={[styleConfig.background_opacity]}
                    onValueChange={([value]) => setStyleConfig(prev => ({ ...prev, background_opacity: value }))}
                    min={0}
                    max={1}
                    step={0.05}
                    className="py-2"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t('primaryCtaEditor.letterSpacing').replace('{value}', styleConfig.letter_spacing.toFixed(2))}</Label>
                  <Slider
                    value={[styleConfig.letter_spacing]}
                    onValueChange={([value]) => setStyleConfig(prev => ({ ...prev, letter_spacing: value }))}
                    min={-0.05}
                    max={0.2}
                    step={0.01}
                    className="py-2"
                  />
                </div>
              </div>

              {/* ANIM.1 — CTA motion effect. Six subtle options (only 'none'
                  free; the rest PRO). Each chip previews its own animation. */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Label className="text-xs">{t('linksEditor.animations')}</Label>
                  {!canAnimations && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#C9A55C]/15 text-[#C9A55C] text-[10px] font-bold px-2 py-0.5">
                      <Lock className="h-2.5 w-2.5" /> PRO
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {ANIMATIONS.map(({ id, labelKey }) => {
                    const selected = (styleConfig.animation ?? 'none') === id;
                    const locked = !canAnimations && id !== 'none';
                    return (
                      <button
                        key={id}
                        type="button"
                        data-testid={`cta-anim-chip-${id}`}
                        aria-pressed={selected}
                        onClick={() => pickAnimation(id)}
                        className={cn(
                          'relative py-2 text-xs font-semibold rounded-lg border-2 transition-all',
                          animationClass(id),
                          selected
                            ? 'border-[#C9A55C] bg-[#C9A55C]/10 text-[#C9A55C]'
                            : 'border-border text-muted-foreground',
                        )}
                      >
                        {locked && <Lock className="absolute right-1 top-1 h-2.5 w-2.5 text-[#C9A55C]/70" />}
                        {t(labelKey)}
                      </button>
                    );
                  })}
                </div>
                {!canAnimations && (
                  <button
                    type="button"
                    data-testid="cta-animations-upsell"
                    onClick={() =>
                      toast(t('linksEditor.animations'), { description: t('linksEditor.animationsUpsell') })
                    }
                    className="w-full py-2 text-xs font-semibold rounded-lg bg-[#C9A55C] text-[#0e0c09] hover:bg-[#C9A55C]/90 transition-colors"
                  >
                    {t('linksEditor.upgradeToPro')}
                  </button>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-2">
            <Label htmlFor="label">
              {t('primaryCtaEditor.buttonLabel')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="label"
              placeholder={t('primaryCtaEditor.shopNowPlaceholder')}
              {...form.register('label')}
            />
            {form.formState.errors.label && (
              <p className="text-sm text-destructive">{form.formState.errors.label.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">
              {t('primaryCtaEditor.url')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="url"
              placeholder="https://example.com/shop"
              {...form.register('url')}
            />
            {form.formState.errors.url && (
              <p className="text-sm text-destructive">{form.formState.errors.url.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="subtitle">{t('primaryCtaEditor.subtitle')}</Label>
            <Input
              id="subtitle"
              placeholder={t('primaryCtaEditor.subtitlePlaceholder')}
              {...form.register('subtitle')}
            />
            {form.formState.errors.subtitle && (
              <p className="text-sm text-destructive">{form.formState.errors.subtitle.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="badge">{t('primaryCtaEditor.badge')}</Label>
            <Input
              id="badge"
              placeholder={t('primaryCtaEditor.badgePlaceholder')}
              {...form.register('badge')}
            />
            {form.formState.errors.badge && (
              <p className="text-sm text-destructive">{form.formState.errors.badge.message}</p>
            )}
          </div>

          {/* Preview */}
          {form.watch('label') && (
            <div className="p-4 rounded-lg border border-border bg-secondary/30">
              <p className="text-xs text-muted-foreground mb-2">{t('primaryCtaEditor.preview')}</p>
              <div className="flex flex-col items-center gap-1">
                {form.watch('badge') && (
                  <span className="text-xs font-medium text-primary">{tc(form.watch('badge'))}</span>
                )}
                <div className="px-6 py-2 rounded-full bg-primary text-primary-foreground font-medium">
                  {tc(form.watch('label'))}
                </div>
                {form.watch('subtitle') && (
                  <span className="text-xs text-muted-foreground">{tc(form.watch('subtitle'))}</span>
                )}
              </div>
            </div>
          )}

          <div className="sticky bottom-0 z-10 mt-auto flex gap-3 -mx-4 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-[#0e0c09]">
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-12 rounded-xl bg-white/10 text-white border border-white/20 hover:bg-white/20"
            >
              {t('blockEditor.cancel')}
            </Button>
            <Button
              type="submit"
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
        </form>
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MousePointer className="h-5 w-5 text-primary" />
            {t('primaryCtaEditor.dialogTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('primaryCtaEditor.dialogDescription')}
          </DialogDescription>
        </DialogHeader>
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
