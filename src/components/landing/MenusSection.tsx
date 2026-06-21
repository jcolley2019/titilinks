import { useEffect, useState, type ComponentType } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  ChevronLeft, ChevronDown, X, GripVertical, Trash2, Plus, PinOff,
  Link2, AtSign, Palette, LayoutGrid, Image as ImageIcon, ShoppingBag,
  Video, Mail, Type, Star, type LucideIcon,
} from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { PlatformIcon } from '@/components/PlatformIcon';
import { PhoneFrame } from './PhoneFrame';
import cardImg from '@/assets/demo-creator-a.webp';
import bgImg from '@/assets/demo-creator-b.webp';

const BG = 'hsl(30 15% 6%)';
const SURFACE = 'hsl(30 12% 12%)';
const HAIRLINE = 'hsl(30 10% 20%)';
const GOLD = '#C9A55C';

type Tx = (en: string, es: string) => string;

/* ── Shared menu primitives (display-only mirrors of the real controls) ── */

function MLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">{children}</p>;
}

function Seg({ items, active }: { items: string[]; active: number }) {
  return (
    <div className="flex gap-1.5">
      {items.map((it, i) => (
        <div
          key={it}
          className="flex-1 rounded-lg py-[7px] text-center text-[11px] font-semibold"
          style={
            i === active
              ? { backgroundColor: GOLD, color: BG }
              : { backgroundColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', border: `1px solid ${HAIRLINE}` }
          }
        >
          {it}
        </div>
      ))}
    </div>
  );
}

function FieldBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="truncate rounded-lg px-3 py-[9px] text-[12px] text-white/80"
      style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIRLINE}` }}
    >
      {children}
    </div>
  );
}

function PinChip({ tx }: { tx: Tx }) {
  return (
    <div
      className="inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold text-white/55"
      style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: `1px solid ${HAIRLINE}` }}
    >
      <PinOff className="h-3 w-3" />
      {tx('Pin menu', 'Fijar menú')}
    </div>
  );
}

/* ── Menu 1 · Featured Links editor ─────────────────────────────────────── */

function LinksMenu({ tx }: { tx: Tx }) {
  return (
    <>
      <PinChip tx={tx} />
      <div className="relative overflow-hidden rounded-2xl" style={{ aspectRatio: '16 / 10' }}>
        <img src={cardImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 45%, rgba(0,0,0,0.8) 100%)' }} />
        <p className="absolute inset-x-3 bottom-2 text-[13px] font-bold text-white">{tx('My favorites', 'Mis favoritos')}</p>
      </div>
      <p className="text-center text-[11px] text-white/45">{tx('Find the look that fits you best', 'Encuentra el estilo perfecto')}</p>
      <Seg items={[tx('Link Cards', 'Tarjetas'), tx('Buttons', 'Botones')]} active={0} />
      <Seg items={[tx('Large', 'Grande'), tx('Small', 'Pequeño')]} active={1} />
      <div className="flex flex-col gap-1.5">
        <MLabel>{tx('Leading icon', 'Ícono')}</MLabel>
        <Seg items={[tx('Platform', 'Plataforma'), tx('Photo', 'Foto'), tx('None', 'Ninguno')]} active={1} />
      </div>
      <div className="flex flex-col gap-1.5">
        <MLabel>{tx('Link', 'Enlace')}</MLabel>
        <FieldBox>https://titiactriz.com</FieldBox>
      </div>
      <div className="flex flex-col gap-1.5">
        <MLabel>{tx('Title color', 'Color del título')}</MLabel>
        <div className="flex items-center gap-2">
          <span className="h-9 w-9 flex-shrink-0 rounded-lg" style={{ backgroundColor: GOLD, border: `1px solid ${HAIRLINE}` }} />
          <div className="flex-1 rounded-lg py-2 text-center text-[11px] font-medium text-white/55" style={{ border: `1px solid ${HAIRLINE}` }}>
            {tx('No color', 'Sin color')}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Menu 2 · Manage Platforms (social icons) ───────────────────────────── */

const PLATFORM_ROWS = [
  { label: 'TikTok', handle: '@buildaiwithjoey' },
  { label: 'Instagram', handle: '@joeycolleyoff…' },
  { label: 'YouTube', handle: '@affiliateproj…' },
  { label: 'Spotify', handle: 'user/31jn…' },
];

function PlatformsMenu({ tx }: { tx: Tx }) {
  return (
    <>
      <PinChip tx={tx} />
      <div className="flex flex-col gap-1.5">
        <MLabel>{tx('Icon size', 'Tamaño')}</MLabel>
        <Seg items={[tx('Small', 'Pequeño'), tx('Medium', 'Mediano'), tx('Large', 'Grande')]} active={1} />
      </div>
      <div className="flex flex-col gap-1.5">
        <MLabel>{tx('Icon color', 'Color')}</MLabel>
        <Seg items={[tx('Brand', 'Marca'), tx('Black', 'Negro'), tx('White', 'Blanco')]} active={0} />
      </div>
      <div
        className="flex items-center justify-between rounded-lg px-3 py-2.5"
        style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIRLINE}` }}
      >
        <span className="flex items-center gap-2 text-[12px] font-semibold text-white">
          <Plus className="h-3.5 w-3.5" /> {tx('Add platform', 'Añadir plataforma')}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-white/40" />
      </div>
      <div className="flex flex-col gap-1.5">
        {PLATFORM_ROWS.map((p) => (
          <div
            key={p.label}
            className="flex items-center gap-2.5 rounded-xl px-2.5 py-2"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIRLINE}` }}
          >
            <GripVertical className="h-3.5 w-3.5 flex-shrink-0 text-white/25" />
            <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
              <PlatformIcon label={p.label} size={15} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[12px] font-semibold leading-tight text-white">{p.label}</span>
              <span className="truncate text-[10px] text-white/40">{p.handle}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-white/30" />
            <Trash2 className="h-3.5 w-3.5 flex-shrink-0 text-red-400/70" />
          </div>
        ))}
      </div>
      <div className="mt-0.5 flex gap-2">
        <div className="flex-1 rounded-lg py-2 text-center text-[12px] font-semibold text-white/55" style={{ border: `1px solid ${HAIRLINE}` }}>
          {tx('Cancel', 'Cancelar')}
        </div>
        <div className="flex-1 rounded-lg py-2 text-center text-[12px] font-semibold" style={{ backgroundColor: GOLD, color: BG }}>
          {tx('Save', 'Guardar')}
        </div>
      </div>
    </>
  );
}

/* ── Menu 3 · Design & Themes ───────────────────────────────────────────── */

const THEME_ACCENTS = [GOLD, '#FF6B5A', '#4FA3D1', '#B69CFF', '#5EC2A0'];
const DESIGN_FONTS = [
  { name: 'Playfair', css: "'Playfair Display', serif" },
  { name: 'Bebas Neue', css: "'Bebas Neue', cursive" },
  { name: 'Pacifico', css: "'Pacifico', cursive" },
  { name: 'Space', css: "'Space Grotesk', sans-serif" },
];

function DesignMenu({ tx }: { tx: Tx }) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <MLabel>{tx('Theme', 'Tema')}</MLabel>
        <div className="flex gap-2.5">
          {THEME_ACCENTS.map((a, i) => (
            <span
              key={a}
              className="h-9 w-9 rounded-full"
              style={{
                background: `linear-gradient(135deg, ${a}, ${BG})`,
                boxShadow: i === 0 ? `0 0 0 2px ${BG}, 0 0 0 4px ${a}` : 'none',
              }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <MLabel>{tx('Typeface', 'Tipografía')}</MLabel>
        <div className="grid grid-cols-2 gap-2">
          {DESIGN_FONTS.map((f) => (
            <div
              key={f.name}
              className="flex items-center justify-center rounded-xl py-2.5"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIRLINE}` }}
            >
              <span className="text-[18px] leading-none text-white" style={{ fontFamily: f.css }}>{f.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <MLabel>{tx('Background', 'Fondo')}</MLabel>
        <div className="flex gap-2.5">
          <span className="h-10 w-10 rounded-lg" style={{ backgroundColor: '#1a1714', border: `1px solid ${HAIRLINE}` }} />
          <span className="h-10 w-10 rounded-lg" style={{ background: `linear-gradient(135deg, ${GOLD}, #5b3fa0)` }} />
          <span className="h-10 w-10 overflow-hidden rounded-lg"><img src={bgImg} alt="" className="h-full w-full object-cover" /></span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <MLabel>{tx('Button style', 'Estilo de botón')}</MLabel>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-full py-2 text-center text-[12px] font-semibold" style={{ backgroundColor: GOLD, color: BG }}>{tx('Pill', 'Pastilla')}</div>
          <div className="rounded-full py-2 text-center text-[12px] font-semibold text-white" style={{ border: `1px solid ${GOLD}` }}>{tx('Outline', 'Contorno')}</div>
          <div className="rounded-full py-2 text-center text-[12px] font-medium text-white" style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>{tx('Glass', 'Vidrio')}</div>
          <div className="rounded-md py-2 text-center text-[12px] font-semibold" style={{ backgroundColor: GOLD, color: BG }}>{tx('Square', 'Cuadrado')}</div>
        </div>
      </div>
    </>
  );
}

