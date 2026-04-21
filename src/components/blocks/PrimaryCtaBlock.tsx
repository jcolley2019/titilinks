// PrimaryCtaBlock — single hero CTA button.
// Lifted from src/pages/PublicProfile.tsx (the richer public-profile version
// with onOutboundClick, adult-content gating, and real <a> semantics) as part
// of Phase 3a. Adds i18n wrapping (tc) on user-facing strings.

import { useLanguage } from '@/hooks/useLanguage';
import { translateContent } from '@/lib/content-i18n';
import { LinkButton } from '@/components/LinkButton';
import type { BlockStyleConfig } from '@/lib/theme-defaults';
import type { ThemedBlockProps } from './types';

export function PrimaryCtaBlock({ block, onOutboundClick, theme }: ThemedBlockProps) {
  const { t } = useLanguage();
  const tc = (text: string | null | undefined) => translateContent(text, t);

  const item = block.items[0];
  if (!item) return null;

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

  const handleClick = (e: React.MouseEvent) => {
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
    <div data-block-type="primary_cta">
      <LinkButton
        as="a"
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        theme={theme}
        blockStyle={blockStyle}
        title={tc(item.label)}
        subtitle={item.subtitle ? tc(item.subtitle) : undefined}
        meta={item.is_adult ? '18+' : undefined}
        size={item.subtitle ? 'medium' : 'button'}
        onClick={handleClick}
      />
    </div>
  );
}
