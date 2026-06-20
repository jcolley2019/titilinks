import { motion } from 'framer-motion';
import { BLOCK_PRESETS } from '@/lib/block-presets';
import type { OnboardingState } from './useOnboardingWizard';

interface Props {
  state: OnboardingState;
  updateField: (field: keyof OnboardingState, value: any) => void;
  onNext: () => void;
  onPrev: () => void;
  t: (key: string) => string;
}

/**
 * Layout step — the user picks a starting set of content sections for Page 1
 * from the shared BLOCK_PRESETS registry. The choice (state.selectedPreset)
 * drives which blocks the next step creates. Header social blocks are added
 * separately, so presets only define content.
 */
export function StepChoosePreset({ state, updateField, onNext, onPrev, t }: Props) {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold text-white">Choose your layout</h2>
        <p className="text-white/60 mt-2 font-body">
          Pick a starting set of sections for your page — you can change everything later.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {BLOCK_PRESETS.map((preset, i) => {
          const isSelected = state.selectedPreset === preset.key;
          return (
            <motion.button
              key={preset.key}
              type="button"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              whileHover={{ scale: 1.02 }}
              onClick={() => updateField('selectedPreset', preset.key)}
              className={`rounded-xl border-2 p-4 text-left transition-all ${
                isSelected
                  ? 'border-[#C9A55C] shadow-[0_0_20px_rgba(201,165,92,0.3)] bg-[#C9A55C]/[0.06]'
                  : 'border-white/10 hover:border-white/20 bg-white/[0.03]'
              }`}
            >
              <p className="text-base font-semibold text-white">{preset.label}</p>
              <p className="text-xs text-white/50 mt-0.5">{preset.desc}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {preset.blocks.map((b, bi) => (
                  <span
                    key={bi}
                    className="text-[10px] rounded-full bg-white/[0.06] text-white/60 px-2 py-0.5"
                  >
                    {b.title}
                  </span>
                ))}
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="flex justify-center gap-3">
        <button
          onClick={onPrev}
          className="px-6 py-3 rounded-lg border border-white/15 text-white/80 font-semibold font-body hover:bg-white/5 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!state.selectedPreset}
          className="px-8 py-3 rounded-lg bg-[#C9A55C] text-[#0e0c09] font-semibold font-body transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
        >
          {t('onboardingFlow.continue')}
        </button>
      </div>
    </div>
  );
}
