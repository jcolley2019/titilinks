import { motion } from 'framer-motion';
import type { OnboardingState } from './useOnboardingWizard';

interface Props {
  state: OnboardingState;
  updateField: (field: keyof OnboardingState, value: any) => void;
  onNext: () => void;
  t: (key: string) => string;
}

const styles = [
  { value: 'hero' as const, key: 'hero' },
  { value: 'full_bleed' as const, key: 'fullBleed' },
];

function HeroMockup() {
  return (
    <div className="flex flex-col">
      <div className="h-28 bg-gradient-to-b from-[#C9A55C]/30 to-transparent relative">
        <div className="absolute bottom-2 left-4">
          <div className="w-16 h-2.5 rounded bg-white/40" />
          <div className="w-12 h-1.5 rounded bg-white/20 mt-1" />
        </div>
      </div>
      <div className="px-4 py-3 space-y-2">
        <div className="h-8 rounded-lg bg-[#C9A55C]/30 border border-[#C9A55C]/20" />
        <div className="h-8 rounded-lg bg-[#C9A55C]/30 border border-[#C9A55C]/20" />
      </div>
    </div>
  );
}

function FullBleedMockup() {
  return (
    <div className="relative h-full min-h-[200px] bg-gradient-to-b from-gray-700/40 to-[#0e0c09]">
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative flex flex-col items-center justify-center h-full gap-2 py-8 px-4">
        <div className="w-14 h-14 rounded-full bg-white/15 border border-white/20" />
        <div className="w-20 h-2.5 rounded bg-white/40" />
        <div className="w-16 h-1.5 rounded bg-white/20" />
        <div className="w-full space-y-2 mt-3">
          <div className="h-8 rounded-lg bg-white/10 border border-white/10" />
          <div className="h-8 rounded-lg bg-white/10 border border-white/10" />
        </div>
      </div>
    </div>
  );
}

const mockups: Record<string, React.FC> = {
  hero: HeroMockup,
  full_bleed: FullBleedMockup,
};

export function StepChooseStyle({ state, updateField, onNext, t }: Props) {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold text-white">
          {t('onboardingFlow.chooseStyle')}
        </h2>
        <p className="text-white/60 mt-2 font-body">
          {t('onboardingFlow.chooseStyleDesc')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {styles.map((style, i) => {
          const isSelected = state.pageStyle === style.value;
          const Mockup = mockups[style.value];
          return (
            <motion.button
              key={style.value}
              type="button"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              whileHover={{ scale: 1.02 }}
              onClick={() => updateField('pageStyle', style.value)}
              className={`rounded-xl border-2 overflow-hidden transition-all text-left ${
                isSelected
                  ? 'border-[#C9A55C] shadow-[0_0_20px_rgba(201,165,92,0.3)]'
                  : 'border-white/10 hover:border-white/20'
              }`}
            >
              <div className="bg-[#141210] min-h-[200px]">
                <Mockup />
              </div>
              <div className="p-3 bg-white/[0.03]">
                <p className="text-sm font-semibold text-white">
                  {t(`onboardingFlow.style${style.key.charAt(0).toUpperCase() + style.key.slice(1)}`)}
                </p>
                <p className="text-xs text-white/50 mt-0.5">
                  {t(`onboardingFlow.style${style.key.charAt(0).toUpperCase() + style.key.slice(1)}Desc`)}
                </p>
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="flex justify-center">
        <button
          onClick={onNext}
          disabled={!state.pageStyle}
          className="px-8 py-3 rounded-lg bg-[#C9A55C] text-[#0e0c09] font-semibold font-body transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
        >
          {t('onboardingFlow.continue')}
        </button>
      </div>
    </div>
  );
}
