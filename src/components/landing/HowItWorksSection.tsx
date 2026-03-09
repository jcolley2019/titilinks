import { motion } from 'framer-motion';
import { UserPlus, Paintbrush, Share2 } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

export function HowItWorksSection() {
  const { t } = useLanguage();

  const steps = [
    { icon: UserPlus, step: '01', title: t('how.step1.title'), description: t('how.step1.desc') },
    { icon: Paintbrush, step: '02', title: t('how.step2.title'), description: t('how.step2.desc') },
    { icon: Share2, step: '03', title: t('how.step3.title'), description: t('how.step3.desc') }
  ];

  return (
    <section className="py-24 px-4 relative mesh-gradient-soft noise-overlay">
      <div className="container max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            {t('how.title')} <span className="italic gradient-text">{t('how.title2')}</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t('how.subtitle')}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-px bg-gradient-to-r from-primary/50 via-primary to-primary/50" />

          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="relative text-center"
            >
              <div className="relative z-10 w-32 h-32 mx-auto mb-6 rounded-full glass-card flex items-center justify-center glow-gold border-2 border-primary/20">
                <step.icon className="h-12 w-12 text-primary" />
                <span className="absolute -top-2 -right-2 w-8 h-8 rounded-full gradient-gold text-primary-foreground text-sm font-bold flex items-center justify-center shadow-lg">
                  {step.step}
                </span>
              </div>
              <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
              <p className="text-muted-foreground">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 section-glow-line" />
    </section>
  );
}
