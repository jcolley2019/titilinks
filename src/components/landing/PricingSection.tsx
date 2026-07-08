import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/hooks/useLanguage';

const BG = 'hsl(30 15% 6%)';
const SURFACE = 'hsl(30 12% 10%)';
const HAIRLINE = 'hsl(30 10% 16%)';
const GOLD = '#C9A55C';

export function PricingSection() {
  const { language } = useLanguage();
  const reduce = useReducedMotion();
  const tx = (en: string, es: string) => (language === 'es' ? es : en);
  const [isAnnual, setIsAnnual] = useState(false);

  const period = isAnnual ? tx('/mo, billed yearly', '/mes, anual') : tx('/month', '/mes');

  const plans = [
    {
      name: tx('Free', 'Gratis'),
      price: '$0',
      periodLabel: tx('/forever', '/siempre'),
      desc: tx('Everything you need to launch your first page.', 'Todo para lanzar tu primera página.'),
      features: [
        tx('1 page', '1 página'),
        tx('5 links', '5 enlaces'),
        tx('Basic themes', 'Temas básicos'),
        tx('Mobile-optimized', 'Optimizado para móvil'),
        tx('TitiLinks branding', 'Marca TitiLinks'),
      ],
      cta: tx('Get started free', 'Empieza gratis'),
      popular: false,
      comingSoon: false,
    },
    {
      name: 'Pro',
      price: isAnnual ? '$7' : '$9',
      periodLabel: period,
      desc: tx('Everything to grow your brand and audience.', 'Todo para hacer crecer tu marca y audiencia.'),
      features: [
        tx('Two pages', 'Dos páginas'),
        tx('Unlimited links', 'Enlaces ilimitados'),
        tx('All premium themes', 'Todos los temas premium'),
        tx('Full analytics', 'Analíticas completas'),
        tx('Custom domain', 'Dominio propio'),
        tx('Email subscribe block', 'Bloque de suscripción'),
        tx('Remove branding', 'Sin marca TitiLinks'),
      ],
      cta: tx('Get started', 'Comenzar'),
      popular: true,
      comingSoon: false,
    },
    {
      name: 'Business',
      price: isAnnual ? '$15' : '$19',
      periodLabel: period,
      desc: tx('For teams and agencies managing creators.', 'Para equipos y agencias con varios creadores.'),
      features: [
        tx('Everything in Pro', 'Todo lo de Pro'),
        tx('Team collaboration', 'Colaboración en equipo'),
        tx('White-label', 'Marca blanca'),
        tx('API access', 'Acceso a API'),
        tx('Priority support', 'Soporte prioritario'),
      ],
      cta: tx('Coming soon', 'Próximamente'),
      popular: false,
      comingSoon: true,
    },
  ];

  const reveal = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 20 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '-60px' },
          transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <section id="pricing" className="relative px-5 py-24 sm:py-32" style={{ backgroundColor: BG }}>
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <motion.div {...reveal(0)} className="mx-auto max-w-2xl text-center">
          <div className="mb-5 flex items-center justify-center gap-3">
            <span className="h-px w-7" style={{ backgroundColor: GOLD }} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: GOLD }}>
              {tx('Pricing', 'Precios')}
            </p>
            <span className="h-px w-7" style={{ backgroundColor: GOLD }} />
          </div>
          <h2 className="font-display text-4xl font-semibold leading-[1.05] text-white sm:text-5xl">
            {tx('Start free, ', 'Empieza gratis, ')}
            <span style={{ color: GOLD }}>{tx('upgrade when you’re ready', 'mejora cuando quieras')}</span>.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base text-white/55 sm:text-lg">
            {tx('No hidden fees. Cancel anytime.', 'Sin cargos ocultos. Cancela cuando quieras.')}
          </p>

          {/* Billing toggle */}
          <div className="mt-8 flex items-center justify-center gap-4">
            <span className={`text-sm font-medium ${!isAnnual ? 'text-white' : 'text-white/45'}`}>{tx('Monthly', 'Mensual')}</span>
            <button
              onClick={() => setIsAnnual((v) => !v)}
              aria-label={tx('Toggle annual billing', 'Cambiar a facturación anual')}
              className="relative h-7 w-14 rounded-full transition-colors"
              style={{ backgroundColor: isAnnual ? GOLD : 'hsl(30 12% 20%)' }}
            >
              <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform ${isAnnual ? 'translate-x-7' : ''}`} />
            </button>
            <span className={`text-sm font-medium ${isAnnual ? 'text-white' : 'text-white/45'}`}>{tx('Annual', 'Anual')}</span>
            {isAnnual && (
              <span className="ml-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: `${GOLD}22`, color: GOLD }}>
                {tx('Save 20%', 'Ahorra 20%')}
              </span>
            )}
          </div>
        </motion.div>

        {/* Plans */}
        <div className="mt-14 grid items-stretch gap-5 md:grid-cols-3">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              {...reveal(0.08 * (i + 1))}
              className="relative flex flex-col rounded-3xl p-6 sm:p-7"
              style={{
                backgroundColor: SURFACE,
                border: plan.popular ? `1px solid ${GOLD}80` : `1px solid ${HAIRLINE}`,
                boxShadow: plan.popular ? `0 0 50px -16px ${GOLD}66` : 'none',
                opacity: plan.comingSoon ? 0.72 : 1,
              }}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: GOLD, color: BG }}>
                  <Crown className="h-3.5 w-3.5" /> {tx('Most popular', 'Más popular')}
                </span>
              )}
              {plan.comingSoon && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-white/70" style={{ backgroundColor: 'hsl(30 10% 22%)' }}>
                  {tx('Coming soon', 'Próximamente')}
                </span>
              )}

              <div className="flex-1">
                <h3 className="font-display text-2xl font-semibold text-white">{plan.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">{plan.price}</span>
                  <span className="text-sm text-white/45">{plan.periodLabel}</span>
                </div>
                <p className="mt-3 text-sm text-white/55">{plan.desc}</p>

                <ul className="mt-6 flex flex-col gap-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5">
                      <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full" style={{ backgroundColor: `${GOLD}22` }}>
                        <Check className="h-3 w-3" style={{ color: GOLD }} />
                      </span>
                      <span className="text-sm text-white/80">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8">
                {plan.comingSoon ? (
                  <button
                    disabled
                    className="w-full cursor-default rounded-full py-2.5 text-sm font-semibold text-white/45"
                    style={{ border: `1px solid ${HAIRLINE}` }}
                  >
                    {plan.cta}
                  </button>
                ) : (
                  <Link
                    to="/login?mode=signup"
                    className="block w-full rounded-full py-2.5 text-center text-sm font-semibold transition-transform duration-150 hover:-translate-y-px active:scale-[0.99]"
                    style={
                      plan.popular
                        ? { backgroundColor: GOLD, color: BG }
                        : { border: `1px solid ${GOLD}`, color: GOLD }
                    }
                  >
                    {plan.cta}
                  </Link>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
