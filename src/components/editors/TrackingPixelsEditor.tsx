import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { isValidPixelId, type PixelKind } from '@/lib/tracking-pixels';

/**
 * PIXELS.1 — the Tracking Pixels panel (Analytics group). Three profile-level
 * IDs (Meta / TikTok / GA4) that the PUBLIC route injects as base pixels.
 *
 * Self-contained: reads and writes `profiles` for the signed-in user directly
 * (owner RLS covers both). Draft/seed/save model mirrors the Name & Handle hub —
 * every field edits a draft; Save is the only write; Clear just blanks the
 * drafts (a wipe still has to be Saved). Rendered by ProfileDashboard inside the
 * narrow slide-in panel, so the layout is single-column and full-width.
 */

type Seed = { meta: string; tiktok: string; ga4: string };
const EMPTY: Seed = { meta: '', tiktok: '', ga4: '' };

const FIELDS: { kind: PixelKind; key: keyof Seed; labelKey: string; phKey: string; testid: string }[] = [
  { kind: 'meta', key: 'meta', labelKey: 'pixels.metaLabel', phKey: 'pixels.metaPlaceholder', testid: 'pixel-meta' },
  { kind: 'tiktok', key: 'tiktok', labelKey: 'pixels.tiktokLabel', phKey: 'pixels.tiktokPlaceholder', testid: 'pixel-tiktok' },
  { kind: 'ga4', key: 'ga4', labelKey: 'pixels.ga4Label', phKey: 'pixels.ga4Placeholder', testid: 'pixel-ga4' },
];

export function TrackingPixelsEditor() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [draft, setDraft] = useState<Seed>(EMPTY);
  const [seed, setSeed] = useState<Seed>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Seed the drafts from the profile once.
  useEffect(() => {
    let alive = true;
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('meta_pixel_id, tiktok_pixel_id, ga4_id')
        .eq('id', user.id)
        .maybeSingle();
      if (!alive) return;
      if (error) {
        console.warn('[pixels] load failed:', error.message);
      }
      const next: Seed = {
        meta: data?.meta_pixel_id ?? '',
        tiktok: data?.tiktok_pixel_id ?? '',
        ga4: data?.ga4_id ?? '',
      };
      setDraft(next);
      setSeed(next);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  const dirty =
    draft.meta !== seed.meta || draft.tiktok !== seed.tiktok || draft.ga4 !== seed.ga4;
  const invalid = FIELDS.some((f) => !isValidPixelId(f.kind, draft[f.key]));
  const set = (key: keyof Seed, v: string) => setDraft((d) => ({ ...d, [key]: v }));

  const handleSave = async () => {
    if (!user || !dirty || invalid || saving) return;
    setSaving(true);
    // Empty field → null column (a cleared pixel is absent, not "").
    const norm = (v: string) => (v.trim() === '' ? null : v.trim());
    const { error } = await supabase
      .from('profiles')
      .update({
        meta_pixel_id: norm(draft.meta),
        tiktok_pixel_id: norm(draft.tiktok),
        ga4_id: norm(draft.ga4),
      })
      .eq('id', user.id);
    setSaving(false);
    if (error) {
      toast.error(t('pixels.saveFailed'));
      return;
    }
    // Saved values become the new baseline, so the form goes clean.
    const saved: Seed = { meta: draft.meta.trim(), tiktok: draft.tiktok.trim(), ga4: draft.ga4.trim() };
    setDraft(saved);
    setSeed(saved);
    toast.success(t('pixels.saved'));
  };

  return (
    <div className="dark text-foreground flex min-h-full flex-col gap-5 px-4 pt-4" data-testid="tracking-pixels-panel">
      <p className="text-white/50 text-[13px] leading-relaxed">{t('pixels.intro')}</p>

      {loading ? (
        <div className="space-y-5">
          {FIELDS.map((f) => (
            <div key={f.key} className="h-16 rounded-xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {FIELDS.map((f) => {
            const value = draft[f.key];
            const showError = !isValidPixelId(f.kind, value);
            return (
              <div key={f.key}>
                <label className="text-white/40 text-[10px] block mb-1">{t(f.labelKey)}</label>
                <input
                  type="text"
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={value}
                  data-testid={f.testid}
                  placeholder={t(f.phKey)}
                  onChange={(e) => set(f.key, e.target.value)}
                  className={`w-full bg-white/5 border rounded-xl px-3 py-2 text-sm text-white font-mono placeholder:text-white/30 focus:outline-none ${
                    showError ? 'border-red-500/60 focus:border-red-500/60' : 'border-white/10 focus:border-[#C9A55C]/50'
                  }`}
                />
                {showError && (
                  <p className="text-red-400/80 text-[10px] mt-1">{t(`${f.labelKey}Hint`)}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-white/40 text-[11px]">{t('pixels.caption')}</p>

      {/* Sticky Save/Clear footer — same anchoring as the Name & Handle hub. */}
      <div className="sticky bottom-0 z-10 mt-auto -mx-4 px-4 flex gap-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-[#0e0c09]">
        <button
          onClick={() => setDraft(EMPTY)}
          disabled={saving || (draft.meta === '' && draft.tiktok === '' && draft.ga4 === '')}
          className="flex-1 h-12 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 font-semibold text-sm disabled:opacity-40"
        >
          {t('pixels.clear')}
        </button>
        <button
          onClick={handleSave}
          disabled={!dirty || invalid || saving}
          data-testid="pixel-save"
          className="flex-1 h-12 rounded-xl bg-[#C9A55C] text-[#0e0c09] hover:bg-[#C9A55C]/90 font-semibold text-sm disabled:opacity-40"
        >
          {t('pixels.save')}
        </button>
      </div>
    </div>
  );
}
