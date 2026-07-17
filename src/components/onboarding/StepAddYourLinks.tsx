import { ArrowLeft, Check } from 'lucide-react';
import { PlatformIcon } from '@/components/PlatformIcon';
import { PLATFORM_CATALOG } from '@/lib/platform-catalog';
import type { OnboardingState } from './useOnboardingWizard';

interface Props {
  state: OnboardingState;
  updateField: (field: keyof OnboardingState, value: any) => void;
  onNext: () => void;
  onPrev: () => void;
  t: (key: string) => string;
}

const PLATFORM_CATEGORIES = PLATFORM_CATALOG.map((c) => ({
  label: c.label,
  platforms: c.platforms.map((p) => p.label),
}));

export function StepAddYourLinks({ state, updateField, onNext, onPrev, t }: Props) {
  const toggle = (platform: string) => {
    const current = state.selectedSocialPlatforms;
    const next = current.includes(platform)
      ? current.filter((p) => p !== platform)
      : [...current, platform];
    updateField('selectedSocialPlatforms', next);
  };

  return (
    <div className="flex flex-col gap-6 flex-1 w-full max-w-lg mx-auto">
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold text-white">
          {t('onboardingFlow.yourSocialPlatforms') || 'Your Social Platforms'}
        </h2>
        <p className="text-white/60 mt-2 font-body">
          {t('onboardingFlow.yourSocialPlatformsDesc') || "Tap to add the platforms you're on. You'll add your links in the editor."}
        </p>
      </div>

      <div>
        {PLATFORM_CATEGORIES.map((category) => (
          <div key={category.label}>
            <p className="text-xs uppercase tracking-widest text-[#C9A55C] mb-3 mt-6 font-body">
              {category.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {category.platforms.map((platform) => {
                const isSelected = state.selectedSocialPlatforms.includes(platform);
                return (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => toggle(platform)}
                    className={`px-3 py-2 rounded-full border text-sm font-body flex items-center gap-2 transition-all ${
                      isSelected
                        ? 'border-[#C9A55C] bg-[#C9A55C]/10 text-[#C9A55C]'
                        : 'border-white/10 text-white/60 hover:border-white/20'
                    }`}
                  >
                    <PlatformIcon label={platform} size={16} />
                    <span>{platform}</span>
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
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
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={onNext}
            className="px-8 py-3 rounded-lg bg-[#C9A55C] text-[#0e0c09] font-semibold font-body transition-opacity hover:opacity-90"
          >
            {t('onboardingFlow.continue')}
          </button>
          <button
            onClick={onNext}
            className="text-xs text-white/40 hover:text-white/60 font-body transition-colors"
          >
            {t('onboardingFlow.skipForNow') || 'Skip for now'}
          </button>
        </div>
      </div>
    </div>
  );
}
