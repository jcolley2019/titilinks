// LinksBlock — vertical list of LinkButton items.
// Lifted from src/pages/PublicProfile.tsx (the richer public-profile version
// with onOutboundClick, adult-content gating, badge composition, and real
// <a> semantics) as part of Phase 3a. Adds i18n wrapping (tc) on user-facing
// strings.

import { useState, Fragment } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { translateContent } from '@/lib/content-i18n';
import { LinkButton } from '@/components/LinkButton';
import type { BlockStyleConfig } from '@/lib/theme-defaults';
import type { BlockItem, ThemedBlockProps } from './types';

// Optional edit-mode props. When absent, the block renders byte-identical to
// the public profile (zero-risk for the live view).
type LinksBlockEditProps = {
  editMode?: boolean;
  onItemEdit?: (id: string) => void;
  onItemDelete?: (id: string) => void;
  onItemAdd?: () => void;
};

export function LinksBlock({
  block,
  onOutboundClick,
  theme,
  editMode,
  onItemEdit,
  onItemDelete,
  onItemAdd,
}: ThemedBlockProps & LinksBlockEditProps) {
  const { t } = useLanguage();
  const tc = (text: string | null | undefined) => translateContent(text, t);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

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

        // Per-item border override (style_json) takes precedence over the
        // block-level border; falls back to blockStyle when unset.
        const sj = (item.style_json && typeof item.style_json === 'object' && !Array.isArray(item.style_json))
          ? (item.style_json as Record<string, any>)
          : null;
        const itemBlockStyle = sj
          ? {
              ...blockStyle,
              ...(sj.border_width != null ? { border_width: sj.border_width } : {}),
              ...(sj.border_color ? { border_color: sj.border_color } : {}),
            }
          : blockStyle;

        const linkButton = (
          <LinkButton
            as="a"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            theme={itemTheme}
            blockStyle={itemBlockStyle}
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

        // Public profile (editMode absent): render exactly as before.
        if (!editMode) {
          return <Fragment key={item.id}>{linkButton}</Fragment>;
        }

        // Edit preview: tap card -> edit; X -> inline confirm -> delete.
        const confirming = confirmingId === item.id;
        return (
          <div key={item.id} className="relative">
            <div onClick={() => onItemEdit?.(item.id)} className="cursor-pointer">
              {linkButton}
            </div>

            {/* Delete (X) — opens inline confirm */}
            <button
              type="button"
              aria-label="Remove link"
              onClick={(e) => { e.stopPropagation(); setConfirmingId(item.id); }}
              className="absolute -top-2 -right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white/80 shadow-md ring-1 ring-white/15 hover:bg-black/90 hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            {/* Inline confirm overlay — its controls stopPropagation so neither
                tap reaches the card's onItemEdit. */}
            {confirming && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl bg-black/85 backdrop-blur-sm px-4 text-center"
              >
                <p className="text-xs font-semibold text-white">Remove this link?</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onItemDelete?.(item.id); setConfirmingId(null); }}
                    className="rounded-full bg-red-500/90 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500 transition-colors"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setConfirmingId(null); }}
                    className="rounded-full border border-white/25 px-3 py-1 text-xs font-semibold text-white/80 hover:text-white hover:border-white/50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Trailing "+" card — add another link (edit preview only) */}
      {editMode && (
        <button
          type="button"
          onClick={() => onItemAdd?.()}
          className="w-full rounded-2xl border border-dashed border-[#C9A55C]/40 py-3 text-xs font-semibold text-[#C9A55C] hover:bg-[#C9A55C]/10 transition-colors"
        >
          + Add link
        </button>
      )}
    </div>
  );
}
