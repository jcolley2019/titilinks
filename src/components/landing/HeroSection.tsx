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
        className="absolute -top-4 -right-10 z-30 px-4 py-2 rounded-xl bg-white dark:bg-card/80 dark:backdrop-blur-md shadow-lg shadow-black/15 dark:shadow-black/30 border border-border/50"
      >
        <span className="text-sm font-medium text-primary">+127 clicks today</span>
      </motion.div>

      {/* Floating badge: setup time */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.5, duration: 0.4 }}
        className="absolute -bottom-4 -left-10 z-30 px-4 py-2 rounded-xl bg-white dark:bg-card/80 dark:backdrop-blur-md shadow-lg shadow-black/15 dark:shadow-black/30 border border-border/50"
      >
        <span className="text-sm font-medium text-primary">⚡ Setup in 2 min</span>
      </motion.div>

      {/* Phone frame — dark iPhone style */}
      <div className="relative mx-auto w-72 h-[540px] rounded-[2.5rem] border-2 border-[#2a2a2a] shadow-[0_0_40px_-8px_hsl(43_65%_55%/0.4),0_0_80px_-15px_hsl(43_65%_55%/0.2)] overflow-hidden bg-[#1a1a1a]">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#1a1a1a] rounded-b-2xl z-20" />

        {/* Screen content — dark theme */}
        <div className="absolute inset-3 top-7 rounded-[2rem] flex flex-col overflow-hidden bg-[#0f0f0f]">
          <div className="w-full h-48 relative overflow-hidden flex-shrink-0 -mb-px">
            <img
              src={mockupCreatorPhoto}
              alt="Creator profile"
              className="w-full h-full object-cover object-top"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0f0f0f]" />
          </div>

          <div className="relative flex-1 flex flex-col -mt-px px-3 pb-2">
            <div className="flex flex-col items-center pt-1 pb-2">
              <h3 className="font-bold text-white text-sm">TheCreator 🌺</h3>
              <p className="text-[10px] text-white/50 text-center">Content Creator & Entrepreneur ✨</p>
            </div>

            <div className="flex-1 flex flex-col justify-end space-y-1.5">
              {['Shop My Favorites', 'Join My Team', 'Free Starter Guide'].map((label) => (
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
      </div>
    </div>
  );
}

export function HeroSection() {
  const { t } = useLanguage();

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20 pb-10 px-4 mesh-gradient-hero noise-overlay">
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
              <br />
              <span className="italic gradient-text">{t('hero.title2')} {t('hero.title3')}</span>
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
              className="flex flex-col gap-3 justify-center items-center lg:items-center mb-8 max-w-md mx-auto px-2 lg:px-0"
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
