import { motion } from 'framer-motion';
import { Palette, BarChart2, Layers, Zap, Shield } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

export function FeaturesSection() {
  const { t } = useLanguage();

  const features = [
    {
      icon: Palette,
      title: t('features.themes.title'),
      description: t('features.themes.desc')
    },
    {
      icon: BarChart2,
      title: t('features.analytics.title'),
      description: t('features.analytics.desc')
    },
    {
      icon: Layers,
      title: t('features.modes.title'),
      description: t('features.modes.desc')
    },
    {
      icon: Zap,
      title: t('features.speed.title'),
      description: t('features.speed.desc')
    },
    {
      icon: Shield,
      title: t('features.privacy.title'),
      description: t('features.privacy.desc')
    }
  ];

  return (
    <section id="features" className="py-24 px-4 relative">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/30 to-background" />
      
      <div className="container max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            {t('features.title')}{' '}
            <span className="italic gradient-text">{t('features.title2')}</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t('features.subtitle')}
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all group"
            >
              <div className="p-3 rounded-xl bg-primary/10 w-fit mb-4 group-hover:bg-primary/20 transition-colors">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
