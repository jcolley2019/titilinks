// ProductCardsBlock — a shoppable gallery of products. Same Full / Filmstrip /
// Grid layouts as the Gallery block (settings in block.title JSON), but every
// tile is a real <a> to the product's store URL and shows its title plus an
// optional price / badge / Buy button (gated by the showPrice / showBuy config
// toggles). Legacy stacked/split configs fall back to Grid.

import { useEffect, useRef } from 'react';
import { ShoppingBag, ShieldAlert } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { translateContent } from '@/lib/content-i18n';
import { triggerHaptic } from '@/hooks/useHapticFeedback';
import type { BlockItem, ThemedBlockProps } from './types';
import { cardSurface, isFullBleedTheme } from '@/lib/surface';
import { animationClass, resolveAnimation } from '@/lib/animations';
import { gatedHref, isGated } from '@/lib/adult-gate';

interface ProductConfig {
  layout: 'full' | 'filmstrip' | 'grid';
  autoScroll: boolean;
  speedMs: number;
  showPrice: boolean;
  showBuy: boolean;
}

function parseConfig(title: string | null | undefined): ProductConfig {
  const cfg: ProductConfig = { layout: 'grid', autoScroll: true, speedMs: 7000, showPrice: true, showBuy: true };
  try {
    const parsed = JSON.parse(title || '');
    if (parsed && typeof parsed === 'object') {
      if (parsed.layout === 'filmstrip' || parsed.layout === 'full') cfg.layout = parsed.layout;
      if (parsed.autoScroll === false) cfg.autoScroll = false;
      cfg.speedMs = parsed.speed === 'fast' ? 3000 : parsed.speed === 'medium' ? 5000 : 7000;
      if (parsed.showPrice === false) cfg.showPrice = false;
      if (parsed.showBuy === false) cfg.showBuy = false;
    }
  } catch { /* legacy/plain title => grid defaults */ }
  return cfg;
}

