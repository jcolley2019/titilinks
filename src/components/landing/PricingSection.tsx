import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/hooks/useLanguage';
import { useState } from 'react';

export function PricingSection() {
  const { t } = useLanguage();
  const [isAnnual, setIsAnnual] = useState(false);

  const plans = [
    {
      name: t('pricing.free'),
      monthlyPrice: '$0',
      annualPrice: '$0',
      period: t('pricing.free.period'),
      description: t('pricing.free.desc'),
      features: [
        'Unlimited links',
        '1 custom page',
        'Basic analytics',
        'Standard themes',
        'Mobile optimized'
      ],
      cta: t('pricing.cta.free'),
      popular: false,
      comingSoon: false
    },
    {
      name: t('pricing.pro'),
      monthlyPrice: '$8',
      annualPrice: '$5',
      period: isAnnual ? t('pricing.period.annual') : t('pricing.period.monthly'),
      description: t('pricing.pro.desc'),
      features: [
        'Everything in Free',
        'Unlimited pages',
        'Advanced analytics',
        'Custom themes',
        'Mode switching',
        'Priority support',
        'Remove branding'
      ],
      cta: t('pricing.cta.pro'),
      popular: true
    },
    {
      name: t('pricing.premium'),
      monthlyPrice: '$30',
      annualPrice: '$25',
      period: isAnnual ? t('pricing.period.annual') : t('pricing.period.monthly'),
      description: t('pricing.premium.desc'),
      features: [
        'Everything in Pro',
        'Team collaboration',
        'API access',
        'Custom domain',
        'White-label option',
        'Dedicated support',
        'SLA guarantee'
      ],
      cta: t('pricing.cta.premium'),
      popular: false,
      comingSoon: true
    }
    }
  ];

  return (
    <section id="pricing" className="py-24 px-4">
      <div className="container max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            {t('pricing.title')} <span className="italic gradient-text">{t('pricing.title2')}</span> {t('pricing.title3')}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
            {t('pricing.subtitle')}
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4">
            <span className={`text-sm font-medium ${!isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>
              {t('pricing.monthly')}
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className={`relative w-14 h-7 rounded-full transition-colors ${
                isAnnual ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-background transition-transform ${
                  isAnnual ? 'translate-x-7' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>
              {t('pricing.annual')}
            </span>
            {isAnnual && (
              <span className="ml-2 px-2 py-1 text-xs font-medium rounded-full gradient-gold text-primary-foreground">
                {t('pricing.save')}
              </span>
            )}
          </div>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative p-8 rounded-2xl border ${
                plan.popular 
                  ? 'border-primary/50 bg-card glow-gold' 
                  : 'border-border bg-card'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full gradient-gold text-primary-foreground text-sm font-medium">
                  {t('pricing.popular')}
                </div>
              )}
              {plan.comingSoon && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-muted text-muted-foreground text-sm font-medium border border-border">
                  {t('pricing.comingSoon')}
                </div>
              )}

              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold">
                  {isAnnual ? plan.annualPrice : plan.monthlyPrice}
                </span>
                <span className="text-muted-foreground">{plan.period}</span>
              </div>
              <p className="text-muted-foreground mb-6">{plan.description}</p>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-primary flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                className={`w-full rounded-full ${
                  plan.popular ? 'gradient-gold text-primary-foreground' : ''
                }`}
                variant={plan.popular ? 'default' : 'outline'}
              >
                <Link to="/login">{plan.cta}</Link>
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
