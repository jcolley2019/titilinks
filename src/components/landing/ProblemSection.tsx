import { motion } from 'framer-motion';
import { AlertCircle, Clock, BarChart3 } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

export function ProblemSection() {
  const { t } = useLanguage();

  const problems = [
    {
      icon: AlertCircle,
      title: t('problem.item1.title'),
      description: t('problem.item1.desc')
    },
    {
      icon: Clock,
      title: t('problem.item2.title'),
      description: t('problem.item2.desc')
    },
    {
      icon: BarChart3,
      title: t('problem.item3.title'),
      description: t('problem.item3.desc')
    }
  ];

  return (
    <section className="py-28 px-4 relative noise-overlay" style={{ backgroundColor: 'hsl(30, 15%, 6%)' }}>
      <div className="container max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-5 text-white tracking-tight">
            {t('problem.title')} <span className="italic gradient-text">{t('problem.title2')}</span>
          </h2>
          <p className="text-white/55 text-lg max-w-2xl mx-auto font-body">
            {t('problem.subtitle')}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {problems.map((problem, index) => (
            <motion.div
              key={problem.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="relative p-8 rounded-2xl border transition-all group"
              style={{ backgroundColor: 'hsl(30, 12%, 10%)', borderColor: 'hsl(43 65% 55% / 0.2)' }}
            >
              <div className="p-3 rounded-xl bg-[hsl(43,65%,55%)]/10 w-fit mb-4 group-hover:bg-[hsl(43,65%,55%)]/20 transition-colors">
                <problem.icon className="h-6 w-6" style={{ color: 'hsl(43, 65%, 55%)' }} />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-white">{problem.title}</h3>
              <p className="text-white/55 font-body leading-relaxed">{problem.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 section-glow-line" />
    </section>
  );
}
