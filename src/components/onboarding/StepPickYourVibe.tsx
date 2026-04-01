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

const socialPlatforms = [
  {
    name: 'TikTok', bg: '#000000', fg: 'white',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.73a8.19 8.19 0 004.76 1.52V6.8a4.84 4.84 0 01-1-.11z"/></svg>,
  },
  {
    name: 'Instagram', bg: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)', fg: 'white',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>,
  },
  {
    name: 'YouTube', bg: '#FF0000', fg: 'white',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>,
  },
  {
    name: 'Facebook', bg: '#1877F2', fg: 'white',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  },
  {
    name: 'Snapchat', bg: '#FFFC00', fg: 'black',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12.922-.214.094-.03.193-.063.3-.09a.965.965 0 01.213-.03c.252 0 .498.093.69.268.228.21.345.505.345.808 0 .468-.36.792-.735.954-.09.042-.18.075-.27.12-.27.12-.604.27-.87.45-.27.18-.39.39-.39.6 0 .045 0 .09.015.135.09.42.54.96 1.005 1.53.33.404.675.824.96 1.275.6.93.585 1.77.39 2.235-.255.6-.84.93-1.245 1.065-.15.045-.315.075-.465.105-.12.03-.21.045-.3.075-.12.06-.18.15-.225.3-.045.18-.045.39-.03.555.015.135.03.24.03.33 0 .57-.39.84-.72.99-.405.18-.84.27-1.29.36-.315.06-.63.12-.9.21-.135.045-.255.12-.39.21-.195.135-.42.27-.735.42-.48.21-.96.315-1.44.315-.48 0-.93-.105-1.395-.315-.3-.15-.525-.285-.72-.42-.135-.09-.255-.165-.39-.21-.27-.09-.585-.15-.9-.21-.45-.09-.885-.18-1.29-.36-.33-.15-.72-.42-.72-.99 0-.09.015-.195.03-.33.015-.165.015-.375-.03-.555-.03-.15-.105-.24-.225-.3-.09-.03-.18-.045-.3-.075-.15-.03-.315-.06-.465-.105-.405-.135-.99-.465-1.245-1.065-.195-.465-.21-1.305.39-2.235.285-.45.63-.87.96-1.275.465-.57.915-1.11 1.005-1.53a.76.76 0 00.015-.135c0-.21-.12-.42-.39-.6-.27-.18-.6-.33-.87-.45-.09-.045-.18-.075-.27-.12C.36 11.292 0 10.968 0 10.5c0-.3.12-.6.345-.808a.96.96 0 01.69-.268c.07 0 .14.01.213.03.107.027.206.06.3.09.263.094.623.198.922.214.198 0 .326-.045.401-.09-.008-.165-.018-.33-.03-.51l-.003-.06c-.105-1.628-.23-3.654.3-4.847C4.86 1.069 8.216.793 9.206.793h2.988z"/></svg>,
  },
  {
    name: 'X', bg: '#000000', fg: 'white',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  },
  {
    name: 'OnlyFans', bg: '#00AFF0', fg: 'white',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 18.6a6.6 6.6 0 110-13.2 6.6 6.6 0 010 13.2zm0-10.8a4.2 4.2 0 100 8.4 4.2 4.2 0 000-8.4zm0 6.6a2.4 2.4 0 110-4.8 2.4 2.4 0 010 4.8z"/></svg>,
  },
  {
    name: 'LinkedIn', bg: '#0A66C2', fg: 'white',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
  },
];

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

  const togglePlatform = (name: string) => {
    const current = state.selectedSocialPlatforms;
    const next = current.includes(name)
      ? current.filter((p) => p !== name)
      : [...current, name];
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
            <div className="grid grid-cols-4 gap-4 justify-items-center">
              {socialPlatforms.map((platform) => {
                const isSelected = state.selectedSocialPlatforms.includes(platform.name);
                return (
                  <button
                    key={platform.name}
                    type="button"
                    onClick={() => togglePlatform(platform.name)}
                    className="flex flex-col items-center gap-2 group"
                  >
                    <div className="relative">
                      <div
                        className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                          isSelected ? 'ring-2 ring-[#C9A55C] ring-offset-2 ring-offset-[#0e0c09]' : 'opacity-70 group-hover:opacity-100'
                        }`}
                        style={{ background: platform.bg, color: platform.fg }}
                      >
                        {platform.icon}
                      </div>
                      {isSelected && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#C9A55C] flex items-center justify-center">
                          <Check className="w-3 h-3 text-[#0e0c09]" />
                        </div>
                      )}
                    </div>
                    <span className={`text-xs font-body transition-colors ${isSelected ? 'text-[#C9A55C]' : 'text-white/60'}`}>
                      {platform.name}
                    </span>
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
