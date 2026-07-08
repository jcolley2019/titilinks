import { motion } from 'framer-motion';
import { Camera } from 'lucide-react';
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
    <div className="relative aspect-[9/16] w-full bg-[#141210]">
      {/* Photo fills the TOP HALF, fading into the dark body. The
          content grid below is IDENTICAL to Full Screen — only the
          photo depth differs between the two styles. */}
      <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-br from-[#C9A55C]/60 via-[#8a6a35]/45 to-[#2a2118]" />
      <div className="absolute inset-x-0 top-[34%] h-[16%] bg-gradient-to-b from-transparent to-[#141210]" />
      <div className="absolute inset-x-0 top-[14%] flex justify-center">
        <Camera className="w-7 h-7 text-white/85" />
      </div>
      <div className="absolute inset-x-0 top-[47%] flex flex-col items-center px-4">
        <div className="w-20 h-2.5 rounded bg-white/80" />
        <div className="w-12 h-1.5 rounded bg-white/40 mt-1" />
        <div className="flex gap-1.5 my-2">
          <div className="w-3 h-3 rounded-full bg-white/25" />
          <div className="w-3 h-3 rounded-full bg-white/25" />
          <div className="w-3 h-3 rounded-full bg-white/25" />
        </div>
        <div className="w-full h-8 rounded-lg bg-[#C9A55C]/80" />
        <div className="w-full h-8 rounded-lg bg-[#C9A55C]/45 mt-2" />
      </div>
    </div>
  );
}

function FullBleedMockup() {
  return (
    <div className="relative aspect-[9/16] w-full bg-gradient-to-br from-[#6d5a8e]/70 via-[#3d3550]/70 to-[#161320]">
      {/* The photo IS the whole page — same content grid as Hero,
          glass buttons floating on the photo. No avatar circle. */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.12) 40%, rgba(0,0,0,0.5) 100%)' }} />
      <div className="absolute inset-x-0 top-[14%] flex justify-center">
        <Camera className="w-7 h-7 text-white/85" />
      </div>
      <div className="absolute inset-x-0 top-[47%] flex flex-col items-center px-4">
        <div className="w-20 h-2.5 rounded bg-white/85" />
        <div className="w-12 h-1.5 rounded bg-white/40 mt-1" />
        <div className="flex gap-1.5 my-2">
          <div className="w-3 h-3 rounded-full bg-white/30" />
          <div className="w-3 h-3 rounded-full bg-white/30" />
          <div className="w-3 h-3 rounded-full bg-white/30" />
        </div>
        <div className="w-full h-8 rounded-lg bg-white/15 border border-white/30" />
        <div className="w-full h-8 rounded-lg bg-white/15 border border-white/30 mt-2" />
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
    <div className="flex flex-col gap-8 flex-1">
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold text-white">
          {t('onboardingFlow.chooseStyle')}
        </h2>
        <p className="text-white/60 mt-2 font-body">
          {t('onboardingFlow.chooseStyleDesc')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
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

      <div className="mt-auto sticky bottom-0 z-20 -mx-6 px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-[#0e0c09]/85 backdrop-blur-md border-t border-white/10 flex justify-center">
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
