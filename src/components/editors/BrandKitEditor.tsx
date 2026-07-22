// BRAND.2 — Brand Kit panel (Style group): brand colors + heading/body fonts,
// saved to profiles.brand_json, with a one-tap snapshot-guarded "Apply my
// brand" onto the CURRENT page's theme (confirmless per the TPL.3d one-gesture
// ruling — the auto snapshot IS the undo, and the toast says so).
//
// Renders in the narrow slide-in panel: single column, full-width controls,
// FS.SURFACE sticky footer.

import { useEffect, useState } from 'react';
import { ChevronDown, Loader2, X } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { useUserFonts } from '@/hooks/useUserFonts';
import { FONT_OPTIONS, userFontOptions, resolveFontFamily, type FontOption } from '@/lib/fonts';
import { applyBrandToPage, parseBrandJson, type BrandColors, type BrandKit } from '@/lib/brand';

interface BrandKitEditorProps {
  pageId: string;
  onRefresh: () => void;
}

const COLOR_ROWS: Array<{ key: keyof BrandColors; labelKey: string; testId: string }> = [
  { key: 'primary', labelKey: 'brand.primary', testId: 'brand-color-primary' },
  { key: 'accent', labelKey: 'brand.accent', testId: 'brand-color-accent' },
  { key: 'background', labelKey: 'brand.background', testId: 'brand-color-background' },
];

