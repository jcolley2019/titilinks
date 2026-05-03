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

  const VALID_SIZES = ['big', 'medium', 'small', 'button'] as const;
  type ItemSize = typeof VALID_SIZES[number];
  const resolveSize = (raw: string | null | undefined): ItemSize => {
    if (raw && (VALID_SIZES as readonly string[]).includes(raw)) return raw as ItemSize;
    if (blockStyle.size && (VALID_SIZES as readonly string[]).includes(blockStyle.size)) return blockStyle.size as ItemSize;
    return 'medium';
  };

  return (
    <div className="space-y-3">
      {block.items.map((item) => {
        // Per-item color overrides synthesize a per-link theme — bg_color
        // overrides theme.buttons.fill_color, title_color overrides text_color.
        const itemTheme = (item.bg_color || item.title_color)
          ? {
              ...theme,
              buttons: {
                ...theme.buttons,
                ...(item.bg_color ? { fill_color: item.bg_color } : {}),
                ...(item.title_color ? { text_color: item.title_color } : {}),
              },
            }
          : theme;

        return (
          <LinkButton
            key={item.id}
            as="a"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            theme={itemTheme}
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
            size={resolveSize(item.size)}
            onClick={(e) => handleClick(e, item)}
          />
        );
      })}
    </div>
  );
}
