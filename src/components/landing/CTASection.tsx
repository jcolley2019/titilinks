import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

export function CTASection() {
  const { t } = useLanguage();

  return (
    <section className="py-32 px-4 relative" style={{ background: 'hsl(30 12% 10%)' }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, hsl(43 65% 55% / 0.08) 0%, transparent 70%)' }} />
      <div className="container max-w-4xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative rounded-3xl p-12 text-center overflow-hidden"
          style={{ background: 'hsl(30 15% 6%)', border: '1px solid hsl(43 65% 55% / 0.2)', boxShadow: '0 0 60px hsl(43 65% 55% / 0.1)' }}
        >
          {/* Ambient glows */}
          <div className="absolute top-0 left-1/4 w-64 h-64 rounded-full blur-[80px]" style={{ background: 'hsl(43 65% 55% / 0.08)' }} />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 rounded-full blur-[80px]" style={{ background: 'hsl(43 65% 55% / 0.05)' }} />

          <div className="relative z-10">
            <motion.div
              initial={{ scale: 0.9 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
              style={{ background: 'hsl(30 12% 10%)', border: '1px solid hsl(43 65% 55% / 0.3)' }}
            >
              <Sparkles className="h-4 w-4" style={{ color: 'hsl(43 65% 55%)' }} />
              <span className="section-label">{t('cta.badge')}</span>
            </motion.div>

            <h2 className="text-3xl sm:text-4xl md:text-6xl font-bold mb-8 text-white tracking-tight">
              {t('cta.title')} <span className="italic gradient-text">{t('cta.title2')}</span> {t('cta.title3')}
            </h2>
            <p className="text-lg text-white/55 max-w-xl mx-auto mb-10 font-body">
              {t('cta.description')}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="gradient-gold text-primary-foreground text-lg px-8 h-14 rounded-full shadow-lg shadow-primary/20">
                <Link to="/login">
                  {t('cta.button')}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg px-8 h-14 rounded-full" style={{ borderColor: 'hsl(43 65% 55%)', color: 'hsl(43 65% 55%)' }}>
                <a href="#demo">{t('cta.button2')}</a>
              </Button>
            </div>

            <p className="text-sm text-white/60 mt-6">{t('cta.note')}</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
