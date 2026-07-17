// LinksBlock — vertical list of LinkButton items.
// Lifted from src/pages/PublicProfile.tsx (the richer public-profile version
// with onOutboundClick, adult-content gating, badge composition, and real
// <a> semantics) as part of Phase 3a. Adds i18n wrapping (tc) on user-facing
// strings.

import { useState, Fragment } from 'react';
import { X, GripVertical } from 'lucide-react';
import { GLASS_AFFORDANCE } from '@/lib/surface';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLanguage } from '@/hooks/useLanguage';
import { translateContent } from '@/lib/content-i18n';
import { LinkButton } from '@/components/LinkButton';
import { gatedHref, isGated, openGated } from '@/lib/adult-gate';
import { AdultCardGate } from './AdultCardGate';
import { leadingIconFor, useProfileAvatar } from './link-leading-icon';
import type { BlockStyleConfig } from '@/lib/theme-defaults';
import { planLinkLayout, VALID_SIZES, type ItemSize } from '@/lib/link-layout';
import type { BlockItem, ThemedBlockProps } from './types';

// Optional edit-mode props. When absent, the block renders byte-identical to
// the public profile (zero-risk for the live view).
type LinksBlockEditProps = {
  editMode?: boolean;
  onItemEdit?: (id: string) => void;
  onItemDelete?: (id: string) => void;
  onItemAdd?: () => void;
  onItemsReorder?: (orderedItemIds: string[]) => void;
};