export function ProductCardsBlock({ block, onOutboundClick, theme, editMode }: ThemedBlockProps) {
  const { t } = useLanguage();
  const tc = (text: string | null | undefined) => translateContent(text, t);
  const cfg = parseConfig(block.title);
  const count = block.items.length;

  const stripRef = useRef<HTMLDivElement>(null);
  const pausedUntil = useRef(0);
  const pause = () => { pausedUntil.current = Date.now() + 8000; };

  // Filmstrip seamless auto-scroll (mirrors GalleryBlock/CarouselBlock).
  const loop = cfg.layout === 'filmstrip' && cfg.autoScroll && count >= 2;
  const stripItems = loop ? [...block.items, ...block.items] : block.items;
  useEffect(() => {
    if (!loop) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = stripRef.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (el.scrollWidth > 0 && Date.now() >= pausedUntil.current) {
        const oneCopy = el.scrollWidth / 2;
        const pxPerSec = (el.clientWidth * 0.72 * 1000) / cfg.speedMs;
        let next = el.scrollLeft + pxPerSec * dt;
        if (next >= oneCopy) next -= oneCopy;
        el.scrollLeft = next;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loop, cfg.speedMs]);

  if (count === 0) return null;

  const textColor = theme.typography.text_color;
  const fill = theme.buttons.fill_color;
  const fullBleed = isFullBleedTheme(theme);
  // TPL.5 TASK 2: the tile surface + frame carry the layout color from the shared
  // derivation (was fill_color @ 8% alpha — invisible). Photos still cover it when
  // present; the frame keeps the layout color visible even on image tiles.
  const surface = cardSurface(theme);
  // ANIM.2: the Buy pill is a button surface — it follows the page-level
  // animation (no per-item override on this surface) via the same lb-anim-*
  // class contract LinkButton uses; inert under prefers-reduced-motion.
  const buyAnimClass = animationClass(resolveAnimation(theme.buttons.animation, undefined));

  const handleClick = (e: React.MouseEvent, item: BlockItem) => {
    // ADULT.2c: report the EFFECTIVE gate, not the stored flag, so a
    // domain-matched item raises the same modal every other surface uses.
    const ok = onOutboundClick(block.type, block.id, item.id, item.url, isGated(item, editMode));
    if (!ok) e.preventDefault();
  };

  const formatPrice = (price: number, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(price);
  const discountPct = (price: number, compareAt: number) => Math.round(((compareAt - price) / compareAt) * 100);

  // One product tile — used by every layout. `rounded` controls the corner.
  const Tile = ({ item, rounded = 'rounded-xl' }: { item: BlockItem; rounded?: string }) => {
    const onSale = !!(cfg.showPrice && item.compare_at_price && item.price && item.compare_at_price > item.price);
    return (
      <a
        href={gatedHref(item.url, item.is_adult, editMode)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => handleClick(e, item)}
        onTouchStart={() => triggerHaptic('light')}
        className={`group relative block h-full w-full overflow-hidden ${rounded}`}
        style={{
          backgroundColor: surface.background,
          border: `1px solid ${surface.borderColor}`,
          ...(fullBleed ? { backdropFilter: 'blur(12px)' } : {}),
        }}
      >
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.label || ''}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <ShoppingBag className="h-8 w-8 opacity-40" style={{ color: fullBleed ? '#ffffff' : textColor }} />
          </div>
        )}

        {item.badge && (
          <span
            className="absolute top-2 left-2 z-[1] text-[10px] font-bold px-2 py-0.5 rounded"
            style={{ backgroundColor: '#C9A55C', color: '#0e0c09' }}
          >
            {tc(item.badge)}
          </span>
        )}
        {onSale && (
          <span className="absolute top-2 right-2 z-[1] text-[10px] font-bold px-2 py-0.5 rounded bg-red-500 text-white">
            -{discountPct(item.price!, item.compare_at_price!)}%
          </span>
        )}
        {item.is_adult && (
          <span className="absolute bottom-2 right-2 z-[2] bg-red-500/90 text-white px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-0.5">
            <ShieldAlert className="h-3 w-3" /> 18+
          </span>
        )}

        {(item.label || (cfg.showPrice && item.price) || (cfg.showBuy && item.cta_label)) && (
          <div className="absolute inset-x-0 bottom-0 z-[1] px-3 pb-2.5 pt-8 bg-gradient-to-t from-black/80 to-transparent">
            {item.label && <p className="truncate text-sm font-semibold text-white">{tc(item.label)}</p>}
            {cfg.showPrice && item.price != null && (
              <p className="flex items-center gap-1.5 mt-0.5">
                <span className="text-sm font-bold text-white">{formatPrice(item.price, item.currency || 'USD')}</span>
                {onSale && (
                  <span className="text-xs line-through text-white/60">
                    {formatPrice(item.compare_at_price!, item.currency || 'USD')}
                  </span>
                )}
              </p>
            )}
            {cfg.showBuy && item.cta_label && (
              <span
                className={`inline-block mt-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${buyAnimClass}`.trim()}
                style={{ backgroundColor: fill, color: theme.buttons.text_color }}
              >
                {tc(item.cta_label)}
              </span>
            )}
          </div>
        )}
      </a>
    );
  };

  if (cfg.layout === 'filmstrip') {
    return (
      <div
        ref={stripRef}
        onPointerDown={pause}
        onTouchStart={pause}
        className={`flex overflow-x-auto pb-1 ${loop ? '' : 'gap-3 snap-x snap-mandatory'}`}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {stripItems.map((item, i) => (
          <div
            key={`${item.id}-${i}`}
            className={`relative flex-shrink-0 w-[72%] ${loop ? 'mr-3' : 'snap-center snap-always'}`}
            style={{ aspectRatio: '1 / 1' }}
          >
            <Tile item={item} />
          </div>
        ))}
      </div>
    );
  }

  if (cfg.layout === 'full') {
    // Full-width product cards, one per row (3/4 cover).
    return (
      <div className="space-y-3">
        {block.items.map((item) => (
          <div key={item.id} className="relative w-full" style={{ aspectRatio: '3 / 4' }}>
            <Tile item={item} rounded="rounded-2xl" />
          </div>
        ))}
      </div>
    );
  }

  // Grid (default) — 2-column square tiles.
  return (
    <div className="grid grid-cols-2 gap-3">
      {block.items.map((item) => (
        <div key={item.id} className="relative" style={{ aspectRatio: '1 / 1' }}>
          <Tile item={item} />
        </div>
      ))}
    </div>
  );
}
