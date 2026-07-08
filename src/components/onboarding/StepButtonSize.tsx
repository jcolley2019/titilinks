import { ArrowLeft, Link2 } from 'lucide-react';
import type { OnboardingState } from './useOnboardingWizard';
import { BUTTON_SHAPES, shapeSwatchStyle } from '@/lib/button-shapes';

interface Props {
  state: OnboardingState;
  updateField: (field: keyof OnboardingState, value: any) => void;
  onNext: () => void;
  onPrev: () => void;
  t: (key: string) => string;
}

const GLASS: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.7)',
  background: 'rgba(255,255,255,0.18)',
  color: '#ffffff',
  backdropFilter: 'blur(4px)',
};

export function StepButtonSize({ state, updateField, onNext, onPrev, t }: Props) {
  const options = [
    { key: 'medium' as const, label: t('onboardingFlow.buttonSizeLarge'), sample: (
      <div className="w-full rounded-2xl flex items-center gap-3 px-3 text-sm font-semibold font-body" style={{ ...GLASS, minHeight: 64 }}>
        <span className="flex items-center justify-center rounded-[10px] border border-white/40 bg-white/10" style={{ width: 44, height: 44 }}><Link2 size={20} /></span>
        <span>Title</span>
      </div>
    ) },
    { key: 'button' as const, label: t('onboardingFlow.buttonSizeSmall'), sample: (
      <div className="w-full rounded-full relative flex items-center justify-center text-sm font-semibold font-body" style={{ ...GLASS, minHeight: 44, paddingLeft: 44, paddingRight: 44 }}>
        <Link2 size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2" />
        <span>Title</span>
      </div>
    ) },
  ];
  return (
    <div className="flex flex-col gap-8 flex-1 w-full max-w-md mx-auto">
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold text-white">
          {t('onboardingFlow.chooseButtons')}
        </h2>
        <p className="text-white/60 mt-2 font-body">
          {t('onboardingFlow.chooseButtonsDesc')}
        </p>
      </div>

      <div className="space-y-3">
        {options.map((o) => {
          const isSelected = state.buttonSize === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => updateField('buttonSize', o.key)}
              className={`w-full rounded-2xl border-2 p-4 text-left transition-all ${
                isSelected ? 'border-[#C9A55C] bg-black/30' : 'border-white/10 hover:border-white/25 bg-black/20'
              }`}
            >
              <p className="text-base font-semibold text-white font-body mb-3">{o.label}</p>
              {o.sample}
            </button>
          );
        })}
      </div>

      <div>
        <p className="text-xs uppercase tracking-widest text-[#C9A55C] mb-3 font-body">
          {t('onboardingFlow.buttonShape')}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {BUTTON_SHAPES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => updateField('buttonShape', s.key)}
              className={`rounded-xl border-2 p-3 flex flex-col items-center gap-2 transition-all ${
                state.buttonShape === s.key ? 'border-[#C9A55C] bg-black/30' : 'border-white/10 hover:border-white/25 bg-black/20'
              }`}
            >
              <span className="block h-4 w-14" style={{ ...shapeSwatchStyle(s.key), background: 'rgba(255,255,255,0.75)' }} />
              <span className="text-xs text-white/70 font-body">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto sticky bottom-0 z-20 -mx-6 px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-[#0e0c09]/85 backdrop-blur-md border-t border-white/10 flex justify-between items-center">
        <button onClick={onPrev} className="flex items-center gap-2 px-4 py-3 rounded-lg text-white/60 hover:text-white transition-colors font-body">
          <ArrowLeft className="h-4 w-4" />
          {t('onboardingFlow.back')}
        </button>
        <button onClick={onNext} className="px-8 py-3 rounded-lg bg-[#C9A55C] text-[#0e0c09] font-semibold font-body transition-opacity hover:opacity-90">
          {t('onboardingFlow.continue')}
        </button>
      </div>
    </div>
  );
}
