// SocialLinksBlock — horizontal row of social platform icons.
// Lifted from src/pages/PublicProfile.tsx (the richer public-profile version
// with onOutboundClick and adult-content gating) as part of Phase 3a.
// Imports the shared SocialSvgIcon extracted in step 3a.3.
// No i18n wrapping needed — labels are platform names, not user copy.

import { ThumbnailImage } from '@/components/ThumbnailImage';
import { SocialSvgIcon } from './SocialSvgIcon';
import type { BlockItem, ThemedBlockProps } from './types';

export function SocialLinksBlock({ block, onOutboundClick, theme: _theme }: ThemedBlockProps) {
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

  return (
    <div className="flex flex-wrap justify-center gap-3">
      {block.items.map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full transition-colors relative overflow-hidden"
          title={item.label}
          onClick={(e) => handleClick(e, item)}
        >
          {item.image_url ? (
            <ThumbnailImage src={item.image_url} alt={item.label} />
          ) : (
            <SocialSvgIcon label={item.label} size={26} />
          )}
          {item.is_adult && (
            <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 flex items-center justify-center">
              <span className="text-[8px] font-bold text-white">18</span>
            </div>
          )}
        </a>
      ))}
    </div>
  );
}
