// ProductCardsEditor — a shoppable Gallery. Modeled on GalleryEditor: block
// settings (layout / auto-scroll / speed + Show price / Show Buy toggles) live
// as JSON in block.title; each product is a block_items row. The editor is a
// 2-col tile grid with a "+" add square (exactly like Gallery); tapping a tile
// opens that product's fields below (title, store link, optional price/badge/
// buy). Product images upload to the `products` bucket.

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { randomUUID } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
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
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, ShoppingBag, ImagePlus, ShieldAlert } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { translateContent } from '@/lib/content-i18n';
import type { Tables } from '@/integrations/supabase/types';
import { validateImageFile, IMAGE_SIZE_LIMITS, ITEM_CAPS, validateUrl } from '@/lib/validation';

const MAX_ITEMS = ITEM_CAPS.product_cards;

type BlockItem = Tables<'block_items'>;

interface ProductItem {
  id: string;
  label: string;
  url: string;
  image_url?: string;
  subtitle?: string;
  badge?: string;
  is_adult?: boolean;
  price?: number | null;
  compare_at_price?: number | null;
  currency?: string;
  cta_label?: string;
  imageFile?: File;
  imagePreview?: string;
}

interface ProductCardsConfig {
  layout: 'full' | 'filmstrip' | 'grid';
  autoScroll: boolean;
  speed: 'slow' | 'medium' | 'fast';
  showPrice: boolean;
  showBuy: boolean;
}

interface ProductCardsEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
}

