import { ArrowLeft } from 'lucide-react';
import type { OnboardingState } from './useOnboardingWizard';

interface Props {
  state: OnboardingState;
  updateField: (field: keyof OnboardingState, value: any) => void;
  dispatch: React.Dispatch<any>;
  onNext: () => void;
  onPrev: () => void;
  t: (key: string) => string;
}

const backgroundRows = [
  {
    label: 'Dark & Moody',
    items: [
      { value: '#000000', label: 'Pitch Black' },
      { value: '#0e0c09', label: 'Dark Charcoal' },
      { value: '#0d1b2a', label: 'Deep Navy' },
      { value: '#1a1a2e', label: 'Forest Dark' },
      { value: '#2d1b33', label: 'Deep Plum' },
      { value: '#2c1810', label: 'Dark Espresso' },
    ],
  },
  {
    label: 'Feminine & Warm',
    items: [
      { value: '#f4e4e4', label: 'Soft Rose' },
      { value: '#f8d7da', label: 'Blush Pink' },
      { value: '#e8d5f0', label: 'Lavender Mist' },
      { value: '#f7e9d4', label: 'Champagne' },
      { value: '#fdf6ec', label: 'Warm Cream' },
      { value: '#d4a5a5', label: 'Dusty Mauve' },
    ],
  },
  {
    label: 'Vibrant & Bold',
    items: [
      { value: 'linear-gradient(135deg, #b76e79, #e8a4b0)', label: 'Rose Gold' },
      { value: 'linear-gradient(135deg, #667eea, #764ba2)', label: 'Purple Dream' },
      { value: 'linear-gradient(135deg, #f093fb, #f5576c)', label: 'Sunset' },
      { value: 'linear-gradient(135deg, #4facfe, #00f2fe)', label: 'Ocean' },
      { value: 'linear-gradient(135deg, #f7971e, #ffd200)', label: 'Golden Hour' },
      { value: 'linear-gradient(135deg, #43e97b, #38f9d7)', label: 'Mint Fresh' },
    ],
  },
  {
    label: 'Nature & Earth',
    items: [
      { value: '#2d4a22', label: 'Forest Green' },
      { value: '#4a3728', label: 'Warm Walnut' },
      { value: '#c4a882', label: 'Sandy Tan' },
      { value: '#8b7355', label: 'Mocha Brown' },
      { value: '#4a5568', label: 'Slate Blue' },
      { value: '#6b7280', label: 'Cool Gray' },
    ],
  },
  {
    label: 'Light & Airy',
    items: [
      { value: '#ffffff', label: 'Pure White' },
      { value: '#f8fafc', label: 'Snow' },
      { value: '#f0f4f8', label: 'Sky White' },
      { value: '#fefce8', label: 'Butter' },
      { value: '#f0fdf4', label: 'Mint White' },
      { value: '#fdf4ff', label: 'Lilac White' },
    ],
  },
];

export function StepPickYourVibe({ state, updateField, onNext, onPrev, t }: Props) {
  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div className="text-center">
        <h2 className="font-display text-3xl font-bold text-white">
          Choose Your Vibe
        </h2>
        <p className="text-white/60 mt-2 font-body">
          Pick a background color that feels like you. You can change everything else in the editor.
        </p>
      </div>

      <div className="space-y-5">
        {backgroundRows.map((row) => (
          <div key={row.label}>
            <p className="text-[10px] uppercase tracking-wider text-white/30 mb-2 font-body">{row.label}</p>
            <div className="grid grid-cols-6 gap-2">
              {row.items.map((bg) => (
                <button
                  key={bg.value}
                  type="button"
                  onClick={() => updateField('backgroundColor', bg.value)}
                  className="flex flex-col items-center gap-1"
                >
                  <div
                    className={`w-14 h-14 rounded-lg border-2 transition-all ${
                      state.backgroundColor === bg.value
                        ? 'border-[#C9A55C] shadow-[0_0_12px_rgba(201,165,92,0.3)] scale-110'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                    style={{ background: bg.value }}
                  />
                  <span className="text-[9px] text-white/40 text-center leading-tight">{bg.label}</span>
                </button>
              ))}
            </div>
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
