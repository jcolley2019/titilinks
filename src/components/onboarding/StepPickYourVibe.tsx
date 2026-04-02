import { useEffect } from 'react';
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
];

const buttonStyles = [
  { value: 'solid_rounded', label: 'Solid Rounded', className: 'rounded-lg bg-[#C9A55C] text-black' },
  { value: 'pill', label: 'Pill', className: 'rounded-full bg-[#C9A55C] text-black' },
  { value: 'outline', label: 'Outline', className: 'rounded-lg border-2 border-[#C9A55C] text-[#C9A55C] bg-transparent' },
  { value: 'soft_shadow', label: 'Soft Shadow', className: 'rounded-lg bg-[#C9A55C] text-black shadow-[0_4px_0_#C9A55C]' },
  { value: 'glass', label: 'Glass', className: 'rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 text-white' },
  { value: 'sharp', label: 'Sharp', className: 'rounded-none bg-[#C9A55C] text-black font-bold' },
];

const fontGroups = [
  {
    label: 'ELEGANT & FEMININE',
    fonts: [
      { value: 'Cormorant Garamond', label: 'Luxury Refined', family: "'Cormorant Garamond', serif", weight: 300 },
      { value: 'Dancing Script', label: 'Feminine Script', family: "'Dancing Script', cursive", weight: 700 },
      { value: 'Lora', label: 'Warm Romantic', family: "'Lora', serif", weight: 400, italic: true },
      { value: 'Quicksand', label: 'Soft & Playful', family: "'Quicksand', sans-serif", weight: 500 },
    ],
  },
  {
    label: 'MODERN & BOLD',
    fonts: [
      { value: 'DM Sans', label: 'Clean Modern', family: "'DM Sans', sans-serif", weight: 400 },
      { value: 'Montserrat', label: 'Strong Bold', family: "'Montserrat', sans-serif", weight: 800 },
      { value: 'Orbitron', label: 'Futuristic Tech', family: "'Orbitron', sans-serif", weight: 700 },
      { value: 'Playfair Display', label: 'Classic Editorial', family: "'Playfair Display', serif", weight: 700 },
    ],
  },
];

