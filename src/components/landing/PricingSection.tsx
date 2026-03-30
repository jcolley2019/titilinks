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
      features: ['1 page', '5 links', 'Basic themes', 'Mobile optimized', 'TitiLinks branding'],
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
      cta: 'Inquire Early Access',
      popular: false,
      comingSoon: true
    }
  ];

  return (
    <section id="pricing" className="py-32 px-4 relative noise-overlay" style={{ background: 'hsl(30 15% 6%)' }}>
      <div className="container max-w-6xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-5xl font-bold mb-5 text-white tracking-tight">
            Simple, <span className="italic gradient-text">transparent</span> pricing
          </h2>
          <p className="text-white/55 text-lg max-w-2xl mx-auto mb-8 font-body">
            Start free, upgrade when you're ready. No hidden fees, cancel anytime.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4">
            <span className={`text-sm font-medium ${!isAnnual ? 'text-white' : 'text-white/50'}`}>
              Monthly
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className="relative w-14 h-7 rounded-full transition-colors"
              style={{ background: isAnnual ? 'hsl(43 65% 55%)' : 'hsl(30 12% 20%)' }}
            >
              <span className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${isAnnual ? 'translate-x-7' : 'translate-x-0'}`} />
            </button>
            <span className={`text-sm font-medium ${isAnnual ? 'text-white' : 'text-white/50'}`}>
              Annual
            </span>
            {isAnnual && (
              <span className="ml-2 px-2 py-1 text-xs font-medium rounded-full gradient-gold text-primary-foreground">
                Save 20%
              </span>
            )}
          </div>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 items-stretch">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="relative p-8 rounded-2xl h-full flex flex-col"
              style={{
                background: 'hsl(30 12% 10%)',
                border: plan.comingSoon
                  ? '1px solid hsl(0 0% 50% / 0.3)'
                  : plan.popular
                    ? '1px solid hsl(43 65% 55% / 0.5)'
                    : '1px solid hsl(43 65% 55% / 0.2)',
                boxShadow: plan.popular ? '0 0 40px hsl(43 65% 55% / 0.15)' : 'none',
                opacity: plan.comingSoon ? 0.6 : 1
              }}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full gradient-gold text-primary-foreground text-sm font-medium shadow-lg">
                  Most Popular
                </div>
              )}
              {plan.comingSoon && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-sm font-medium shadow-lg" style={{ background: 'hsl(0 0% 40%)', color: 'white' }}>
                  Coming Soon
                </div>
              )}

              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-2 text-white">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-4xl font-bold text-white">{isAnnual ? plan.annualPrice : plan.monthlyPrice}</span>
                  <span className="text-white/50">{plan.period}</span>
                </div>
                <p className="text-white/55 mb-6 font-body">{plan.description}</p>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <Check className="h-5 w-5 flex-shrink-0" style={{ color: 'hsl(43 65% 55%)' }} />
                      <span className="text-sm text-white font-body">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                {plan.comingSoon && (
                  <p className="text-center text-xs italic text-white/40 mb-3">Be first to know when Business launches</p>
                )}
                <Button
                  asChild
                  className={`w-full rounded-full ${plan.popular ? 'gradient-gold text-primary-foreground shadow-lg shadow-primary/20' : ''}`}
                  variant={plan.popular ? 'default' : 'outline'}
                  style={
                    plan.comingSoon
                      ? { borderColor: 'hsl(0 0% 50% / 0.5)', color: 'hsl(0 0% 70%)' }
                      : !plan.popular
                        ? { borderColor: 'hsl(43 65% 55%)', color: 'hsl(43 65% 55%)' }
                        : {}
                  }
                >
                  <Link to="/login">{plan.cta}</Link>
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 section-glow-line" />
    </section>
  );
}
