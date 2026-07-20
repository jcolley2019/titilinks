import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Instagram, Youtube, Music, Globe, ShoppingBag, Ticket, Link2, Headphones, Plane, Film, Calendar, Play, Sparkles, MapPin, type LucideIcon } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import creatorCover from '@/assets/demo-creator.webp';
import creatorBig from '@/assets/demo-creator-big.webp';
import creatorA from '@/assets/demo-creator-a.webp';
import creatorB from '@/assets/demo-creator-b.webp';
import musicianCover from '@/assets/demo-musician.webp';
import athleteCover from '@/assets/demo-athlete.webp';
import athleteBig from '@/assets/demo-athlete-big.webp';
import athleteG1 from '@/assets/demo-athlete-g1.webp';
import athleteG2 from '@/assets/demo-athlete-g2.webp';
import athleteG3 from '@/assets/demo-athlete-g3.webp';
import businessCover from '@/assets/demo-business.webp';
import businessP1 from '@/assets/demo-business-p1.webp';
import businessP2 from '@/assets/demo-business-p2.webp';

const BG = 'hsl(30 15% 6%)'; // warm near-black, #0e0c09
const SURFACE = 'hsl(30 12% 12%)';
const HAIRLINE = 'hsl(30 10% 20%)';
const PHONE_BASE_W = 320;
const PHONE_BASE_H = 664; // 640 screen + 12px bezel top/bottom

type Lang = 'en' | 'es';
type Social = { Icon: LucideIcon; color: string };

type Block =
  | { type: 'bigcard'; img: string; en: string; es: string }
  | { type: 'cardpair'; items: { img: string; en: string; es: string }[] }
  | { type: 'buttons'; items: { Icon: LucideIcon; bg: string; fg: string; en: string; es: string }[] }
  | { type: 'gallery'; imgs: string[] }
  | { type: 'products'; items: { img: string; en: string; es: string; price: string }[] }
  | { type: 'cta'; bg: string; fg: string; Icon: LucideIcon; en: string; es: string };

/* Full-bleed page: the photo fills the whole screen, glass link buttons float over it. */
type FullBleedConfig = {
  img: string;
  goldFrame?: boolean;
  links: { Icon: LucideIcon; en: string; es: string }[];
};

type Example = {
  key: string;
  name: string;
  handle: string;
  followers: string;
  accent: string;
  cover: string;
  socials: Social[];
  blocks: Block[];
  fullBleed?: FullBleedConfig;
};

const SOCIALS: Social[] = [
  { Icon: Instagram, color: '#E1306C' },
  { Icon: Youtube, color: '#FF0000' },
  { Icon: Music, color: '#1DB954' },
  { Icon: Globe, color: '#C9A55C' },
];

