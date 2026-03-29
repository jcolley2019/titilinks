import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles, Users, Zap, ShoppingBag, ExternalLink } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

function SocialIcon({ platform }: { platform: string }) {
  const s = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'currentColor', xmlns: 'http://www.w3.org/2000/svg' } as const;
  if (platform === 'tiktok') return <svg {...s}><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1 0-5.78 2.92 2.92 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 3 15.57 6.33 6.33 0 0 0 9.37 22a6.33 6.33 0 0 0 6.38-6.22V9.06a8.16 8.16 0 0 0 3.84.96V6.69Z"/></svg>;
  if (platform === 'instagram') return <svg {...s}><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.97.24 2.44.41a4.07 4.07 0 0 1 1.51.98c.46.46.77.93.98 1.51.17.47.36 1.27.41 2.44.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.24 1.97-.41 2.44a4.07 4.07 0 0 1-.98 1.51 4.07 4.07 0 0 1-1.51.98c-.47.17-1.27.36-2.44.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.97-.24-2.44-.41a4.07 4.07 0 0 1-1.51-.98 4.07 4.07 0 0 1-.98-1.51c-.17-.47-.36-1.27-.41-2.44C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.24-1.97.41-2.44a4.07 4.07 0 0 1 .98-1.51 4.07 4.07 0 0 1 1.51-.98c.47-.17 1.27-.36 2.44-.41C8.84 2.17 9.22 2.16 12 2.16ZM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.98 5.98 0 0 0-2.18 1.33A5.98 5.98 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91a5.98 5.98 0 0 0 1.33 2.18 5.98 5.98 0 0 0 2.18 1.33c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.98 5.98 0 0 0 2.18-1.33 5.98 5.98 0 0 0 1.33-2.18c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.98 5.98 0 0 0-1.33-2.18A5.98 5.98 0 0 0 19.86.63C19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0Zm0 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.41-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88Z"/></svg>;
  return <svg {...s}><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19 31.68 31.68 0 0 0 0 12a31.68 31.68 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.84.5 9.38.55 9.38.55s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14A31.68 31.68 0 0 0 24 12a31.68 31.68 0 0 0-.5-5.81ZM9.6 15.6V8.4L15.84 12 9.6 15.6Z"/></svg>;
}

function PhoneMockup() {
  return (
    <div className="relative">
      {/* Floating badge: clicks */}
      <motion.div
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.2, duration: 0.4 }}
        className="absolute -top-3 -right-10 z-30 px-3 py-1.5 rounded-full bg-white shadow-lg shadow-black/10 flex items-center gap-1.5"
      >
        <span className="text-xs font-bold text-primary">+127</span>
        <span className="text-[10px] font-medium text-muted-foreground">clicks today</span>
      </motion.div>

      {/* Floating badge: setup time */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.4, duration: 0.4 }}
        className="absolute -bottom-2 -left-8 z-30 px-3 py-1.5 rounded-full bg-white shadow-lg shadow-black/10 flex items-center gap-1.5"
      >
        <span className="text-xs">⚡</span>
        <span className="text-[10px] font-bold text-primary">Setup in 2 min</span>
      </motion.div>

      {/* Phone frame */}
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
          <div className="flex flex-col items-center pt-14 px-5 gap-3">
            {/* Avatar — real photo */}
            <div className="w-16 h-16 rounded-full overflow-hidden ring-2 ring-primary/40">
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400"
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            {/* Name & Bio */}
            <div className="text-center">
              <p className="text-sm font-bold text-white">@titi</p>
              <p className="text-[11px] text-white/50 mt-0.5">Content Creator & Entrepreneur</p>
            </div>
            {/* Links */}
            <div className="w-full flex flex-col gap-2 mt-1">
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
                  className="w-full rounded-xl py-2.5 px-4 flex items-center gap-3 gradient-gold"
                  style={{ color: 'hsl(30,15%,6%)' }}
                >
                  <link.icon size={14} />
                  <span className="text-xs font-semibold">{link.label}</span>
                </motion.div>
              ))}
            </div>
            {/* Social row — SVG icons */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.3 }}
              className="flex gap-3 mt-2"
            >
              {(['tiktok', 'instagram', 'youtube'] as const).map((p) => (
                <div key={p} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60">
                  <SocialIcon platform={p} />
                </div>
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
