import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import type { OnboardingState } from './useOnboardingWizard';

interface Props {
  state: OnboardingState;
  updateField: (field: keyof OnboardingState, value: any) => void;
  dispatch: React.Dispatch<any>;
  onNext: () => void;
  onPrev: () => void;
  t: (key: string) => string;
}

export function StepPickYourVibe({ state, updateField, onNext, onPrev, t }: Props) {
  // Which gradient stop the picker is currently editing (local-only UI state).
  const [activeStop, setActiveStop] = useState<'start' | 'end'>('start');
  const isGradient = state.backgroundType === 'gradient';
  const gradientCss = `linear-gradient(135deg, ${state.gradientStart}, ${state.gradientEnd})`;

  // The picker edits the solid color, or the selected gradient stop.
  const pickerColor = !isGradient
    ? state.backgroundColor
    : activeStop === 'start'
      ? state.gradientStart
      : state.gradientEnd;

  const handlePickerChange = (color: string) => {
    if (!isGradient) {
      updateField('backgroundColor', color);
    } else if (activeStop === 'start') {
      updateField('gradientStart', color);
    } else {
      updateField('gradientEnd', color);
    }
  };

  return (
    <div className="flex flex-col gap-6 flex-1 w-full max-w-lg mx-auto">
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold text-white">
          Choose Your Vibe
        </h2>
        <p className="text-white/60 mt-2 font-body">
          Pick a background color or gradient. You can change everything else in the editor.
        </p>
      </div>

      {/* Solid / Gradient toggle */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => updateField('backgroundType', 'solid')}
            className={`px-6 py-2 rounded-lg text-sm font-semibold font-body transition-colors ${
              !isGradient ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/60 hover:text-white'
            }`}
          >
            Solid
          </button>
          <button
            type="button"
            onClick={() => updateField('backgroundType', 'gradient')}
            className={`px-6 py-2 rounded-lg text-sm font-semibold font-body transition-colors ${
              isGradient ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/60 hover:text-white'
            }`}
          >
            Gradient
          </button>
        </div>
      </div>

      {/* Live preview */}
      <div
        className="h-20 w-full rounded-2xl border border-white/10"
        style={{ background: isGradient ? gradientCss : state.backgroundColor }}
      />

      {/* Gradient stop selectors */}
      {isGradient && (
        <div className="flex justify-center gap-2">
          {(['start', 'end'] as const).map((stop) => {
            const color = stop === 'start' ? state.gradientStart : state.gradientEnd;
            const selected = activeStop === stop;
            return (
              <button
                key={stop}
                type="button"
                onClick={() => setActiveStop(stop)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-body transition-all ${
                  selected
                    ? 'border-[#C9A55C] bg-[#C9A55C]/10 text-white'
                    : 'border-white/10 text-white/60 hover:border-white/20'
                }`}
              >
                <span
                  className="w-4 h-4 rounded-full border border-white/20"
                  style={{ background: color }}
                />
                {stop === 'start' ? 'Start' : 'End'}
              </button>
            );
          })}
        </div>
      )}

      {/* Color picker */}
      <div className="mx-auto w-full max-w-[260px] space-y-3">
        <HexColorPicker color={pickerColor} onChange={handlePickerChange} style={{ width: '100%' }} />
        <div className="flex items-center gap-2">
          <div
            className="w-10 h-10 rounded-md border border-white/10 flex-shrink-0"
            style={{ background: pickerColor }}
          />
          <input
            type="text"
            value={pickerColor}
            onChange={(e) => handlePickerChange(e.target.value)}
            placeholder="#000000"
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono uppercase text-sm focus:outline-none focus:border-[#C9A55C]/50"
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-auto sticky bottom-0 z-20 -mx-6 px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-[#0e0c09]/85 backdrop-blur-md border-t border-white/10 flex justify-between items-center">
        <button
          onClick={onPrev}
          className="flex items-center gap-2 px-4 py-3 rounded-lg text-white/60 hover:text-white transition-colors font-body"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('onboardingFlow.back')}
        </button>
        <button
          onClick={onNext}
          className="px-8 py-3 rounded-lg bg-[#C9A55C] text-[#0e0c09] font-semibold font-body transition-opacity hover:opacity-90"
        >
          {t('onboardingFlow.continue')}
        </button>
      </div>
    </div>
  );
}
