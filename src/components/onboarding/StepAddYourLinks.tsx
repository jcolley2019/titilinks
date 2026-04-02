import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Grid2X2, List, LayoutList } from 'lucide-react';
import type { OnboardingState } from './useOnboardingWizard';

interface Props {
  state: OnboardingState;
  updateField: (field: keyof OnboardingState, value: any) => void;
  onNext: () => void;
  onPrev: () => void;
  t: (key: string) => string;
}

const placeholders: Record<string, string> = {
  TikTok: 'https://tiktok.com/@you',
  Instagram: 'https://instagram.com/you',
  YouTube: 'https://youtube.com/@you',
  Facebook: 'https://facebook.com/you',
  Snapchat: 'https://snapchat.com/add/you',
  X: 'https://x.com/you',
  OnlyFans: 'https://onlyfans.com/you',
  LinkedIn: 'https://linkedin.com/in/you',
};

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

function GalleryMockup() {
  return (
    <div className="grid grid-cols-2 gap-2 w-full max-w-[140px] mx-auto">
      <div className="aspect-square rounded-lg bg-white/10 border border-white/5" />
      <div className="aspect-square rounded-lg bg-white/10 border border-white/5" />
    </div>
  );
}

function StandardMockup() {
  return (
    <div className="space-y-2 w-full max-w-[160px] mx-auto">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-6 rounded-full bg-white/10 border border-white/5" />
      ))}
    </div>
  );
}

function FeaturedMockup() {
  return (
    <div className="space-y-2 w-full max-w-[160px] mx-auto">
      {[1, 2].map((i) => (
        <div key={i} className="relative h-14 rounded-lg bg-white/10 border border-white/5 overflow-hidden">
          <div className="absolute bottom-1 left-2 h-2 w-16 rounded bg-white/20" />
        </div>
      ))}
    </div>
  );
}

const layoutOptions = [
  {
    value: 'gallery' as const,
    title: 'Grid Layout',
    description: 'Great for photos, products, and visual content',
    icon: Grid2X2,
    mockup: GalleryMockup,
  },
  {
    value: 'standard' as const,
    title: 'Button Layout',
    description: 'Clean and simple, works for any type of link',
    icon: List,
    mockup: StandardMockup,
  },
  {
    value: 'featured' as const,
    title: 'Image Cards',
    description: 'Bold visual cards that make links stand out',
    icon: LayoutList,
    mockup: FeaturedMockup,
  },
];

const linkCountOptions = [2, 3, 4, 6] as const;

export function StepAddYourLinks({ state, updateField, onNext, onPrev, t }: Props) {
  const [subStep, setSubStep] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (subStep === 2 && state.selectedSocialPlatforms.length > 0) {
      const existingUrls = new Map(state.links.map((l) => [l.platform, l.url]));
      const newLinks = state.selectedSocialPlatforms.map((p) => ({
        platform: p,
        url: existingUrls.get(p) || '',
      }));
      updateField('links', newLinks);
    }
  }, [state.selectedSocialPlatforms.length, subStep]);

  const updateLinkUrl = (index: number, url: string) => {
    const newLinks = state.links.map((link, i) => (i === index ? { ...link, url } : link));
    updateField('links', newLinks);
  };

  const hasAtLeastOneLink = state.links.some((l) => l.url.trim() !== '');
  const visibleLinks = state.links.slice(0, state.linkCount);

  const handleBack = () => {
    if (subStep === 0) {
      onPrev();
    } else {
      setDirection(-1);
      setSubStep((s) => s - 1);
    }
  };

  const handleContinue = () => {
    if (subStep === 2) {
      onNext();
    } else {
      setDirection(1);
      setSubStep((s) => s + 1);
    }
  };

  const canContinue = (() => {
    if (subStep === 0) return state.linkLayout !== null;
    if (subStep === 1) return true;
    if (subStep === 2) return hasAtLeastOneLink;
    return false;
  })();

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold text-white">
          {t('onboardingFlow.addLinks')}
        </h2>
        <p className="text-white/60 mt-2 font-body">
          {subStep === 0
            ? 'How do you want your links to look?'
            : subStep === 1
            ? 'How many links to start with?'
            : t('onboardingFlow.addLinksDesc')}
        </p>
      </div>

      <SubStepDots current={subStep} total={3} />

      <AnimatePresence mode="wait" custom={direction}>
        {/* Sub-step 0: Link Layout */}
        {subStep === 0 && (
          <motion.div key="layout" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
            <div className="space-y-3">
              {layoutOptions.map((opt) => {
                const isSelected = state.linkLayout === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => updateField('linkLayout', opt.value)}
                    className={`w-full p-5 rounded-xl border-2 text-left transition-all flex items-center gap-5 ${
                      isSelected
                        ? 'border-[#C9A55C] bg-white/5'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex-shrink-0 w-[160px]">
                      <opt.mockup />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <opt.icon className={`w-4 h-4 ${isSelected ? 'text-[#C9A55C]' : 'text-white/50'}`} />
                        <p className={`text-sm font-semibold font-body ${isSelected ? 'text-[#C9A55C]' : 'text-white'}`}>
                          {opt.title}
                        </p>
                      </div>
                      <p className="text-xs text-white/50 mt-1 font-body">{opt.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Sub-step 1: Link Count */}
        {subStep === 1 && (
          <motion.div key="count" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
            <div className="flex justify-center gap-4 py-8">
              {linkCountOptions.map((n) => {
                const isSelected = state.linkCount === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => updateField('linkCount', n)}
                    className={`w-16 h-16 rounded-xl border-2 text-lg font-bold font-body transition-all ${
                      isSelected
                        ? 'border-[#C9A55C] bg-[#C9A55C]/10 text-[#C9A55C]'
                        : 'border-white/10 text-white/60 hover:border-white/20'
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Sub-step 2: URL Inputs */}
        {subStep === 2 && (
          <motion.div key="urls" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
            {state.selectedSocialPlatforms.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-white/60 font-body">{t('onboardingFlow.noSocialsSelected')}</p>
                <button
                  onClick={onPrev}
                  className="flex items-center gap-2 mx-auto mt-3 px-4 py-3 rounded-lg text-[#C9A55C] hover:underline font-body"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {t('onboardingFlow.back')}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {visibleLinks.map((link, i) => (
                  <div key={link.platform} className="space-y-1.5">
                    <label className="text-sm font-medium text-white/80 font-body">
                      {link.platform}
                    </label>
                    <input
                      type="url"
                      value={link.url}
                      onChange={(e) => updateLinkUrl(i, e.target.value)}
                      placeholder={placeholders[link.platform] || 'https://...'}
                      className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-[#C9A55C]/50 font-body text-sm"
                    />
                  </div>
                ))}
              </div>
            )}
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
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={handleContinue}
            disabled={!canContinue}
            className="px-8 py-3 rounded-lg bg-[#C9A55C] text-[#0e0c09] font-semibold font-body transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
          >
            {t('onboardingFlow.continue')}
          </button>
          {subStep === 2 && (
            <button
              onClick={onNext}
              className="text-xs text-white/40 hover:text-white/60 transition-colors font-body"
            >
              {t('onboardingFlow.skipForNow')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
