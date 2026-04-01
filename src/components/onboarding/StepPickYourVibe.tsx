import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check } from 'lucide-react';
import type { OnboardingState } from './useOnboardingWizard';

interface Props {
  state: OnboardingState;
  updateField: (field: keyof OnboardingState, value: any) => void;
  dispatch: React.Dispatch<any>;
  onNext: () => void;
  onPrev: () => void;
  t: (key: string) => string;
}

const backgrounds = [
  { value: '#0e0c09', label: 'Dark' },
  { value: '#f5f0eb', label: 'Light' },
  { value: '#2a1f14', label: 'Warm' },
  { value: '#0f1923', label: 'Cool' },
  { value: 'linear-gradient(135deg, #1a1a2e, #0f3460)', label: 'Gradient Dark' },
  { value: 'linear-gradient(135deg, #2a1f14, #3d2914)', label: 'Gradient Warm' },
];

const buttonStyles = [
  { value: 'solid_rounded', label: 'Solid Rounded', className: 'rounded-lg bg-[#C9A55C] text-black' },
  { value: 'outline', label: 'Outline', className: 'rounded-lg border-2 border-[#C9A55C] text-[#C9A55C] bg-transparent' },
  { value: 'pill', label: 'Pill', className: 'rounded-full bg-[#C9A55C] text-black' },
];

const fonts = [
  { value: 'modern', label: 'Modern', family: "'DM Sans', sans-serif", weight: 400 },
  { value: 'elegant', label: 'Elegant', family: "'Playfair Display', serif", weight: 400 },
  { value: 'display', label: 'Bold', family: "'DM Sans', sans-serif", weight: 700 },
];

const socialPlatforms = ['TikTok', 'Instagram', 'YouTube', 'Facebook', 'Snapchat', 'X', 'OnlyFans', 'LinkedIn'];

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -60 : 60, opacity: 0 }),
};

function SubStepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex justify-center gap-2 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full transition-colors ${
            i <= current ? 'bg-[#C9A55C]' : 'bg-gray-600'
          }`}
        />
      ))}
    </div>
  );
}

export function StepPickYourVibe({ state, updateField, dispatch, onNext, onPrev, t }: Props) {
  const sub = state.currentSubStep;
  const direction = state.direction;

  const handleBack = () => {
    if (sub === 0) {
      onPrev();
    } else {
      dispatch({ type: 'SET_SUB_STEP', subStep: sub - 1 });
    }
  };

  const handleContinue = () => {
    if (sub === 3) {
      onNext();
    } else {
      dispatch({ type: 'SET_SUB_STEP', subStep: sub + 1 });
    }
  };

  const togglePlatform = (platform: string) => {
    const current = state.selectedSocialPlatforms;
    const next = current.includes(platform)
      ? current.filter((p) => p !== platform)
      : [...current, platform];
    updateField('selectedSocialPlatforms', next);
  };

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold text-white">
          {t('onboardingFlow.pickVibe')}
        </h2>
        <p className="text-white/60 mt-2 font-body">
          {t('onboardingFlow.pickVibeDesc')}
        </p>
      </div>

      <SubStepDots current={sub} total={4} />

      <AnimatePresence mode="wait" custom={direction}>
        {/* Sub-step 0: Background */}
        {sub === 0 && (
          <motion.div key="bg" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
            <p className="text-sm font-medium text-white/80 mb-4 font-body">{t('onboardingFlow.background')}</p>
            <div className="grid grid-cols-3 gap-3">
              {backgrounds.map((bg) => (
                <button
                  key={bg.value}
                  type="button"
                  onClick={() => updateField('backgroundColor', bg.value)}
                  className={`aspect-square rounded-xl border-2 transition-all ${
                    state.backgroundColor === bg.value
                      ? 'border-[#C9A55C] shadow-[0_0_12px_rgba(201,165,92,0.3)]'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                  style={{ background: bg.value }}
                >
                  <span className="sr-only">{bg.label}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-center mt-2">
              {backgrounds.map((bg) => (
                <span key={bg.value} className="text-[10px] text-white/40 flex-1 text-center">{bg.label}</span>
              ))}
            </div>
          </motion.div>
        )}

        {/* Sub-step 1: Buttons */}
        {sub === 1 && (
          <motion.div key="btn" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
            <p className="text-sm font-medium text-white/80 mb-4 font-body">{t('onboardingFlow.buttonStyle')}</p>
            <div className="space-y-3">
              {buttonStyles.map((bs) => (
                <button
                  key={bs.value}
                  type="button"
                  onClick={() => updateField('buttonStyle', bs.value)}
                  className={`w-full p-4 rounded-xl border-2 transition-all ${
                    state.buttonStyle === bs.value
                      ? 'border-[#C9A55C] bg-white/5'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white/70 font-body">{bs.label}</span>
                    <div className={`px-6 py-2 font-medium text-sm ${bs.className}`}>
                      Sample Link
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Sub-step 2: Font */}
        {sub === 2 && (
          <motion.div key="font" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
            <p className="text-sm font-medium text-white/80 mb-4 font-body">{t('onboardingFlow.fontChoice')}</p>
            <div className="space-y-3">
              {fonts.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => updateField('fontChoice', f.value)}
                  className={`w-full p-5 rounded-xl border-2 text-left transition-all ${
                    state.fontChoice === f.value
                      ? 'border-[#C9A55C] bg-white/5'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <p className="text-xs text-white/40 mb-1 font-body">{f.label}</p>
                  <p className="text-xl text-white" style={{ fontFamily: f.family, fontWeight: f.weight }}>
                    Your Name
                  </p>
                  <p className="text-sm text-white/50 mt-0.5" style={{ fontFamily: f.family, fontWeight: f.weight }}>
                    Subtitle text here
                  </p>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Sub-step 3: Social Platforms */}
        {sub === 3 && (
          <motion.div key="social" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
            <p className="text-sm font-medium text-white/80 mb-4 font-body">{t('onboardingFlow.socialPlatforms')}</p>
            <div className="grid grid-cols-2 gap-3">
              {socialPlatforms.map((platform) => {
                const isSelected = state.selectedSocialPlatforms.includes(platform);
                return (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => togglePlatform(platform)}
                    className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-[#C9A55C] bg-[#C9A55C]/10'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <span className="text-sm text-white font-body">{platform}</span>
                    {isSelected && <Check className="w-4 h-4 text-[#C9A55C]" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-4 py-3 rounded-lg text-white/60 hover:text-white transition-colors font-body"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('onboardingFlow.back')}
        </button>
        <button
          onClick={handleContinue}
          className="px-8 py-3 rounded-lg bg-[#C9A55C] text-[#0e0c09] font-semibold font-body transition-opacity hover:opacity-90"
        >
          {t('onboardingFlow.continue')}
        </button>
      </div>
    </div>
  );
}