const socialPlatforms = [
  {
    name: 'TikTok', brandBg: '#010101', brandFg: 'white',
    icon: (fg: string) => <svg viewBox="0 0 24 24" className="w-8 h-8"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.75a4.85 4.85 0 01-1.01-.06z" fill={fg}/></svg>,
  },
  {
    name: 'Instagram', brandBg: 'linear-gradient(45deg, #833AB4, #E1306C, #F77737)', brandFg: 'white',
    icon: (fg: string) => <svg viewBox="0 0 24 24" className="w-8 h-8"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" fill={fg}/></svg>,
  },
  {
    name: 'YouTube', brandBg: '#FF0000', brandFg: 'white',
    icon: (fg: string) => <svg viewBox="0 0 24 24" className="w-8 h-8"><path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z" fill={fg}/></svg>,
  },
  {
    name: 'Facebook', brandBg: '#1877F2', brandFg: 'white',
    icon: (fg: string) => <svg viewBox="0 0 24 24" className="w-8 h-8"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill={fg}/></svg>,
  },
  {
    name: 'Snapchat', brandBg: '#FFFC00', brandFg: 'black',
    icon: (fg: string) => <svg viewBox="0 0 24 24" className="w-8 h-8"><path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.329 4.847l-.004.09c-.005.11-.009.22-.01.33.002.068.046.199.185.33.236.22.779.395 1.316.395.035 0 .07-.001.103-.003.128-.01.254-.023.38-.023.22 0 .419.028.615.084.63.18.91.536.914.977.003.5-.39.984-1.031 1.247-.049.02-.147.06-.261.098-.143.047-.35.11-.45.171-.133.08-.158.165-.159.224.002.122.084.25.144.332.065.085.143.17.216.252.278.312.622.699.622 1.294 0 .604-.356 1.047-.862 1.296-.484.24-1.097.355-1.829.355-.303 0-.604-.023-.908-.069-.155-.022-.294-.05-.44-.082-.272-.058-.532-.113-.772-.113-.135 0-.26.015-.38.046-.163.045-.318.118-.483.198-.379.181-.838.404-1.473.536-.067.014-.137.023-.206.033l-.116.017c-.073.012-.147.019-.222.019-.075 0-.15-.007-.222-.019l-.116-.017c-.069-.01-.139-.019-.206-.033-.635-.132-1.094-.355-1.473-.536-.165-.08-.32-.153-.483-.198-.12-.031-.245-.046-.38-.046-.24 0-.5.055-.772.113-.146.032-.285.06-.44.082-.304.046-.605.069-.908.069-.732 0-1.345-.115-1.829-.355-.506-.249-.862-.692-.862-1.296 0-.595.344-.982.622-1.294.073-.082.151-.167.216-.252.06-.082.142-.21.144-.332-.001-.059-.026-.144-.159-.224-.1-.061-.307-.124-.45-.171-.114-.038-.212-.078-.261-.098-.641-.263-1.034-.747-1.031-1.247.004-.441.284-.797.914-.977.196-.056.395-.084.615-.084.126 0 .252.013.38.023.033.002.068.003.103.003.537 0 1.08-.175 1.316-.395.139-.131.183-.262.185-.33-.001-.11-.005-.22-.01-.33l-.004-.09c-.074-1.628-.2-3.654.329-4.847C7.859 1.069 11.216.793 12.206.793z" fill={fg}/></svg>,
  },
  {
    name: 'X', brandBg: '#000000', brandFg: 'white',
    icon: (fg: string) => <svg viewBox="0 0 24 24" className="w-8 h-8"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" fill={fg}/></svg>,
  },
  {
    name: 'OnlyFans', brandBg: '#00AFF0', brandFg: 'white',
    icon: (fg: string) => <svg viewBox="0 0 24 24" className="w-8 h-8"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 4.5c4.142 0 7.5 3.358 7.5 7.5s-3.358 7.5-7.5 7.5S4.5 16.142 4.5 12 7.858 4.5 12 4.5zm0 2.5a5 5 0 100 10A5 5 0 0012 7z" fill={fg}/></svg>,
  },
  {
    name: 'LinkedIn', brandBg: '#0A66C2', brandFg: 'white',
    icon: (fg: string) => <svg viewBox="0 0 24 24" className="w-8 h-8"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" fill={fg}/></svg>,
  },
  {
    name: 'Telegram', brandBg: '#2AABEE', brandFg: 'white',
    icon: (fg: string) => <svg viewBox="0 0 24 24" className="w-8 h-8"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" fill={fg}/></svg>,
  },
  {
    name: 'Pinterest', brandBg: '#E60023', brandFg: 'white',
    icon: (fg: string) => <svg viewBox="0 0 24 24" className="w-8 h-8"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641 0 12.017 0z" fill={fg}/></svg>,
  },
  {
    name: 'Twitch', brandBg: '#9146FF', brandFg: 'white',
    icon: (fg: string) => <svg viewBox="0 0 24 24" className="w-8 h-8"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" fill={fg}/></svg>,
  },
  {
    name: 'BeReal', brandBg: '#000000', brandFg: 'white',
    icon: (fg: string) => <svg viewBox="0 0 24 24" className="w-8 h-8"><text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fill={fg} fontSize="10" fontWeight="bold" fontFamily="sans-serif">BR</text></svg>,
  },
  {
    name: 'Threads', brandBg: '#000000', brandFg: 'white',
    icon: (fg: string) => <svg viewBox="0 0 24 24" className="w-8 h-8"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.187.408-2.26 1.33-3.017.88-.724 2.107-1.138 3.455-1.165 1.01-.02 1.937.124 2.768.429.011-.39.005-.78-.019-1.167-.066-.966-.253-1.65-.529-2.03-.364-.508-.96-.756-1.819-.756h-.06c-.635.013-1.178.177-1.573.48l-1.326-1.564c.695-.592 1.594-.909 2.606-.96h.09c1.402 0 2.46.481 3.143 1.431.545.754.842 1.786.913 3.154.037.708.032 1.453-.015 2.223.529.32.985.714 1.358 1.182.796.997 1.132 2.263 1 3.765-.17 1.935-1.07 3.61-2.606 4.843C17.87 23.248 15.46 23.97 12.186 24zm.01-9.484c-.81.02-1.468.2-1.96.536-.467.32-.706.754-.682 1.22.024.46.27.836.712 1.12.455.29 1.058.452 1.696.417 1.002-.054 1.76-.433 2.322-1.133.372-.462.648-1.098.824-1.893-.607-.201-1.267-.3-1.968-.283l-.044.001h-.056z" fill={fg}/></svg>,
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

  // Load additional Google Fonts for the font picker
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600&family=Lora:ital,wght@0,400;1,400&family=Quicksand:wght@400;500;600&family=Montserrat:wght@800&family=Orbitron:wght@400;700&family=Dancing+Script:wght@400;700&family=Playfair+Display:wght@400;700&family=DM+Sans:wght@400;500&display=swap';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  const handleBack = () => {
    if (sub === 0) {
      onPrev();
    } else {
      dispatch({ type: 'SET_SUB_STEP', subStep: sub - 1, direction: -1 });
    }
  };

  const handleContinue = () => {
    if (sub === 3) {
      onNext();
    } else {
      dispatch({ type: 'SET_SUB_STEP', subStep: sub + 1, direction: 1 });
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
            <p className="text-sm font-medium text-white/80 mb-3 font-body">{t('onboardingFlow.fontChoice')}</p>
            <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
              {fontGroups.map((group) => (
                <div key={group.label}>
                  <p className="text-[10px] uppercase tracking-wider text-white/30 mb-2 font-body">{group.label}</p>
                  <div className="space-y-2">
                    {group.fonts.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => updateField('fontChoice', f.value)}
                        className={`w-full px-4 py-3 rounded-xl border-2 text-left transition-all h-[90px] flex flex-col justify-center ${
                          state.fontChoice === f.value
                            ? 'border-[#C9A55C] bg-white/5'
                            : 'border-white/10 hover:border-white/20'
                        }`}
                      >
                        <p className="text-[10px] text-white/40 font-body">{f.label}</p>
                        <p className="text-lg text-white leading-tight" style={{ fontFamily: f.family, fontWeight: f.weight, fontStyle: ('italic' in f && f.italic) ? 'italic' : 'normal' }}>
                          Your Name
                        </p>
                        <p className="text-xs text-white/50" style={{ fontFamily: f.family, fontWeight: f.weight, fontStyle: ('italic' in f && f.italic) ? 'italic' : 'normal' }}>
                          Link in bio
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Sub-step 3: Social Platforms */}
        {sub === 3 && (
          <motion.div key="social" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
            <p className="text-sm font-medium text-white/80 mb-3 font-body">{t('onboardingFlow.socialPlatforms')}</p>

            {/* Icon Style Picker */}
            <div className="flex items-center gap-2 mb-5">
              <span className="text-xs text-white/50 font-body">Icon Style:</span>
              <div className="flex rounded-lg border border-white/10 overflow-hidden">
                {(['color', 'white', 'dark'] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => updateField('socialIconStyle', style)}
                    className={`px-3 py-1.5 text-xs font-medium font-body capitalize transition-colors ${
                      state.socialIconStyle === style
                        ? 'bg-[#C9A55C] text-[#0e0c09]'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {style === 'color' ? 'Color' : style === 'white' ? 'White' : 'Dark'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-4 md:grid-cols-5 gap-4 justify-items-center">
              {socialPlatforms.map((platform) => {
                const isSelected = state.selectedSocialPlatforms.includes(platform.name);
                const iconStyle = state.socialIconStyle;
                const bg = iconStyle === 'color' ? platform.brandBg
                  : iconStyle === 'white' ? '#ffffff'
                  : '#1a1a1a';
                const fg = iconStyle === 'color' ? platform.brandFg
                  : iconStyle === 'white' ? '#1a1a1a'
                  : '#ffffff';
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
                        style={{ background: bg }}
                      >
                        {platform.icon(fg)}
                      </div>
                      {isSelected && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#C9A55C] flex items-center justify-center">
                          <Check className="w-3 h-3 text-[#0e0c09]" />
                        </div>
                      )}
                    </div>
                    <span className={`text-[10px] font-body transition-colors ${isSelected ? 'text-[#C9A55C]' : 'text-white/60'}`}>
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