/* ── Menu 4 · Add content (block picker) ────────────────────────────────── */

const BLOCK_TILES: { Icon: LucideIcon; en: string; es: string }[] = [
  { Icon: Link2, en: 'Featured Links', es: 'Enlaces' },
  { Icon: ImageIcon, en: 'Gallery', es: 'Galería' },
  { Icon: ShoppingBag, en: 'Products', es: 'Productos' },
  { Icon: Video, en: 'Video Feed', es: 'Videos' },
  { Icon: AtSign, en: 'Social Icons', es: 'Redes' },
  { Icon: Mail, en: 'Email Signup', es: 'Correo' },
  { Icon: Type, en: 'Text', es: 'Texto' },
  { Icon: Star, en: 'Spotlight', es: 'Destacado' },
];

function BlocksMenu({ tx }: { tx: Tx }) {
  return (
    <>
      <p className="text-center text-[11px] text-white/45">{tx('Choose what to showcase on your page', 'Elige qué mostrar en tu página')}</p>
      <div className="grid grid-cols-2 gap-2">
        {BLOCK_TILES.map(({ Icon, en, es }, i) => (
          <div
            key={en}
            className="flex flex-col items-center gap-2 rounded-2xl py-3.5"
            style={
              i === 0
                ? { backgroundColor: `${GOLD}1a`, border: `1px solid ${GOLD}66` }
                : { backgroundColor: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIRLINE}` }
            }
          >
            <Icon className="h-5 w-5" style={{ color: i === 0 ? GOLD : 'rgba(255,255,255,0.7)' }} />
            <span className="text-[11px] font-semibold" style={{ color: i === 0 ? '#fff' : 'rgba(255,255,255,0.7)' }}>{tx(en, es)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ── Menu registry ──────────────────────────────────────────────────────── */

type Menu = {
  key: string;
  Icon: LucideIcon;
  en: string; es: string;
  subEn: string; subEs: string;
  Body: ComponentType<{ tx: Tx }>;
};

const MENUS: Menu[] = [
  { key: 'links', Icon: Link2, en: 'Featured Links', es: 'Enlaces', subEn: 'Cards, buttons & colors', subEs: 'Tarjetas, botones y colores', Body: LinksMenu },
  { key: 'social', Icon: AtSign, en: 'Social Icons', es: 'Redes', subEn: 'Size, color & ordering', subEs: 'Tamaño, color y orden', Body: PlatformsMenu },
  { key: 'design', Icon: Palette, en: 'Design & Themes', es: 'Diseño', subEn: 'Fonts, colors & backgrounds', subEs: 'Fuentes, colores y fondos', Body: DesignMenu },
  { key: 'blocks', Icon: LayoutGrid, en: 'Add Content', es: 'Contenido', subEn: 'Galleries, products, video…', subEs: 'Galerías, productos, video…', Body: BlocksMenu },
];

/* The phone screen for one menu: header bar + scrolling body + bottom fade. */
function MenuScreen({ menu, tx }: { menu: Menu; tx: Tx }) {
  const { Body } = menu;
  return (
    <div className="flex h-full w-full flex-col" style={{ backgroundColor: BG }}>
      <div className="flex items-center justify-between px-4 pb-2.5 pt-[50px]">
        <ChevronLeft className="h-[18px] w-[18px] text-white/55" />
        <span className="font-display text-[14px] font-semibold text-white">{tx(menu.en, menu.es)}</span>
        <X className="h-[18px] w-[18px] text-white/55" />
      </div>
      <div className="h-px w-full" style={{ backgroundColor: HAIRLINE }} />
      <div className="relative flex-1 overflow-hidden">
        <div className="flex flex-col gap-3.5 px-4 pb-6 pt-3.5">
          <Body tx={tx} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12" style={{ background: `linear-gradient(to top, ${BG}, transparent)` }} />
      </div>
    </div>
  );
}

/* Desktop tab — a selectable feature row that highlights the active menu. */
function TabRow({ menu, active, onClick, tx }: { menu: Menu; active: boolean; onClick: () => void; tx: Tx }) {
  const { Icon } = menu;
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3.5 rounded-2xl px-4 py-3 text-left transition-all"
      style={active
        ? { backgroundColor: SURFACE, border: `1px solid ${GOLD}55`, boxShadow: '0 12px 32px -18px rgba(0,0,0,0.7)' }
        : { backgroundColor: 'transparent', border: '1px solid transparent' }}
    >
      <span
        className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl transition-colors"
        style={active ? { backgroundColor: `${GOLD}24`, color: GOLD } : { backgroundColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex flex-col">
        <span className="text-[15px] font-semibold" style={{ color: active ? '#fff' : 'rgba(255,255,255,0.82)' }}>{tx(menu.en, menu.es)}</span>
        <span className="text-[12.5px] text-white/45">{tx(menu.subEn, menu.subEs)}</span>
      </span>
    </button>
  );
}

export function MenusSection() {
  const { language } = useLanguage();
  const reduce = useReducedMotion();
  const tx: Tx = (en, es) => (language === 'es' ? es : en);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  // Auto-advance through the menus until the visitor takes over by tapping one.
  useEffect(() => {
    if (reduce || paused) return;
    const id = setInterval(() => setActive((i) => (i + 1) % MENUS.length), 5000);
    return () => clearInterval(id);
  }, [reduce, paused]);

  const select = (i: number) => { setActive(i); setPaused(true); };
  const accent = GOLD;
  const phoneW = 304;

  return (
    <section className="relative overflow-hidden px-5 py-24 sm:py-32" style={{ backgroundColor: BG }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(45% 45% at 24% 45%, ${accent}12 0%, transparent 60%)` }}
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Left — copy + selectable menu list */}
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <div className="mb-5 flex items-center gap-3">
            <span className="h-px w-7" style={{ backgroundColor: GOLD }} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: GOLD }}>
              {tx('The editor', 'El editor')}
            </p>
          </div>
          <h2 className="font-display text-4xl font-semibold leading-[1.05] text-white sm:text-5xl">
            {tx('Customize every detail in ', 'Personaliza cada detalle en ')}
            <span style={{ color: GOLD }}>{tx('seconds', 'segundos')}</span>.
          </h2>
          <p className="mt-5 max-w-md text-base text-white/55 sm:text-lg">
            {tx(
              'These are the real menus from the TitiLinks editor — tap one to see exactly what you can shape, right from your phone.',
              'Estos son los menús reales del editor de TitiLinks: toca uno para ver todo lo que puedes ajustar, desde tu teléfono.'
            )}
          </p>

          <div className="mt-8 hidden w-full max-w-md flex-col gap-1.5 lg:flex">
            {MENUS.map((m, i) => (
              <TabRow key={m.key} menu={m} active={i === active} onClick={() => select(i)} tx={tx} />
            ))}
          </div>
        </div>

        {/* Right — phone showing the active menu */}
        <div className="flex flex-col items-center">
          <div className="relative" style={{ width: phoneW, height: 664 * (phoneW / 320) }}>
            <PhoneFrame displayWidth={phoneW}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.35 }}
                >
                  <MenuScreen menu={MENUS[active]} tx={tx} />
                </motion.div>
              </AnimatePresence>
            </PhoneFrame>
          </div>

          {/* Mobile — labeled chips to switch menus */}
          <div className="mt-7 flex flex-wrap justify-center gap-2 lg:hidden">
            {MENUS.map((m, i) => {
              const on = i === active;
              return (
                <button
                  key={m.key}
                  onClick={() => select(i)}
                  className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all"
                  style={on
                    ? { backgroundColor: GOLD, color: BG }
                    : { backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: `1px solid ${HAIRLINE}` }}
                >
                  <m.Icon className="h-3.5 w-3.5" />
                  {tx(m.en, m.es)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
