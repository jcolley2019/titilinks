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
      name: 'Free',
      monthlyPrice: '$0',
      annualPrice: '$0',
      period: '/forever',
      description: 'Perfect for getting started with your first biolink page.',
      features: ['1 page', '5 links', 'Basic themes', 'Mobile optimized', 'TitiLINKS branding'],
      cta: 'Get Started Free',
      popular: false,
      comingSoon: false
    },
    {
      name: 'Pro',
      monthlyPrice: '$9',
      annualPrice: '$7',
      period: isAnnual ? '/mo (billed annually)' : '/month',
      description: 'Everything you need to grow your brand and audience.',
      features: ['2 pages (Shop + Recruit)', 'Unlimited links', 'All premium themes', 'Full analytics dashboard', 'Custom domain', 'AI bio generator', 'Email subscribe block', 'Remove branding'],
      cta: 'Start Pro Trial',
      popular: true,
      comingSoon: false
    },
    {
      name: 'Business',
      monthlyPrice: '$19',
      annualPrice: '$15',
      period: isAnnual ? '/mo (billed annually)' : '/month',
      description: 'For teams and agencies managing multiple creators.',
      features: ['Everything in Pro', 'Team collaboration', 'Priority support', 'White-label option', 'API access', 'Dedicated account manager', 'SLA guarantee'],
      cta: 'Contact Sales',
      popular: false,
      comingSoon: false
    }
  ];

  return (
    <section id="pricing" className="py-24 px-4 relative mesh-gradient-rich noise-overlay">
      <div className="container max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Simple, <span className="italic gradient-text">transparent</span> pricing
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
            Start free, upgrade when you're ready. No hidden fees, cancel anytime.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4">
            <span className={`text-sm font-medium ${!isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>
              Monthly
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className={`relative w-14 h-7 rounded-full transition-colors ${isAnnual ? 'bg-primary' : 'bg-muted'}`}
            >
              <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-background transition-transform ${isAnnual ? 'translate-x-7' : 'translate-x-0'}`} />
            </button>
            <span className={`text-sm font-medium ${isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}>
              Annual
            </span>
            {isAnnual && (
              <span className="ml-2 px-2 py-1 text-xs font-medium rounded-full gradient-gold text-primary-foreground">
                Save 20%
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
              className={`relative p-8 rounded-2xl glass-card ${
                plan.popular ? 'border-primary/40 glow-gold' : ''
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full gradient-gold text-primary-foreground text-sm font-medium shadow-lg">
                  {t('pricing.popular')}
                </div>
              )}
              {plan.comingSoon && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full glass text-muted-foreground text-sm font-medium">
                  {t('pricing.comingSoon')}
                </div>
              )}

              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold">{isAnnual ? plan.annualPrice : plan.monthlyPrice}</span>
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
                className={`w-full rounded-full ${plan.popular ? 'gradient-gold text-primary-foreground shadow-lg shadow-primary/20' : ''}`}
                variant={plan.popular ? 'default' : 'outline'}
              >
                <Link to="/login">{plan.cta}</Link>
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 section-glow-line" />
    </section>
  );
}
