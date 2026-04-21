// LinksBlock — vertical list of LinkButton items.
// Lifted from src/pages/PublicProfile.tsx (the richer public-profile version
// with onOutboundClick, adult-content gating, badge composition, and real
// <a> semantics) as part of Phase 3a. Adds i18n wrapping (tc) on user-facing
// strings.

import { useLanguage } from '@/hooks/useLanguage';
import { translateContent } from '@/lib/content-i18n';
import { LinkButton } from '@/components/LinkButton';
import type { BlockStyleConfig } from '@/lib/theme-defaults';
import type { BlockItem, ThemedBlockProps } from './types';

export function LinksBlock({ block, onOutboundClick, theme }: ThemedBlockProps) {
  const { t } = useLanguage();
  const tc = (text: string | null | undefined) => translateContent(text, t);

  if (block.items.length === 0) return null;

  // Parse block style config from title (legacy JSON-in-title pattern)
  let blockStyle: Partial<BlockStyleConfig> = {};
  try {
    const parsed = JSON.parse(block.title || '{}');
    if (parsed.style) {
      blockStyle = parsed.style;
    }
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

  return (
    <div className="space-y-3">
      {block.items.map((item) => (
        <LinkButton
          key={item.id}
          as="a"
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          theme={theme}
          blockStyle={blockStyle}
          title={tc(item.label)}
          subtitle={item.subtitle ? tc(item.subtitle) : undefined}
          media={item.image_url ? { kind: 'image', src: item.image_url } : undefined}
          meta={
            item.is_adult && item.badge
              ? `18+ · ${tc(item.badge)}`
              : item.is_adult
              ? '18+'
              : item.badge
              ? tc(item.badge)
              : undefined
          }
          size="medium"
          onClick={(e) => handleClick(e, item)}
        />
      ))}
    </div>
  );
}
