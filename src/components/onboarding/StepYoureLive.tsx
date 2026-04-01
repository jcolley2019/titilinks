import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, Share2 } from 'lucide-react';
import type { OnboardingState } from './useOnboardingWizard';

interface Props {
  state: OnboardingState;
  onFinish: () => void;
  t: (key: string) => string;
}

export function StepYoureLive({ state, onFinish, t }: Props) {
  const [copied, setCopied] = useState(false);
  const handle = state.createdHandle || state.username;
  const fullUrl = `https://titilinks.com/${handle}`;

  const confetti = useMemo(
    () =>
      Array.from({ length: 25 }).map((_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 500,
        y: (Math.random() - 0.5) * 400,
        delay: Math.random() * 0.5,
        size: 6 + Math.random() * 6,
      })),
    []
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'TitiLinks', url: fullUrl });
      } catch {
        handleCopy();
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] relative overflow-hidden">
      {/* Confetti */}
      {confetti.map((c) => (
        <motion.div
          key={c.id}
          className="absolute rounded-full bg-[#C9A55C]"
          style={{ width: c.size, height: c.size }}
          initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
          animate={{ scale: 1, x: c.x, y: c.y, opacity: 0 }}
          transition={{ duration: 1.5, delay: c.delay, ease: 'easeOut' }}
        />
      ))}

      {/* Checkmark */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', damping: 10, stiffness: 100 }}
        className="w-20 h-20 rounded-full bg-[#C9A55C] flex items-center justify-center mb-6"
      >
        <svg className="w-10 h-10 text-[#0e0c09]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </motion.div>

      {/* Heading */}
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="font-display text-4xl font-bold text-[#C9A55C] mb-3"
      >
        {t('onboardingFlow.youreLive')}
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-white/60 mb-8 font-body"
      >
        {t('onboardingFlow.youreLiveDesc')}
      </motion.p>

      {/* URL Display */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="flex items-center gap-2 px-5 py-3 rounded-full bg-white/5 border border-[#C9A55C]/30 mb-8"
      >
        <span className="text-white font-body font-medium">titilinks.com/{handle}</span>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-400" />
          ) : (
            <Copy className="w-4 h-4 text-white/60" />
          )}
        </button>
      </motion.div>

      {/* Action Buttons */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="flex gap-3"
      >
        <button
          onClick={handleShare}
          className="flex items-center gap-2 px-6 py-3 rounded-lg border-2 border-[#C9A55C] text-[#C9A55C] font-semibold font-body hover:bg-[#C9A55C]/10 transition-colors"
        >
          <Share2 className="w-4 h-4" />
          {t('onboardingFlow.shareLink')}
        </button>
        <button
          onClick={onFinish}
          className="px-6 py-3 rounded-lg bg-[#C9A55C] text-[#0e0c09] font-semibold font-body hover:opacity-90 transition-opacity"
        >
          {t('onboardingFlow.goToDashboard')}
        </button>
      </motion.div>
    </div>
  );
}
