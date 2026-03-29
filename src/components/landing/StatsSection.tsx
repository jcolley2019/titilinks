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
    <section className="py-20 px-4 relative" style={{ backgroundColor: 'hsl(30, 12%, 10%)' }}>
      <div className="container max-w-6xl mx-auto">
        <div className="rounded-3xl glass-card p-12 glow-gold relative overflow-hidden" style={{ borderColor: 'hsl(43 65% 55% / 0.2)' }}>
          {/* Internal ambient glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[200px] bg-primary/8 rounded-full blur-[80px]" />
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12 relative z-10"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-5 text-white tracking-tight">
              {t('stats.title')} <span className="italic gradient-text">{t('stats.title2')}</span>
            </h2>
            <p className="text-white/50 text-lg font-body">
              {t('stats.subtitle')}
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 text-center relative z-10">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <p className="text-5xl sm:text-7xl font-bold mb-3 tracking-tight" style={{ color: 'hsl(43, 65%, 55%)' }}>
                  {stat.value}
                </p>
                <p className="text-lg font-semibold mb-1 text-white font-body uppercase tracking-wider">{stat.label}</p>
                <p className="text-sm text-white/50 font-body">{stat.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