// Edit-mode per-item shell: drag handle (top-left), tap-to-edit body, and the
// delete (X) badge + inline confirm overlay (top-right). Self-contained sortable
// node mirroring SortablePreviewCard. Never rendered on the public path.
function SortableLinkItem({
  item,
  onItemEdit,
  onItemDelete,
  children,
}: {
  item: BlockItem;
  onItemEdit?: (id: string) => void;
  onItemDelete?: (id: string) => void;
  children: React.ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? 'none' : transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="relative"
    >
      {/* Drag handle — top-left, mirrors the X badge in the opposite corner.
          Handle-only activation (listeners live here), so a card tap still edits. */}
      <button
        type="button"
        aria-label="Reorder link"
        {...attributes}
        {...listeners}
        className="absolute -top-2 -left-2 z-10 h-6 w-6 rounded-full bg-black/70 text-white/80 ring-1 ring-white/15 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <div onClick={() => onItemEdit?.(item.id)} className="cursor-pointer">
        {children}
      </div>

      {/* Delete (X) — opens inline confirm */}
      <button
        type="button"
        aria-label="Remove link"
        onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
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
              onClick={(e) => { e.stopPropagation(); onItemDelete?.(item.id); setConfirming(false); }}
              className="rounded-full bg-red-500/90 px-3 py-1 text-xs font-semibold text-white hover:bg-red-500 transition-colors"
            >
              Remove
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
              className="rounded-full border border-white/25 px-3 py-1 text-xs font-semibold text-white/80 hover:text-white hover:border-white/50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function LinksBlock({
  block,
  onOutboundClick,
  theme,
  editMode,
  onItemEdit,
  onItemDelete,
  onItemAdd,
  onItemsReorder,
}: ThemedBlockProps & LinksBlockEditProps) {
  const { t } = useLanguage();
  const tc = (text: string | null | undefined) => translateContent(text, t);
  // Creator's live profile photo — lets a link opt into using the avatar as its
  // leading icon (see leadingIconFor / icon_source).
  const profileAvatar = useProfileAvatar();

  // ADULT.2a: ids the visitor has age-confirmed in-card. Deliberately component
  // state — the reveal lasts the session and is never persisted, so a fresh
  // load always re-gates.
  const [revealedAdult, setRevealedAdult] = useState<ReadonlySet<string>>(() => new Set());
  const revealAdult = (id: string) =>
    setRevealedAdult((prev) => new Set(prev).add(id));

  // Item-level drag sensors — nested inside the block-level DndContext. Handle-
  // only activation with an 8px threshold so a stationary press still taps.
  const itemSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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
    // A gated card only reaches this handler once it has been revealed, i.e.
    // the visitor already confirmed their age in-card. So it does not re-enter
    // the modal gate (isAdult is reported false, which still tracks the click)
    // — but its URL is absent from the DOM by design, so nothing would happen
    // on its own. The open has to be made here, client-side.
    const gated = isGated(item, editMode);
    const shouldNavigate = onOutboundClick(
      block.type,
      block.id,
      item.id,
      item.url,
      gated ? false : item.is_adult || false
    );
    if (gated) {
      e.preventDefault();
      if (shouldNavigate) openGated(item.url);
      return;
    }
    if (!shouldNavigate) {
      e.preventDefault();
    }
  };

  const handleItemDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = block.items.map((i) => i.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    onItemsReorder?.(arrayMove(ids, oldIndex, newIndex));
  };

  const resolveSize = (raw: string | null | undefined): ItemSize => {
    if (raw && (VALID_SIZES as readonly string[]).includes(raw)) return raw as ItemSize;
    if (blockStyle.size && (VALID_SIZES as readonly string[]).includes(blockStyle.size)) return blockStyle.size as ItemSize;
    return 'medium';
  };

  // Build a single link card. renderSize is the size to ACTUALLY render (a lone
  // Small is promoted to 'big'); span controls half- vs full-width.
  const buildLinkButton = (item: BlockItem, renderSize: ItemSize, span: 'full' | 'half') => {
    // ADULT.2a: a gated card shows its disclaimer in place of the real card
    // until the visitor confirms their age. The URL is not handed to the gate,
    // so nothing about the destination is rendered pre-reveal.
    if (isGated(item, editMode) && !revealedAdult.has(item.id)) {
      return (
        <AdultCardGate
          imageUrl={item.image_url}
          size={renderSize}
          span={span}
          onContinue={() => revealAdult(item.id)}
        />
      );
    }

    // Per-item style overrides (style_json): border, leading-icon, gradient.
    const sj = (item.style_json && typeof item.style_json === 'object' && !Array.isArray(item.style_json))
      ? (item.style_json as Record<string, any>)
      : null;
    const grad = sj?.bg_gradient as { from?: string; to?: string } | undefined;
    const fillGradient = grad
      ? `linear-gradient(135deg, ${grad.from || '#C9A55C'}, ${grad.to || '#5B3FA0'})`
      : undefined;
    // A per-item background color OR gradient paints the button SOLID (filled).
    const filled = !!item.bg_color || !!fillGradient;
    // bg_color → fill; gradient (no bg_color) → its start color drives contrast.
    const fillBase = item.bg_color || grad?.from;

    // Per-item color overrides synthesize a per-link theme — fill drives the
    // button background color, title_color overrides text_color.
    const itemTheme = (fillBase || item.title_color)
      ? {
          ...theme,
          buttons: {
            ...theme.buttons,
            ...(fillBase ? { fill_color: fillBase } : {}),
            ...(item.title_color ? { text_color: item.title_color } : {}),
          },
        }
      : theme;

    const itemBlockStyle = (sj || filled)
      ? {
          ...blockStyle,
          ...(sj?.border_width != null ? { border_width: sj.border_width } : {}),
          ...(sj?.border_color ? { border_color: sj.border_color } : {}),
          ...(filled ? { variant: 'filled' as const, background_opacity: 1 } : {}),
        }
      : blockStyle;

    return (
      <LinkButton
        as="a"
        href={gatedHref(item.url, item.is_adult, editMode)}
        target="_blank"
        rel="noopener noreferrer"
        theme={itemTheme}
        blockStyle={itemBlockStyle}
        fillGradient={fillGradient}
        titleColor={item.title_color || undefined}
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
        size={renderSize}
        span={span}
        socialIcon={leadingIconFor({
          url: item.url,
          iconSource: sj?.icon_source as string | undefined,
          hasImage: !!item.image_url,
          avatarUrl: profileAvatar,
          iconColor: sj?.icon_color as string | undefined,
          iconImage: sj?.icon_image as string | undefined,
        })}
        onClick={(e) => handleClick(e, item)}
      />
    );
  };

  // Pair consecutive Small cards into half-width rows; an unpaired Small falls
  // back to a full-width Big. Shared by both render paths so preview == live.
  const layout = planLinkLayout(block.items, resolveSize);

  // Public render: no DnD. Pairs render side-by-side; everything else full-width.
  if (!editMode) {
    return (
      <div className="space-y-3">
        {layout.map((row) => {
          if (row.kind === 'pair') {
            return (
              <div key={`${row.items[0].id}-${row.items[1].id}`} className="lb-row">
                {buildLinkButton(row.items[0], 'small', 'half')}
                {buildLinkButton(row.items[1], 'small', 'half')}
              </div>
            );
          }
          const renderSize = row.kind === 'lone-small' ? 'big' : resolveSize(row.item.size);
          return <Fragment key={row.item.id}>{buildLinkButton(row.item, renderSize, 'full')}</Fragment>;
        })}
      </div>
    );
  }

  // Edit render: grid-aware DnD (free axis so a card can move between pair
  // slots) + trailing add button.
  return (
    <div className="space-y-3">
      <DndContext
        sensors={itemSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleItemDragEnd}
      >
        <SortableContext
          items={block.items.map((i) => i.id)}
          strategy={rectSortingStrategy}
        >
          {layout.map((row) => {
            // Pair: two independently sortable half-width cards in one grid row.
            if (row.kind === 'pair') {
              return (
                <div key={`${row.items[0].id}-${row.items[1].id}`} className="lb-row">
                  <SortableLinkItem item={row.items[0]} onItemEdit={onItemEdit} onItemDelete={onItemDelete}>
                    {buildLinkButton(row.items[0], 'small', 'half')}
                  </SortableLinkItem>
                  <SortableLinkItem item={row.items[1]} onItemEdit={onItemEdit} onItemDelete={onItemDelete}>
                    {buildLinkButton(row.items[1], 'small', 'half')}
                  </SortableLinkItem>
                </div>
              );
            }
            // Lone Small: rendered full-width as Big (revert is announced via a
            // toast from the delete handler — no inline notice).
            if (row.kind === 'lone-small') {
              return (
                <SortableLinkItem key={row.item.id} item={row.item} onItemEdit={onItemEdit} onItemDelete={onItemDelete}>
                  {buildLinkButton(row.item, 'big', 'full')}
                </SortableLinkItem>
              );
            }
            // Full-width single.
            return (
              <SortableLinkItem key={row.item.id} item={row.item} onItemEdit={onItemEdit} onItemDelete={onItemDelete}>
                {buildLinkButton(row.item, resolveSize(row.item.size), 'full')}
              </SortableLinkItem>
            );
          })}
        </SortableContext>
      </DndContext>

      {/* Trailing "+" card — add another link (edit preview only) */}
      <button
        type="button"
        onClick={() => onItemAdd?.()}
        className={`w-full rounded-2xl ${GLASS_AFFORDANCE}`}
      >
        + Add link
      </button>
    </div>
  );
}
