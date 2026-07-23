import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/hooks/useLanguage';
import {
  PhoneCard,
  EXAMPLES,
  PHONE_BASE_W,
  PHONE_BASE_H,
  BG,
  SURFACE,
  type Lang,
} from '@/components/PhoneMockup';

/* Desktop: a row of phones drifting sideways, looping seamlessly. */
function PhoneMarquee({ lang }: { lang: Lang }) {
  const loop = [...EXAMPLES, ...EXAMPLES];
  return (
    <div
      className="hero-marquee-viewport relative overflow-hidden"
      style={{
        maskImage: 'linear-gradient(to right, transparent, #000 9%, #000 91%, transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, #000 9%, #000 91%, transparent)',
      }}
    >
      <div className="hero-marquee-track py-4">
        {loop.map((ex, i) => (
          <div key={i} className="flex-shrink-0" style={{ marginRight: 28, transform: `rotate(${i % 2 ? -2.5 : 2.5}deg)` }}>
            <PhoneCard example={ex} lang={lang} displayWidth={244} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* Mobile: one phone that cross-fades through the examples. */
function PhoneRotator({ lang }: { lang: Lang }) {
  const reduce = useReducedMotion();
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % EXAMPLES.length), 4500);
    return () => clearInterval(id);
  }, [reduce]);
  const w = 290;
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: w, height: PHONE_BASE_H * (w / PHONE_BASE_W) }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <PhoneCard example={EXAMPLES[idx]} lang={lang} displayWidth={w} />
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mt-5 flex gap-2">
        {EXAMPLES.map((ex, i) => (
          <button
            key={ex.key}
            aria-label={`Show ${ex.key} example`}
            onClick={() => setIdx(i)}
            className="h-2 rounded-full transition-all"
            style={{ width: i === idx ? 22 : 8, backgroundColor: i === idx ? '#C9A55C' : 'rgba(255,255,255,0.22)' }}
          />
        ))}
      </div>
    </div>
  );
}

function useIsDesktop() {
  const [desktop, setDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)');
    const handler = () => setDesktop(m.matches);
    m.addEventListener('change', handler);
    return () => m.removeEventListener('change', handler);
  }, []);
  return desktop;
}

export function HeroSection() {
  const { t, language } = useLanguage();
  const lang: Lang = language === 'es' ? 'es' : 'en';
  const isDesktop = useIsDesktop();

  return (
    <section className="relative flex min-h-[100svh] items-center overflow-hidden px-5 pb-16 pt-28 lg:pt-32" style={{ backgroundColor: BG }}>
      {/* Single soft gold spotlight + vignette — no orbs, no noise */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(55% 50% at 70% 45%, rgba(201,165,92,0.10) 0%, transparent 60%),
            radial-gradient(120% 100% at 50% 0%, transparent 55%, rgba(0,0,0,0.55) 100%)`,
        }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-6">
        {/* Left — copy */}
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mb-7 flex items-center gap-3"
          >
            <span className="h-px w-7" style={{ backgroundColor: '#C9A55C' }} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: '#C9A55C' }}>
              {t('hero.badge')}
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-5xl font-semibold leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-[4.5rem] xl:text-[5rem]"
          >
            {t('hero.title1')}
            <br />
            <span style={{ color: '#C9A55C' }}>{t('hero.title2')}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 max-w-md text-base text-white/60 sm:text-lg"
          >
            {t('hero.subtitle')}
          </motion.p>

          {/* Handle claimer */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="mt-9 w-full max-w-md"
          >
            <div className="flex items-center rounded-full p-1.5" style={{ backgroundColor: SURFACE, border: '1px solid rgba(201,165,92,0.35)' }}>
              <span className="whitespace-nowrap pl-4 pr-1 text-sm text-white/45 sm:text-base">titilinks.com/</span>
              <input
                type="text"
                aria-label="Choose your handle"
                placeholder={t('hero.handlePlaceholder')}
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-white/30 sm:text-base"
              />
              <Link to="/login?mode=signup" className="shrink-0">
                <button
                  className="rounded-full px-6 py-2.5 text-sm font-semibold transition-transform duration-150 hover:-translate-y-px active:scale-[0.98]"
                  style={{ backgroundColor: '#C9A55C', color: BG }}
                >
                  {t('hero.cta')}
                </button>
              </Link>
            </div>
            <p className="mt-3 text-sm text-white/40">
              {t('hero.freeForever')} {t('hero.noCreditCard')}
            </p>
          </motion.div>
        </div>

        {/* Right — rotating phones */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="min-w-0"
        >
          {isDesktop ? <PhoneMarquee lang={lang} /> : <PhoneRotator lang={lang} />}
        </motion.div>
      </div>
    </section>
  );
}