const EXAMPLES: Example[] = [
  {
    key: 'creator',
    name: 'Maya Rivera',
    handle: '@maya.rivera',
    followers: '128K',
    accent: '#C9A55C',
    cover: creatorCover,
    socials: SOCIALS,
    blocks: [
      { type: 'bigcard', img: creatorBig, en: 'Shop my looks', es: 'Compra mis looks' },
      {
        type: 'cardpair',
        items: [
          { img: creatorA, en: 'My favorites', es: 'Mis favoritos' },
          { img: creatorB, en: 'Travel diary', es: 'Diario de viaje' },
        ],
      },
    ],
  },
  {
    key: 'dj',
    name: 'Rafa Solano',
    handle: '@rafa.sets',
    followers: '312K',
    accent: '#B36BFF',
    cover: musicianCover,
    socials: SOCIALS,
    blocks: [],
    fullBleed: {
      img: musicianCover,
      links: [
        { Icon: Headphones, en: "Tonight's set", es: 'Set de esta noche' },
        { Icon: Music, en: 'Latest mix', es: 'Último mix' },
        { Icon: Ticket, en: 'Get tickets', es: 'Consigue entradas' },
        { Icon: Play, en: 'Watch the recap', es: 'Ver el resumen' },
      ],
    },
  },
  {
    key: 'musician',
    name: 'Leo Marsh',
    handle: '@leomarsh',
    followers: '540K',
    accent: '#B69CFF',
    cover: musicianCover,
    socials: SOCIALS,
    blocks: [
      {
        type: 'buttons',
        items: [
          { Icon: Music, bg: '#1DB954', fg: '#0c2a17', en: 'Latest single', es: 'Nuevo sencillo' },
          { Icon: Youtube, bg: '#FF6B6B', fg: '#3a0d0d', en: 'Music video', es: 'Video musical' },
          { Icon: Ticket, bg: '#B69CFF', fg: '#241a40', en: 'Tour dates', es: 'Fechas de gira' },
          { Icon: ShoppingBag, bg: '#2b2740', fg: '#ffffff', en: 'Merch store', es: 'Tienda de merch' },
        ],
      },
    ],
  },
  {
    key: 'travel',
    name: 'Sofía Marín',
    handle: '@sofia.wanders',
    followers: '204K',
    accent: '#4FA3D1',
    cover: creatorB,
    socials: SOCIALS,
    blocks: [],
    fullBleed: {
      img: creatorB,
      links: [
        { Icon: MapPin, en: 'Travel guides', es: 'Guías de viaje' },
        { Icon: Plane, en: 'Book a trip', es: 'Reserva un viaje' },
        { Icon: ShoppingBag, en: 'My travel gear', es: 'Mi equipo de viaje' },
        { Icon: Play, en: 'Watch the vlog', es: 'Ver el vlog' },
      ],
    },
  },
  {
    key: 'athlete',
    name: 'Jordan Hayes',
    handle: '@jhayes',
    followers: '1.2M',
    accent: '#FF6B5A',
    cover: athleteCover,
    socials: SOCIALS,
    blocks: [
      { type: 'bigcard', img: athleteBig, en: 'Training vlog', es: 'Vlog de entrenamiento' },
      { type: 'gallery', imgs: [athleteG1, athleteG2, athleteG3, athleteCover] },
    ],
  },
  {
    key: 'actriz',
    name: 'Valentina Cruz',
    handle: '@valentina.cruz',
    followers: '1.4M',
    accent: '#C9A55C',
    cover: creatorCover,
    socials: SOCIALS,
    blocks: [],
    fullBleed: {
      img: creatorCover,
      goldFrame: true,
      links: [
        { Icon: Film, en: 'Latest film', es: 'Última película' },
        { Icon: Sparkles, en: 'Fragrance line', es: 'Línea de fragancias' },
        { Icon: Calendar, en: 'Press & events', es: 'Prensa y eventos' },
        { Icon: Ticket, en: 'Premiere tickets', es: 'Entradas del estreno' },
      ],
    },
  },
  {
    key: 'business',
    name: 'Aura Skincare',
    handle: '@aura.skin',
    followers: '86K',
    accent: '#5EC2A0',
    cover: businessCover,
    socials: SOCIALS,
    blocks: [
      {
        type: 'products',
        items: [
          { img: businessP1, en: 'Glow Serum', es: 'Sérum Glow', price: '$38' },
          { img: businessP2, en: 'Night Oil', es: 'Aceite de Noche', price: '$44' },
        ],
      },
      { type: 'cta', bg: '#C9822E', fg: '#2a1602', Icon: ShoppingBag, en: 'Shop the collection', es: 'Ver la colección' },
    ],
  },
];

/* ── Card chrome ────────────────────────────────────────────────────── */

function LinkBadge() {
  return (
    <div className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-black/40 backdrop-blur-sm">
      <Link2 className="h-3 w-3 text-white/80" />
    </div>
  );
}

function ImageCard({ img, title, aspect }: { img: string; title: string; aspect: string }) {
  return (
    <div className={`relative ${aspect} overflow-hidden rounded-2xl`}>
      <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 45%, rgba(0,0,0,0.78) 100%)' }} />
      <LinkBadge />
      <p className="absolute inset-x-3 bottom-2.5 truncate text-[13px] font-bold text-white" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.6)' }}>
        {title}
      </p>
    </div>
  );
}

/* ── Full-bleed page: photo edge-to-edge, glass buttons floating over it ── */

