import { motion } from 'framer-motion';
import { useLanguage } from '@/hooks/useLanguage';
import { Sparkles, BarChart3, Repeat2 } from 'lucide-react';

const benefits = [
  {
    icon: Sparkles,
    title: 'AI-Powered Setup',
    description: 'Build your entire page in minutes with AI-generated copy and smart link suggestions.',
  },
  {
    icon: BarChart3,
    title: 'Real Analytics',
    description: 'See exactly which links convert and where your audience comes from.',
  },
  {
    icon: Repeat2,
    title: 'Dual Page System',
    description: 'One link that shows different content to shoppers vs. team recruits automatically.',
  },
];

export function SolutionSection() {
  const { t } = useLanguage();

  return (
    <section className="py-24 px-4 relative mesh-gradient-soft">
      <div className="container max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            {t('solution.title')}{' '}
            <span className="italic gradient-text">{t('solution.title2')}</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {t('solution.description')}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {benefits.map((benefit, index) => (
            <motion.div
              key={benefit.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="p-8 rounded-2xl glass-card text-center hover:shadow-lg hover:shadow-primary/5 transition-all"
            >
              <div className="w-14 h-14 rounded-xl gradient-gold flex items-center justify-center mx-auto mb-5 shadow-lg shadow-primary/20">
                <benefit.icon className="h-7 w-7 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-foreground">{benefit.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{benefit.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 section-glow-line" />
    </section>
  );
}
