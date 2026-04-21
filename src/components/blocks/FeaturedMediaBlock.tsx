// FeaturedMediaBlock — high-impact visual cards with image + title overlay.
// Lifted from src/pages/PublicProfile.tsx (the richer public-profile version
// with onOutboundClick, adult-content gating, Framer Motion whileTap, and
// real <a> semantics) as part of Phase 3a. Adds i18n wrapping (tc) on the
// user-facing label.
//
// Renders aspect-video cards with:
//   - Cover image with hover scale-105 effect
//   - Dark gradient overlay (top-to-bottom black/60)
//   - Title text overlay at bottom, white, bold
//   - Optional 18+ badge (top-right, red)
//   - Empty state: ImageIcon placeholder if no image_url
//
// Restores from EditableProfileView's stripped version:
//   - onOutboundClick analytics
//   - Framer Motion whileTap micro-interactions
//   - Real <a> semantics (was rendering as <div>)

import { motion } from 'framer-motion';
import { Image as ImageIcon, ShieldAlert } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { translateContent } from '@/lib/content-i18n';
import { ThumbnailImage } from '@/components/ThumbnailImage';
import type { BlockItem, ThemedBlockProps } from './types';

export function FeaturedMediaBlock({ block, onOutboundClick, theme }: ThemedBlockProps) {
  const { t } = useLanguage();
  const tc = (text: string | null | undefined) => translateContent(text, t);

  if (block.items.length === 0) return null;

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

  return (
    <div className="space-y-3">
      {block.title && (
        <h3 className="text-sm font-medium opacity-70" style={{ color: theme.typography.text_color }}>
          {block.title}
        </h3>
      )}
      <div className="space-y-3">
        {block.items.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block group"
            onClick={(e) => handleClick(e, item)}
          >
            <motion.div
              whileTap={{ scale: 0.98 }}
              className="relative overflow-hidden transition-colors"
              style={{
                borderRadius: getButtonRadius(),
                border: `1px solid ${theme.buttons.fill_color}20`,
              }}
            >
              {item.image_url ? (
                <div className="aspect-video">
                  <ThumbnailImage
                    src={item.image_url}
                    alt={item.label}
                    className="group-hover:scale-105 transition-transform duration-300 motion-reduce:transition-none"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  {item.is_adult && (
                    <div className="absolute top-2 right-2 bg-red-500/90 text-white px-2 py-1 rounded text-xs font-semibold flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" />
                      18+
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <p className="font-semibold text-white">{tc(item.label)}</p>
                  </div>
                </div>
              ) : (
                <div className="aspect-video flex items-center justify-center relative" style={{ backgroundColor: `${theme.buttons.fill_color}10` }}>
                  <ImageIcon className="h-10 w-10 opacity-40" style={{ color: theme.typography.text_color }} />
                  {item.is_adult && (
                    <div className="absolute top-2 right-2 bg-red-500/90 text-white px-2 py-1 rounded text-xs font-semibold flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" />
                      18+
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </a>
        ))}
      </div>
    </div>
  );
}
