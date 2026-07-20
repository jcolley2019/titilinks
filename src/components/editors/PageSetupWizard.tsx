import { useMemo, useState } from 'react';
import {
  Sparkles, Check,
  Star, Calendar, ShoppingBag, Music, Dumbbell, Store, Film, Minus,
  MessageCircle, Tag, TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/hooks/useLanguage';
import { resolveEffectivePageStyle } from '@/lib/surface';
import type { PageId, PageStyle } from '@/lib/theme-defaults';
import { LayoutPreview, ApplyButton, useApplyLayout } from './gallery-shared';
import {
  recommendPresets,
  WIZARD_PERSONAS,
  WIZARD_GOALS,
  type Persona,
  type Goal,
} from '@/lib/ais-recommend';

/**
 * AIS.0 — "Set up my page" guided wizard.
 *
 * Two questions (persona → goal) feed the PURE recommendPresets() mapper, which
 * returns a top pick + an "or try" alternate + a goal-driven checklist. Both
 * picks apply through useApplyLayout — the SAME snapshot→theme→blocks path the
 * Layouts gallery uses (shared, not forked) — and the recommendation cards reuse
 * the gallery's LayoutPreview so what you see is exactly what gets applied.
 *
 * Rendered inside the narrow slide-in panel (panelMode): single-column, phone
 * width first, FS.SURFACE sticky footer. Checklist checkboxes are VISUAL ONLY in
 * v0 (no persistence — self-flagged).
 */

// GAL.2 convention: one lucide line-icon per persona (== TplCategory).
const PERSONA_ICONS: Record<Persona, LucideIcon> = {
  creator: Star,
  booking: Calendar,
  store: ShoppingBag,
  music: Music,
  fitness: Dumbbell,
  local_business: Store,
  media: Film,
  minimal: Minus,
};

const GOAL_ICONS: Record<Goal, LucideIcon> = {
  get_messages: MessageCircle,
  sell: Tag,
  grow_audience: TrendingUp,
};

interface PageSetupWizardProps {
  pageId: string;
  modeId?: string | null;
  activePageId?: PageId;
  themeJson?: unknown;
  /** Refresh the editor preview after a preset applies. */
  onApply: () => void;
  /** Close the wizard panel (Done / Cancel). */
  onClose: () => void;
}

type Step = 'persona' | 'goal' | 'reco' | 'done';

export function PageSetupWizard({
  pageId,
  modeId,
  activePageId,
  themeJson,
  onApply,
  onClose,
}: PageSetupWizardProps) {
  const { t } = useLanguage();
  const [step, setStep] = useState<Step>('persona');
  const [persona, setPersona] = useState<Persona | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);

  // The shared Layouts apply path — identical engine call to the gallery.
  const { applyLayout, applyingPreset, appliedPreset } = useApplyLayout({
    pageId,
    modeId,
    activePageId,
    themeJson,
    onApply,
  });

  const pageStyle: PageStyle = resolveEffectivePageStyle(themeJson, activePageId ?? 'page1');

  const reco = useMemo(
    () => (persona && goal ? recommendPresets({ persona, goal }) : null),
    [persona, goal],
  );

  const choosePersona = (p: Persona) => { setPersona(p); setStep('goal'); };
  const chooseGoal = (g: Goal) => { setGoal(g); setStep('reco'); };

  const handleApply = async (which: 'top' | 'alternate') => {
    if (!reco) return;
    const preset = which === 'top' ? reco.top : reco.alternate;
    const ok = await applyLayout(preset);
    if (ok) setStep('done');
  };

  const back = () => {
    if (step === 'goal') setStep('persona');
    else if (step === 'reco') setStep('goal');
    else onClose();
  };

  return (
    <div
      className="flex min-h-full flex-col bg-[#0e0c09] text-white"
      data-testid="page-setup-wizard"
    >
      <div className="flex-1 overflow-y-auto px-4 pt-4">
        {/* ── Q1: persona ─────────────────────────────────────────────── */}
        {step === 'persona' && (
          <div data-testid="wizard-q1">
            <div className="mb-4">
              <div className="mb-1 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#C9A55C]" />
                <h3 className="text-base font-bold">{t('wizard.q1Title')}</h3>
              </div>
              <p className="text-[13px] text-white/50">{t('wizard.q1Subtitle')}</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {WIZARD_PERSONAS.map((p) => {
                const Icon = PERSONA_ICONS[p.id];
                const selected = persona === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`wizard-persona-${p.id}`}
                    onClick={() => choosePersona(p.id)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition-colors',
                      selected
                        ? 'border-[#C9A55C] bg-[#C9A55C]/10'
                        : 'border-white/10 bg-white/5 hover:bg-white/10',
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                      <Icon className="h-5 w-5 text-white" />
                    </span>
                    <span className="truncate text-sm font-semibold">{t(p.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Q2: goal ────────────────────────────────────────────────── */}
        {step === 'goal' && (
          <div data-testid="wizard-q2">
            <div className="mb-4">
              <div className="mb-1 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#C9A55C]" />
                <h3 className="text-base font-bold">{t('wizard.q2Title')}</h3>
              </div>
              <p className="text-[13px] text-white/50">{t('wizard.q2Subtitle')}</p>
            </div>
            <div className="flex flex-col gap-2.5">
              {WIZARD_GOALS.map((g) => {
                const Icon = GOAL_ICONS[g.id];
                const selected = goal === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    data-testid={`wizard-goal-${g.id}`}
                    onClick={() => chooseGoal(g.id)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border px-3 py-3.5 text-left transition-colors',
                      selected
                        ? 'border-[#C9A55C] bg-[#C9A55C]/10'
                        : 'border-white/10 bg-white/5 hover:bg-white/10',
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                      <Icon className="h-5 w-5 text-white" />
                    </span>
                    <span className="text-sm font-semibold">{t(g.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Recommendation ──────────────────────────────────────────── */}
        {step === 'reco' && reco && (
          <div data-testid="wizard-reco">
            <div className="mb-4">
              <h3 className="text-base font-bold">{t('wizard.recoTitle')}</h3>
              <p className="text-[13px] text-white/50">{t('wizard.recoSubtitle')}</p>
            </div>

            {/* Top pick — large card, Apply as the primary gold action. */}
            <div
              data-testid="wizard-top-card"
              className="overflow-hidden rounded-2xl border border-[#C9A55C]/40 bg-white/5"
            >
              <div className="relative pt-3">
                <span className="absolute left-2 top-2 z-10 rounded-full bg-[#C9A55C] px-2 py-0.5 text-[10px] font-bold text-[#0e0c09]">
                  {t('wizard.topPickBadge')}
                </span>
                <div className="mx-auto w-40 overflow-hidden rounded-xl border border-white/10">
                  <LayoutPreview preset={reco.top} pageStyle={pageStyle} />
                </div>
              </div>
              <div className="p-3">
                <p data-testid="wizard-top-name" className="text-sm font-bold">{reco.top.name}</p>
                <p className="truncate text-xs text-white/50">{t(reco.top.description)}</p>
                <span className="mt-1.5 inline-block rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-medium text-white/60">
                  {t(`tpl.category.${reco.top.category}`)}
                </span>
                <div className="mt-3">
                  <ApplyButton
                    isApplying={applyingPreset === reco.top.id}
                    isApplied={appliedPreset === reco.top.id}
                    onApply={() => handleApply('top')}
                    className="h-11 w-full bg-[#C9A55C] text-[#0e0c09] hover:bg-[#C9A55C]/90"
                  />
                </div>
              </div>
            </div>

            {/* Alternate — a smaller "or try" card. */}
            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-white/40">
              {t('wizard.orTry')}
            </p>
            <div
              data-testid="wizard-alt-card"
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2.5"
            >
              <div className="w-14 shrink-0 overflow-hidden rounded-lg border border-white/10">
                <LayoutPreview preset={reco.alternate} pageStyle={pageStyle} />
              </div>
              <div className="min-w-0 flex-1">
                <p data-testid="wizard-alt-name" className="truncate text-sm font-semibold">{reco.alternate.name}</p>
                <p className="truncate text-xs text-white/50">{t(`tpl.category.${reco.alternate.category}`)}</p>
              </div>
              <ApplyButton
                isApplying={applyingPreset === reco.alternate.id}
                isApplied={appliedPreset === reco.alternate.id}
                onApply={() => handleApply('alternate')}
                className="shrink-0"
              />
            </div>
          </div>
        )}

        {/* ── Success + checklist ─────────────────────────────────────── */}
        {step === 'done' && (
          <div data-testid="wizard-done">
            <div className="py-4 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#C9A55C]/15">
                <Check className="h-6 w-6 text-[#C9A55C]" />
              </div>
              <h3 className="text-base font-bold">{t('wizard.doneTitle')}</h3>
              <p className="mt-1 text-[13px] text-white/50">{t('wizard.doneSubtitle')}</p>
            </div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">
              {t('wizard.checklistTitle')}
            </p>
            <ul data-testid="wizard-checklist" className="flex flex-col gap-2">
              {reco?.checklist.map((item) => (
                <li
                  key={item.id}
                  data-testid="wizard-checklist-item"
                  className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-3"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/20">
                    <Check className="h-3.5 w-3.5 text-white/30" />
                  </span>
                  <span className="text-sm">{t(item.labelKey)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* FS.SURFACE sticky footer — in-wizard nav (the panel header's back arrow
          closes the whole wizard). */}
      <div className="sticky bottom-0 z-10 mt-auto flex items-center gap-3 -mx-4 border-t border-white/10 bg-[#0e0c09] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {step === 'done' ? (
          <button
            type="button"
            data-testid="wizard-finish"
            onClick={onClose}
            className="h-12 flex-1 rounded-xl bg-[#C9A55C] font-semibold text-[#0e0c09] hover:bg-[#C9A55C]/90"
          >
            {t('wizard.done')}
          </button>
        ) : (
          <>
            <button
              type="button"
              data-testid="wizard-back"
              onClick={back}
              className="h-11 rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20"
            >
              {step === 'persona' ? t('wizard.cancel') : t('wizard.back')}
            </button>
            {(step === 'persona' || step === 'goal') && (
              <span className="ml-auto text-[11px] text-white/40">
                {t('wizard.step')
                  .replace('{n}', step === 'persona' ? '1' : '2')
                  .replace('{total}', '2')}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