export function ProductCardsEditor({ blockId, open, onOpenChange, onSave, panelMode }: ProductCardsEditorProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  // ES.FIX.1 STEP 3: the tile grid mirrors ProductCardsBlock — seeded default
  // label/badge translate via content-i18n; the input fields keep raw values.
  const tc = (text: string | null | undefined) => translateContent(text, t);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<ProductItem[]>([]);
  const [existingItems, setExistingItems] = useState<BlockItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [config, setConfig] = useState<ProductCardsConfig>({
    layout: 'grid',
    autoScroll: true,
    speed: 'slow',
    showPrice: true,
    showBuy: true,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) fetchItems();
  }, [open, blockId]);

  const fetchItems = async () => {
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
          setConfig({
            // Migrate the legacy stacked/split layouts onto the Gallery set.
            layout: parsed.layout === 'filmstrip' || parsed.layout === 'full' ? parsed.layout : 'grid',
            autoScroll: parsed.autoScroll !== false,
            speed: parsed.speed === 'fast' || parsed.speed === 'medium' ? parsed.speed : 'slow',
            showPrice: parsed.showPrice !== false,
            showBuy: parsed.showBuy !== false,
          });
        }
      } catch { /* plain title => defaults */ }

      const { data, error } = await supabase
        .from('block_items')
        .select('*')
        .eq('block_id', blockId)
        .order('order_index', { ascending: true });
      if (error) throw error;

      setExistingItems(data || []);
      setItems(
        (data || []).map((item) => ({
          id: item.id,
          label: item.label || '',
          url: item.url || '',
          image_url: item.image_url || undefined,
          subtitle: item.subtitle || '',
          badge: item.badge || '',
          is_adult: item.is_adult || false,
          price: item.price,
          compare_at_price: item.compare_at_price,
          currency: item.currency || 'USD',
          cta_label: item.cta_label || '',
        }))
      );
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error(t('productCardsEditor.failedToLoad'));
    } finally {
      setLoading(false);
    }
  };

  // Tapping the "+" tile opens the file picker; the chosen image becomes a new
  // product, auto-selected so its link/title fields show below (Gallery flow).
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    if (items.length >= MAX_ITEMS) {
      toast.error(t('productCardsEditor.maxProducts').replace('{max}', String(MAX_ITEMS)));
      return;
    }
    const validation = validateImageFile(file, IMAGE_SIZE_LIMITS.product);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }
    const id = `new-${Date.now()}-${Math.random()}`;
    const reader = new FileReader();
    reader.onload = () => {
      setItems((prev) => [
        ...prev,
        {
          id,
          label: '',
          url: '',
          subtitle: '',
          badge: '',
          is_adult: false,
          price: null,
          compare_at_price: null,
          currency: 'USD',
          cta_label: '',
          imageFile: file,
          imagePreview: reader.result as string,
        },
      ]);
      setSelectedId(id);
    };
    reader.readAsDataURL(file);
  };

  const updateItem = (id: string, patch: Partial<ProductItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const replaceImage = (id: string, file: File) => {
    const validation = validateImageFile(file, IMAGE_SIZE_LIMITS.product);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateItem(id, { imageFile: file, imagePreview: reader.result as string });
    reader.readAsDataURL(file);
  };

  const uploadImage = async (file: File): Promise<string> => {
    if (!user) throw new Error('Not authenticated');
    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/${randomUUID()}.${fileExt}`;
    const { error } = await supabase.storage.from('products').upload(filePath, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('products').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleSave = async () => {
    // Each product needs a title + a valid store link.
    for (const item of items) {
      if (!item.label.trim()) {
        toast.error(t('productCardsEditor.titleRequired'));
        setSelectedId(item.id);
        return;
      }
      const urlError = validateUrl(item.url);
      if (urlError) {
        toast.error(urlError);
        setSelectedId(item.id);
        return;
      }
    }

    setSaving(true);
    try {
      // Delete removed items.
      const keptIds = items.filter((i) => !i.id.startsWith('new-')).map((i) => i.id);
      const toDelete = existingItems.filter((ei) => !keptIds.includes(ei.id));
      for (const item of toDelete) {
        const { error } = await supabase.from('block_items').delete().eq('id', item.id);
        if (error) throw error;
      }

      // Upsert kept items in display order.
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        let imageUrl = item.image_url || null;
        if (item.imageFile) imageUrl = await uploadImage(item.imageFile);

        const itemData = {
          label: item.label.trim(),
          url: item.url.trim(),
          image_url: imageUrl,
          subtitle: item.subtitle?.trim() || null,
          badge: item.badge?.trim() || null,
          is_adult: item.is_adult || false,
          order_index: i,
          price: item.price ?? null,
          compare_at_price: item.compare_at_price ?? null,
          currency: item.currency || 'USD',
          cta_label: item.cta_label?.trim() || null,
        };

        if (item.id.startsWith('new-')) {
          const { error } = await supabase.from('block_items').insert({ block_id: blockId, ...itemData });
          if (error) throw error;
        } else {
          const { error } = await supabase.from('block_items').update(itemData).eq('id', item.id);
          if (error) throw error;
        }
      }

      const { error: cfgError } = await supabase
        .from('blocks')
        .update({ title: JSON.stringify(config) })
        .eq('id', blockId);
      if (cfgError) throw cfgError;

      toast.success(t('productCardsEditor.saved'));
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving products:', error);
      toast.error(error.message || t('productCardsEditor.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const selected = items.find((i) => i.id === selectedId) || null;

  const innerContent = (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Layout picker — same set as the Gallery. */}
          <div className="mb-4">
            <p className="text-xs text-white/60 mb-2">{t('productCardsEditor.layout')}</p>
            <div className="flex items-center gap-2">
              {(['full', 'filmstrip', 'grid'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setConfig((c) => ({ ...c, layout: opt }))}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    config.layout === opt
                      ? 'bg-[#C9A55C] text-[#0e0c09]'
                      : 'bg-white/5 text-foreground border border-white/10'
                  }`}
                >
                  {opt === 'full' ? t('productCardsEditor.layoutFull') : opt === 'filmstrip' ? t('productCardsEditor.layoutFilmstrip') : t('productCardsEditor.layoutGrid')}
                </button>
              ))}
            </div>
            {config.layout === 'filmstrip' && (
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/60">{t('productCardsEditor.autoScroll')}</span>
                  <button
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, autoScroll: !c.autoScroll }))}
                    className={`w-[33px] h-[18px] rounded-full relative transition-colors ${config.autoScroll ? 'bg-[#C9A55C]' : 'bg-white/10'}`}
                  >
                    <span className={`absolute top-[1.5px] left-[1.5px] w-[15px] h-[15px] rounded-full bg-white transition-transform ${config.autoScroll ? 'translate-x-[15px]' : ''}`} />
                  </button>
                </div>
                {config.autoScroll && (
                  <div className="flex items-center gap-1.5">
                    {(['slow', 'medium', 'fast'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setConfig((c) => ({ ...c, speed: s }))}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                          config.speed === s ? 'bg-[#C9A55C] text-[#0e0c09]' : 'bg-white/5 text-foreground border border-white/10'
                        }`}
                      >
                        {t(`productCardsEditor.speed${s.charAt(0).toUpperCase()}${s.slice(1)}`)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Show price / Show Buy toggles. */}
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">{t('productCardsEditor.showPrices')}</span>
              <Switch checked={config.showPrice} onCheckedChange={(v) => setConfig((c) => ({ ...c, showPrice: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">{t('productCardsEditor.showBuyButton')}</span>
              <Switch checked={config.showBuy} onCheckedChange={(v) => setConfig((c) => ({ ...c, showBuy: v }))} />
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.gif,.webp"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Tile grid + selected product's fields. */}
          <ScrollArea className={panelMode ? 'flex-1 min-h-0 px-4 -mx-4' : 'flex-1 min-h-0 -mx-6 px-6'}>
            <div>
              <div className="grid grid-cols-2 gap-3">
                {items.length < MAX_ITEMS && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-[#C9A55C]/40 flex flex-col items-center justify-center gap-2 hover:border-[#C9A55C]/70 hover:bg-[#C9A55C]/5 transition-colors"
                  >
                    <Plus className="h-7 w-7 text-[#C9A55C]/70" />
                    <span className="text-xs font-medium text-[#C9A55C]/80">{t('productCardsEditor.addProduct')}</span>
                  </button>
                )}
                {items.map((item) => {
                  const img = item.imagePreview || item.image_url;
                  const isSel = item.id === selectedId;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`group relative aspect-square rounded-xl overflow-hidden bg-white/5 border-2 cursor-pointer transition-colors ${
                        isSel ? 'border-[#C9A55C]' : 'border-transparent'
                      }`}
                    >
                      {img ? (
                        <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <ShoppingBag className="h-7 w-7 text-white/30" />
                        </div>
                      )}
                      {item.badge && (
                        <span className="absolute top-1.5 left-1.5 z-[1] text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#C9A55C] text-[#0e0c09]">
                          {tc(item.badge)}
                        </span>
                      )}
                      {item.label && (
                        <span className="absolute inset-x-0 bottom-0 z-[1] px-2 pb-1.5 pt-5 text-left bg-gradient-to-t from-black/75 to-transparent">
                          <span className="block truncate text-[11px] font-semibold text-white">{tc(item.label)}</span>
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteItem(item.id); }}
                        aria-label={t('productCardsEditor.removeProduct')}
                        className="absolute top-1.5 right-1.5 z-[2] h-6 w-6 rounded-full bg-black/60 text-white/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {items.length === 0 && (
                <p className="mt-3 text-center text-xs text-white/40">
                  {t('productCardsEditor.emptyState')}
                </p>
              )}

              {/* Selected product's fields. */}
              {selected && (
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t('productCardsEditor.title')}</Label>
                    <Input
                      value={selected.label}
                      onChange={(e) => updateItem(selected.id, { label: e.target.value })}
                      placeholder={t('productCardsEditor.productNamePlaceholder')}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t('productCardsEditor.storeLink')}</Label>
                    <Input
                      value={selected.url}
                      onChange={(e) => updateItem(selected.id, { url: e.target.value })}
                      placeholder="https://…"
                      className="h-9 text-sm"
                    />
                  </div>

                  {config.showPrice && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">{t('productCardsEditor.price')}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={selected.price ?? ''}
                          onChange={(e) => updateItem(selected.id, { price: e.target.value ? parseFloat(e.target.value) : null })}
                          placeholder="29.99"
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('productCardsEditor.compare')}</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={selected.compare_at_price ?? ''}
                          onChange={(e) => updateItem(selected.id, { compare_at_price: e.target.value ? parseFloat(e.target.value) : null })}
                          placeholder="39.99"
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t('productCardsEditor.currency')}</Label>
                        <Select value={selected.currency || 'USD'} onValueChange={(v) => updateItem(selected.id, { currency: v })}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'].map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  <div className={config.showBuy ? 'grid grid-cols-2 gap-2' : ''}>
                    <div className="space-y-1">
                      <Label className="text-xs">{t('productCardsEditor.badge')}</Label>
                      <Input
                        value={selected.badge || ''}
                        onChange={(e) => updateItem(selected.id, { badge: e.target.value })}
                        placeholder={t('productCardsEditor.badgePlaceholder')}
                        className="h-9 text-sm"
                      />
                    </div>
                    {config.showBuy && (
                      <div className="space-y-1">
                        <Label className="text-xs">{t('productCardsEditor.buyLabel')}</Label>
                        <Input
                          value={selected.cta_label || ''}
                          onChange={(e) => updateItem(selected.id, { cta_label: e.target.value })}
                          placeholder={t('productCardsEditor.buyNowPlaceholder')}
                          className="h-9 text-sm"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <ImageReplaceButton onPick={(file) => replaceImage(selected.id, file)} hasImage={!!(selected.imagePreview || selected.image_url)} />
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-white/50" />
                      <span className="text-xs text-white/50">18+</span>
                      <Switch
                        checked={selected.is_adult || false}
                        onCheckedChange={(v) => updateItem(selected.id, { is_adult: v })}
                      />
                    </div>
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
            <ShoppingBag className="h-5 w-5 text-primary" />
            {t('productCardsEditor.dialogTitle')}
          </DialogTitle>
          <DialogDescription>{t('productCardsEditor.dialogDescription')}</DialogDescription>
        </DialogHeader>
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}

/** "Change photo" trigger with its own hidden file input. */
function ImageReplaceButton({ onPick, hasImage }: { onPick: (file: File) => void; hasImage: boolean }) {
  const { t } = useLanguage();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".jpg,.jpeg,.png,.gif,.webp"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); if (ref.current) ref.current.value = ''; }}
        className="hidden"
      />
      <Button type="button" variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => ref.current?.click()}>
        <ImagePlus className="h-3.5 w-3.5" />
        {hasImage ? t('productCardsEditor.changePhoto') : t('productCardsEditor.addPhoto')}
      </Button>
    </>
  );
}
