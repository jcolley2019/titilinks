import { motion, useReducedMotion } from 'framer-motion';
import { Crown, Eye, MousePointerClick, TrendingUp, Check, type LucideIcon } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

const BG = 'hsl(30 15% 6%)';
const SURFACE = 'hsl(30 12% 10%)';
const HAIRLINE = 'hsl(30 10% 16%)';
const GOLD = '#C9A55C';

function PanelLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">{children}</p>;
}

function Stat({ Icon, label, value, delta }: { Icon: LucideIcon; label: string; value: string; delta: string }) {
  return (
    <div className="rounded-2xl p-3" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIRLINE}` }}>
      <Icon className="h-4 w-4" style={{ color: GOLD }} />
      <p className="mt-2 text-[10px] uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-0.5 text-lg font-bold leading-none text-white">{value}</p>
      <p className="mt-1 text-[10px] font-semibold" style={{ color: '#5EC2A0' }}>
        ▲ {delta}
      </p>
    </div>
  );
}

export function KnowWhatWorksSection() {
  const { language } = useLanguage();
  const reduce = useReducedMotion();
  const tx = (en: string, es: string) => (language === 'es' ? es : en);

  const reveal = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 20 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '-60px' },
          transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  const destinations = [
    { domain: 'instagram.com', pct: 100, count: '1,204' },
    { domain: 'shop.maya.co', pct: 70, count: '842' },
    { domain: 'youtube.com', pct: 42, count: '510' },
    { domain: 'open.spotify.com', pct: 26, count: '318' },
  ];

  const sources = [
    { label: 'TikTok', pct: 48, color: '#2DD4BF' },
    { label: 'Instagram', pct: 31, color: '#E1306C' },
    { label: tx('Direct', 'Directo'), pct: 21, color: GOLD },
  ];

  const features = [
    tx('Views & clicks, 7- and 30-day', 'Vistas y clics, 7 y 30 días'),
    tx('Click-through rate', 'Tasa de clics'),
    tx('Top destinations, ranked', 'Destinos principales, ordenados'),
    tx('Traffic by source — TikTok, Instagram, direct', 'Tráfico por fuente: TikTok, Instagram, directo'),
    tx('Short-link & goal tracking', 'Seguimiento de short-links y metas'),
  ];

  return (
    <section className="relative overflow-hidden px-5 py-24 sm:py-32" style={{ backgroundColor: BG }}>
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(45% 45% at 24% 50%, ${GOLD}12 0%, transparent 60%)` }} />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Dashboard card — left on desktop */}
        <motion.div
          {...reveal(0.1)}
          className="order-2 rounded-3xl p-5 sm:p-6 lg:order-1"
          style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}`, boxShadow: '0 24px 60px -24px rgba(0,0,0,0.7)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
              {tx('Analytics', 'Analíticas')}
            </p>
            <div className="flex items-center gap-2">
              <span className="rounded-full px-2.5 py-0.5 text-[10px] font-medium text-white/55" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                {tx('7 days', '7 días')}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: GOLD, color: BG }}>
                <Crown className="h-3 w-3" /> PRO
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <Stat Icon={Eye} label={tx('Views', 'Vistas')} value="12,480" delta="18%" />
            <Stat Icon={MousePointerClick} label={tx('Clicks', 'Clics')} value="3,140" delta="12%" />
            <Stat Icon={TrendingUp} label={tx('Click rate', 'Tasa')} value="25.2%" delta="4%" />
          </div>

          {/* Top destinations */}
          <div className="mt-5">
            <PanelLabel>{tx('Top destinations', 'Destinos principales')}</PanelLabel>
            <div className="mt-3 flex flex-col gap-2.5">
              {destinations.map((d) => (
                <div key={d.domain} className="flex items-center gap-3">
                  <span className="w-28 flex-shrink-0 truncate text-[12px] text-white/70">{d.domain}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full" style={{ width: `${d.pct}%`, backgroundColor: GOLD }} />
                  </div>
                  <span className="w-10 flex-shrink-0 text-right text-[11px] text-white/50">{d.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Traffic sources */}
          <div className="mt-5">
            <PanelLabel>{tx('Traffic sources', 'Fuentes de tráfico')}</PanelLabel>
            <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full">
              {sources.map((s) => (
                <div key={s.label} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
              {sources.map((s) => (
                <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-white/55">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.label} {s.pct}%
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Copy — right on desktop */}
        <motion.div {...reveal(0)} className="order-1 flex flex-col items-center text-center lg:order-2 lg:items-start lg:text-left">
          <div className="mb-5 flex items-center gap-3">
            <span className="h-px w-7" style={{ backgroundColor: GOLD }} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: GOLD }}>
              {tx('Know what works', 'Conoce qué funciona')}
            </p>
          </div>
          <h2 className="font-display text-4xl font-semibold leading-[1.05] text-white sm:text-5xl">
            {tx('Know what’s ', 'Sabe qué está ')}
            <span style={{ color: GOLD }}>{tx('working', 'funcionando')}</span>.
          </h2>
          <p className="mt-5 max-w-md text-base text-white/55 sm:text-lg">
            {tx(
              'Real-time views and clicks, your best-performing links, and exactly where your audience comes from.',
              'Vistas y clics en tiempo real, tus enlaces con mejor rendimiento y de dónde viene tu audiencia.'
            )}
          </p>
          <p className="mt-3 text-sm font-medium" style={{ color: GOLD }}>
            {tx('Included with Pro & Business.', 'Incluido con Pro y Business.')}
          </p>
          <ul className="mt-7 flex flex-col gap-3">
            {features.map((f, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full" style={{ backgroundColor: `${GOLD}22` }}>
                  <Check className="h-3 w-3" style={{ color: GOLD }} />
                </span>
                <span className="text-sm text-white/75">{f}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </section>
  );
}
