import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Bookmark, Check } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import bgImage from '@/assets/demo-creator-b.webp';

const BG = 'hsl(30 15% 6%)';
const SURFACE = 'hsl(30 12% 10%)';
const HAIRLINE = 'hsl(30 10% 16%)';
const GOLD = '#C9A55C';

const THEMES = [
  { name: 'Gold', accent: '#C9A55C' },
  { name: 'Sunset', accent: '#FF6B5A' },
  { name: 'Ocean', accent: '#4FA3D1' },
  { name: 'Violet', accent: '#B69CFF' },
  { name: 'Emerald', accent: '#5EC2A0' },
];

const FONTS = [
  { name: 'Playfair', css: "'Playfair Display', serif" },
  { name: 'DM Sans', css: "'DM Sans', sans-serif" },
  { name: 'Bebas Neue', css: "'Bebas Neue', sans-serif" },
  { name: 'Pacifico', css: "'Pacifico', cursive" },
];

function PanelLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">{children}</p>;
}

export function MakeItYoursSection() {
  const { language } = useLanguage();
  const reduce = useReducedMotion();
  const tx = (en: string, es: string) => (language === 'es' ? es : en);
  const [active, setActive] = useState(0);
  const accent = THEMES[active].accent;

  const reveal = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 20 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, margin: '-60px' },
          transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  const features = [
    tx('7 ready-made themes', '7 temas listos para usar'),
    tx('14 fonts, from elegant to bold', '14 fuentes, de elegante a atrevida'),
    tx('Color, gradient & image backgrounds', 'Fondos de color, degradado e imagen'),
    tx('Save your own custom themes', 'Guarda tus propios temas'),
  ];

  return (
    <section className="relative overflow-hidden px-5 py-24 sm:py-32" style={{ backgroundColor: BG }}>
      {/* faint spotlight behind the panel */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(45% 45% at 78% 50%, ${accent}14 0%, transparent 60%)`, transition: 'background 400ms ease' }}
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Left — copy */}
        <motion.div {...reveal(0)} className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <div className="mb-5 flex items-center gap-3">
            <span className="h-px w-7" style={{ backgroundColor: GOLD }} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: GOLD }}>
              {tx('Make it yours', 'Hazlo tuyo')}
            </p>
          </div>
          <h2 className="font-display text-4xl font-semibold leading-[1.05] text-white sm:text-5xl">
            {tx('Make it unmistakably ', 'Hazlo inconfundiblemente ')}
            <span style={{ color: GOLD }}>{tx('yours', 'tuyo')}</span>.
          </h2>
          <p className="mt-5 max-w-md text-base text-white/55 sm:text-lg">
            {tx(
              'Themes, fonts, colors, gradients, backgrounds, button styles — tune every detail until the page looks like no one else’s.',
              'Temas, fuentes, colores, degradados, fondos, estilos de botón: ajusta cada detalle hasta que tu página no se parezca a ninguna otra.'
            )}
          </p>
          <ul className="mt-7 flex flex-col gap-3">
            {features.map((f, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full" style={{ backgroundColor: `${accent}22` }}>
                  <Check className="h-3 w-3" style={{ color: accent }} />
                </span>
                <span className="text-sm text-white/75">{f}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        {/* Right — design studio panel */}
        <motion.div
          {...reveal(0.1)}
          className="rounded-3xl p-5 sm:p-6"
          style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}`, boxShadow: '0 24px 60px -24px rgba(0,0,0,0.7)' }}
        >
          {/* Theme */}
          <PanelLabel>{tx('Theme', 'Tema')}</PanelLabel>
          <div className="mt-2.5 flex gap-2.5">
            {THEMES.map((th, i) => (
              <button
                key={th.name}
                onClick={() => setActive(i)}
                aria-label={th.name}
                className="h-9 w-9 rounded-full transition-transform hover:scale-105"
                style={{
                  background: `linear-gradient(135deg, ${th.accent}, ${BG})`,
                  boxShadow: i === active ? `0 0 0 2px ${SURFACE}, 0 0 0 4px ${th.accent}` : 'none',
                }}
              />
            ))}
          </div>

          {/* Typeface */}
          <div className="mt-5">
            <PanelLabel>{tx('Typeface', 'Tipografía')}</PanelLabel>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            {FONTS.map((f) => (
              <div key={f.name} className="flex items-center justify-center rounded-xl py-2.5" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIRLINE}` }}>
                <span className="text-[19px] leading-none text-white" style={{ fontFamily: f.css }}>
                  {f.name}
                </span>
              </div>
            ))}
          </div>

          {/* Background */}
          <div className="mt-5">
            <PanelLabel>{tx('Background', 'Fondo')}</PanelLabel>
          </div>
          <div className="mt-2.5 flex gap-2.5">
            <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: '#1a1714', border: `1px solid ${HAIRLINE}` }} />
            <div className="h-10 w-10 rounded-lg" style={{ background: `linear-gradient(135deg, ${accent}, #5b3fa0)`, transition: 'background 400ms ease' }} />
            <div className="h-10 w-10 overflow-hidden rounded-lg">
              <img src={bgImage} alt="" className="h-full w-full object-cover" />
            </div>
          </div>

          {/* Button style */}
          <div className="mt-5">
            <PanelLabel>{tx('Button style', 'Estilo de botón')}</PanelLabel>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <div className="rounded-full py-2 text-center text-[12px] font-semibold" style={{ backgroundColor: accent, color: BG, transition: 'background 400ms ease' }}>
              {tx('Pill', 'Pastilla')}
            </div>
            <div className="rounded-full py-2 text-center text-[12px] font-semibold text-white" style={{ border: `1px solid ${accent}`, transition: 'border-color 400ms ease' }}>
              {tx('Outline', 'Contorno')}
            </div>
            <div className="rounded-full py-2 text-center text-[12px] font-medium text-white" style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
              {tx('Glass', 'Vidrio')}
            </div>
            <div className="rounded-md py-2 text-center text-[12px] font-semibold" style={{ backgroundColor: accent, color: BG, transition: 'background 400ms ease' }}>
              {tx('Square', 'Cuadrado')}
            </div>
          </div>

          {/* Save custom theme */}
          <div
            className="mt-5 flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold"
            style={{ backgroundColor: accent, color: BG, transition: 'background 400ms ease' }}
          >
            <Bookmark className="h-4 w-4" />
            {tx('Save your theme', 'Guarda tu tema')}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
