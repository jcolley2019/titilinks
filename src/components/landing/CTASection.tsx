import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

export function CTASection() {
  const { t } = useLanguage();

  return (
    <section className="py-24 px-4">
      <div className="container max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative rounded-3xl glass-card border-primary/20 p-12 text-center overflow-hidden glow-gold"
        >
          {/* Ambient glows */}
          <div className="absolute top-0 left-1/4 w-64 h-64 bg-primary/8 rounded-full blur-[80px]" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-accent/8 rounded-full blur-[80px]" />
          
          <div className="relative z-10">
            <motion.div
              initial={{ scale: 0.9 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border-primary/20 mb-6"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">{t('cta.badge')}</span>
            </motion.div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
              {t('cta.title')} <span className="italic gradient-text">{t('cta.title2')}</span> {t('cta.title3')}
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
              {t('cta.description')}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" className="gradient-gold text-primary-foreground text-lg px-8 h-14 rounded-full shadow-lg shadow-primary/20">
                <Link to="/login">
                  {t('cta.button')}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg px-8 h-14 rounded-full glass border-primary/20">
                <a href="#demo">{t('cta.button2')}</a>
              </Button>
            </div>

            <p className="text-sm text-muted-foreground mt-6">{t('cta.note')}</p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
