// CarouselBlock — a swipeable, auto-rotating row of link cards (Pass 5).
//
// A "Carousel" is a curated group of links rendered as Featured Links Big/Small
// cards in a horizontal scroller — the visual of the link cards with the motion
// of the Gallery block. Settings (section title, card size, auto-scroll, speed)
// live as JSON in block.title, exactly like GalleryBlock; the cards themselves
// are block_items rows (url / label / image_url), same table as Featured Links.
// No DB column is added.
//
// Each card shows its custom photo if one was uploaded; otherwise it falls back
// to the icon DERIVED from the link (platform brand / generic link glyph) plus
// the title — so a photo-less card stays a real card instead of a text button.

import { useEffect, useRef } from 'react';
import { Link as LinkChainIcon } from 'lucide-react';
import { platformFromUrl } from '@/lib/platform-from-url';
import { PlatformIcon } from '@/components/PlatformIcon';
import type { ThemedBlockProps, BlockItem } from './types';

/** The icon "from the link": platform brand glyph, or a generic link chain. */
function DerivedIcon({ url, size, color }: { url: string | null | undefined; size: number; color?: string }) {
  const platform = platformFromUrl(url || '');
  return platform
    ? <PlatformIcon label={platform} size={size} color={color} />
    : <LinkChainIcon size={size} color={color} />;
}

export function CarouselBlock({ block, onOutboundClick, theme }: ThemedBlockProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  const pausedUntil = useRef(0);
  const count = block.items.length;

  // Settings stored as JSON in block.title (same pattern as GalleryBlock).
  // A missing/plain title => sensible defaults (no migration).
  let sectionTitle = '';
  let cardSize: 'big' | 'small' = 'big';
  let autoScroll = true;
  let speedMs = 5000;
  try {
    const parsed = JSON.parse(block.title || '');
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.section_title === 'string') sectionTitle = parsed.section_title;
      if (parsed.cardSize === 'small') cardSize = 'small';
      if (parsed.autoScroll === false) autoScroll = false;
      speedMs = parsed.speed === 'fast' ? 3000 : parsed.speed === 'slow' ? 7000 : 5000;
    }
  } catch { /* legacy/plain title => defaults */ }

  const textColor = theme.typography.text_color;
  const fill = theme.buttons.fill_color;
  const cardFrac = cardSize === 'small' ? 0.44 : 0.78;

  // Seamless infinite loop when auto-scrolling 2+ cards: render the strip twice
  // and glide continuously, wrapping by exactly one copy width. (Mirrors the
  // GalleryBlock filmstrip so motion feels identical across the app.)
  const loop = autoScroll && count >= 2;
  const stripItems = loop ? [...block.items, ...block.items] : block.items;

  const pause = () => { pausedUntil.current = Date.now() + 8000; };
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
        const pxPerSec = (el.clientWidth * cardFrac * 1000) / speedMs;
        let next = el.scrollLeft + pxPerSec * dt;
        if (next >= oneCopy) next -= oneCopy;
        el.scrollLeft = next;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loop, speedMs, cardFrac]);

  if (count === 0) return null;

  const widthClass = cardSize === 'small' ? 'w-[44%]' : 'w-[78%]';
  const aspect = cardSize === 'small' ? '1 / 1' : '3 / 4';

  const handleClick = (e: React.MouseEvent, item: BlockItem) => {
    const ok = onOutboundClick(block.type, block.id, item.id, item.url, item.is_adult || false);
    if (!ok) e.preventDefault();
  };

  return (
    <div className="space-y-2">
      {sectionTitle && (
        <p className="text-sm font-semibold" style={{ color: textColor }}>{sectionTitle}</p>
      )}
      <div
        ref={stripRef}
        onPointerDown={pause}
        onTouchStart={pause}
        className={`flex overflow-x-auto pb-1 ${loop ? '' : 'gap-3 snap-x snap-mandatory'}`}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {stripItems.map((item, i) => (
          <a
            key={`${item.id}-${i}`}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => handleClick(e, item)}
            className={`relative flex-shrink-0 ${widthClass} rounded-2xl overflow-hidden ${loop ? 'mr-3' : 'snap-center snap-always'}`}
            style={{ aspectRatio: aspect, backgroundColor: `${fill}14` }}
          >
            {item.image_url ? (
              <>
                <img
                  src={item.image_url}
                  alt={item.label || ''}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
                {/* Platform badge (top-left), like a Featured Links image card. */}
                <span
                  className="absolute top-2.5 left-2.5 z-[1] h-7 w-7 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center text-white"
                  aria-hidden="true"
                >
                  <DerivedIcon url={item.url} size={14} color="#ffffff" />
                </span>
                {item.label && (
                  <span className="absolute inset-x-0 bottom-0 z-[1] px-3 pb-2.5 pt-8 bg-gradient-to-t from-black/75 to-transparent">
                    <span className="block truncate text-sm font-semibold text-white">{item.label}</span>
                  </span>
                )}
              </>
            ) : (
              // No custom photo → "default from the link": derived icon + title.
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
                <DerivedIcon url={item.url} size={cardSize === 'small' ? 30 : 42} color={textColor} />
                {item.label && (
                  <span className="block w-full truncate text-sm font-semibold" style={{ color: textColor }}>
                    {item.label}
                  </span>
                )}
              </div>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
