import { motion, useReducedMotion } from 'framer-motion';
import { Play, Instagram, ShoppingBag, Youtube, Music, Globe, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import featuredImg from '@/assets/demo-creator-big.webp';
import g1 from '@/assets/demo-athlete-g1.webp';
import g2 from '@/assets/demo-athlete-g2.webp';
import g3 from '@/assets/demo-athlete-g3.webp';
import g4 from '@/assets/demo-creator-b.webp';
import productImg from '@/assets/demo-business-p1.webp';

const BG = 'hsl(30 15% 6%)';
const SURFACE = 'hsl(30 12% 10%)';
const HAIRLINE = 'hsl(30 10% 16%)';
const GOLD = '#C9A55C';

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: GOLD }}>
      {children}
    </p>
  );
}

function MiniRow({ Icon, title }: { Icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIRLINE}` }}>
      <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg" style={{ backgroundColor: 'rgba(201,165,92,0.14)' }}>
        <Icon className="h-3.5 w-3.5" style={{ color: GOLD }} />
      </div>
      <span className="flex-1 truncate text-[12px] font-medium text-white">{title}</span>
      <ArrowUpRight className="h-3.5 w-3.5 flex-shrink-0 text-white/30" />
    </div>
  );
}

export function BlocksSection() {
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

  return (
    <section id="features" className="relative px-5 py-24 sm:py-32" style={{ backgroundColor: BG }}>
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <motion.div {...reveal(0)} className="mx-auto max-w-2xl text-center">
          <div className="mb-5 flex items-center justify-center gap-3">
            <span className="h-px w-7" style={{ backgroundColor: GOLD }} />
            <Label>{tx('The building blocks', 'Los bloques')}</Label>
            <span className="h-px w-7" style={{ backgroundColor: GOLD }} />
          </div>
          <h2 className="font-display text-4xl font-semibold leading-[1.05] text-white sm:text-5xl">
            {tx('Build ', 'Crea ')}
            <span style={{ color: GOLD }}>{tx('any page', 'cualquier página')}</span>
            {tx(' you can imagine.', ' que imagines.')}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base text-white/55 sm:text-lg">
            {tx(
              'Links, products, video, galleries, forms — drag in the blocks you need and arrange them your way.',
              'Enlaces, productos, video, galerías, formularios: arrastra los bloques que necesites y ordénalos a tu manera.'
            )}
          </p>
        </motion.div>

        {/* Bento grid */}
        <div className="mt-12 grid grid-cols-2 gap-3.5 sm:gap-4 lg:auto-rows-[185px] lg:grid-cols-4">
          {/* Featured media — big */}
          <motion.div
            {...reveal(0.05)}
            className="relative col-span-2 row-span-2 min-h-[280px] overflow-hidden rounded-3xl lg:min-h-0"
            style={{ border: `1px solid ${HAIRLINE}` }}
          >
            <img src={featuredImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.88), rgba(0,0,0,0.15) 55%, transparent)' }} />
            <div className="absolute inset-0 grid place-items-center">
              <div className="grid h-16 w-16 place-items-center rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(6px)' }}>
                <Play className="ml-0.5 h-6 w-6 text-white" fill="currentColor" />
              </div>
            </div>
            <div className="absolute inset-x-5 bottom-5">
              <Label>{tx('Featured media', 'Medios destacados')}</Label>
              <p className="mt-1.5 font-display text-2xl font-semibold text-white">{tx('Video, front and center', 'Video, en primer plano')}</p>
            </div>
          </motion.div>

          {/* Links — wide */}
          <motion.div {...reveal(0.1)} className="col-span-2 flex flex-col rounded-3xl p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}>
            <Label>{tx('Links', 'Enlaces')}</Label>
            <p className="mt-1.5 text-sm text-white/55">{tx('Smart link cards, any size.', 'Tarjetas de enlace de cualquier tamaño.')}</p>
            <div className="mt-4 flex flex-col gap-2">
              <MiniRow Icon={Instagram} title={tx('Latest reels', 'Últimos reels')} />
              <MiniRow Icon={ShoppingBag} title={tx('Shop my picks', 'Compra mis favoritos')} />
            </div>
          </motion.div>

          {/* Gallery */}
          <motion.div {...reveal(0.15)} className="relative col-span-1 min-h-[180px] overflow-hidden rounded-3xl lg:min-h-0" style={{ border: `1px solid ${HAIRLINE}` }}>
            <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5">
              {[g1, g2, g3, g4].map((img, i) => (
                <img key={i} src={img} alt="" className="h-full w-full object-cover" />
              ))}
            </div>
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent 45%)' }} />
            <div className="absolute inset-x-4 bottom-4">
              <Label>{tx('Gallery', 'Galería')}</Label>
            </div>
          </motion.div>

          {/* Products */}
          <motion.div {...reveal(0.2)} className="relative col-span-1 min-h-[180px] overflow-hidden rounded-3xl lg:min-h-0" style={{ border: `1px solid ${HAIRLINE}` }}>
            <img src={productImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent 50%)' }} />
            <span className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[11px] font-bold text-black" style={{ backgroundColor: GOLD }}>
              $38
            </span>
            <div className="absolute inset-x-4 bottom-4">
              <Label>{tx('Products', 'Productos')}</Label>
            </div>
          </motion.div>

          {/* Email capture — wide */}
          <motion.div {...reveal(0.25)} className="col-span-2 flex flex-col justify-center rounded-3xl p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}>
            <Label>{tx('Email capture', 'Captura de correos')}</Label>
            <p className="mt-1.5 mb-3 text-sm text-white/55">{tx('Grow your list right from your page.', 'Haz crecer tu lista desde tu página.')}</p>
            <div className="flex items-center rounded-full p-1" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: `1px solid ${HAIRLINE}` }}>
              <span className="flex-1 truncate pl-3 text-[13px] text-white/40">you@email.com</span>
              <span className="rounded-full px-4 py-1.5 text-[13px] font-semibold" style={{ backgroundColor: GOLD, color: BG }}>
                {tx('Join', 'Unirse')}
              </span>
            </div>
          </motion.div>

          {/* Social — wide */}
          <motion.div {...reveal(0.3)} className="col-span-2 flex flex-col justify-center rounded-3xl p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${HAIRLINE}` }}>
            <Label>{tx('Social icons', 'Iconos sociales')}</Label>
            <p className="mt-1.5 mb-3 text-sm text-white/55">{tx('Every platform, one tidy row.', 'Cada plataforma, en una fila.')}</p>
            <div className="flex gap-2.5">
              {[
                { Icon: Instagram, c: '#E1306C' },
                { Icon: Youtube, c: '#FF0000' },
                { Icon: Music, c: '#1DB954' },
                { Icon: Globe, c: GOLD },
              ].map(({ Icon, c }, i) => (
                <div key={i} className="grid h-9 w-9 place-items-center rounded-full" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                  <Icon className="h-[18px] w-[18px]" style={{ color: c }} />
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Full roster caption */}
        <motion.p {...reveal(0.1)} className="mt-8 text-center text-sm text-white/40">
          {tx(
            'Plus text, content sections, primary CTAs, YouTube feeds, music smart-links, and more.',
            'Además de texto, secciones de contenido, botones CTA, feeds de YouTube, smart-links de música y más.'
          )}
        </motion.p>
      </div>
    </section>
  );
}
