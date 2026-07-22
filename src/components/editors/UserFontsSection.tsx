// BRAND.1 — shared "Upload font file" affordance + "Your fonts" group.
//
// Embedded at the TOP of both page-level font pickers (Name & Handle hub
// Fuente tab, DesignEditor Font tab) so the two surfaces stay one feature:
// upload (PRO-gated), list uploaded families previewed in their own face,
// select one (`custom:<family>` key via onSelect), remove. Panel-width
// single-column by design — this renders in the narrow slide-in panel.

import { useRef } from 'react';
import { Lock, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';
import { useUserFonts } from '@/hooks/useUserFonts';
import { customFontKey, resolveFontFamily } from '@/lib/fonts';

interface UserFontsSectionProps {
  selectedKey?: string;
  onSelect?: (key: string) => void;
}

export function UserFontsSection({ selectedKey, onSelect }: UserFontsSectionProps) {
  const { t } = useLanguage();
  const { fonts, busy, canUpload, addFont, removeFont } = useUserFonts();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    const err = await addFont(file);
    if (err === 'invalidType') toast.error(t('fonts.invalidType'));
    else if (err === 'tooLarge') toast.error(t('fonts.tooLarge'));
    else if (err === 'notAllowed') toast(t('fonts.proTitle'), { description: t('fonts.proDesc') });
    else if (err) toast.error(t('fonts.uploadFailed'));
    else toast.success(t('fonts.uploaded'));
  };

  const handleRemove = async (family: string) => {
    const ok = await removeFont(family);
    if (ok) toast.success(t('fonts.removed'));
    else toast.error(t('fonts.removeFailed'));
  };

  return (
    <div className="space-y-2">
      {canUpload ? (
        <>
          <input
            ref={inputRef}
            data-testid="font-upload-input"
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            data-testid="font-upload-cta"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="w-full flex items-center gap-2.5 rounded-xl border border-dashed border-white/20 px-3 py-2.5 text-left hover:border-[#C9A55C]/60 transition-colors disabled:opacity-50"
          >
            <Upload className="h-4 w-4 text-[#C9A55C] flex-shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white truncate">
                {busy ? t('fonts.uploading') : t('fonts.uploadTitle')}
              </span>
              <span className="block text-[11px] text-white/40 truncate">{t('fonts.uploadDesc')}</span>
            </span>
          </button>
        </>
      ) : (
        // PRO upsell — pill + toast on tap, per the app's lock convention.
        <button
          type="button"
          data-testid="font-upload-upsell"
          onClick={() => toast(t('fonts.proTitle'), { description: t('fonts.proDesc') })}
          className="w-full flex items-center gap-2.5 rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-left hover:border-white/30 transition-colors"
        >
          <Upload className="h-4 w-4 text-white/40 flex-shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="text-sm font-semibold text-white/70 flex items-center gap-1.5">
              <span className="truncate">{t('fonts.uploadTitle')}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#C9A55C]/15 text-[#C9A55C] text-[10px] font-bold px-1.5 py-0.5 flex-shrink-0">
                <Lock className="h-2.5 w-2.5" /> PRO
              </span>
            </span>
            <span className="block text-[11px] text-white/40 truncate">{t('fonts.proDesc')}</span>
          </span>
        </button>
      )}

      {fonts.length > 0 && (
        <div className="space-y-1.5" data-testid="user-fonts-group">
          <p className="text-white/60 text-[11px] font-semibold uppercase tracking-wide pt-1">
            {t('fonts.yourFonts')}
          </p>
          {fonts.map((f) => {
            const key = customFontKey(f.family);
            const active = selectedKey === key;
            return (
              <div
                key={f.family}
                className={`flex items-center gap-1 rounded-xl border-2 pr-1 transition-all ${active ? 'border-[#C9A55C] bg-black/30' : 'border-white/10 hover:border-white/25'}`}
              >
                <button
                  type="button"
                  data-testid="user-font-chip"
                  onClick={() => onSelect?.(key)}
                  className="flex-1 min-w-0 text-left px-3 py-2.5"
                >
                  <span
                    className={`block truncate text-base ${active ? 'text-white' : 'text-white/60'}`}
                    style={{ fontFamily: resolveFontFamily(key) }}
                  >
                    {f.family}
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="user-font-remove"
                  aria-label={t('fonts.remove')}
                  onClick={() => handleRemove(f.family)}
                  className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
