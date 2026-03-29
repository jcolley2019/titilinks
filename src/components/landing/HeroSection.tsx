import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles, Users, Zap, Instagram, Youtube, Globe } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import mockupCreatorPhoto from '@/assets/mockup-creator-photo.jpg';

function PhoneMockup() {
  return (
    <div className="relative">
      {/* Floating badge: clicks */}
      <motion.div
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.2, duration: 0.4 }}
        className="absolute -top-4 -right-10 z-30 px-4 py-2 rounded-xl glass-card shadow-lg"
      >
        <span className="text-sm font-medium text-primary">+127 clicks today</span>
      </motion.div>

      {/* Floating badge: setup time */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.4, duration: 0.4 }}
        className="absolute -bottom-3 -left-8 z-30 px-3 py-1.5 rounded-full bg-white shadow-lg shadow-black/10 flex items-center gap-1.5"
      >
        <span className="text-xs">⚡</span>
        <span className="text-[10px] font-bold text-primary">Setup in 2 min</span>
      </motion.div>

      {/* Phone frame — light warm style */}
      <div className="relative mx-auto w-72 h-[540px] rounded-[3rem] border-2 border-[#2a2a2a] shadow-2xl overflow-hidden glow-gold bg-[#1a1a1a]">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#1a1a1a] rounded-b-2xl z-20" />

        {/* Screen content */}
        <div className="absolute inset-4 top-8 rounded-[2rem] flex flex-col overflow-hidden">
          <div className="w-full h-56 relative overflow-hidden flex-shrink-0">
            <img
              src={mockupCreatorPhoto}
              alt="Creator profile"
              className="w-full h-full object-cover object-top"
            />
          </div>

          <div className="relative flex-1 bg-gradient-to-b from-amber-200 to-amber-300 flex flex-col">
            <div className="absolute -top-16 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-amber-200" />

            <div className="flex flex-col items-center pt-2 pb-1">
              <h3 className="font-bold text-gray-800 text-sm">TheCreator 🌺</h3>
              <p className="text-[10px] text-gray-600 text-center">Welcome to my world ✨</p>
            </div>

            <div className="flex-1 flex flex-col justify-end px-2 pb-1 space-y-1.5">
              <div className="w-full h-9 bg-white rounded-full flex items-center pl-0.5 pr-2 shadow-sm">
                <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                  </svg>
                </div>
                <span className="text-gray-700 text-xs font-medium flex-1 text-center">TikTok</span>
              </div>
              <div className="w-full h-9 bg-white rounded-full flex items-center pl-0.5 pr-2 shadow-sm">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center flex-shrink-0">
                  <Instagram className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-gray-700 text-xs font-medium flex-1 text-center">Instagram</span>
              </div>
              <div className="w-full h-9 bg-white rounded-full flex items-center pl-0.5 pr-2 shadow-sm">
                <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center flex-shrink-0">
                  <Youtube className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-gray-700 text-xs font-medium flex-1 text-center">YouTube</span>
              </div>
              <div className="w-full h-9 bg-white rounded-full flex items-center pl-0.5 pr-2 shadow-sm">
                <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                  <Globe className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-gray-700 text-xs font-medium flex-1 text-center">Green World</span>
              </div>

              <div className="text-center py-1">
                <p className="text-[9px] text-gray-600">
                  <span className="text-gray-700">Titi</span>
                  <span className="italic text-amber-700">Links</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroSection() {
  const { t } = useLanguage();

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20 pb-16 px-4 mesh-gradient-hero noise-overlay">
      {/* Ambient glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-primary/8 rounded-full blur-[120px]" />
      <div className="absolute top-2/3 left-1/4 w-[400px] h-[300px] bg-accent/6 rounded-full blur-[100px]" />
      <div className="absolute top-1/2 right-1/4 w-[300px] h-[400px] bg-primary/5 rounded-full blur-[80px]" />
      <div className="absolute bottom-0 left-0 right-0 section-glow-line" />

      <div className="container relative z-10 max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          {/* Left — Copy */}
          <div className="flex-1 text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-foreground border border-foreground mb-8"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-background">{t('hero.badge')}</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 text-foreground"
            >
              {t('hero.title1')}{' '}
              <span className="italic gradient-text">{t('hero.title2')}</span>
              <br />
              <span className="italic gradient-text">{t('hero.title3')}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg sm:text-xl italic text-foreground/70 font-medium max-w-2xl mx-auto lg:mx-0 mb-4"
            >
              {t('hero.subtitle')}
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="text-base text-foreground/60 font-medium max-w-xl mx-auto lg:mx-0 mb-10"
            >
              {t('hero.description')}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col gap-3 justify-center lg:justify-start items-center lg:items-start mb-8 max-w-md mx-auto lg:mx-0 px-2 lg:px-0"
            >
              {/* Desktop: inline pill */}
              <div className="hidden sm:flex items-center w-full rounded-xl glass-card overflow-hidden p-1.5 border-2 border-primary shadow-[0_0_15px_-3px_hsl(43_65%_55%/0.4)]">
                <div className="flex items-center pl-4 pr-1 text-muted-foreground text-base whitespace-nowrap">
                  titilinks.com/
                </div>
                <input
                  type="text"
                  placeholder={t('hero.handlePlaceholder')}
                  className="flex-1 min-w-0 bg-transparent border-none outline-none text-foreground text-base py-3 pr-2"
                />
                <Link to="/login" className="shrink-0">
                  <Button size="lg" className="gradient-gold text-primary-foreground text-base px-6 py-3 rounded-lg font-semibold shadow-lg shadow-primary/20">
                    {t('hero.cta')}
                  </Button>
                </Link>
              </div>

              {/* Mobile: stacked */}
              <div className="flex sm:hidden flex-col w-full gap-3">
                <div className="flex items-center w-full rounded-2xl glass-card px-4 py-3.5 border-2 border-primary shadow-[0_0_15px_-3px_hsl(43_65%_55%/0.4)]">
                  <span className="text-muted-foreground text-[15px] mr-1">titilinks.com/</span>
                  <input
                    type="text"
                    placeholder={t('hero.handlePlaceholder')}
                    className="flex-1 min-w-0 bg-transparent border-none outline-none text-foreground text-[15px]"
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
              className="flex items-center justify-center lg:justify-start gap-6 text-sm text-muted-foreground"
            >
              <span className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                {t('hero.stat1')}
              </span>
              <span className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                {t('hero.stat2')}
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
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity }}
            >
              <div className="relative">
                <div className="absolute -inset-8 bg-primary/10 rounded-full blur-[60px]" />
                <PhoneMockup />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
