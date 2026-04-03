import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CoachStep {
  targetSelector: string | null;
  title: string;
  description: string;
}

const STORAGE_KEY = 'titilinks-coach-complete';

const coachSteps: CoachStep[] = [
  {
    targetSelector: '[data-coach="preview"]',
    title: '\ud83d\udc4b You\u2019re live!',
    description: 'This is your link page. Visitors can already see it at titilinks.com/',
  },
  {
    targetSelector: '[data-coach="blocks"]',
    title: '\u270f\ufe0f Edit your links',
    description: 'Click any link to edit the title and URL. Drag the \u2807 icon to reorder them.',
  },
  {
    targetSelector: '[data-coach="blocks"]',
    title: '\ud83d\udc41\ufe0f Show or hide links',
    description: 'Toggle any link on or off to control what visitors see on your page.',
  },
  {
    targetSelector: '[data-coach="tabs"]',
    title: '\ud83c\udfa8 Customize your design',
    description: 'Switch to the Design tab to change colors, fonts, backgrounds, and button styles.',
  },
  {
    targetSelector: null,
    title: '\ud83d\ude80 You\u2019re all set!',
    description: 'Add more links, upload images, and grow your audience. We\u2019re excited to have you!',
  },
];

interface Props {
  username: string;
}

export function WelcomeCoach({ username }: Props) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    const timer = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(timer);
  }, []);

  const updateRect = useCallback(() => {
    const selector = coachSteps[step]?.targetSelector;
    if (!selector) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(selector);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [step]);

  useEffect(() => {
    if (!visible) return;
    updateRect();
    window.addEventListener('resize', updateRect);
    return () => window.removeEventListener('resize', updateRect);
  }, [visible, step, updateRect]);

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
  };

  const handleNext = () => {
    if (step === coachSteps.length - 1) {
      handleComplete();
    } else {
      setStep((s) => s + 1);
    }
  };

  if (!visible) return null;

  const currentStep = coachSteps[step];
  const description =
    step === 0 && username
      ? `${currentStep.description}${username}`
      : currentStep.description;

  const isLastStep = step === coachSteps.length - 1;
  const isCentered = !currentStep.targetSelector;

  // Calculate tooltip position
  const tooltipStyle: React.CSSProperties = {};
  if (targetRect && !isCentered) {
    const padding = 12;
    const tooltipWidth = Math.min(320, window.innerWidth - 32);
    const spaceBelow = window.innerHeight - targetRect.bottom - padding;
    const spaceAbove = targetRect.top - padding;

    tooltipStyle.position = 'fixed';
    tooltipStyle.width = tooltipWidth;
    tooltipStyle.left = Math.max(
      16,
      Math.min(
        targetRect.left + targetRect.width / 2 - tooltipWidth / 2,
        window.innerWidth - tooltipWidth - 16
      )
    );

    if (spaceBelow >= 180 || spaceBelow >= spaceAbove) {
      tooltipStyle.top = targetRect.bottom + padding + 8;
      tooltipStyle.maxHeight = spaceBelow - 16;
    } else {
      tooltipStyle.bottom = window.innerHeight - targetRect.top + padding + 8;
      tooltipStyle.maxHeight = spaceAbove - 16;
    }
  }

  return (
    <div className="fixed inset-0 z-[100]" style={{ pointerEvents: 'auto' }}>
      {/* Backdrop */}
      {isCentered ? (
        <div className="absolute inset-0 bg-black/60" />
      ) : (
        <>
          <div className="absolute inset-0 bg-black/60" />
          {/* Spotlight cutout */}
          {targetRect && (
            <div
              className="absolute rounded-xl"
              style={{
                top: targetRect.top - 8,
                left: targetRect.left - 8,
                width: targetRect.width + 16,
                height: targetRect.height + 16,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
                zIndex: 1,
                pointerEvents: 'none',
              }}
            />
          )}
        </>
      )}

      {/* Skip button */}
      {!isLastStep && (
        <button
          onClick={handleComplete}
          className="fixed top-4 right-4 z-[102] text-sm text-white/40 hover:text-white/70 transition-colors font-body px-3 py-2 rounded-lg bg-black/40 backdrop-blur-sm"
        >
          Skip
        </button>
      )}

      {/* Tooltip card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          className={`z-[102] ${
            isCentered
              ? 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(360px,calc(100vw-32px))]'
              : ''
          }`}
          style={isCentered ? {} : { ...tooltipStyle, position: 'fixed', zIndex: 102 }}
        >
          <div className="bg-[#1a1816] border-2 border-[#C9A55C] rounded-2xl p-5 shadow-2xl overflow-y-auto" style={{ maxHeight: 'calc(100vh - 80px)' }}>
            <h3
              className="text-lg font-bold text-white mb-2"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {currentStep.title}
            </h3>
            <p className="text-sm text-white/70 leading-relaxed font-body">
              {description}
            </p>

            {/* Step dots */}
            <div className="flex justify-center gap-1.5 mt-4 mb-3">
              {coachSteps.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i === step ? 'bg-[#C9A55C]' : 'bg-white/20'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={handleNext}
              className="w-full py-2.5 rounded-lg bg-[#C9A55C] text-[#0e0c09] font-semibold text-sm font-body hover:opacity-90 transition-opacity"
            >
              {isLastStep ? "Let's go!" : 'Next'}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
