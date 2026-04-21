// ContentSectionBlock — content cards with 3 layout modes (carousel default
// with scroll-snap pagination dots, 2-col grid, or horizontal list with
// thumbnail + text).
// Lifted from src/pages/PublicProfile.tsx line 1215 as part of Phase 3a.
//
// Restores from EditableProfileView's stripped version:
//   - onOutboundClick analytics
//   - Framer Motion whileTap on card hover
//
// Uses raw img tags (not the shared lazy-loader component) to preserve the
// fast-scroll carousel performance from the source. The view_all_label
// default is now translated via t() to support bilingual rendering.

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Image as ImageIcon } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { translateContent } from '@/lib/content-i18n';
import { cn } from '@/lib/utils';
import type { BlockItem, ThemedBlockProps } from './types';

export function ContentSectionBlock({ block, onOutboundClick, theme }: ThemedBlockProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();
  const tc = (text: string | null | undefined) => translateContent(text, t);

  if (block.items.length === 0) return null;

  // Parse config from block title
  let config = {
    section_title: '',
    view_all_url: '',
    view_all_label: t('contentSection.viewAll'),
    layout: 'carousel' as 'list' | 'grid' | 'carousel',
  };

  if (block.title) {
    try {
      const parsed = JSON.parse(block.title);
      config = { ...config, ...parsed };
    } catch {
      config.section_title = block.title;
    }
  }

  const handleClick = (e: React.MouseEvent, item: BlockItem) => {
    const shouldNavigate = onOutboundClick(block.type, block.id, item.id, item.url, item.is_adult || false);
    if (!shouldNavigate) {
      e.preventDefault();
    }
  };

  const getRadius = () => {
    switch (theme.buttons.shape) {
      case 'pill': return '24px';
      case 'rounded': return '16px';
      case 'square': return '8px';
      default: return '16px';
    }
  };

  // Handle scroll for carousel pagination dots
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const scrollLeft = container.scrollLeft;
      const itemWidth = container.firstElementChild?.clientWidth || 200;
      const gap = 12;
      const newIndex = Math.round(scrollLeft / (itemWidth + gap));
      setActiveIndex(Math.min(newIndex, block.items.length - 1));
    }
  };

  const scrollToIndex = (index: number) => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const itemWidth = container.firstElementChild?.clientWidth || 200;
      const gap = 12;
      container.scrollTo({
        left: index * (itemWidth + gap),
        behavior: 'smooth',
      });
    }
  };

  // Render carousel item
  const renderItem = (item: BlockItem, isCarousel = false) => (
    <a
      key={item.id}
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => handleClick(e, item)}
      className={cn(
        'block group',
        isCarousel && 'flex-shrink-0 w-[200px] snap-start'
      )}
    >
      <motion.div
        whileTap={{ scale: 0.98 }}
        className="overflow-hidden"
        style={{ borderRadius: getRadius() }}
      >
        <div
          className="aspect-[4/3] relative overflow-hidden"
          style={{ backgroundColor: `${theme.buttons.fill_color}10` }}
        >
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.label}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 motion-reduce:transform-none"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="h-8 w-8 opacity-30" style={{ color: theme.typography.text_color }} />
            </div>
          )}
        </div>

        <div
          className="p-3"
          style={{ backgroundColor: `${theme.buttons.fill_color}08` }}
        >
          <p
            className="font-medium text-sm line-clamp-2"
            style={{ color: theme.typography.text_color }}
          >
            {tc(item.label)}
          </p>
          {item.subtitle && (
            <p
              className="text-xs mt-1 opacity-60"
              style={{ color: theme.typography.text_color }}
            >
              {tc(item.subtitle)}
            </p>
          )}
        </div>
      </motion.div>
    </a>
  );

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: `${theme.buttons.fill_color}08`,
        borderRadius: getRadius(),
      }}
    >
      {(config.section_title || config.view_all_url) && (
        <div className="flex items-center justify-between px-4 py-3">
          {config.section_title && (
            <h3
              className="font-semibold"
              style={{ color: theme.typography.text_color }}
            >
              {config.section_title}
            </h3>
          )}
          {config.view_all_url && (
            <a
              href={config.view_all_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium opacity-70 hover:opacity-100 transition-opacity"
              style={{ color: theme.buttons.fill_color }}
            >
              {config.view_all_label} →
            </a>
          )}
        </div>
      )}

      <div className="px-4 pb-4">
        {config.layout === 'carousel' && (
          <>
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-3"
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              {block.items.map((item) => renderItem(item, true))}
            </div>

            {block.items.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-2">
                {block.items.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => scrollToIndex(index)}
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-200',
                      index === activeIndex ? 'w-4' : 'w-1.5 opacity-40'
                    )}
                    style={{
                      backgroundColor: index === activeIndex
                        ? theme.buttons.fill_color
                        : theme.typography.text_color,
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {config.layout === 'grid' && (
          <div className="grid grid-cols-2 gap-3">
            {block.items.map((item) => renderItem(item))}
          </div>
        )}

        {config.layout === 'list' && (
          <div className="space-y-3">
            {block.items.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => handleClick(e, item)}
                className="flex items-center gap-3 group"
              >
                <div
                  className="w-16 h-12 rounded-lg overflow-hidden flex-shrink-0"
                  style={{ backgroundColor: `${theme.buttons.fill_color}10` }}
                >
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.label}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 opacity-30" style={{ color: theme.typography.text_color }} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="font-medium text-sm truncate group-hover:underline"
                    style={{ color: theme.typography.text_color }}
                  >
                    {tc(item.label)}
                  </p>
                  {item.subtitle && (
                    <p
                      className="text-xs opacity-60 truncate"
                      style={{ color: theme.typography.text_color }}
                    >
                      {tc(item.subtitle)}
                    </p>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
