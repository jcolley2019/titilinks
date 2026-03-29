import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles, Users, Zap, ShoppingBag, ExternalLink } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

function PhoneMockup() {
  return (
    <div className="relative bg-[#1a1a1a] rounded-[40px] p-2.5 shadow-2xl"
      style={{
        width: '280px',
        boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.6), inset 0 0 0 2px rgba(255,255,255,0.08)',
      }}
    >
      {/* Dynamic Island */}
      <div className="absolute top-[14px] left-1/2 -translate-x-1/2 z-20">
        <div className="bg-black rounded-full" style={{ width: '90px', height: '26px' }} />
      </div>

      {/* Screen */}
      <div className="relative bg-[hsl(30,15%,6%)] rounded-[30px] overflow-hidden" style={{ height: '480px' }}>
        <div className="flex flex-col items-center pt-14 px-5 gap-4">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-full gradient-gold flex items-center justify-center text-xl font-bold text-[hsl(30,15%,6%)]">
            T
          </div>
          {/* Name & Bio */}
          <div className="text-center">
            <p className="text-sm font-bold text-white">@titi</p>
            <p className="text-xs text-white/50 mt-1">Content Creator & Entrepreneur</p>
          </div>
          {/* Links */}
          <div className="w-full flex flex-col gap-2.5 mt-2">
            {[
              { icon: ShoppingBag, label: 'Shop My Favorites' },
              { icon: ExternalLink, label: 'Join My Team' },
              { icon: Sparkles, label: 'Free Starter Guide' },
            ].map((link, i) => (
              <motion.div
                key={link.label}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + i * 0.15 }}
                className="w-full rounded-xl py-3 px-4 flex items-center gap-3 gradient-gold"
                style={{ color: 'hsl(30,15%,6%)' }}
              >
                <link.icon size={15} />
                <span className="text-xs font-semibold">{link.label}</span>
              </motion.div>
            ))}
          </div>
          {/* Social row */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.3 }}
            className="flex gap-4 mt-3"
          >
            {['TikTok', 'IG', 'YT'].map((p) => (
              <div key={p} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white/60 font-medium">{p}</div>
            ))}
          </motion.div>
        </div>

        {/* Home indicator */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-[80px] h-[4px] bg-white/20 rounded-full" />
      </div>

      {/* Reflection */}
      <div
        className="absolute inset-0 pointer-events-none rounded-[40px]"
        style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 50%)' }}
      />
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
