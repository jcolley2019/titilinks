// HeroCardBlock — non-interactive full-bleed hero card with image + text overlay.
// Lifted from src/pages/PublicProfile.tsx as part of Phase 3a.
//
// Reads its config (card_radius, text_alignment, text_color, overlay_opacity,
// show_profile_avatar) from item.badge as a JSON blob, with sane defaults.
//
// Restores from EditableProfileView's stripped version:
//   - Framer Motion mount animation (fade + scale-from-0.98)
//
// Intentional differences from the richer PublicProfile source:
//   - Props surface is minimal: only `block`. The source declared `theme` but
//     never used it; keeping it out avoids dead surface area.
//   - i18n wrapping (tc) added on the user-facing label + subtitle.

import { motion } from 'framer-motion';
import { useLanguage } from '@/hooks/useLanguage';
import { translateContent } from '@/lib/content-i18n';
import type { BlockWithItems } from './types';

interface HeroCardBlockProps {
  block: BlockWithItems;
}

export function HeroCardBlock({ block }: HeroCardBlockProps) {
  const { t } = useLanguage();
  const tc = (text: string | null | undefined) => translateContent(text, t);

  const item = block.items[0];
  if (!item || !item.image_url) return null;

  // Parse config from badge field
  let config = {
    card_radius: 'lg' as 'sm' | 'md' | 'lg',
    show_profile_avatar: true,
    text_alignment: 'center' as 'left' | 'center' | 'right',
    text_color: '#ffffff',
    overlay_opacity: 0.4,
  };

  if (item.badge) {
    try {
      const parsed = JSON.parse(item.badge);
      config = { ...config, ...parsed };
    } catch (e) {
      // Use defaults
    }
  }

  const getRadius = () => {
    switch (config.card_radius) {
      case 'sm': return '12px';
      case 'md': return '20px';
      case 'lg': return '28px';
      default: return '20px';
    }
  };

  const getTextAlign = (): React.CSSProperties['textAlign'] => {
    return config.text_alignment;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="relative overflow-hidden w-full"
      style={{ borderRadius: getRadius() }}
    >
      <div className="aspect-square relative">
        <img
          src={item.image_url}
          alt={item.label || 'Hero'}
          className="w-full h-full object-cover"
          loading="eager"
        />

        <div
          className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent"
          style={{ opacity: config.overlay_opacity + 0.4 }}
        />

        <div
          className="absolute bottom-0 left-0 right-0 p-5 sm:p-6"
          style={{ color: config.text_color, textAlign: getTextAlign() }}
        >
          {item.label && item.label !== 'Hero Card' && (
            <h2 className="text-xl sm:text-2xl font-bold drop-shadow-lg mb-1">
              {tc(item.label)}
            </h2>
          )}

          {item.subtitle && (
            <p className="text-sm sm:text-base opacity-90 drop-shadow">
              {tc(item.subtitle)}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
