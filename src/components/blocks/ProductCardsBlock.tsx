// ProductCardsBlock — product/merch cards with price, discount, badge, CTA.
// Lifted from src/pages/PublicProfile.tsx (the richer public-profile version
// with onOutboundClick, adult-content gating, Framer Motion whileTap, haptic
// feedback, and real <a> semantics) as part of Phase 3a. Adds i18n wrapping
// (tc) on user-facing strings.
//
// Supports two layouts (selected via JSON in block.title):
//   - 'stacked' (default): 2-column grid of square image + content cards
//   - 'split': horizontal cards with 28x28 image on left, content on right
//
// Restores from EditableProfileView's stripped version:
//   - onOutboundClick analytics
//   - Framer Motion whileTap micro-interactions
//   - triggerHaptic('light') on touch start
//   - Real <a> semantics (was rendering as <div>)

import { motion } from 'framer-motion';
import { ShoppingBag, ShieldAlert } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { translateContent } from '@/lib/content-i18n';
import { ThumbnailImage } from '@/components/ThumbnailImage';
import { triggerHaptic } from '@/hooks/useHapticFeedback';
import type { BlockItem, ThemedBlockProps } from './types';

export function ProductCardsBlock({ block, onOutboundClick, theme }: ThemedBlockProps) {
  const { t } = useLanguage();
  const tc = (text: string | null | undefined) => translateContent(text, t);

  if (block.items.length === 0) return null;

  // Parse layout config from block title (legacy JSON-in-title pattern)
  let layout: 'stacked' | 'split' = 'stacked';
  try {
    const parsed = JSON.parse(block.title || '{}');
    if (parsed.layout === 'split') layout = 'split';
  } catch {
    // Not JSON, ignore
  }

  const handleClick = (e: React.MouseEvent, item: BlockItem) => {
    const shouldNavigate = onOutboundClick(
      block.type,
      block.id,
      item.id,
      item.url,
      item.is_adult || false
    );
    if (!shouldNavigate) {
      e.preventDefault();
    }
  };

  const getButtonRadius = () => {
    switch (theme.buttons.shape) {
      case 'pill': return '9999px';
      case 'rounded': return '16px';
      case 'square': return '6px';
      default: return '16px';
    }
  };

  const formatPrice = (price: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(price);
  };

  const getDiscountPercent = (price: number, compareAt: number) => {
    return Math.round(((compareAt - price) / compareAt) * 100);
  };

  const renderStackedCard = (item: BlockItem) => (
    <a
      key={item.id}
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block group"
      onClick={(e) => handleClick(e, item)}
      onTouchStart={() => triggerHaptic('light')}
    >
      <motion.div
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.1 }}
        className="overflow-hidden transform-gpu will-change-transform motion-reduce:transform-none"
        style={{
          backgroundColor: `${theme.buttons.fill_color}08`,
          borderRadius: getButtonRadius(),
          border: `1px solid ${theme.buttons.fill_color}15`,
        }}
      >
        <div className="aspect-square flex items-center justify-center overflow-hidden relative" style={{ backgroundColor: `${theme.buttons.fill_color}05` }}>
          {item.image_url ? (
            <ThumbnailImage
              src={item.image_url}
              alt={item.label}
              className="group-hover:scale-105 transition-transform duration-300 motion-reduce:transition-none"
            />
          ) : (
            <ShoppingBag className="h-8 w-8 opacity-40" style={{ color: theme.typography.text_color }} />
          )}
          {item.is_adult && (
            <div className="absolute top-2 right-2 bg-red-500/90 text-white px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-0.5">
              <ShieldAlert className="h-3 w-3" />
              18+
            </div>
          )}
          {item.badge && (
            <span
              className="absolute top-2 left-2 text-[10px] font-bold px-2 py-1 rounded"
              style={{ backgroundColor: theme.buttons.fill_color, color: theme.buttons.text_color }}
            >
              {tc(item.badge)}
            </span>
          )}
          {item.compare_at_price && item.price && item.compare_at_price > item.price && (
            <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-1 rounded bg-red-500 text-white">
              -{getDiscountPercent(item.price, item.compare_at_price)}%
            </span>
          )}
        </div>
        <div className="p-3 space-y-2">
          <p className="font-semibold text-sm line-clamp-2" style={{ color: theme.typography.text_color }}>{tc(item.label)}</p>

          {item.price && (
            <div className="flex items-center gap-2">
              <span className="font-bold text-base" style={{ color: theme.buttons.fill_color }}>
                {formatPrice(item.price, item.currency || 'USD')}
              </span>
              {item.compare_at_price && item.compare_at_price > item.price && (
                <span className="text-xs line-through opacity-50" style={{ color: theme.typography.text_color }}>
                  {formatPrice(item.compare_at_price, item.currency || 'USD')}
                </span>
              )}
            </div>
          )}

          {!item.price && item.subtitle && (
            <p className="text-xs opacity-60" style={{ color: theme.typography.text_color }}>{tc(item.subtitle)}</p>
          )}

          {item.cta_label && (
            <div
              className="w-full text-center py-2 text-xs font-semibold transition-transform duration-100 active:scale-[0.98] transform-gpu motion-reduce:transform-none"
              style={{
                backgroundColor: theme.buttons.fill_color,
                color: theme.buttons.text_color,
                borderRadius: theme.buttons.shape === 'pill' ? '9999px' : theme.buttons.shape === 'square' ? '6px' : '8px',
              }}
            >
              {item.cta_label}
            </div>
          )}
        </div>
      </motion.div>
    </a>
  );

  const renderSplitCard = (item: BlockItem) => (
    <a
      key={item.id}
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block group"
      onClick={(e) => handleClick(e, item)}
      onTouchStart={() => triggerHaptic('light')}
    >
      <motion.div
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.1 }}
        className="flex overflow-hidden transform-gpu will-change-transform motion-reduce:transform-none"
        style={{
          backgroundColor: `${theme.buttons.fill_color}08`,
          borderRadius: getButtonRadius(),
          border: `1px solid ${theme.buttons.fill_color}15`,
        }}
      >
        <div className="w-28 h-28 flex-shrink-0 flex items-center justify-center overflow-hidden relative" style={{ backgroundColor: `${theme.buttons.fill_color}05` }}>
          {item.image_url ? (
            <ThumbnailImage
              src={item.image_url}
              alt={item.label}
              className="group-hover:scale-105 transition-transform duration-300 motion-reduce:transition-none"
            />
          ) : (
            <ShoppingBag className="h-6 w-6 opacity-40" style={{ color: theme.typography.text_color }} />
          )}
          {item.is_adult && (
            <div className="absolute top-1 right-1 bg-red-500/90 text-white px-1 py-0.5 rounded text-[8px] font-semibold flex items-center gap-0.5">
              <ShieldAlert className="h-2.5 w-2.5" />
              18+
            </div>
          )}
        </div>

        <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-sm line-clamp-2" style={{ color: theme.typography.text_color }}>{tc(item.label)}</p>
              {item.badge && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ backgroundColor: `${theme.buttons.fill_color}20`, color: theme.buttons.fill_color }}
                >
                  {tc(item.badge)}
                </span>
              )}
            </div>
            {item.subtitle && (
              <p className="text-xs mt-1 opacity-60 line-clamp-1" style={{ color: theme.typography.text_color }}>{tc(item.subtitle)}</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 mt-2">
            {item.price ? (
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm" style={{ color: theme.buttons.fill_color }}>
                  {formatPrice(item.price, item.currency || 'USD')}
                </span>
                {item.compare_at_price && item.compare_at_price > item.price && (
                  <>
                    <span className="text-[10px] line-through opacity-50" style={{ color: theme.typography.text_color }}>
                      {formatPrice(item.compare_at_price, item.currency || 'USD')}
                    </span>
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-500 text-white">
                      -{getDiscountPercent(item.price, item.compare_at_price)}%
                    </span>
                  </>
                )}
              </div>
            ) : (
              <div />
            )}

            {item.cta_label && (
              <motion.span
                whileHover={{ scale: 1.05 }}
                className="text-[10px] font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
                style={{
                  backgroundColor: theme.buttons.fill_color,
                  color: theme.buttons.text_color,
                  borderRadius: theme.buttons.shape === 'pill' ? '9999px' : theme.buttons.shape === 'square' ? '4px' : '6px',
                }}
              >
                {item.cta_label}
              </motion.span>
            )}
          </div>
        </div>
      </motion.div>
    </a>
  );

  return (
    <div className="space-y-3">
      {layout === 'stacked' ? (
        <div className="grid grid-cols-2 gap-3">
          {block.items.map(renderStackedCard)}
        </div>
      ) : (
        <div className="space-y-3">
          {block.items.map(renderSplitCard)}
        </div>
      )}
    </div>
  );
}
