import { motion } from 'framer-motion';
import { useLanguage } from '@/hooks/useLanguage';

export function StatsSection() {
  const { t } = useLanguage();

  const stats = [
    { value: '47%', label: t('stats.ctr'), description: t('stats.ctr.desc') },
    { value: '2.8x', label: t('stats.conversions'), description: t('stats.conversions.desc') },
    { value: '89ms', label: t('stats.load'), description: t('stats.load.desc') }
  ];

  return (
    <section className="py-24 px-4">
      <div className="container max-w-6xl mx-auto">
        <div className="rounded-3xl bg-card border border-primary/20 p-12 glow-gold">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              {t('stats.title')} <span className="italic gradient-text">{t('stats.title2')}</span>
            </h2>
            <p className="text-muted-foreground text-lg">
              {t('stats.subtitle')}
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 text-center">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <p className="text-5xl sm:text-6xl font-bold gradient-text mb-2">
                  {stat.value}
                </p>
                <p className="text-xl font-semibold mb-1">{stat.label}</p>
                <p className="text-sm text-muted-foreground">{stat.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
