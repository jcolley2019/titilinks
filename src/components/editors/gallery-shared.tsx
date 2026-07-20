/**
 * AIS.0 — shared Layouts internals, lifted out of TemplateGallery so the
 * PageSetupWizard applies through the EXACT same path and renders the EXACT
 * same preset preview (reuse, not fork). Nothing here changes behavior; each
 * piece was moved verbatim from TemplateGallery.tsx.
 *
 *  - withAlpha        hex → rgba for preview fills (TPL.3c)
 *  - LayoutPreview    the theme-derived 9:16 card mock, style-pair aware
 *  - ApplyButton      the 3-state (busy / applied / idle) apply control (GAL.TOUCH)
 *  - useApplyLayout   the Layouts apply path (snapshot → theme → blocks via the
 *                     TPL.2 engine) with the TPL.5 re-entry lock
 */
import { useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { resolveEffectivePageStyle } from '@/lib/surface';
import { resolveTplVariant, type TplPreset } from '@/lib/tpl-presets';
import { applyTplPreset } from '@/lib/tpl-apply';
import { captureSnapshot } from '@/lib/snapshots';
import type { PageId, PageStyle } from '@/lib/theme-defaults';
import { useLanguage } from '@/hooks/useLanguage';

// TPL.3c: hex → rgba for the Layout card preview fills (mirrors LinkButton's
// rgbaStr; preview-only). Non-hex input (a gradient/keyword) passes through
// unchanged so callers can hand it any theme color.
export function withAlpha(color: string, a: number): string {
  if (!color || !color.startsWith('#')) return color;
  const h = color.replace('#', '');
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(s, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// TPL.3: the theme-derived preset preview (a 9:16 phone mock). Extracted from
// LayoutCard so the gallery card and the wizard recommendation cards render the
// SAME thing. Style-pair aware: it resolves through resolveTplVariant — the pure
// resolver the apply engine also uses — so a hero page previews the solid
// rendition and a full_bleed page previews the glass/outlined one, and the
// preview can never drift from the applied result. `children` render inside the
// preview box (the gallery card injects its hover/touch Apply overlay there; the
// wizard passes none).
export function LayoutPreview({
  preset,
  pageStyle,
  children,
}: {
  preset: TplPreset;
  pageStyle: PageStyle;
  children?: ReactNode;
}) {
  const { theme: vTheme, blockStyles: vbs } = resolveTplVariant(preset, pageStyle);

  const previewBackground = vTheme.background.type === 'gradient'
    ? vTheme.background.gradient_css
    : vTheme.background.solid_color;

  // The hero band is a PHOTO, not a button — suggest one with a neutral depth
  // scrim over the theme background (dark presets read as a dark photo).
  const heroMock = `linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0.30) 100%), ${previewBackground}`;

  const buttonRadius = vTheme.buttons.shape === 'pill'
    ? '9999px'
    : vTheme.buttons.shape === 'square'
      ? '2px'
      : '6px';

  // Bars honor the previewed variant. When the rendition defines a border
  // (border_width > 0) or is outline/glass, preview an outlined bar; a filled
  // rendition stays a solid bar. Mirrors LinkButton's precedence.
  const effVariant = vTheme.buttons.variant ?? vbs.variant ?? 'filled';
  const borderW = vbs.border_width ?? 0;
  const frameColor = vbs.border_color || vTheme.buttons.border_color || vTheme.buttons.fill_color;
  const fillOpacity =
    (vTheme.buttons as { background_opacity?: number }).background_opacity ?? vbs.background_opacity ?? 1;
  const outlined = borderW > 0 || effVariant === 'outline' || effVariant === 'glass';
  const barBackground = outlined
    ? withAlpha(vTheme.buttons.fill_color, effVariant === 'outline' ? 0 : fillOpacity)
    : vTheme.buttons.fill_color;
  const barBorder = borderW > 0 ? `${borderW}px solid ${frameColor}` : 'none';

  return (
    <div className="relative aspect-[9/16] overflow-hidden">
      <div className="absolute inset-0" style={{ background: previewBackground }} />
      <div className="absolute inset-0 flex flex-col items-center">
        <div className="w-full mb-2" style={{ height: '42%', background: heroMock }} />
        <div
          className="w-16 h-2 rounded mb-1"
          style={{ backgroundColor: vTheme.typography.text_color, opacity: 0.8 }}
        />
        <div
          className="w-20 h-1.5 rounded mb-4"
          style={{ backgroundColor: vTheme.typography.text_color, opacity: 0.4 }}
        />
        <div className="w-full space-y-2 px-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              data-testid="tpl-card-bar"
              className="w-full h-6"
              style={{ background: barBackground, border: barBorder, borderRadius: buttonRadius, opacity: 1 - i * 0.15 }}
            />
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

// GAL.TOUCH: the Apply button — three states (busy / applied / idle) — shared
// verbatim by the gallery's hover overlay + touch bar and the wizard's
// recommendation cards, so the affordance can never diverge. onApply is
// double-tap-safe upstream (useApplyLayout's applyingRef + the engine lock).
export function ApplyButton({
  isApplying,
  isApplied,
  onApply,
  className,
}: {
  isApplying: boolean;
  isApplied: boolean;
  onApply: () => void;
  className?: string;
}) {
  const { t } = useLanguage();
  return (
    <Button size="sm" onClick={onApply} disabled={isApplying} className={cn('gap-2', className)}>
      {isApplying ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('templateGallery.applying')}
        </>
      ) : isApplied ? (
        <>
          <Check className="h-4 w-4" />
          {t('templateGallery.applied')}
        </>
      ) : (
        t('templateGallery.apply')
      )}
    </Button>
  );
}

export interface UseApplyLayoutParams {
  pageId: string;
  modeId?: string | null;
  activePageId?: PageId;
  themeJson?: unknown;
  /** Called after a successful apply (parent refreshes the preview). */
  onApply: () => void;
}

/**
 * The Layouts apply path, extracted verbatim from TemplateGallery so both the
 * gallery and the PageSetupWizard drive the identical engine call. Owns the
 * transient applying/applied preset-id state the cards read, plus the TPL.5
 * synchronous re-entry lock. `applyLayout` resolves to `true` on a successful
 * apply and `false` on any early-return / failure, so a caller (the wizard) can
 * advance a flow only when the apply actually landed. Gallery callers ignore it.
 */
export function useApplyLayout({ pageId, modeId, activePageId, themeJson, onApply }: UseApplyLayoutParams) {
  const { t } = useLanguage();
  const [applyingPreset, setApplyingPreset] = useState<string | null>(null);
  const [appliedPreset, setAppliedPreset] = useState<string | null>(null);
  // TPL.5 TASK 1: synchronous hard lock against a double-fire.
  const applyingRef = useRef(false);

  const applyLayout = async (preset: TplPreset): Promise<boolean> => {
    // TPL.5 TASK 1: hard, synchronous re-entry lock. `disabled` is render-state —
    // it can't stop a rapid double-click (or a click during the pre-lock modes
    // lookup below) from starting a second engine run before React re-disables
    // the button, which duplicates the composition. A ref flips synchronously on
    // the first click so the second call returns at once; cleared in `finally`.
    if (applyingRef.current) return false;
    applyingRef.current = true;
    try {
      const pageId2: PageId = activePageId ?? 'page1';
      const pageStyle = resolveEffectivePageStyle(themeJson, pageId2);

      // FIX.P2 race-safe modeId resolution (mirrors ProfileDashboard.applyPreset):
      // the modeId prop can lag a freshly-created page, so fall back to a DB read
      // by page_id + page type before firing the noMode toast.
      let activeModeId = modeId ?? null;
      if (!activeModeId && pageId) {
        const { data } = await supabase
          .from('modes')
          .select('id')
          .eq('page_id', pageId)
          .eq('type', pageId2)
          .maybeSingle();
        activeModeId = data?.id ?? null;
      }
      if (!activeModeId) { toast.error(t('dashboard.noMode')); return false; }

      setApplyingPreset(preset.id);
      // Distinguish a pre-mutation snapshot failure (the engine aborts at step 1)
      // from a later DB failure: this wrapper flips `captured` only once the safety
      // net lands, so the catch surfaces the right message.
      let captured = false;
      try {
        await applyTplPreset(
          {
            pageId,
            modeId: activeModeId,
            pageStyle,
            preset,
            autoSnapshotName: t('snapshots.autoBeforeTemplate').replace('{name}', preset.name),
          },
          {
            capture: async (...args: Parameters<typeof captureSnapshot>) => {
              const row = await captureSnapshot(...args);
              captured = true;
              return row;
            },
          },
        );
        setAppliedPreset(preset.id);
        toast.success(t('tpl.apply.successToast'));
        onApply();
        // Reset applied indicator after a delay (mirrors applyTemplate).
        setTimeout(() => setAppliedPreset(null), 2000);
        return true;
      } catch (err) {
        console.error('[tpl] apply failed:', err);
        toast.error(captured ? t('tpl.apply.failedToast') : t('snapshots.autoFailed'));
        return false;
      } finally {
        setApplyingPreset(null);
      }
    } finally {
      applyingRef.current = false;
    }
  };

  return { applyLayout, applyingPreset, appliedPreset };
}
