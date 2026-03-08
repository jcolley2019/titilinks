import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sparkles, Users, Zap } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

export function HeroSection() {
  const { t } = useLanguage();

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20 pb-16 px-4">
      {/* Background with subtle gold glow */}
      <div className="absolute inset-0 bg-background" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      
      <div className="container relative z-10 max-w-6xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-foreground/5 border border-foreground/15 mb-8"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-foreground">{t('hero.badge')}</span>
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
          className="text-lg sm:text-xl italic text-muted-foreground max-w-2xl mx-auto mb-4"
        >
          {t('hero.subtitle')}
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="text-base text-muted-foreground max-w-xl mx-auto mb-10"
        >
          {t('hero.description')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col gap-3 justify-center items-center mb-8 max-w-md mx-auto px-2"
        >
          {/* Mobile: stacked layout. Desktop: inline pill */}
          <div className="hidden sm:flex w-full rounded-full bg-card border border-border overflow-hidden shadow-lg">
            <div className="flex items-center pl-5 pr-1 py-3 text-muted-foreground text-base whitespace-nowrap">
              titilinks.app/
            </div>
            <input
              type="text"
              placeholder={t('hero.handlePlaceholder')}
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-foreground text-base py-3 pr-2"
            />
            <Link to="/login" className="shrink-0">
              <Button size="lg" className="gradient-gold text-primary-foreground text-base px-6 h-full rounded-full font-semibold m-1">
                {t('hero.cta')}
              </Button>
            </Link>
          </div>

          {/* Mobile: clean stacked input + button */}
          <div className="flex sm:hidden flex-col w-full gap-3">
            <div className="flex items-center w-full rounded-2xl bg-card border border-border px-4 py-3.5 shadow-sm">
              <span className="text-muted-foreground text-[15px] mr-1">titilinks.app/</span>
              <input
                type="text"
                placeholder={t('hero.handlePlaceholder')}
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-foreground text-[15px]"
              />
            </div>
            <Button asChild size="lg" className="gradient-gold text-primary-foreground text-[15px] w-full h-14 rounded-2xl font-semibold shadow-md">
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
          className="flex items-center justify-center gap-6 text-sm text-muted-foreground"
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
    </section>
  );
}
