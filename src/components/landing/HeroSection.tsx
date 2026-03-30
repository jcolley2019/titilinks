import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles, Users, Zap, Instagram, Youtube, Globe, ShieldCheck, CreditCard } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import mockupCreatorPhoto from '@/assets/mockup-creator-photo.jpg';

function PhoneMockup() {
  const { t } = useLanguage();
  return (
    <div className="relative">
      {/* Floating badge: clicks */}
      <div className="absolute -top-4 -right-10 z-30 px-4 py-2 rounded-xl bg-white dark:bg-card/80 dark:backdrop-blur-md shadow-lg shadow-black/15 dark:shadow-black/30 border border-border/50">
        <span className="text-sm font-medium text-primary">{t('hero.mockup.clicks')}</span>
      </div>

      {/* Floating badge: setup time */}
      <div className="absolute -bottom-4 -left-10 z-30 px-4 py-2 rounded-xl bg-white dark:bg-card/80 dark:backdrop-blur-md shadow-lg shadow-black/15 dark:shadow-black/30 border border-border/50">
        <span className="text-sm font-medium text-primary">{t('hero.mockup.setup')}</span>
      </div>

      {/* OUTER LAYER: Phone frame/shell only — this is what animates */}
      <div
        className="relative mx-auto bg-[#1a1a1a] rounded-[3rem] p-[3px] overflow-hidden"
        style={{
          width: '290px',
          height: '586px',
          boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.6), inset 0 0 0 1.5px rgba(255,255,255,0.08), 0 0 40px -8px hsl(43 65% 55% / 0.4), 0 0 80px -15px hsl(43 65% 55% / 0.2)',
        }}
      >
        {/* Side Buttons — Left (Silent, Volume) */}
        <div className="absolute left-[-2.5px] top-[100px] w-[2.5px] h-[24px] bg-[#2a2a2a] rounded-l-sm" />
        <div className="absolute left-[-2.5px] top-[135px] w-[2.5px] h-[42px] bg-[#2a2a2a] rounded-l-sm" />
        <div className="absolute left-[-2.5px] top-[185px] w-[2.5px] h-[42px] bg-[#2a2a2a] rounded-l-sm" />
        {/* Side Button — Right (Power) */}
        <div className="absolute right-[-2.5px] top-[155px] w-[2.5px] h-[65px] bg-[#2a2a2a] rounded-r-sm" />

        {/* INNER LAYER: All content — completely static, no animation, no transform */}
        <div
          className="absolute inset-[3px] bg-black rounded-[2.75rem] overflow-hidden"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            WebkitFontSmoothing: 'antialiased',
            contain: 'layout style paint',
          }}
        >
          {/* Dynamic Island */}
          <div className="absolute top-[10px] z-20" style={{ left: '50%', marginLeft: '-55px' }}>
            <div
              className="bg-black rounded-full flex items-center justify-center"
              style={{ width: '110px', height: '32px' }}
            >
              <div className="w-[10px] h-[10px] rounded-full bg-[#1a1a2e] ml-7 ring-1 ring-[#2a2a3a]" />
            </div>
          </div>

          {/* Screen Content */}
          <div className="h-full w-full overflow-hidden pt-[44px]">
            <div className="w-full h-44 relative overflow-hidden flex-shrink-0">
              <img
                src={mockupCreatorPhoto}
                alt="Creator profile"
                className="w-full h-full object-cover object-top"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0f0f0f]" />
            </div>

            <div className="relative flex-1 flex flex-col px-3 pb-2">
              <div className="flex flex-col items-center pt-1 pb-2">
                <h3 className="font-bold text-white text-sm">{t('hero.mockup.name')}</h3>
                <p className="text-[10px] text-white/50 text-center">{t('hero.mockup.bio')}</p>
              </div>

              <div className="flex-1 flex flex-col justify-end space-y-1.5">
                {[t('hero.mockup.btn1'), t('hero.mockup.btn2'), t('hero.mockup.btn3')].map((label) => (
                  <div
                    key={label}
                    className="w-full h-9 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: '#C9A55C' }}
                  >
                    <span className="text-[#0f0f0f] text-xs font-semibold">{label}</span>
                  </div>
                ))}

                <div className="flex items-center justify-center gap-3 pt-1.5">
                  <Instagram className="w-3.5 h-3.5 text-white/40" />
                  <Youtube className="w-3.5 h-3.5 text-white/40" />
                  <Globe className="w-3.5 h-3.5 text-white/40" />
                </div>

                <div className="text-center pt-0.5 pb-1">
                  <p className="text-[9px] text-white/30">
                    <span className="text-white/50">Titi</span>
                    <span className="italic" style={{ color: '#C9A55C' }}>Links</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Home Indicator */}
          <div className="absolute bottom-[6px] z-20 w-[100px] h-[4px] bg-white/25 rounded-full" style={{ left: '50%', marginLeft: '-50px' }} />
        </div>
      </div>

      {/* Reflection overlay */}
      <div
        className="absolute inset-0 pointer-events-none rounded-[3rem]"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 50%)' }}
      />
    </div>
  );
}

