// SocialIconRowBlock — configurable row of social icons (no labels).
// Lifted from src/pages/PublicProfile.tsx line 943 as part of Phase 3a.
//
// Reads its config (icon_size: sm/md/lg, spacing: tight/normal/loose,
// use_theme_color, custom_color) from JSON-in-block.title.
//
// Restores from EditableProfileView's stripped version:
//   - onOutboundClick analytics
//   - Framer Motion whileTap micro-interaction
//
// Intentional details preserved from the source:
//   - Uses motion.a directly as the anchor (NOT a wrapping motion.div).
//   - whileTap scale is 0.95 (NOT the 0.98 other blocks use).
//   - No haptic feedback — that was never present in the source.

import { motion } from 'framer-motion';
import { useLanguage } from '@/hooks/useLanguage';
import { translateContent } from '@/lib/content-i18n';
import { ThumbnailImage } from '@/components/ThumbnailImage';
import { SocialSvgIcon } from './SocialSvgIcon';
import type { BlockItem, ThemedBlockProps } from './types';

export function SocialIconRowBlock({ block, onOutboundClick, theme }: ThemedBlockProps) {
  if (block.items.length === 0) return null;

  const { t } = useLanguage();
  const tc = (text: string | null | undefined) => translateContent(text, t);

  // Parse config from block title
  let config = {
    icon_size: 'md' as 'sm' | 'md' | 'lg',
    spacing: 'normal' as 'tight' | 'normal' | 'loose',
    use_theme_color: true,
    custom_color: '#ffffff',
  };

  if (block.title) {
    try {
      const parsed = JSON.parse(block.title);
      config = { ...config, ...parsed };
    } catch {
      // Use defaults
    }
  }

  const handleClick = (e: React.MouseEvent, item: BlockItem) => {
    const shouldNavigate = onOutboundClick(block.type, block.id, item.id, item.url, item.is_adult || false);
    if (!shouldNavigate) {
      e.preventDefault();
    }
  };

  const getIconSize = () => {
    switch (config.icon_size) {
      case 'sm': return 18;
      case 'md': return 22;
      case 'lg': return 26;
    }
  };

  const getSize = () => {
    switch (config.icon_size) {
      case 'sm': return 'h-11 w-11';
      case 'md': return 'h-12 w-12';
      case 'lg': return 'h-14 w-14';
    }
  };

  const getGap = () => {
    switch (config.spacing) {
      case 'tight': return 'gap-2';
      case 'normal': return 'gap-3';
      case 'loose': return 'gap-4';
    }
  };

  const sizeClass = getSize();
  const bgColor = config.use_theme_color
    ? `${theme.buttons.fill_color}20`
    : `${config.custom_color}20`;

  return (
    <div className={`flex flex-wrap justify-center ${getGap()}`}>
      {block.items.map((item) => (
        <motion.a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          whileTap={{ scale: 0.95 }}
          className={`${sizeClass} rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 motion-reduce:transform-none`}
          style={{ backgroundColor: bgColor }}
          title={tc(item.label)}
          onClick={(e) => handleClick(e, item)}
        >
          {item.image_url ? (
            <ThumbnailImage src={item.image_url} alt={tc(item.label)} />
          ) : (
            <SocialSvgIcon label={tc(item.label)} size={getIconSize()} />
          )}
        </motion.a>
      ))}
    </div>
  );
}
