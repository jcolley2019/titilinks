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
    <section className="py-24 px-4 relative">
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
            {t('problem.title')} <span className="italic gradient-text">{t('problem.title2')}</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
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
              className="relative p-8 rounded-2xl bg-card border border-border hover:border-primary/30 transition-colors group"
            >
              <div className="p-3 rounded-xl bg-primary/10 w-fit mb-4 group-hover:bg-primary/20 transition-colors">
                <problem.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{problem.title}</h3>
              <p className="text-muted-foreground">{problem.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
