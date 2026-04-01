import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
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

export function StepAddYourLinks({ state, updateField, onNext, onPrev, t }: Props) {
  useEffect(() => {
    if (state.links.length === 0 && state.selectedSocialPlatforms.length > 0) {
      updateField(
        'links',
        state.selectedSocialPlatforms.map((p) => ({ platform: p, url: '' }))
      );
    }
  }, []);

  const updateLinkUrl = (index: number, url: string) => {
    const newLinks = state.links.map((link, i) => (i === index ? { ...link, url } : link));
    updateField('links', newLinks);
  };

  const hasAtLeastOneLink = state.links.some((l) => l.url.trim() !== '');

  if (state.selectedSocialPlatforms.length === 0) {
    return (
      <div className="space-y-8 max-w-md mx-auto text-center">
        <h2 className="font-display text-3xl font-bold text-white">
          {t('onboardingFlow.addLinks')}
        </h2>
        <p className="text-white/60 font-body">{t('onboardingFlow.noSocialsSelected')}</p>
        <button
          onClick={onPrev}
          className="flex items-center gap-2 mx-auto px-4 py-3 rounded-lg text-[#C9A55C] hover:underline font-body"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('onboardingFlow.back')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-md mx-auto">
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold text-white">
          {t('onboardingFlow.addLinks')}
        </h2>
        <p className="text-white/60 mt-2 font-body">
          {t('onboardingFlow.addLinksDesc')}
        </p>
      </div>

      <div className="space-y-4">
        {state.links.map((link, i) => (
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

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onPrev}
          className="flex items-center gap-2 px-4 py-3 rounded-lg text-white/60 hover:text-white transition-colors font-body"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('onboardingFlow.back')}
        </button>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={onNext}
            disabled={!hasAtLeastOneLink}
            className="px-8 py-3 rounded-lg bg-[#C9A55C] text-[#0e0c09] font-semibold font-body transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90"
          >
            {t('onboardingFlow.continue')}
          </button>
          <button
            onClick={onNext}
            className="text-xs text-white/40 hover:text-white/60 transition-colors font-body"
          >
            {t('onboardingFlow.skipForNow')}
          </button>
        </div>
      </div>
    </div>
  );
}