export function BrandKitEditor({ pageId, onRefresh }: BrandKitEditorProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { fonts } = useUserFonts(); // also registers @font-face for previews
  const [colors, setColors] = useState<BrandColors>({});
  const [headingFont, setHeadingFont] = useState('');
  const [bodyFont, setBodyFont] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [wheelFor, setWheelFor] = useState<keyof BrandColors | null>(null);
  const [pickerFor, setPickerFor] = useState<'heading' | 'body' | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!user) { setLoading(false); return; }
      const { data, error } = await supabase
        .from('profiles')
        .select('brand_json')
        .eq('id', user.id)
        .single();
      if (cancelled) return;
      if (error) {
        console.warn('[brand] brand_json read failed:', error.message);
      } else {
        const kit = parseBrandJson(data?.brand_json);
        setColors(kit.colors ?? {});
        setHeadingFont(kit.heading_font ?? '');
        setBodyFont(kit.body_font ?? '');
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentKit = (): BrandKit => {
    const kit: BrandKit = {};
    const c: BrandColors = {};
    if (colors.primary) c.primary = colors.primary;
    if (colors.accent) c.accent = colors.accent;
    if (colors.background) c.background = colors.background;
    if (Object.keys(c).length) kit.colors = c;
    if (headingFont) kit.heading_font = headingFont;
    if (bodyFont) kit.body_font = bodyFont;
    return kit;
  };

  // Read-modify-write over the FRESH row so brand_json.fonts (BRAND.1) and any
  // future siblings survive a kit save.
  const persistKit = async (): Promise<void> => {
    if (!user) throw new Error('no user');
    const { data } = await supabase
      .from('profiles')
      .select('brand_json')
      .eq('id', user.id)
      .single();
    const existing = (data?.brand_json && typeof data.brand_json === 'object' && !Array.isArray(data.brand_json))
      ? data.brand_json as Record<string, unknown>
      : {};
    const kit = currentKit();
    const next = {
      ...existing,
      colors: kit.colors ?? null,
      heading_font: kit.heading_font ?? null,
      body_font: kit.body_font ?? null,
    };
    const { error } = await supabase
      .from('profiles')
      .update({ brand_json: next as unknown as Json })
      .eq('id', user.id);
    if (error) throw error;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await persistKit();
      toast.success(t('brand.saved'));
    } catch (err) {
      console.error('[brand] save failed:', err);
      toast.error(t('brand.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleApply = async () => {
    if (applying) return;
    setApplying(true);
    try {
      await persistKit();
      const applied = await applyBrandToPage({
        pageId,
        brand: currentKit(),
        autoSnapshotName: t('brand.autoBeforeApply'),
      });
      if (!applied) {
        toast(t('brand.nothingToApply'));
        return;
      }
      toast.success(t('brand.applied'));
      onRefresh();
    } catch (err) {
      console.error('[brand] apply failed:', err);
      toast.error(t('brand.applyFailed'));
    } finally {
      setApplying(false);
    }
  };

  const fontLabel = (key: string): string => {
    if (!key) return t('brand.fontNone');
    const all = [...userFontOptions(fonts), ...FONT_OPTIONS];
    return all.find((o) => o.value === key)?.label ?? key;
  };

  const renderFontPicker = (
    kind: 'heading' | 'body',
    value: string,
    setValue: (v: string) => void,
    labelKey: string,
    testId: string,
  ) => {
    const open = pickerFor === kind;
    const options: FontOption[] = [...userFontOptions(fonts), ...FONT_OPTIONS];
    return (
      <div>
        <label className="text-white/40 text-[10px] block mb-1">{t(labelKey)}</label>
        <button
          type="button"
          data-testid={testId}
          onClick={() => setPickerFor(open ? null : kind)}
          className="w-full flex items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-left hover:border-white/25 transition-colors"
        >
          <span
            className="text-sm text-white truncate"
            style={{ fontFamily: resolveFontFamily(value) }}
          >
            {fontLabel(value)}
          </span>
          <ChevronDown className={`h-4 w-4 text-white/40 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="mt-1.5 max-h-48 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
            <button
              type="button"
              onClick={() => { setValue(''); setPickerFor(null); }}
              className="w-full text-left px-3 py-2 text-sm text-white/60 hover:bg-white/5"
            >
              {t('brand.fontNone')}
            </button>
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => { setValue(o.value); setPickerFor(null); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-white/5 truncate ${value === o.value ? 'text-[#C9A55C]' : 'text-white'}`}
                style={{ fontFamily: o.fontFamily }}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div data-testid="brand-kit-panel" className="dark text-foreground flex min-h-full flex-col gap-5 px-4 pt-4">
      <p className="text-xs text-white/50">{t('brand.hint')}</p>

      {/* Colors */}
      <div className="space-y-4">
        <p className="text-white/60 text-[11px] font-semibold uppercase tracking-wide">{t('brand.colors')}</p>
        {COLOR_ROWS.map((row) => {
          const value = colors[row.key] ?? '';
          return (
            <div key={row.key}>
              <label className="text-white/40 text-[10px] block mb-1">{t(row.labelKey)}</label>
              <div className="flex items-center gap-2">
                {/* Wheel toggle — the app's conic-gradient wheel convention. */}
                <button
                  type="button"
                  aria-label={t(row.labelKey)}
                  onClick={() => setWheelFor(wheelFor === row.key ? null : row.key)}
                  className="h-10 w-12 flex-shrink-0 rounded-lg border border-white/10 cursor-pointer"
                  style={value
                    ? { backgroundColor: value }
                    : { background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
                />
                <input
                  type="text"
                  data-testid={row.testId}
                  value={value}
                  placeholder="#C9A55C"
                  onChange={(e) => setColors((prev) => ({ ...prev, [row.key]: e.target.value }))}
                  className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono uppercase placeholder:text-white/30 focus:outline-none focus:border-[#C9A55C]/50 truncate"
                />
                {value && (
                  <button
                    type="button"
                    aria-label={t('brand.clear')}
                    onClick={() => {
                      setColors((prev) => ({ ...prev, [row.key]: undefined }));
                      if (wheelFor === row.key) setWheelFor(null);
                    }}
                    className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {wheelFor === row.key && (
                <div className="mt-2">
                  <HexColorPicker
                    color={value || '#C9A55C'}
                    onChange={(c) => setColors((prev) => ({ ...prev, [row.key]: c }))}
                    style={{ width: '100%' }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Fonts — same shared source as the page pickers, uploads included. */}
      <div className="space-y-4">
        <p className="text-white/60 text-[11px] font-semibold uppercase tracking-wide">{t('brand.fonts')}</p>
        {renderFontPicker('heading', headingFont, setHeadingFont, 'brand.headingFont', 'brand-font-heading')}
        {renderFontPicker('body', bodyFont, setBodyFont, 'brand.bodyFont', 'brand-font-body')}
      </div>

      {/* Uniform sticky footer — save + the primary one-tap apply. */}
      <div className="sticky bottom-0 z-10 mt-auto -mx-4 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-[#0e0c09] space-y-2">
        <button
          type="button"
          data-testid="brand-apply"
          disabled={applying || saving}
          onClick={handleApply}
          className="w-full py-2.5 text-sm font-semibold rounded-lg bg-[#C9A55C] text-[#0e0c09] hover:bg-[#C9A55C]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {applying && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('brand.apply')}
        </button>
        <button
          type="button"
          data-testid="brand-save"
          disabled={saving || applying}
          onClick={handleSave}
          className="w-full py-2.5 text-sm font-semibold rounded-lg bg-white/10 text-white hover:bg-white/15 transition-colors disabled:opacity-50"
        >
          {t('brand.save')}
        </button>
      </div>
    </div>
  );
}