function FullBleedScreen({ example, lang }: { example: Example; lang: Lang }) {
  const tx = (en: string, es: string) => (lang === 'es' ? es : en);
  const fb = example.fullBleed!;
  // Match the app's real full_bleed + FS.SURFACE glass: rgba(255,255,255,0.10)
  // fill + blur, a white hairline — or a gold hairline for the framed look.
  const border = fb.goldFrame ? 'rgba(201,165,92,0.55)' : 'rgba(255,255,255,0.25)';
  const iconColor = fb.goldFrame ? '#C9A55C' : '#ffffff';

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Edge-to-edge photo */}
      <img src={fb.img} alt={`${example.name} TitiLinks page`} className="absolute inset-0 h-full w-full object-cover object-top" />
      {/* Legibility scrim — light at the top so the face reads, deep at the bottom under the buttons */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 30%, transparent 44%, rgba(0,0,0,0.82) 100%)' }} />

      {/* Content, anchored to the lower half over the photo */}
      <div className="relative flex h-full flex-col justify-end px-4 pb-7">
        {/* Identity */}
        <div className="flex flex-col items-center">
          <h3 className="font-display text-[20px] font-semibold leading-tight text-white" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.7)' }}>
            {example.name}
          </h3>
          <p className="text-[11px] text-white/70">{example.handle}</p>
        </div>

        {/* Social row — glass chips */}
        <div className="mt-2.5 flex items-center justify-center gap-2.5">
          {example.socials.map(({ Icon, color }, i) => (
            <div key={i} className="grid h-7 w-7 place-items-center rounded-full border border-white/20 bg-white/10 backdrop-blur-md">
              <Icon className="h-[15px] w-[15px]" style={{ color: color === '#C9A55C' ? example.accent : color }} />
            </div>
          ))}
        </div>

        {/* Glass link buttons over the photo */}
        <div className="mt-3.5 flex flex-col gap-2.5">
          {fb.links.map((b, j) => (
            <div
              key={j}
              className="flex items-center gap-2 rounded-full py-2 pl-2 pr-3 backdrop-blur-md"
              style={{ backgroundColor: 'rgba(255,255,255,0.10)', border: `1px solid ${border}` }}
            >
              <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full border border-white/25 bg-white/15">
                <b.Icon className="h-[15px] w-[15px]" style={{ color: iconColor }} />
              </div>
              <span className="flex-1 truncate text-center text-[12px] font-bold text-white" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
                {tx(b.en, b.es)}
              </span>
              <span className="w-7 flex-shrink-0" />
            </div>
          ))}
        </div>

        {/* Footer wordmark */}
        <div className="mt-4 text-center">
          <p className="text-[9px] text-white/40">
            <span className="text-white/55">Titi</span>
            <span className="font-display italic" style={{ color: example.accent }}>
              Links
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── One example page inside the phone screen ───────────────────────── */