export function HeroSection() {
  const { t } = useLanguage();

  return (
    <section className="relative flex items-center justify-center pt-32 pb-20 px-4 noise-overlay overflow-hidden" style={{ backgroundColor: 'hsl(30, 15%, 6%)' }}>
      {/* Ambient glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-primary/8 rounded-full blur-[120px]" />
      <div className="absolute top-2/3 left-1/4 w-[400px] h-[300px] bg-accent/6 rounded-full blur-[100px]" />
      <div className="absolute top-1/2 right-1/4 w-[300px] h-[400px] bg-primary/5 rounded-full blur-[80px]" />
      <div className="absolute bottom-0 left-0 right-0 section-glow-line" />

      <div className="container relative z-10 max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          {/* Left — Copy */}
          <div className="flex-1 text-center lg:text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border mb-8"
              style={{ backgroundColor: 'hsl(30, 12%, 10%)', borderColor: 'hsl(43 65% 55% / 0.3)' }}
            >
              <Sparkles className="h-4 w-4 text-[hsl(43,65%,55%)]" />
              <span className="section-label">{t('hero.badge')}</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-8 text-white leading-[1.05]"
            >
              {t('hero.title1')}{' '}
              <br />
              <span className="italic gradient-text">{t('hero.title2')} {t('hero.title3')}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg sm:text-xl italic text-white/60 font-medium max-w-2xl mx-auto mb-4 font-body"
            >
              {t('hero.subtitle')}
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="text-base text-white/50 font-normal max-w-xl mx-auto mb-12 font-body"
            >
              {t('hero.description')}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col gap-3 justify-center items-center lg:items-center mb-8 max-w-lg mx-auto lg:mx-auto px-2 lg:px-0 w-full"
            >
              {/* Desktop: inline pill */}
              <div className="hidden sm:flex items-center w-full rounded-xl overflow-hidden p-1.5 border-2 border-[hsl(43,65%,55%)] shadow-[0_0_15px_-3px_hsl(43_65%_55%/0.4)]" style={{ backgroundColor: 'hsl(30, 12%, 10%)' }}>
                <div className="flex items-center pl-4 pr-1 text-white/50 text-base whitespace-nowrap">
                  titilinks.com/
                </div>
                <input
                  type="text"
                  placeholder={t('hero.handlePlaceholder')}
                  className="flex-1 min-w-0 bg-transparent border-none outline-none text-white text-base py-3 pr-2 placeholder:text-white/30"
                />
                <Link to="/login" className="shrink-0">
                  <Button size="lg" className="gradient-gold text-primary-foreground text-base px-6 py-3 rounded-lg font-semibold shadow-lg shadow-primary/20">
                    {t('hero.cta')}
                  </Button>
                </Link>
              </div>

              {/* Mobile: stacked */}
              <div className="flex sm:hidden flex-col w-full gap-3">
                <div className="flex items-center w-full rounded-2xl px-4 py-3.5 border-2 border-[hsl(43,65%,55%)] shadow-[0_0_15px_-3px_hsl(43_65%_55%/0.4)]" style={{ backgroundColor: 'hsl(30, 12%, 10%)' }}>
                  <span className="text-white/50 text-[15px] mr-1">titilinks.com/</span>
                  <input
                    type="text"
                    placeholder={t('hero.handlePlaceholder')}
                    className="flex-1 min-w-0 bg-transparent border-none outline-none text-white text-[15px] placeholder:text-white/30"
                  />
                </div>
                <Button asChild size="lg" className="gradient-gold text-primary-foreground text-[15px] w-full h-14 rounded-xl font-semibold shadow-lg shadow-primary/20">
                  <Link to="/login">
                    {t('hero.cta')}
                  </Link>
                </Button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex items-center justify-center gap-6 text-sm text-white/60"
            >
              <span className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                {t('hero.noCreditCard')}
              </span>
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                {t('hero.freeForever')}
              </span>
            </motion.div>
          </div>

          {/* Right — Phone Mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="hidden md:block flex-shrink-0"
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                willChange: 'transform',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: 'translateZ(0)',
              }}
            >
              <div className="relative">
                <div className="absolute -inset-6 bg-primary/30 dark:bg-primary/20 rounded-full blur-[50px]" />
                <PhoneMockup />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
