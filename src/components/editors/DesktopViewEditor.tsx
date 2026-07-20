import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/useLanguage';
import { DEVICE_PRESETS, DEFAULT_DEVICE_ID } from '@/lib/device-presets';
import { resolveDesktopStageDeviceId } from '@/lib/theme-defaults';

/**
 * DESK.STAGE.2 — the Desktop view panel (Style group).
 *
 * DESK.STAGE.1 gave desktop visitors a phone-shaped stage to read the page in,
 * fixed at DEFAULT_DEVICE_ID. This panel lets the page OWNER pick which device
 * that stage is, persisted to `theme_json.desktopStage.deviceId`.
 *
 * The catalog is DEVICE_PRESETS — the same table the editor's preview dropdown
 * renders and the same one every crop aspect derives from. No second list, no
 * re-declared dimensions. The entry equal to DEFAULT_DEVICE_ID wears the
 * "Default" chip, so the default IS a selectable row rather than a duplicate
 * pseudo-option that would highlight twice.
 *
 * Draft / seed / Save, like the Tracking Pixels panel: tapping a row only moves
 * the draft; Save is the only write, and it merges over the raw theme_json so a
 * structural key can never be dropped (BUG.THEME.1). Rendered in the NARROW
 * slide-in panel, so the list is single-column and every label truncates.
 *
 * Scope, stated honestly in the panel copy: this drives the PUBLIC page's
 * desktop stage. The editor's own device dropdown is a separate, ephemeral
 * preview tool and is deliberately left alone.
 */
export interface DesktopViewEditorProps {
  pageId: string;
  /** The page's RAW theme_json — structural keys intact. */
  themeJson: unknown;
  onRefresh: () => void;
}

export function DesktopViewEditor({ pageId, themeJson, onRefresh }: DesktopViewEditorProps) {
  const { t } = useLanguage();
  // The persisted value, resolved through the same total reader the stage uses.
  const stored = resolveDesktopStageDeviceId(themeJson);
  const [draft, setDraft] = useState<string>(stored);
  const [saved, setSaved] = useState<string>(stored);
  const [saving, setSaving] = useState(false);

  // Re-seed only when the STORED value moves away from what we last saved — an
  // external write (snapshot restore, template apply) while the panel is open.
  // A user's own in-progress pick leaves `saved` alone, so it is never clobbered.
  useEffect(() => {
    if (stored !== saved) {
      setSaved(stored);
      setDraft(stored);
    }
  }, [stored, saved]);

  const dirty = draft !== saved;

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    // Merge-safe: spread the raw existing theme (BUG.THEME.1 rule) so this write
    // can't drop pageStyle, pages, heroConfig or anything else structural.
    // Untyped on purpose — a typed theme_json write trips TS2322 against the
    // generated Json column type.
    const existingTheme = (themeJson as any) || {};
    const existingStage = existingTheme.desktopStage || {};
    const { error } = await supabase
      .from('pages')
      .update({
        theme_json: { ...existingTheme, desktopStage: { ...existingStage, deviceId: draft } },
      })
      .eq('id', pageId);
    setSaving(false);
    if (error) {
      toast.error(t('desktopView.saveFailed'));
      return;
    }
    setSaved(draft);
    onRefresh();
    toast.success(t('desktopView.saved'));
  };

  return (
    <div
      className="dark text-foreground flex min-h-full flex-col gap-5 px-4 pt-4"
      data-testid="desktop-view-panel"
    >
      <p className="text-white/50 text-[13px] leading-relaxed">{t('desktopView.intro')}</p>

      <div className="space-y-2">
        {DEVICE_PRESETS.map((d) => {
          const selected = draft === d.id;
          return (
            <button
              key={d.id}
              type="button"
              data-testid={`desktop-view-option-${d.id}`}
              aria-pressed={selected}
              onClick={() => setDraft(d.id)}
              className={`w-full text-left rounded-xl border-2 px-3 py-2.5 transition-all ${
                selected ? 'border-[#C9A55C] bg-[#C9A55C]/10' : 'border-white/10 bg-white/5 hover:border-white/30'
              }`}
            >
              <div className="flex items-center gap-2">
                {/* Device names are intentionally NOT translated (DP.1). */}
                <span
                  className={`text-sm font-semibold truncate ${selected ? 'text-[#C9A55C]' : 'text-white/90'}`}
                >
                  {d.label}
                </span>
                {d.id === DEFAULT_DEVICE_ID && (
                  <span className="shrink-0 rounded-full bg-white/10 text-white/60 text-[10px] font-bold px-2 py-0.5">
                    {t('desktopView.defaultBadge')}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-white/40 tabular-nums truncate">
                {d.width}×{d.height}
                {d.note ? ` · ${t('desktopView.approx')}` : ''}
              </p>
            </button>
          );
        })}
      </div>

      <p className="text-white/40 text-[11px]">{t('desktopView.caption')}</p>

      {/* Cancel / Save — the standard panel footer strip. */}
      <div className="sticky bottom-0 z-10 mt-auto -mx-4 px-4 flex gap-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-[#0e0c09]">
        <button
          onClick={() => setDraft(saved)}
          disabled={!dirty || saving}
          className="flex-1 h-12 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 font-semibold text-sm disabled:opacity-40"
        >
          {t('desktopView.cancel')}
        </button>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          data-testid="desktop-view-save"
          className="flex-1 h-12 rounded-xl bg-[#C9A55C] text-[#0e0c09] hover:bg-[#C9A55C]/90 font-semibold text-sm disabled:opacity-40"
        >
          {t('desktopView.save')}
        </button>
      </div>
    </div>
  );
}