function PhoneScreen({ example, lang }: { example: Example; lang: Lang }) {
  if (example.fullBleed) return <FullBleedScreen example={example} lang={lang} />;
  const tx = (en: string, es: string) => (lang === 'es' ? es : en);

  return (
    <div className="flex h-full w-full flex-col">
      {/* Immersive cover */}
      <div className="relative h-[272px] w-full flex-shrink-0 overflow-hidden">
        <img src={example.cover} alt={`${example.name} TitiLinks page`} className="h-full w-full object-cover object-top" />
        <div className="absolute inset-x-0 top-0 h-20" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)' }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, transparent 40%, ${BG} 100%)` }} />
        <div className="absolute inset-x-0 bottom-2.5 flex flex-col items-center">
          <h3 className="font-display text-[18px] font-semibold leading-tight text-white" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.7)' }}>
            {example.name}
          </h3>
          <p className="text-[11px] text-white/60">{example.handle}</p>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col px-3.5">
        {/* Social row */}
        <div className="flex items-center justify-center gap-2.5 pt-2">
          {example.socials.map(({ Icon, color }, i) => (
            <div key={i} className="grid h-7 w-7 place-items-center rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
              <Icon className="h-[15px] w-[15px]" style={{ color: color === '#C9A55C' ? example.accent : color }} />
            </div>
          ))}
        </div>
        <p className="pt-1.5 text-center text-[10px] text-white/45">
          {example.followers} {tx('followers', 'seguidores')}
        </p>

        {/* Blocks */}
        <div className="mt-2.5 flex flex-col gap-2.5">
          {example.blocks.map((block, i) => {
            if (block.type === 'bigcard') {
              return <ImageCard key={i} img={block.img} title={tx(block.en, block.es)} aspect="aspect-[16/10]" />;
            }
            if (block.type === 'cardpair') {
              return (
                <div key={i} className="grid grid-cols-2 gap-2.5">
                  {block.items.map((it, j) => (
                    <ImageCard key={j} img={it.img} title={tx(it.en, it.es)} aspect="aspect-square" />
                  ))}
                </div>
              );
            }
            if (block.type === 'buttons') {
              return (
                <div key={i} className="flex flex-col gap-2">
                  {block.items.map((b, j) => (
                    <div key={j} className="flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-2" style={{ backgroundColor: b.bg }}>
                      <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-white/95">
                        <b.Icon className="h-[15px] w-[15px]" style={{ color: b.bg }} />
                      </div>
                      <span className="flex-1 text-center text-[12px] font-bold" style={{ color: b.fg }}>
                        {tx(b.en, b.es)}
                      </span>
                      <span className="w-7 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              );
            }
            if (block.type === 'gallery') {
              return (
                <div key={i} className="flex gap-1.5 overflow-hidden">
                  {block.imgs.map((img, j) => (
                    <div key={j} className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg">
                      <img src={img} alt="" className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              );
            }
            if (block.type === 'products') {
              return (
                <div key={i} className="grid grid-cols-2 gap-2.5">
                  {block.items.map((p, j) => (
                    <div key={j} className="overflow-hidden rounded-2xl" style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}>
                      <div className="aspect-square overflow-hidden">
                        <img src={p.img} alt="" className="h-full w-full object-cover" />
                      </div>
                      <div className="flex items-center justify-between px-2.5 py-1.5">
                        <span className="truncate text-[11px] font-semibold text-white">{tx(p.en, p.es)}</span>
                        <span className="flex-shrink-0 pl-1 text-[11px] font-bold" style={{ color: example.accent }}>
                          {p.price}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            }
            // cta
            return (
              <div key={i} className="flex items-center justify-center gap-2 rounded-2xl py-3" style={{ backgroundColor: block.bg }}>
                <block.Icon className="h-4 w-4" style={{ color: block.fg }} />
                <span className="text-[13px] font-bold" style={{ color: block.fg }}>
                  {tx(block.en, block.es)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer wordmark */}
        <div className="mt-3 pb-3 text-center">
          <p className="text-[9px] text-white/30">
            <span className="text-white/45">Titi</span>
            <span className="font-display italic" style={{ color: example.accent }}>
              Links
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

/* The phone shell (editor DeviceFrame geometry), scaled to displayWidth. */
function PhoneCard({ example, lang, displayWidth }: { example: Example; lang: Lang; displayWidth: number }) {
  const scale = displayWidth / PHONE_BASE_W;
  return (
    <div style={{ width: displayWidth, height: PHONE_BASE_H * scale }}>
      <div style={{ width: PHONE_BASE_W, transformOrigin: 'top left', transform: `scale(${scale})` }}>
        <div
          className="relative rounded-[48px] p-3"
          style={{
            backgroundColor: '#1a1a1a',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), inset 0 0 0 2px rgba(255,255,255,0.1), 0 0 55px -10px rgba(201,165,92,0.3)',
          }}
        >
          {/* Side buttons */}
          <div className="absolute left-[-3px] top-[120px] h-[28px] w-[3px] rounded-l-sm bg-[#2a2a2a]" />
          <div className="absolute left-[-3px] top-[160px] h-[48px] w-[3px] rounded-l-sm bg-[#2a2a2a]" />
          <div className="absolute left-[-3px] top-[215px] h-[48px] w-[3px] rounded-l-sm bg-[#2a2a2a]" />
          <div className="absolute right-[-3px] top-[180px] h-[75px] w-[3px] rounded-r-sm bg-[#2a2a2a]" />

          {/* Screen */}
          <div className="relative overflow-hidden rounded-[38px]" style={{ height: '640px', backgroundColor: BG }}>
            {/* Dynamic island */}
            <div className="absolute left-1/2 top-[12px] z-20 -translate-x-1/2">
              <div className="flex h-[37px] w-[126px] items-center justify-center rounded-full bg-black">
                <div className="ml-8 h-3 w-3 rounded-full bg-[#1a1a2e] ring-1 ring-[#2a2a3a]" />
              </div>
            </div>
            <PhoneScreen example={example} lang={lang} />
            {/* Home indicator */}
            <div className="absolute bottom-2 left-1/2 z-20 h-[5px] w-[120px] -translate-x-1/2 rounded-full bg-white/30" />
          </div>

          {/* Reflection */}
          <div
            className="pointer-events-none absolute inset-0 rounded-[48px]"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, transparent 100%)' }}
          />
        </div>
      </div>
    </div>
  );
}

/* Desktop: a row of phones drifting sideways, looping seamlessly. */
function PhoneMarquee({ lang }: { lang: Lang }) {
  const loop = [...EXAMPLES, ...EXAMPLES];
  return (
    <div
      className="hero-marquee-viewport relative overflow-hidden"
      style={{
        maskImage: 'linear-gradient(to right, transparent, #000 9%, #000 91%, transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, #000 9%, #000 91%, transparent)',
      }}
    >
      <div className="hero-marquee-track py-4">
        {loop.map((ex, i) => (
          <div key={i} className="flex-shrink-0" style={{ marginRight: 28, transform: `rotate(${i % 2 ? -2.5 : 2.5}deg)` }}>
            <PhoneCard example={ex} lang={lang} displayWidth={244} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* Mobile: one phone that cross-fades through the examples. */
function PhoneRotator({ lang }: { lang: Lang }) {
  const reduce = useReducedMotion();
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % EXAMPLES.length), 4500);
    return () => clearInterval(id);
  }, [reduce]);
  const w = 290;
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: w, height: PHONE_BASE_H * (w / PHONE_BASE_W) }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <PhoneCard example={EXAMPLES[idx]} lang={lang} displayWidth={w} />
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mt-5 flex gap-2">
        {EXAMPLES.map((ex, i) => (
          <button
            key={ex.key}
            aria-label={`Show ${ex.key} example`}
            onClick={() => setIdx(i)}
            className="h-2 rounded-full transition-all"
            style={{ width: i === idx ? 22 : 8, backgroundColor: i === idx ? '#C9A55C' : 'rgba(255,255,255,0.22)' }}
          />
        ))}
      </div>
    </div>
  );
}

function useIsDesktop() {
  const [desktop, setDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)');
    const handler = () => setDesktop(m.matches);
    m.addEventListener('change', handler);
    return () => m.removeEventListener('change', handler);
  }, []);
  return desktop;
}

export function HeroSection() {
  const { t, language } = useLanguage();
  const lang: Lang = language === 'es' ? 'es' : 'en';
  const isDesktop = useIsDesktop();

  return (
    <section className="relative flex min-h-[100svh] items-center overflow-hidden px-5 pb-16 pt-28 lg:pt-32" style={{ backgroundColor: BG }}>
      {/* Single soft gold spotlight + vignette — no orbs, no noise */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(55% 50% at 70% 45%, rgba(201,165,92,0.10) 0%, transparent 60%),
            radial-gradient(120% 100% at 50% 0%, transparent 55%, rgba(0,0,0,0.55) 100%)`,
        }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-6">
        {/* Left — copy */}
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mb-7 flex items-center gap-3"
          >
            <span className="h-px w-7" style={{ backgroundColor: '#C9A55C' }} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: '#C9A55C' }}>
              {t('hero.badge')}
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-5xl font-semibold leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-[4.5rem] xl:text-[5rem]"
          >
            {t('hero.title1')}
            <br />
            <span style={{ color: '#C9A55C' }}>{t('hero.title2')}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 max-w-md text-base text-white/60 sm:text-lg"
          >
            {t('hero.subtitle')}
          </motion.p>

          {/* Handle claimer */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="mt-9 w-full max-w-md"
          >
            <div className="flex items-center rounded-full p-1.5" style={{ backgroundColor: SURFACE, border: '1px solid rgba(201,165,92,0.35)' }}>
              <span className="whitespace-nowrap pl-4 pr-1 text-sm text-white/45 sm:text-base">titilinks.com/</span>
              <input
                type="text"
                aria-label="Choose your handle"
                placeholder={t('hero.handlePlaceholder')}
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-white outline-none placeholder:text-white/30 sm:text-base"
              />
              <Link to="/login?mode=signup" className="shrink-0">
                <button
                  className="rounded-full px-6 py-2.5 text-sm font-semibold transition-transform duration-150 hover:-translate-y-px active:scale-[0.98]"
                  style={{ backgroundColor: '#C9A55C', color: BG }}
                >
                  {t('hero.cta')}
                </button>
              </Link>
            </div>
            <p className="mt-3 text-sm text-white/40">
              {t('hero.freeForever')} {t('hero.noCreditCard')}
            </p>
          </motion.div>
        </div>

        {/* Right — rotating phones */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="min-w-0"
        >
          {isDesktop ? <PhoneMarquee lang={lang} /> : <PhoneRotator lang={lang} />}
        </motion.div>
      </div>
    </section>
  );
}
