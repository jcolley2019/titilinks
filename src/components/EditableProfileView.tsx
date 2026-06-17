import { useState, useRef, useEffect } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { motion } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers';
import {
  Link as LinkIcon,
  ShoppingBag,
  Image as ImageIcon,
  ShieldAlert,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  Camera,
  Pencil,
  Trash2,
  MousePointer,
  Share2,
  FileText,
  Mail,
  User,
  Volume2,
  VolumeX,
  Play,
  Plus,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getThemeWithDefaults, applyAutoContrast, type ThemeJson, type BlockStyleConfig, DEFAULT_BLOCK_STYLE } from '@/lib/theme-defaults';
import { getChromeTokens, relativeLuminance, type ChromeTokens } from '@/lib/contrast';
import { LinkButton } from '@/components/LinkButton';
import { ThumbnailImage } from '@/components/ThumbnailImage';
import { SmoothImage } from '@/components/SmoothImage';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/hooks/useHapticFeedback';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';
import { translateContent } from '@/lib/content-i18n';
import type { Tables, Enums } from '@/integrations/supabase/types';
import type { ClickHandler } from '@/components/blocks/types';
import { PrimaryCtaBlock } from '@/components/blocks/PrimaryCtaBlock';
import { LinksBlock } from '@/components/blocks/LinksBlock';
import { SocialLinksBlock } from '@/components/blocks/SocialLinksBlock';
import { ProductCardsBlock } from '@/components/blocks/ProductCardsBlock';
import { FeaturedMediaBlock } from '@/components/blocks/FeaturedMediaBlock';
import { VideoFeedBlock } from '@/components/blocks/VideoFeedBlock';
import { HeroCardBlock } from '@/components/blocks/HeroCardBlock';
import { SocialIconRowBlock } from '@/components/blocks/SocialIconRowBlock';
import { PlatformIcon } from '@/components/PlatformIcon';
import { EmailSubscribeBlock } from '@/components/blocks/EmailSubscribeBlock';
import { ContentSectionBlock } from '@/components/blocks/ContentSectionBlock';
import { TextBlock } from '@/components/blocks/TextBlock';
import { resolveFontFamily } from '@/lib/fonts';
import { createPortal } from 'react-dom';

// ─── Types ───────────────────────────────────────────────────────────────────

type Block = Tables<'blocks'>;
type BlockItem = Tables<'block_items'>;

interface BlockWithItems extends Block {
  items: BlockItem[];
}

interface ThemedBlockProps {
  block: BlockWithItems;
  onOutboundClick: (blockType: string, blockId: string, itemId: string, url: string, isAdult?: boolean) => boolean;
  theme: ThemeJson;
}

interface EditableProfileViewProps {
  page: Tables<'pages'>;
  blocks: BlockWithItems[];
  editMode: boolean;
  onBlockEdit: (blockId: string) => void;
  onBlockToggle: (blockId: string, enabled: boolean) => void;
  onBlockReorder: (blockIds: string[]) => void;
  onRefresh: () => void;
  selectedMode: 'shop' | 'recruit';
  onModeChange: (mode: 'shop' | 'recruit') => void;
  onOutboundClick?: ClickHandler;
  onAddContent?: () => void;
  // Per-item edit affordances for links blocks (G2). Optional — absent on the
  // public/live render.
  onItemEdit?: (blockId: string, itemId: string) => void;
  onItemDelete?: (itemId: string) => void;
  onItemAdd?: (blockId: string) => void;
  onItemsReorder?: (blockId: string, orderedItemIds: string[]) => void;
  stickyTop?: number | string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getFontFamily(theme: ThemeJson): string {
  switch (theme.typography.font) {
    case 'inter': return "'Inter', sans-serif";
    case 'system': return 'system-ui, sans-serif';
    case 'serif': return 'Georgia, serif';
    case 'mono': return 'monospace';
    case 'playfair': return "'Playfair Display', serif";
    case 'bebas': return "'Bebas Neue', cursive";
    case 'abril': return "'Abril Fatface', cursive";
    case 'pacifico': return "'Pacifico', cursive";
    case 'orbitron': return "'Orbitron', sans-serif";
    case 'caveat': return "'Caveat', cursive";
    case 'archivo': return "'Archivo Black', sans-serif";
    case 'lora': return "'Lora', serif";
    case 'patrick': return "'Patrick Hand', cursive";
    case 'space': return "'Space Grotesk', sans-serif";
    default: return "'Inter', sans-serif";
  }
}

// ─── SocialSvgIcon ───────────────────────────────────────────────────────────

function SocialSvgIcon({ label, size = 20, color = 'currentColor' }: { label: string; size?: number; color?: string }) {
  return <PlatformIcon label={label} size={size} color={color} />;
}

// ─── Block Renderers ─────────────────────────────────────────────────────────

function BlockRenderer({
  block,
  onOutboundClick,
  theme,
  pageId,
  editMode,
  onItemEdit,
  onItemDelete,
  onItemAdd,
  onItemsReorder,
}: ThemedBlockProps & {
  pageId?: string;
  editMode?: boolean;
  onItemEdit?: (id: string) => void;
  onItemDelete?: (id: string) => void;
  onItemAdd?: () => void;
  onItemsReorder?: (orderedItemIds: string[]) => void;
}) {
  const blockProps = { block, onOutboundClick, theme };

  switch (block.type) {
    case 'primary_cta':
      return <PrimaryCtaBlock {...blockProps} />;
    case 'social_links':
      return <SocialLinksBlock {...blockProps} />;
    case 'links':
      return (
        <LinksBlock
          {...blockProps}
          editMode={editMode}
          onItemEdit={onItemEdit}
          onItemDelete={onItemDelete}
          onItemAdd={onItemAdd}
          onItemsReorder={onItemsReorder}
        />
      );
    case 'product_cards':
      return <ProductCardsBlock {...blockProps} />;
    case 'featured_media':
      return <FeaturedMediaBlock {...blockProps} />;
    case 'video_feed':
      return <VideoFeedBlock {...blockProps} />;
    case 'text':
      return <TextBlock {...blockProps} />;
    case 'hero_card':
      return <HeroCardBlock block={block} />;
    case 'social_icon_row':
      return <SocialIconRowBlock {...blockProps} />;
    case 'email_subscribe':
      return <EmailSubscribeBlock block={block} theme={theme} pageId={pageId} />;
    case 'content_section':
      return <ContentSectionBlock {...blockProps} />;
    case 'gallery':
      return <GalleryBlock block={block} theme={theme} onEdit={() => {}} />;
    case 'bio':
      return <BioBlock block={block} theme={theme} />;
    default:
      return null;
  }
}

function BioBlock({ block, theme }: Omit<ThemedBlockProps, 'onOutboundClick'>) {
  const bioText = block.items[0]?.label || '';
  if (!bioText) return null;

  // Style config stored as JSON in block.title; the bio text lives in items[0].label.
  let cfg: { align: 'left' | 'center' | 'right'; font: string; bold: boolean; size: 'sm' | 'base' | 'lg' } = {
    align: 'center',
    font: '',
    bold: false,
    size: 'base',
  };
  if (block.title) {
    try {
      cfg = { ...cfg, ...JSON.parse(block.title) };
    } catch {
      // No JSON config (legacy bio) — keep defaults.
    }
  }

  const alignClass =
    cfg.align === 'left' ? 'text-left' : cfg.align === 'right' ? 'text-right' : 'text-center';
  const sizeClass = cfg.size === 'sm' ? 'text-sm' : cfg.size === 'lg' ? 'text-lg' : 'text-base';
  const fontFamily = resolveFontFamily(cfg.font);

  return (
    <div className={cn('px-1 py-3', alignClass)} style={fontFamily ? { fontFamily } : undefined}>
      <p
        className={cn('leading-relaxed whitespace-pre-wrap', sizeClass, cfg.bold ? 'font-bold' : 'font-normal')}
        style={{ color: theme.typography.text_color, opacity: 0.85 }}
      >
        {bioText}
      </p>
    </div>
  );
}

function GalleryBlock({ block, theme, onEdit, onDelete }: Omit<ThemedBlockProps, 'onOutboundClick'> & { onEdit?: () => void; onDelete?: (itemId: string) => void }) {
  const { t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = block.items.length;

  // Layout config stored as JSON in block.title (same pattern as BioBlock).
  // 'full' = current edge-to-edge carousel. Missing/invalid title => 'full' (no migration).
  let layout: 'full' | 'filmstrip' | 'grid' = 'full';
  let autoScroll = true;
  let speedMs = 7000;
  try {
    const parsed = JSON.parse(block.title || '');
    if (parsed && (parsed.layout === 'filmstrip' || parsed.layout === 'grid')) layout = parsed.layout;
    if (parsed?.autoScroll === false) autoScroll = false;
    speedMs = parsed?.speed === 'fast' ? 3000 : parsed?.speed === 'medium' ? 5000 : 7000;
  } catch { /* legacy/plain title => full */ }

  // Seamless infinite loop: public showcase only (no delete handles), filmstrip
  // layout, 2+ photos, auto-scroll on. Render the strip twice and glide
  // continuously, wrapping by exactly one copy width (pixel-identical) so the
  // first photo flows back around with no rewind/jump.
  const loop = layout === 'filmstrip' && autoScroll && count >= 2 && !onDelete;
  const stripItems = loop ? [...block.items, ...block.items] : block.items;

  // Filmstrip auto-advance: one photo every 4s; any touch pauses it for 8s.
  const stripRef = useRef<HTMLDivElement>(null);
  const pausedUntil = useRef(0);
  const pauseAutoScroll = () => { pausedUntil.current = Date.now() + 8000; };
  useEffect(() => {
    if (!loop) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = stripRef.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (el.scrollWidth > 0 && Date.now() >= pausedUntil.current) {
        const oneCopy = el.scrollWidth / 2;
        const pxPerSec = (el.clientWidth * 0.72 * 1000) / speedMs;
        let next = el.scrollLeft + pxPerSec * dt;
        if (next >= oneCopy) next -= oneCopy;
        el.scrollLeft = next;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loop, speedMs]);

  // Lightbox: tap a photo → fullscreen swipe viewer. Auto-scroll pauses while open.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const openLightbox = (i: number) => { pausedUntil.current = Date.now() + 1e9; setLightboxIndex(i); };
  const closeLightbox = () => { pausedUntil.current = Date.now() + 5000; setLightboxIndex(null); };
  useEffect(() => {
    if (lightboxIndex === null) return;
    const el = lightboxRef.current;
    if (el) el.scrollTo({ left: lightboxIndex * el.clientWidth });
  }, [lightboxIndex]);
  const lightbox = lightboxIndex === null ? null : createPortal(
    <div className="fixed inset-0 z-[130] bg-black/95 flex flex-col" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={closeLightbox}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center text-2xl leading-none"
      >
        ×
      </button>
      <div
        ref={lightboxRef}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {block.items.map((item) => (
          <div key={item.id} className="relative flex-shrink-0 w-full h-full snap-center snap-always flex items-center justify-center p-4">
            {item.image_url && (
              <img src={item.image_url} alt={item.label || 'Photo'} className="max-w-full max-h-full object-contain rounded-lg" />
            )}
            {item.label && item.label !== 'Photo' && (
              <p className="absolute bottom-6 left-0 right-0 text-center text-white/80 text-sm px-6">{item.label}</p>
            )}
          </div>
        ))}
      </div>
    </div>,
    document.body
  );

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      left: dir === 'right' ? scrollRef.current.clientWidth : -scrollRef.current.clientWidth,
      behavior: 'smooth',
    });
  };

  if (layout === 'filmstrip' && count > 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold" style={{ color: theme.typography.text_color }}>
          {t('gallery.label')} ({count} {count === 1 ? t('gallery.photo') : t('gallery.photos')})
        </p>
        <div
          ref={stripRef}
          onPointerDown={pauseAutoScroll}
          onTouchStart={pauseAutoScroll}
          className={`flex overflow-x-auto pb-1 ${loop ? '' : 'gap-2 snap-x snap-mandatory'}`}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {stripItems.map((item, i) => (
            <div
              key={`${item.id}-${i}`}
              onClick={(e) => { e.stopPropagation(); openLightbox(i % count); }}
              className={`relative flex-shrink-0 w-[72%] rounded-xl overflow-hidden cursor-pointer ${loop ? 'mr-2' : 'first:ml-[14%] last:mr-[14%] snap-center snap-always'}`}
              style={{ aspectRatio: '1/1', backgroundColor: `${theme.buttons.fill_color}10` }}
            >
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.label || 'Gallery photo'}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="h-6 w-6 opacity-30" style={{ color: theme.typography.text_color }} />
                </div>
              )}
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
        {lightbox}
      </div>
    );
  }

  if (layout === 'grid' && count > 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold" style={{ color: theme.typography.text_color }}>
          {t('gallery.label')} ({count} {count === 1 ? t('gallery.photo') : t('gallery.photos')})
        </p>
        <div className="grid grid-cols-2 gap-2">
          {block.items.map((item, i) => (
            <div
              key={item.id}
              onClick={(e) => { e.stopPropagation(); openLightbox(i); }}
              className="relative rounded-xl overflow-hidden cursor-pointer"
              style={{ aspectRatio: '1/1', backgroundColor: `${theme.buttons.fill_color}10` }}
            >
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.label || 'Gallery photo'}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="h-6 w-6 opacity-30" style={{ color: theme.typography.text_color }} />
                </div>
              )}
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
        {lightbox}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold" style={{ color: theme.typography.text_color }}>
        {t('gallery.label')} ({count} {count === 1 ? t('gallery.photo') : t('gallery.photos')})
      </p>

      <div className="relative">
        {count > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); scroll('left'); }}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors -ml-2"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        <div
          ref={scrollRef}
          className="flex overflow-x-auto snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {block.items.map((item, i) => (
            <div
              key={item.id}
              onClick={(e) => { e.stopPropagation(); openLightbox(i); }}
              className="relative flex-shrink-0 w-full rounded-xl overflow-hidden snap-start cursor-pointer"
              style={{ minWidth: '100%', aspectRatio: '1/1', backgroundColor: `${theme.buttons.fill_color}10` }}
            >
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.label || 'Gallery photo'}
                  className="w-full h-full object-contain"
                  style={{ backgroundColor: '#000000' }}
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 opacity-30" style={{ color: theme.typography.text_color }} />
                </div>
              )}
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                  className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-red-400 hover:bg-black/80 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}

          <button
            onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
            className="flex-shrink-0 rounded-xl flex items-center justify-center snap-start transition-colors"
            style={{
              minWidth: '100%',
              aspectRatio: '1/1',
              backgroundColor: `${theme.buttons.fill_color}08`,
              border: `2px dashed ${theme.buttons.fill_color}30`,
            }}
          >
            <span className="text-4xl font-light opacity-30" style={{ color: theme.typography.text_color }}>+</span>
          </button>
        </div>

        {count > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); scroll('right'); }}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors -mr-2"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        {lightbox}
      </div>
    </div>
  );
}

function EmptyState({ textColor }: { textColor: string }) {
  const { t } = useLanguage();
  return (
    <div className="text-center py-12">
      <div className="rounded-full bg-white/10 p-4 w-fit mx-auto mb-4">
        <LinkIcon className="h-8 w-8" style={{ color: textColor, opacity: 0.6 }} />
      </div>
      <p style={{ color: textColor, opacity: 0.6 }}>{t('emptyState.noContent')}</p>
    </div>
  );
}

// ─── Name/Handle Sortable Card ──────────────────────────────────────────────

// Locked header spacing (Brick A) — tune in Brick B, hardcode in Brick C
const HEADER_NAME_TOP = 10;  // space above the name (the red-line anchor), px
const HEADER_GAP_A = 0;      // fixed gap name -> handle, px
const HEADER_GAP_B = 10;      // fixed gap handle -> icons, px
const HEADER_LIFT = 25;      // px the name/handle/icons ride UP toward the seam; dial on a REAL phone (bigger = higher; content below rides up with them).
const HEADER_OFFSET_Y =95; // name/handle/icons lift over the hero, in px. Raise to float them up; 0 = none.
const CARDS_LIFT = 85;      // px the link cards ride UP under the icons, closing the gap the header lift leaves behind. Bigger = cards higher / smaller gap; smaller = bigger gap.
const HERO_EXTRA = 60;       // px added to hero height; gradient follows down with it. Dial on a REAL phone until the hero fills ~half the screen. 6px ~ 1/16 in.

function NameHandleCard({
  page,
  expanded,
  onToggleExpand,
  localNameSize, setLocalNameSize,
  localHandleSize, setLocalHandleSize,
  localNameColor, setLocalNameColor,
  localHandleColor, setLocalHandleColor,
  localNamePadTop, setLocalNamePadTop,
  localNamePadBottom, setLocalNamePadBottom,
  localNameHandleGap, setLocalNameHandleGap,
  nameCardY, onNameCardYChange, onDragEnd,
  onSave,
  onDisplayNameChange,
  chrome,
}: {
  page: any;
  chrome: ChromeTokens;
  expanded: boolean;
  onToggleExpand: () => void;
  localNameSize: number; setLocalNameSize: (v: number) => void;
  localHandleSize: number; setLocalHandleSize: (v: number) => void;
  localNameColor: string; setLocalNameColor: (v: string) => void;
  localHandleColor: string; setLocalHandleColor: (v: string) => void;
  localNamePadTop: number; setLocalNamePadTop: (v: number) => void;
  localNamePadBottom: number; setLocalNamePadBottom: (v: number) => void;
  localNameHandleGap: number; setLocalNameHandleGap: (v: number) => void;
  nameCardY: number; onNameCardYChange: (v: number) => void; onDragEnd: () => void;
  onSave: () => void;
  onDisplayNameChange: (name: string) => void;
}) {
  const { t } = useLanguage();
  const dragStart = useRef({ y: 0, cardY: 0 });
  const [localDisplayName, setLocalDisplayName] = useState(page.display_name || '');

  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const debouncedSave = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(onSave, 500);
  };

  const nameSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const debouncedNameSave = (name: string) => {
    clearTimeout(nameSaveTimer.current);
    nameSaveTimer.current = setTimeout(() => onDisplayNameChange(name), 500);
  };

  // Dark glow lifts LIGHT text off the hero photo; on dark text (gold/light
  // themes) it smudges. Key the shadow off the resolved text color, not bg.
  const resolvedNameColor = localNameColor === '#ffffff' ? chrome.text : localNameColor;
  const lightHeaderText = relativeLuminance(resolvedNameColor) > 0.5;

  return (
    <div
      style={{ position: 'relative', zIndex: 20 }}
      className="relative"
    >
      {/* Content — tap name to edit inline, tap handle area to expand settings */}
      <div
        className="relative"
        style={{ paddingTop: HEADER_NAME_TOP, textAlign: 'center' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <input
            type="text"
            value={localDisplayName}
            onChange={(e) => {
              setLocalDisplayName(e.target.value);
              debouncedNameSave(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
                onDisplayNameChange(localDisplayName);
              }
            }}
            onBlur={() => onDisplayNameChange(localDisplayName)}
            placeholder={`@${page.handle}`}
            className="font-bold mb-0 bg-transparent border-0 outline-none text-center w-full"
            style={{
              fontSize: localNameSize,
              lineHeight: 1,
              padding: 0,
              color: resolvedNameColor,
              textShadow: 'none',
              caretColor: '#C9A55C',
            }}
          />
          <p style={{ fontSize: localHandleSize, color: localHandleColor === '#ffffff99' ? 'rgba(255,255,255,0.9)' : localHandleColor, textShadow: 'none', margin: 0, marginTop: HEADER_GAP_A }}>
            @{page.handle}
          </p>
        </div>
        <button
          onClick={onToggleExpand}
          className="absolute right-2 top-1/2 -translate-y-1/2"
        >
          <ChevronRight className={cn(
            "h-4 w-4 text-white/30 transition-transform duration-200",
            expanded && "rotate-90"
          )} />
        </button>
      </div>

      {/* Compact settings row */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200 ease-out',
          expanded ? 'max-h-[120px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="px-6 pb-2 space-y-1.5">
          <div className="flex gap-3 items-center">
            <label className="text-[10px] text-white/40 w-12 flex-shrink-0">Name</label>
            <input type="range" min={16} max={48} step={1} value={localNameSize}
              onChange={(e) => { setLocalNameSize(Number(e.target.value)); debouncedSave(); }}
              className="flex-1 accent-[#C9A55C] h-1" />
            <input type="color" value={localNameColor}
              onChange={(e) => { setLocalNameColor(e.target.value); debouncedSave(); }}
              className="w-6 h-6 rounded cursor-pointer bg-transparent border border-white/20 flex-shrink-0" />
          </div>
          <div className="flex gap-3 items-center">
            <label className="text-[10px] text-white/40 w-12 flex-shrink-0">Handle</label>
            <input type="range" min={10} max={24} step={1} value={localHandleSize}
              onChange={(e) => { setLocalHandleSize(Number(e.target.value)); debouncedSave(); }}
              className="flex-1 accent-[#C9A55C] h-1" />
            <input type="color" value={localHandleColor.slice(0, 7)}
              onChange={(e) => { setLocalHandleColor(e.target.value); debouncedSave(); }}
              className="w-6 h-6 rounded cursor-pointer bg-transparent border border-white/20 flex-shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Social Icons Sortable Card ─────────────────────────────────────────────

function SocialIconsCard({
  socialItems,
  chrome,
  expanded,
  onToggleExpand,
  localIconsPaddingY, setLocalIconsPaddingY,
  localIconSize, setLocalIconSize,
  iconsCardY, onIconsCardYChange, onDragEnd,
  contentStartY, setContentStartY,
  onEditSocial,
  onSave,
}: {
  socialItems: any[];
  chrome: ChromeTokens;
  expanded: boolean;
  onToggleExpand: () => void;
  localIconsPaddingY: number; setLocalIconsPaddingY: (v: number) => void;
  localIconSize: 'small'|'medium'|'large'; setLocalIconSize: (v: 'small'|'medium'|'large') => void;
  iconsCardY: number; onIconsCardYChange: (v: number) => void; onDragEnd: () => void;
  contentStartY: number; setContentStartY: (v: number) => void;
  onEditSocial: () => void;
  onSave: () => void;
}) {
  const { t } = useLanguage();
  const dragStart = useRef({ y: 0, cardY: 0 });

  const iconSizeMap = { small: 14, medium: 18, large: 24 };
  const iconContainerMap = { small: 'h-8 w-8', medium: 'h-10 w-10', large: 'h-12 w-12' };

  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const debouncedSave = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(onSave, 500);
  };

  return (
    <div
      style={{ marginTop: HEADER_GAP_B, position: 'relative', zIndex: 20 }}
      className="relative"
    >
      {/* Icon row — size comes from the Social Platforms menu (headerConfig.iconSize) */}
      <div
        className="relative"
        style={{ paddingTop: 0, paddingBottom: 0 }}
      >
        <div className="flex flex-wrap justify-center gap-3 px-4">
          {socialItems.map((item) => (
            <a
              key={item.id}
              href={item.url || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={cn('flex items-center justify-center rounded-full', iconContainerMap[localIconSize])}
              style={{ background: chrome.iconBg }}
              title={item.label}
            >
              <SocialSvgIcon label={item.label} size={iconSizeMap[localIconSize]} color={chrome.iconColor} />
            </a>
          ))}
          {/* Add / manage platforms — opens the Manage Platforms menu (edit mode only) */}
          <button
            type="button"
            onClick={onEditSocial}
            aria-label={t('editor.editSocial')}
            title={t('editor.editSocial')}
            className={cn('flex items-center justify-center rounded-full border border-dashed border-white/30 text-white/50 hover:text-white/80 hover:border-white/50 transition-colors', iconContainerMap[localIconSize])}
            style={{ background: chrome.iconBg }}
          >
            <Plus size={iconSizeMap[localIconSize]} />
          </button>
        </div>
      </div>

    </div>
  );
}

// ─── Preview Block Card (edit mode) ─────────────────────────────────────────

function SortablePreviewCard({
  block,
  onEdit,
  onToggle,
  onGalleryAdd,
  onGalleryDelete,
  onItemEdit,
  onItemDelete,
  onItemAdd,
  onItemsReorder,
  isDragActive,
  theme,
}: {
  block: BlockWithItems;
  onEdit: () => void;
  onToggle: (enabled: boolean) => void;
  onGalleryAdd: (blockId: string) => void;
  onGalleryDelete: (itemId: string) => void;
  onItemEdit?: (blockId: string, itemId: string) => void;
  onItemDelete?: (itemId: string) => void;
  onItemAdd?: (blockId: string) => void;
  onItemsReorder?: (orderedItemIds: string[]) => void;
  isDragActive: boolean;
  theme: ThemeJson;
}) {
  const { t } = useLanguage();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
  };
  const chrome = getChromeTokens(theme);

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, background: chrome.surface, border: `1px solid ${chrome.border}` }}
      className={cn(
        'mx-4 mb-4 rounded-2xl overflow-hidden',
        'transition-all duration-200 ease-out',
        isDragging && 'shadow-2xl ring-1 ring-[#C9A55C]/60 scale-[1.01] z-50',
        isDragActive && !isDragging && 'opacity-50',
        !block.is_enabled && 'opacity-40',
      )}
    >
      {/* Control bar */}
      <div className="flex items-center gap-3 px-3 py-2.5" style={{ borderBottom: `1px solid ${chrome.border}`, background: chrome.surfaceStrong }}>
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-white/30 hover:text-white/60 touch-none"
        >
          <GripVertical className="h-5 w-5" />
        </button>
        <span className="flex-1 text-xs font-semibold uppercase tracking-wider" style={{ color: chrome.textMuted }}>
          {t(`blocks.${block.type}.title`) || block.type}
        </span>
        {/* Toggle */}
        <button
          onClick={() => onToggle(!block.is_enabled)}
          className={cn(
            'w-11 h-6 rounded-full flex-shrink-0 p-[2px] transition-colors',
            block.is_enabled ? 'bg-[#C9A55C]' : 'bg-white/20'
          )}
        >
          <div
            className={cn(
              'h-5 w-5 rounded-full bg-white shadow-md transition-transform',
              block.is_enabled ? 'translate-x-[20px]' : 'translate-x-0'
            )}
          />
        </button>
        {/* Links blocks are edited entirely in the live preview (tap a card,
            "+ Add link", grip to reorder, X to delete) — no block-level list
            view — so the control-bar chevron is hidden for them (G5). Every
            other block type keeps its chevron. */}
        {block.type !== 'links' && (
          <button onClick={onEdit} className="text-white/30 hover:text-white/80">
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Full-size block content preview — smooth collapse during drag.
          For links blocks the per-item taps own the body, so we suppress the
          body-level onEdit (the control-bar chevron remains the list fallback). */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200 ease-out',
          block.type !== 'links' && 'cursor-pointer',
          isDragActive ? 'max-h-0' : 'max-h-[2000px]'
        )}
        onClick={block.type !== 'links' && !isDragActive ? onEdit : undefined}
      >
        <div className="p-4">
          {block.type === 'gallery' ? (
            <GalleryBlock block={block} theme={theme} onEdit={() => onGalleryAdd(block.id)} onDelete={onGalleryDelete} />
          ) : block.items.length === 0 && block.type !== 'video_feed' && block.type !== 'text' ? (
            <div className="py-6 text-center">
              <p className="text-xs text-white/30">{t(`blocks.${block.type}.subtitle`)}</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (block.type === 'links' && onItemAdd) onItemAdd(block.id);
                  else onEdit();
                }}
                className="mt-3 text-xs font-semibold text-[#C9A55C] border border-[#C9A55C]/40 rounded-full px-4 py-1.5 hover:bg-[#C9A55C]/10 transition-colors"
              >
                + {t('editor.addContent')}
              </button>
            </div>
          ) : block.type === 'links' ? (
            <BlockRenderer
              block={block}
              onOutboundClick={() => false}
              theme={theme}
              editMode
              onItemEdit={(itemId) => onItemEdit?.(block.id, itemId)}
              onItemDelete={onItemDelete}
              onItemAdd={() => onItemAdd?.(block.id)}
              onItemsReorder={onItemsReorder}
            />
          ) : (
            <BlockRenderer block={block} onOutboundClick={() => false} theme={theme} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

function HeroVideo({
  src,
  poster,
  fit,
  blurImage,
  imgStyle,
  playbackMode = 'once',
  audioMode = 'silent',
  voiceoverUrl = '',
}: {
  src: string;
  poster?: string;
  fit: string;
  blurImage?: string;
  imgStyle: React.CSSProperties;
  playbackMode?: 'once' | 'loop' | 'bounce';
  audioMode?: 'silent' | 'clip' | 'voiceover';
  voiceoverUrl?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const bounceRaf = useRef<number | null>(null);
  const [muted, setMuted] = useState(true);
  const [showReplay, setShowReplay] = useState(false);

  const hasVoiceover = audioMode === 'voiceover' && !!voiceoverUrl;
  const hasSound = audioMode === 'clip' || hasVoiceover;

  const stopBounce = () => {
    if (bounceRaf.current !== null) {
      cancelAnimationFrame(bounceRaf.current);
      bounceRaf.current = null;
    }
  };

  // Bounce = ping-pong. Browsers can't play video in reverse, so step
  // currentTime backwards with rAF, then play forward again.
  const playReverse = () => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    let last = performance.now();
    const step = (now: number) => {
      const vid = videoRef.current;
      if (!vid) return;
      const dt = (now - last) / 1000;
      last = now;
      const next = vid.currentTime - dt;
      if (next <= 0.03) {
        stopBounce();
        vid.currentTime = 0;
        vid.play().catch(() => {});
        return;
      }
      vid.currentTime = next;
      bounceRaf.current = requestAnimationFrame(step);
    };
    bounceRaf.current = requestAnimationFrame(step);
  };

  const handleEnded = () => {
    const v = videoRef.current;
    if (!v) return;
    if (playbackMode === 'bounce') {
      playReverse();
    } else if (playbackMode !== 'loop') {
      setShowReplay(true);
    }
  };

  // Replay tap also unlocks sound, so a sound-enabled hero restarts WITH audio.
  const replay = (e: React.MouseEvent) => {
    e.stopPropagation();
    stopBounce();
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    if (hasVoiceover && audioRef.current) {
      const a = audioRef.current;
      a.currentTime = 0;
      a.muted = false;
      a.play().catch(() => {});
      v.muted = true;
      setMuted(false);
    } else if (audioMode === 'clip') {
      v.muted = false;
      setMuted(false);
    }
    v.play().catch(() => {});
    setShowReplay(false);
  };

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasVoiceover && audioRef.current) {
      const a = audioRef.current;
      a.muted = !a.muted;
      if (!a.muted) { a.currentTime = 0; a.play().catch(() => {}); }
      setMuted(a.muted);
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) v.play().catch(() => {});
    setMuted(v.muted);
  };

  useEffect(() => stopBounce, []);

  return (
    <>
      {fit === 'fit' && blurImage && (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${blurImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(28px) brightness(0.7)',
            transform: 'scale(1.1)',
          }}
        />
      )}
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        autoPlay
        muted
        loop={playbackMode === 'loop'}
        playsInline
        onEnded={handleEnded}
        className="absolute inset-0 w-full h-full brightness-110"
        style={imgStyle}
      />
      {hasVoiceover && (
        <audio ref={audioRef} src={voiceoverUrl} preload="auto" />
      )}
      {showReplay && (
        <button
          onClick={replay}
          aria-label="Replay video"
          className="absolute inset-0 z-[6] flex items-center justify-center bg-black/15"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            <Play className="h-7 w-7 text-white/90" fill="currentColor" />
          </span>
        </button>
      )}
      {hasSound && !showReplay && (
        <button
          onClick={toggleSound}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className="absolute bottom-3 right-3 z-10 bg-black/45 backdrop-blur-sm rounded-full p-2 transition-opacity hover:opacity-90"
        >
          {muted ? (
            <VolumeX className="h-5 w-5 text-white" />
          ) : (
            <Volume2 className="h-5 w-5 text-white" />
          )}
        </button>
      )}
    </>
  );
}

export function EditableProfileView({
  page,
  blocks,
  editMode,
  onBlockEdit,
  onBlockToggle,
  onBlockReorder,
  onRefresh,
  selectedMode,
  onModeChange,
  onOutboundClick,
  onAddContent,
  onItemEdit,
  onItemDelete,
  onItemAdd,
  onItemsReorder,
  stickyTop = 0,
}: EditableProfileViewProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const galleryFileInputRef = useRef<HTMLInputElement>(null);
  const [activeGalleryBlockId, setActiveGalleryBlockId] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoOriginalFile, setPhotoOriginalFile] = useState<File | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [localHeroImages, setLocalHeroImages] = useState<{ shop: string | null; recruit: string | null }>({ shop: null, recruit: null });
  const [photoStep, setPhotoStep] = useState<'idle' | 'choose' | 'manual' | 'ai' | 'ai-preview' | 'preview'>('idle');
  const [aiPreviewData, setAiPreviewData] = useState<string | null>(null); // holds AI-cropped+enhanced data URL
  const [aiPreviewEnhanced, setAiPreviewEnhanced] = useState(false); // true = AI ran, false = crop only fallback
  const [photoOffset, setPhotoOffset] = useState({ x: 50, y: 30 });
  const [photoScale, setPhotoScale] = useState(1);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 }); // image pan offset
  // HERO-1 display mode (B1): live Fill/Fit + vertical position, persisted to theme_json.heroConfig
  const [heroFitDraft, setHeroFitDraft] = useState<'fill' | 'fit'>(
    (page.theme_json as any)?.heroConfig?.fit === 'fit' ? 'fit' : 'fill'
  );
  const [heroPosYDraft, setHeroPosYDraft] = useState<number>(
    typeof (page.theme_json as any)?.heroConfig?.posY === 'number' ? (page.theme_json as any).heroConfig.posY : 50
  );
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const cropImgRef = useRef<HTMLImageElement>(null);
  const cropFrameRef = useRef<HTMLDivElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const [, setCropImgLoaded] = useState(0); // triggers re-render on img load

  // Lock body + inner container scroll when photo overlay is open
  useEffect(() => {
    if (photoStep !== 'idle' && photoPreview) {
      document.body.style.overflow = 'hidden';
      // Also lock all scrollable containers inside the device frame
      const scrollables = document.querySelectorAll<HTMLElement>('.overflow-y-auto, .overflow-auto');
      scrollables.forEach(el => { el.style.overflow = 'hidden'; });
      return () => {
        document.body.style.overflow = '';
        scrollables.forEach(el => { el.style.overflow = ''; });
      };
    }
  }, [photoStep, photoPreview]);

  // Header config (must be before state that depends on it)
  const headerConfig = (page.theme_json as any)?.headerConfig || {
    nameSize: 28,
    handleSize: 14,
    nameColor: '#ffffff',
    handleColor: '#ffffff99',
    nameOffset: 0,
    iconsOffset: 0,
    namePadTop: 0,
    namePadBottom: 0,
    iconsPaddingY: 8,
    iconSize: 'medium' as 'small'|'medium'|'large',
    nameHandleGap: 2,
  };

  // Header card sortable state
  const [headerCardOrder, setHeaderCardOrder] = useState<string[]>(() => {
    const saved = (page.theme_json as any)?.headerCardOrder;
    if (saved && Array.isArray(saved)) {
      // Ensure both cards exist and name comes first
      const hasName = saved.includes('__name_handle__');
      const hasIcons = saved.includes('__social_icons__');
      if (hasName && hasIcons) {
        // Sort: name always before icons
        return ['__name_handle__', '__social_icons__'];
      }
    }
    return ['__name_handle__', '__social_icons__'];
  });
  const [expandedHeaderCard, setExpandedHeaderCard] = useState<string | null>(null);
  const [localNameSize, setLocalNameSize] = useState(headerConfig.nameSize ?? 28);
  const [localHandleSize, setLocalHandleSize] = useState(headerConfig.handleSize ?? 14);
  const [localNameColor, setLocalNameColor] = useState(headerConfig.nameColor ?? '#ffffff');
  const [localHandleColor, setLocalHandleColor] = useState(headerConfig.handleColor ?? '#ffffff99');
  const [localNamePadTop, setLocalNamePadTop] = useState(headerConfig.namePadTop ?? headerConfig.namePaddingY ?? 0);
  const [localNamePadBottom, setLocalNamePadBottom] = useState(headerConfig.namePadBottom ?? headerConfig.namePaddingY ?? 0);
  const [localIconsPaddingY, setLocalIconsPaddingY] = useState(headerConfig.iconsPaddingY ?? 8);
  const [localIconSize, setLocalIconSize] = useState<'small'|'medium'|'large'>(headerConfig.iconSize ?? 'medium');
  const [localNameHandleGap, setLocalNameHandleGap] = useState(headerConfig.nameHandleGap ?? 2);
  const [nameCardY, setNameCardY] = useState(
    (page.theme_json as any)?.headerConfig?.nameCardY ?? 0
  );
  const [iconsCardY, setIconsCardY] = useState(
    (page.theme_json as any)?.headerConfig?.iconsCardY ?? 0
  );
  const [contentStartY, setContentStartY] = useState(
    (page.theme_json as any)?.headerConfig?.contentStartY ?? 0
  );

  // Inline Size buttons removed (SOCIAL.7) — keep the editor preview's icon size
  // in sync with the Social Platforms menu (headerConfig.iconSize).
  useEffect(() => {
    setLocalIconSize(headerConfig.iconSize ?? 'medium');
  }, [headerConfig.iconSize]);

  const handleGalleryFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !activeGalleryBlockId || !user) return;

    const filesToAdd = Array.from(files).slice(0, 20);

    for (const file of filesToAdd) {
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('products')
          .upload(fileName, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('products')
          .getPublicUrl(fileName);

        await supabase.from('block_items').insert({
          block_id: activeGalleryBlockId,
          label: 'Photo',
          url: '',
          image_url: urlData.publicUrl,
          order_index: 999,
        });
      } catch (err) {
        console.error('Upload error:', err);
        toast.error(t('gallery.uploadFailed'));
      }
    }

    onRefresh();
    if (galleryFileInputRef.current) galleryFileInputRef.current.value = '';
    setActiveGalleryBlockId(null);
  };

  const openGalleryPicker = (blockId: string) => {
    setActiveGalleryBlockId(blockId);
    setTimeout(() => galleryFileInputRef.current?.click(), 50);
  };

  const handleGalleryDelete = async (itemId: string) => {
    const { error } = await supabase.from('block_items').delete().eq('id', itemId);
    if (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete photo');
      return;
    }
    toast.success('Photo removed');
    onRefresh();
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith('video/')) {
      handleVideoUpload(file);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(reader.result as string);
      setPhotoFile(file);
      setPhotoOriginalFile(file);
      setPhotoStep('choose');
      setPhotoOffset({ x: 50, y: 30 });
      setPhotoScale(1);
      setCropZoom(1);
      setCropPosition({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  // Compute crop frame size (fixed 3:4 aspect, fits within container with padding)
  const getCropFrameSize = () => {
    const container = cropContainerRef.current;
    if (!container) return { fw: 300, fh: 400 };
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const padding = 24;
    const availW = cw - padding * 2;
    const availH = ch - padding * 2;
    const ratio = 1 / 1; // square — matches the visible hero display area
    let fw = availW;
    let fh = fw / ratio;
    if (fh > availH) { fh = availH; fw = fh * ratio; }
    return { fw, fh };
  };

  // Compute min zoom so the image always covers the frame (no gaps)
  const getCropMinZoom = () => {
    const img = cropImgRef.current;
    const container = cropContainerRef.current;
    if (!img || !container || !img.naturalWidth) return 1;
    const { fw, fh } = getCropFrameSize();
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    // fitScale: image fits within the frame (the "zoomed out" size)
    const scaleW = fw / nw;
    const scaleH = fh / nh;
    // We need the image to COVER the frame, so use the LARGER scale
    const coverScale = Math.max(scaleW, scaleH);
    // Also need the image to at least fit within the container at zoom=1
    // minZoom is relative to the "base" size (image fit in container)
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const baseScale = Math.min(cw / nw, ch / nh);
    return coverScale / baseScale;
  };

  // Clamp pan position so image edges never go inside the frame
  const clampCropPosition = (panX: number, panY: number, zoom: number) => {
    const img = cropImgRef.current;
    const container = cropContainerRef.current;
    if (!img || !container || !img.naturalWidth) return { x: panX, y: panY };
    const { fw, fh } = getCropFrameSize();
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    // Image display size at current zoom
    const baseScale = Math.min(cw / nw, ch / nh);
    const dispW = nw * baseScale * zoom;
    const dispH = nh * baseScale * zoom;
    // Frame is centered in container
    const frameCX = cw / 2;
    const frameCY = ch / 2;
    const frameL = frameCX - fw / 2;
    const frameR = frameCX + fw / 2;
    const frameT = frameCY - fh / 2;
    const frameB = frameCY + fh / 2;
    // Image center = container center + pan
    // Image left = (cw/2 + panX) - dispW/2, must be <= frameL
    // Image right = (cw/2 + panX) + dispW/2, must be >= frameR
    const maxPanX = frameL - (cw / 2 - dispW / 2);   // image left <= frame left
    const minPanX = frameR - (cw / 2 + dispW / 2);    // image right >= frame right
    const maxPanY = frameT - (ch / 2 - dispH / 2);
    const minPanY = frameB - (ch / 2 + dispH / 2);
    return {
      x: Math.min(maxPanX, Math.max(minPanX, panX)),
      y: Math.min(maxPanY, Math.max(minPanY, panY)),
    };
  };

  const getCroppedCanvas = (): string => {
    const img = cropImgRef.current;
    const container = cropContainerRef.current;
    if (!img || !container || !photoPreview) return photoPreview || '';
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return photoPreview || '';

    const { fw, fh } = getCropFrameSize();
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    // Image display size
    const baseScale = Math.min(cw / nw, ch / nh);
    const dispW = nw * baseScale * cropZoom;
    const dispH = nh * baseScale * cropZoom;

    // Image position (center of container + pan offset)
    const imgCX = cw / 2 + cropPosition.x;
    const imgCY = ch / 2 + cropPosition.y;
    const imgL = imgCX - dispW / 2;
    const imgT = imgCY - dispH / 2;

    // Frame is centered
    const frameL = cw / 2 - fw / 2;
    const frameT = ch / 2 - fh / 2;

    // Frame position relative to image, in display pixels
    const relX = frameL - imgL;
    const relY = frameT - imgT;

    // Convert to natural pixels. Keep the source rect at full frame size and
    // slide its position back inside the image so the output stays square —
    // truncating srcW/srcH at the edge would yield a non-square crop.
    const scale = nw / dispW;
    const srcW = Math.min(Math.round(fw * scale), nw);
    const srcH = Math.min(Math.round(fh * scale), nh);
    const srcX = Math.max(0, Math.min(Math.round(relX * scale), nw - srcW));
    const srcY = Math.max(0, Math.min(Math.round(relY * scale), nh - srcH));

    const canvas = document.createElement('canvas');
    canvas.width = srcW;
    canvas.height = srcH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return photoPreview || '';
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
    return canvas.toDataURL('image/jpeg', 0.95);
  };

  // HERO-1 (B1): persist display mode only — no file upload, no crop.
  const handleHeroDisplaySave = async () => {
    setPhotoSaving(true);
    try {
      const existingTheme = (page.theme_json as any) || {};
      const existingHero = existingTheme.heroConfig || {};
      const { error } = await supabase
        .from('pages')
        .update({ theme_json: { ...existingTheme, heroConfig: { ...existingHero, fit: heroFitDraft, posY: heroPosYDraft } } })
        .eq('id', page.id);
      if (error) throw error;
      setPhotoStep('idle');
      onRefresh();
    } catch (e) {
      console.error('hero display save failed', e);
      toast.error(t('editor.saveFailed') || 'Could not save');
    } finally {
      setPhotoSaving(false);
    }
  };

  const handlePhotoSave = async (overrideFile?: File) => {
    let fileToUpload = overrideFile || photoFile;
    if (!fileToUpload && photoPreview) {
      const res = await fetch(photoPreview);
      const blob = await res.blob();
      fileToUpload = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
    }
    if (!fileToUpload || !user) return;
    setPhotoSaving(true);
    try {
      const fileExt = fileToUpload.name.split('.').pop();
      const fileName = `${user.id}/${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, fileToUpload, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // If this is a fresh upload (user picked a new file), also store the
      // original full-size photo so they can re-crop later with full
      // flexibility. Skipped on re-crop (photoOriginalFile is null) and on
      // recruit-mode page 2 (its schema is JSON-based).
      let originalUrl: string | null = null;
      if (photoOriginalFile && selectedMode !== 'recruit') {
        const origExt = photoOriginalFile.name.split('.').pop() || 'jpg';
        const origFileName = `${user.id}/${crypto.randomUUID()}-original.${origExt}`;
        const { error: origUploadError } = await supabase.storage
          .from('avatars')
          .upload(origFileName, photoOriginalFile, { upsert: true });
        if (origUploadError) {
          console.error('Original photo upload failed (non-fatal):', origUploadError);
        } else {
          originalUrl = supabase.storage.from('avatars').getPublicUrl(origFileName).data.publicUrl;
        }
      }

      if (selectedMode === 'recruit') {
        // Save page 2 avatar into theme_json
        const existingTheme = (page.theme_json as any) || {};
        await supabase
          .from('pages')
          .update({ theme_json: { ...existingTheme, avatar_url_page2: urlData.publicUrl } })
          .eq('id', page.id);
      } else {
        const existingTheme = (page.theme_json as any) || {};
        const existingHero = { ...(existingTheme.heroConfig || {}) };
        delete existingHero.video; // an image hero replaces any video — clean swap, no leftover video
        const updates: { avatar_url: string; avatar_original_url?: string; theme_json: any } = {
          avatar_url: urlData.publicUrl,
          theme_json: { ...existingTheme, heroConfig: { ...existingHero, fit: heroFitDraft, posY: heroPosYDraft } },
        };
        if (originalUrl) {
          updates.avatar_original_url = originalUrl;
        }
        await supabase
          .from('pages')
          .update(updates)
          .eq('id', page.id);
      }
      toast.success('Profile photo updated!');
      setLocalHeroImages(prev => ({ ...prev, [selectedMode]: urlData.publicUrl }));
      setPhotoStep('idle');
      setPhotoPreview(null);
      setPhotoFile(null);
      setPhotoOriginalFile(null);
      setPhotoOffset({ x: 50, y: 30 });
      setPhotoScale(1);
      onRefresh();
    } catch (err) {
      console.error('Photo upload error:', err);
      toast.error('Failed to upload photo');
    } finally {
      setPhotoSaving(false);
    }
  };

  const handleVideoUpload = async (file: File) => {
    if (!user) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Video is too large (max 50MB). Try a shorter clip.');
      return;
    }
    toast('Uploading video…');
    setPhotoSaving(true);
    try {
      const fileExt = file.name.split('.').pop() || 'mp4';
      const fileName = `${user.id}/hero-video-${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);
      const existingTheme = (page.theme_json as any) || {};
      const existingHero = existingTheme.heroConfig || {};
      const { error } = await supabase
        .from('pages')
        .update({ theme_json: { ...existingTheme, heroConfig: { ...existingHero, video: urlData.publicUrl } } })
        .eq('id', page.id);
      if (error) throw error;
      toast.success('Hero video added!');
      onRefresh();
    } catch (err) {
      console.error('Video upload error:', err);
      toast.error('Failed to upload video');
    } finally {
      setPhotoSaving(false);
    }
  };

  const handleVideoRemove = async () => {
    setPhotoSaving(true);
    try {
      const existingTheme = (page.theme_json as any) || {};
      const existingHero = { ...(existingTheme.heroConfig || {}) };
      delete existingHero.video;
      const { error } = await supabase
        .from('pages')
        .update({ theme_json: { ...existingTheme, heroConfig: existingHero } })
        .eq('id', page.id);
      if (error) throw error;
      toast.success('Hero video removed');
      onRefresh();
    } catch (err) {
      console.error('Video remove error:', err);
      toast.error('Failed to remove video');
    } finally {
      setPhotoSaving(false);
    }
  };

  // Detect face using face-api.js TinyFaceDetector (works in all browsers, 190KB model)
  const detectFace = async (img: HTMLImageElement): Promise<{ x: number; y: number; w: number; h: number } | null> => {
    try {
      // Load model on first use (cached after that)
      if (!faceapi.nets.tinyFaceDetector.isLoaded) {
        console.log('[AI CROP] Loading face detection model...');
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        console.log('[AI CROP] Model loaded successfully');
      }

      // Draw image to canvas first — ensures pixels are fully decoded
      // (data URL images may not be decoded when passed directly)
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas context');
      ctx.drawImage(img, 0, 0);

      console.log('[AI CROP] Running detection on', img.naturalWidth, 'x', img.naturalHeight, 'image...');

      // Try multiple input sizes for best results (larger = more accurate but slower)
      for (const inputSize of [512, 416, 320] as const) {
        const detection = await faceapi.detectSingleFace(
          canvas as any,
          new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.15 })
        );

        if (detection) {
          const { x, y, width, height } = detection.box;
          console.log('[AI CROP] Face detected (inputSize=%d, score=%.2f):', inputSize, detection.score, {
            x: Math.round(x), y: Math.round(y), w: Math.round(width), h: Math.round(height)
          });
          return { x, y, w: width, h: height };
        }
        console.log('[AI CROP] No face at inputSize', inputSize, '— trying next...');
      }

      console.log('[AI CROP] No face detected at any input size');
    } catch (e) {
      console.error('[AI CROP] face-api.js error:', e);
    }

    return null; // no face detected
  };

  const handleAiCrop = async (mode: 'headshot' | 'shoulders' | 'fullbody') => {
    if (!photoPreview) return;
    setAiProcessing(true);
    setPhotoStep('ai');
    try {
      // Load image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = photoPreview;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image load failed'));
      });

      const natW = img.naturalWidth;
      const natH = img.naturalHeight;

      // Detect face
      const face = await detectFace(img);
      if (!face) {
        toast.error('No face detected — try manual crop');
        setPhotoStep('manual');
        return;
      }

      // Face bounding box (exact pixels from FaceDetector)
      const faceX = face.x;           // face left edge
      const faceY = face.y;           // face top edge
      const faceW = face.w;           // face width
      const faceH = face.h;           // face height
      const faceCX = faceX + faceW / 2; // face center X
      const faceCY = faceY + faceH / 2; // face center Y

      // --- CROP SIZING BY FACE OCCUPANCY ---
      // Target: face takes up X% of crop width. More stable than padding multipliers.
      // headshot: face = ~58% of width
      // shoulders: face = ~40% of width
      // fullbody: face = ~18% of width
      const targetFaceRatio = mode === 'headshot' ? 0.50 : mode === 'shoulders' ? 0.40 : 0.18;
      let cropSize = faceW / targetFaceRatio;
      cropSize = Math.min(cropSize, natW, natH);

      // Center horizontally on face
      let sx = faceCX - cropSize / 2;

      // Vertical placement: face higher in frame for portraits
      const faceTopRatio = mode === 'headshot' ? 0.48 : mode === 'shoulders' ? 0.30 : 0.22;
      let sy = faceCY - cropSize * faceTopRatio;

      // Clamp to image bounds
      sx = Math.max(0, Math.min(sx, natW - cropSize));
      sy = Math.max(0, Math.min(sy, natH - cropSize));

      console.log(`[AI Crop] Face: ${Math.round(faceW)}px wide @ (${Math.round(faceCX)}, ${Math.round(faceCY)}). Crop: ${Math.round(cropSize)}px square @ (${Math.round(sx)}, ${Math.round(sy)})`);

      // Crop the headshot square
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(cropSize);
      canvas.height = Math.round(cropSize);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas context');
      ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, canvas.width, canvas.height);

      // JPEG at high quality — much smaller payload than PNG (avoids 6MB request limit)
      const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      console.log(`[AI Crop] Cropped data URL size: ${(croppedDataUrl.length / 1024).toFixed(0)}KB`);

      // --- AI ENHANCEMENT — crystal-upscaler (portrait-optimized, no plastic skin) ---
      let finalDataUrl = croppedDataUrl;
      let aiSucceeded = false;
      let aiErrorMsg = '';

      try {
        const [hdr, b64] = croppedDataUrl.split(',');
        const mt = hdr.match(/data:(.*?);/)?.[1] || 'image/jpeg';
        console.log(`[AI Enhance] Sending ${(b64.length / 1024).toFixed(0)}KB to crystal-upscaler...`);

        const { data: enhData, error: enhErr } = await supabase.functions.invoke('ai-enhance', {
          body: { base64: b64, mediaType: mt },
        });

        if (enhErr) {
          // Try to get the raw response from the FunctionsHttpError
          let extra = '';
          try {
            // @ts-ignore - context is on FunctionsHttpError
            const ctx = (enhErr as any).context;
            if (ctx && typeof ctx.json === 'function') {
              const body = await ctx.json();
              extra = ` — ${JSON.stringify(body)}`;
            } else if (ctx && typeof ctx.text === 'function') {
              extra = ` — ${await ctx.text()}`;
            }
          } catch (_) { /* ignore */ }
          aiErrorMsg = `${enhErr.message || enhErr.name || 'unknown'}${extra}`;
          console.error('[AI Enhance] Supabase function error:', enhErr, 'extra:', extra);
          throw new Error(aiErrorMsg);
        }
        if (!enhData?.output) {
          aiErrorMsg = `Empty output (response: ${JSON.stringify(enhData)})`;
          console.error('[AI Enhance] No output:', enhData);
          throw new Error(aiErrorMsg);
        }

        // Fetch the enhanced image — crystal-upscaler returns natural-looking
        // results, no client-side sharpening needed.
        const enhResp = await fetch(enhData.output);
        if (!enhResp.ok) {
          aiErrorMsg = `Fetch enhanced image failed: ${enhResp.status}`;
          throw new Error(aiErrorMsg);
        }
        const enhBlob = await enhResp.blob();
        finalDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(enhBlob);
        });
        aiSucceeded = true;
        console.log('[AI Enhance] ✓ Success');
      } catch (enhanceErr) {
        console.error('[AI Enhance] FAILED — showing crop-only fallback:', enhanceErr);
        toast.error(`AI enhancement failed${aiErrorMsg ? `: ${aiErrorMsg.slice(0, 80)}` : ''}`, { duration: 5000 });
      }

      // Show preview for user to accept or go back — with badge if AI didn't run
      setAiPreviewData(finalDataUrl);
      setAiPreviewEnhanced(aiSucceeded);
      setPhotoStep('ai-preview');
      return;
    } catch (err) {
      console.error('AI crop error:', err);
      toast.error(t('editor.aiCropFailed'));
      setPhotoStep('manual');
    } finally {
      setAiProcessing(false);
    }
  };

  const handleAiEnhance = async (mode: 'upscale' | 'face_restore', fromCrop?: boolean) => {
    setAiProcessing(true);
    setPhotoStep('ai');
    try {
      let sourceDataUrl = photoPreview;

      // If called from manual crop, crop first then enhance
      if (fromCrop && sourceDataUrl) {
        sourceDataUrl = getCroppedCanvas();
      }

      if (!sourceDataUrl) throw new Error('No image');

      const [header, base64] = sourceDataUrl.split(',');
      const mediaType = header.match(/data:(.*?);/)?.[1] || 'image/jpeg';
      console.log(`[AI Enhance] Sending ${(base64.length / 1024).toFixed(0)}KB to crystal-upscaler...`);

      const { data, error } = await supabase.functions.invoke('ai-enhance', {
        body: { base64, mediaType },
      });

      if (error || !data?.output) throw new Error(error?.message || 'Enhancement failed');

      // Fetch enhanced image from Replicate's URL
      const response = await fetch(data.output);
      const blob = await response.blob();
      const enhancedDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      setPhotoPreview(enhancedDataUrl);
      const file = new File([blob], 'enhanced.jpg', { type: 'image/jpeg' });
      setPhotoFile(file);

      if (fromCrop) {
        // Crop + enhance → save directly
        await handlePhotoSave(file);
      } else {
        // Enhance before crop → go back to choose so user can crop or save
        setPhotoStep('choose');
        toast.success(mode === 'upscale' ? 'Photo upscaled!' : 'Face enhanced!');
      }
    } catch (err) {
      console.error('AI enhance error:', err);
      toast.error('Enhancement failed — try again');
      setPhotoStep('choose');
    } finally {
      setAiProcessing(false);
    }
  };

  const resetPhoto = () => {
    setPhotoPreview(null);
    setPhotoFile(null);
    setPhotoOriginalFile(null);
    setPhotoStep('idle');
    setPhotoOffset({ x: 50, y: 30 });
    setPhotoScale(1);
  };

  // Get theme
  const rawTheme = getThemeWithDefaults(page.theme_json);
  const theme = rawTheme.auto_contrast ? applyAutoContrast(rawTheme) : rawTheme;
  const fontFamily = getFontFamily(theme);
  const chrome = getChromeTokens(theme);

  const saveHeaderConfig = async (config: Record<string, unknown>) => {
    const existingTheme = (page.theme_json as any) || {};
    await supabase
      .from('pages')
      .update({
        theme_json: {
          ...existingTheme,
          headerConfig: {
            ...(existingTheme.headerConfig || {}),
            ...config,
          },
          headerCardOrder,
        },
      })
      .eq('id', page.id);
    onRefresh();
  };

  // Hero image — per-page avatar support (no cross-page fallback)
  const page2AvatarUrl = (page.theme_json as any)?.avatar_url_page2 || null;
  const heroImage = selectedMode === 'recruit'
    ? (localHeroImages.recruit || page2AvatarUrl || '')
    : (localHeroImages.shop || (theme.header?.image_url) || page.avatar_url || '');
  // Hero display config (HERO-1). Absent → Fill, centered — un-beheads legacy photos.
  const heroConfig = (page.theme_json as any)?.heroConfig || {};
  const heroVideo: string = heroConfig.video || '';
  const heroFit: 'fill' | 'fit' = heroConfig.fit === 'fit' ? 'fit' : 'fill';
  const heroPosY: number = typeof heroConfig.posY === 'number' ? heroConfig.posY : 50;
  const heroAudio: 'silent' | 'clip' | 'voiceover' =
    heroConfig.audio === 'clip' || heroConfig.audio === 'voiceover' ? heroConfig.audio : 'silent';
  const heroPlayback: 'once' | 'loop' | 'bounce' =
    heroConfig.playback === 'loop' || heroConfig.playback === 'bounce' ? heroConfig.playback : 'once';
  const heroVoiceover: string = heroConfig.voiceover || '';
  const heroImgStyle: React.CSSProperties = heroFit === 'fit'
    ? { objectFit: 'contain', objectPosition: 'center' }
    : { objectFit: 'cover', objectPosition: `50% ${heroPosY}%` };

  // Page labels from theme
  const themePages = (page.theme_json as any)?.pages;
  const page1Label = themePages?.page1?.label || 'Page 1';
  const page2Label = themePages?.page2?.label || 'Page 2';

  // No-op click handler for edit mode
  const noOpClick: ClickHandler = () => false;
  const viewModeClick: ClickHandler = onOutboundClick ?? noOpClick;

  // Drag state
  const [isDragActive, setIsDragActive] = useState(false);

  // Drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8, delay: 100, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = () => {
    setIsDragActive(true);
  };

  // Filter blocks for display (cinematic hides social in header)
  const displayBlocks = blocks.filter(
    (b) => b.type !== 'social_links' && b.type !== 'social_icon_row'
  );
  const socialBlocks = blocks.filter(
    (b) => b.type === 'social_links' || b.type === 'social_icon_row'
  );

  const allSortableItems = displayBlocks.map(b => b.id);

  const handleDragEnd = (event: DragEndEvent) => {
    setIsDragActive(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = allSortableItems.indexOf(active.id as string);
    const newIndex = allSortableItems.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(allSortableItems, oldIndex, newIndex);
    onBlockReorder(newOrder);
  };

  return (
    <div
      className="relative max-w-[640px] mx-auto"
      style={{ fontFamily, color: theme.typography.text_color }}
    >
      {/* Fixed hero image — stays pinned while content scrolls over it */}
      <div className="relative w-full" style={{ position: 'sticky', top: stickyTop, height: 'calc(50dvh + ' + HERO_EXTRA + 'px)', maxHeight: 'calc(500px + ' + HERO_EXTRA + 'px)', overflow: 'hidden', zIndex: 1 }}>
        {heroVideo ? (
          <HeroVideo
            src={heroVideo}
            fit={heroFit}
            blurImage={heroImage}
            imgStyle={heroImgStyle}
            playbackMode={heroPlayback}
            audioMode={heroAudio}
            voiceoverUrl={heroVoiceover}
          />
        ) : heroImage ? (
          <>
            {heroFit === 'fit' && (
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${heroImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'blur(28px) brightness(0.7)',
                  transform: 'scale(1.1)',
                }}
              />
            )}
            <SmoothImage
              src={heroImage}
              alt={page.display_name || page.handle}
              className="brightness-110 relative"
              imgStyle={heroImgStyle}
              containerClassName="h-full w-full"
              skeletonClassName="bg-neutral-900"
            />
          </>
        ) : (
          <div className="h-full w-full bg-[#0e0c09] flex flex-col items-center justify-center gap-3">
            {editMode && selectedMode === 'recruit' && (
              <>
                <Camera className="h-12 w-12 text-white/20" />
                <p className="text-white/40 text-sm font-medium text-center px-6">
                  {t('editor.choosePage2Photo')}
                </p>
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="mt-1 px-5 py-2 rounded-full bg-[#C9A55C] text-[#0e0c09] font-bold text-xs"
                >
                  {t('editor.uploadPhoto')}
                </button>
              </>
            )}
          </div>
        )}
        {editMode && photoStep === 'idle' && heroImage && (
          <div className="absolute top-3 right-3 z-[15] flex flex-col gap-2">
            <button
              onClick={() => {
                // Prefer the saved original (full-size) so the cropper has the
                // unrestricted source. Falls back to the cropped hero for
                // legacy photos uploaded before avatar_original_url existed.
                const editSource = page.avatar_original_url || heroImage;
                setPhotoPreview(editSource);
                setPhotoFile(null);
                setPhotoOriginalFile(null);
                setCropZoom(1);
                setCropPosition({ x: 0, y: 0 });
                setPhotoStep('choose');
              }}
              className="bg-black/40 backdrop-blur-sm rounded-full p-3"
              title={t('editor.editCurrentPhoto')}
            >
              <Pencil className="h-6 w-6 text-white opacity-80 hover:opacity-100" />
            </button>
            <button
              onClick={() => photoInputRef.current?.click()}
              className="bg-black/40 backdrop-blur-sm rounded-full p-3"
              title={t('editor.newPhoto')}
            >
              <Camera className="h-6 w-6 text-white opacity-80 hover:opacity-100" />
            </button>
          </div>
        )}
      </div>

      {/* Content panel */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          background: theme.background?.type === 'gradient' && theme.background?.gradient_css
            ? theme.background.gradient_css
            : (theme.background?.solid_color || '#0e0c09'),
          minHeight: '60vh',
          marginTop: '-2rem',
          paddingTop: '0',
        }}
      >
        {/* Gradient fade — scrolls over the sticky hero photo */}
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            left: 0,
            right: 0,
            height: '64px',
            background: `linear-gradient(to bottom, transparent 0%, ${theme.background?.solid_color || '#0e0c09'} 80%)`,
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />

        {/* Name, handle, social icons */}
        <div
          style={{
            position: 'relative',
            zIndex: 3,
            textAlign: 'center',
            paddingLeft: '1.5rem',
            paddingRight: '1.5rem',
            marginTop: -HEADER_LIFT,
            transform: editMode ? undefined : `translateY(${-HEADER_OFFSET_Y}px)`,
            paddingBottom: editMode ? 0 : '1rem',
          }}
        >
          {/* In edit mode, name/handle render as sortable cards below */}
          {!editMode && headerCardOrder.map(id => {
            const headerNameColor = headerConfig.nameColor && headerConfig.nameColor !== '#ffffff' ? headerConfig.nameColor : chrome.text;
            const headerHandleColor = headerConfig.handleColor && headerConfig.handleColor !== '#ffffff99' ? headerConfig.handleColor : 'rgba(255,255,255,0.9)';
            const headerLightText = relativeLuminance(headerNameColor) > 0.5;
            if (id === '__name_handle__') return (
              <div key={id} style={{ paddingTop: HEADER_NAME_TOP, display: 'flex', flexDirection: 'column' as const, alignItems: 'center' }}>
                <h1
                  className="font-bold mb-0"
                  style={{
                    fontSize: `${headerConfig.nameSize}px`,
                    color: headerNameColor,
                    textShadow: 'none',
                  }}
                >
                  {page.display_name || `@${page.handle}`}
                </h1>
                <p
                  style={{
                    fontSize: `${headerConfig.handleSize}px`,
                    color: headerHandleColor,
                    textShadow: 'none',
                    margin: 0,
                    marginTop: HEADER_GAP_A,
                  }}
                >
                  @{page.handle}
                </p>
              </div>
            );
            if (id === '__social_icons__') {
              const allSocialItems = socialBlocks.flatMap(b => b.items);
              const seenLabels = new Set<string>();
              const dedupedItems = allSocialItems.filter(item => {
                const key = item.label.toLowerCase();
                if (seenLabels.has(key)) return false;
                seenLabels.add(key);
                return true;
              });
              if (dedupedItems.length === 0) return null;
              const iSize = headerConfig.iconSize ?? 'medium';
              const sizeMap: Record<string, number> = { small: 14, medium: 18, large: 24 };
              const containerMap: Record<string, string> = { small: 'h-8 w-8', medium: 'h-10 w-10', large: 'h-12 w-12' };
              return (
                <div key={id} style={{ marginTop: HEADER_GAP_B }} className="flex flex-wrap justify-center gap-3">
                  {dedupedItems.map((item) => (
                    <span
                      key={item.id}
                      className={cn('flex items-center justify-center rounded-full', containerMap[iSize])}
                      style={{ background: chrome.iconBg }}
                      title={item.label}
                    >
                      <SocialSvgIcon label={item.label} size={sizeMap[iSize]} color={chrome.iconColor} />
                    </span>
                  ))}
                </div>
              );
            }
            return null;
          })}
          {editMode && (
            <>

              {photoPreview && photoStep !== 'idle' && (
                <div
                  className="fixed inset-0 z-[130] flex flex-col bg-black/95"
                  style={{ overflow: 'hidden', touchAction: 'none', overscrollBehavior: 'none', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
                  onTouchMove={(e) => {
                    // Prevent background scroll on touch devices
                    // (manual crop step handles its own touch events)
                    if (photoStep !== 'manual') e.preventDefault();
                  }}
                  onWheel={(e) => {
                    // Prevent background scroll on mouse wheel
                    if (photoStep !== 'manual') e.preventDefault();
                  }}
                >

                  {/* CHOOSE STEP — simplified, just preview + Crop Image */}
                  {photoStep === 'choose' && (
                    <div className="flex flex-col items-center justify-center flex-1 p-6 gap-4 overflow-y-auto">
                      <p className="text-white font-bold text-xl">
                        {t('editor.editPhoto')}
                      </p>

                      {/* Live preview in the real hero shape — what you see is what publishes */}
                      <div className="relative w-full max-w-xs h-56 rounded-2xl overflow-hidden border-2 border-white/20 bg-black">
                        {heroFitDraft === 'fit' && (
                          <div
                            aria-hidden="true"
                            className="absolute inset-0"
                            style={{
                              backgroundImage: `url(${photoPreview})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              filter: 'blur(28px) brightness(0.7)',
                              transform: 'scale(1.1)',
                            }}
                          />
                        )}
                        <img
                          src={photoPreview}
                          alt="Preview"
                          className="absolute inset-0 w-full h-full"
                          style={
                            heroFitDraft === 'fit'
                              ? { objectFit: 'contain', objectPosition: 'center' }
                              : { objectFit: 'cover', objectPosition: `50% ${heroPosYDraft}%` }
                          }
                        />
                      </div>

                      {/* Fill / Fit toggle */}
                      <div className="flex w-full max-w-xs rounded-xl bg-white/5 p-1 gap-1">
                        <button
                          onClick={() => setHeroFitDraft('fill')}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            heroFitDraft === 'fill' ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/70'
                          }`}
                        >
                          Fill
                        </button>
                        <button
                          onClick={() => setHeroFitDraft('fit')}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            heroFitDraft === 'fit' ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/70'
                          }`}
                        >
                          Fit
                        </button>
                      </div>
                      <p className="text-white/40 text-xs text-center max-w-xs -mt-1">
                        {heroFitDraft === 'fill'
                          ? 'Fills the space. Drag to choose what stays centered.'
                          : 'Shows the whole photo, with a soft blurred backdrop.'}
                      </p>

                      {/* Vertical position — Fill only */}
                      {heroFitDraft === 'fill' && (
                        <div className="w-full max-w-xs flex items-center gap-3">
                          <span className="text-white/40 text-[10px]">Top</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={heroPosYDraft}
                            onChange={(e) => setHeroPosYDraft(Number(e.target.value))}
                            className="flex-1 accent-[#C9A55C]"
                          />
                          <span className="text-white/40 text-[10px]">Bottom</span>
                        </div>
                      )}

                      {/* Save (no crop needed) — new photo uploads uncropped + config;
                          existing photo writes display config only */}
                      <button
                        onClick={() => (photoFile ? handlePhotoSave() : handleHeroDisplaySave())}
                        disabled={photoSaving}
                        className="w-full max-w-xs py-4 rounded-2xl bg-[#C9A55C] text-[#0e0c09] font-bold text-sm disabled:opacity-60"
                      >
                        {photoSaving ? 'Saving…' : 'Save'}
                      </button>

                      {/* Crop manually — secondary, optional */}
                      <button
                        onClick={() => setPhotoStep('manual')}
                        className="w-full max-w-xs py-3 rounded-2xl border border-white/20 text-white/80 font-semibold text-sm"
                      >
                        {t('editor.cropImage')}
                      </button>

                      <button onClick={resetPhoto} className="text-white/40 text-xs">
                        {t('editor.cancel')}
                      </button>
                    </div>
                  )}

                  {/* AI PROCESSING STEP */}
                  {photoStep === 'ai' && (
                    <div className="flex flex-col items-center justify-center flex-1 gap-4">
                      <div className="w-12 h-12 border-2 border-[#C9A55C] border-t-transparent rounded-full animate-spin" />
                      <p className="text-white font-semibold">AI processing...</p>
                      <p className="text-white/40 text-xs">Detecting face, cropping & enhancing</p>
                    </div>
                  )}

                  {/* AI PREVIEW STEP — shows result, accept or go back */}
                  {photoStep === 'ai-preview' && aiPreviewData && (
                    <div className="flex flex-col items-center justify-center flex-1 p-6 gap-5">
                      <p className="text-white font-bold text-lg">
                        {aiPreviewEnhanced ? 'AI Result' : 'Crop Preview'}
                      </p>
                      <div className="relative">
                        <div className={`w-64 h-64 rounded-2xl overflow-hidden border-2 ${aiPreviewEnhanced ? 'border-[#C9A55C]/50' : 'border-amber-500/40'}`}>
                          <img src={aiPreviewData} alt="AI Preview" className="w-full h-full object-cover" />
                        </div>
                        {/* Status badge */}
                        <div className={`absolute top-2 left-2 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide backdrop-blur-md ${
                          aiPreviewEnhanced
                            ? 'bg-[#C9A55C]/90 text-[#0e0c09]'
                            : 'bg-amber-500/90 text-[#0e0c09]'
                        }`}>
                          {aiPreviewEnhanced ? '✓ AI ENHANCED' : '⚠ CROP ONLY — AI FAILED'}
                        </div>
                      </div>
                      <div className="flex gap-3 w-full max-w-xs">
                        <button
                          onClick={() => {
                            setAiPreviewData(null);
                            setPhotoStep('manual');
                          }}
                          className="flex-1 py-3 rounded-2xl border border-white/20 text-white font-semibold text-sm"
                        >
                          ← Back
                        </button>
                        <button
                          onClick={async () => {
                            if (!aiPreviewData) return;
                            setPhotoPreview(aiPreviewData);
                            const res = await fetch(aiPreviewData);
                            const blob = await res.blob();
                            const file = new File([blob], 'ai-enhanced.jpg', { type: 'image/jpeg' });
                            setPhotoFile(file);
                            setAiPreviewData(null);
                            await handlePhotoSave(file);
                          }}
                          className="flex-1 py-3 rounded-2xl bg-[#C9A55C] text-[#0e0c09] font-bold text-sm"
                        >
                          Accept ✓
                        </button>
                      </div>
                    </div>
                  )}

                  {/* MANUAL CROP STEP — fixed 1:1 frame, user moves image */}
                  {photoStep === 'manual' && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column', backgroundColor: '#0e0c09', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>

                      {/* Header */}
                      <div className="flex items-center justify-between px-3 border-b border-white/10" style={{ height: '44px', flexShrink: 0 }}>
                        <div className="w-8" />
                        <p className="text-white font-semibold text-sm">{t('editor.cropImage')}</p>
                        <button
                          onClick={() => setPhotoStep('choose')}
                          className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Crop area — user drags image behind fixed frame */}
                      <div
                        ref={cropContainerRef}
                        style={{ flexGrow: 1, flexShrink: 1, minHeight: 0, overflow: 'hidden', position: 'relative', backgroundColor: '#000', touchAction: 'none', cursor: 'grab' }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          setIsDraggingCrop(true);
                          setDragStart({ x: e.clientX - cropPosition.x, y: e.clientY - cropPosition.y });
                          e.currentTarget.setPointerCapture(e.pointerId);
                          e.currentTarget.style.cursor = 'grabbing';
                        }}
                        onPointerMove={(e) => {
                          if (!isDraggingCrop) return;
                          e.preventDefault();
                          const rawX = e.clientX - dragStart.x;
                          const rawY = e.clientY - dragStart.y;
                          const clamped = clampCropPosition(rawX, rawY, Math.max(cropZoom, getCropMinZoom()));
                          setCropPosition(clamped);
                        }}
                        onPointerUp={(e) => {
                          e.preventDefault();
                          setIsDraggingCrop(false);
                          e.currentTarget.style.cursor = 'grab';
                        }}
                      >
                        {/* Image — explicitly positioned, no object-fit, no CSS transform */}
                        {photoPreview && (() => {
                          const img = cropImgRef.current;
                          const container = cropContainerRef.current;
                          const nw = img?.naturalWidth || 1;
                          const nh = img?.naturalHeight || 1;
                          const cw = container?.clientWidth || 430;
                          const ch = container?.clientHeight || 600;
                          const baseScale = Math.min(cw / nw, ch / nh);
                          const effectiveZoom = Math.max(cropZoom, getCropMinZoom());
                          const dispW = nw * baseScale * effectiveZoom;
                          const dispH = nh * baseScale * effectiveZoom;
                          const imgL = (cw / 2 + cropPosition.x) - dispW / 2;
                          const imgT = (ch / 2 + cropPosition.y) - dispH / 2;
                          return (
                            <img
                              ref={cropImgRef}
                              src={photoPreview}
                              alt="Crop"
                              draggable={false}
                              className="max-w-none select-none pointer-events-none"
                              onLoad={() => {
                                setCropImgLoaded(n => n + 1);
                                // Auto-set zoom to min on load
                                const minZ = getCropMinZoom();
                                if (cropZoom < minZ) setCropZoom(minZ);
                                setCropPosition({ x: 0, y: 0 });
                              }}
                              style={{
                                position: 'absolute',
                                left: imgL,
                                top: imgT,
                                width: dispW,
                                height: dispH,
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                              }}
                            />
                          );
                        })()}

                        {/* Fixed 3:4 crop frame — centered, non-interactive */}
                        {(() => {
                          const { fw, fh } = getCropFrameSize();
                          return (
                            <div
                              ref={cropFrameRef}
                              className="absolute pointer-events-none"
                              style={{
                                width: fw,
                                height: fh,
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                border: '2px solid #C9A55C',
                                boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
                                zIndex: 10,
                              }}
                            >
                              {/* Rule of thirds grid lines */}
                              <div className="absolute inset-0">
                                <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/20" />
                                <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/20" />
                                <div className="absolute top-1/3 left-0 right-0 h-px bg-white/20" />
                                <div className="absolute top-2/3 left-0 right-0 h-px bg-white/20" />
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Zoom slider — positioned below the photo, above the AI row, so it isn't clipped by the iOS dynamic island/status bar */}
                      <div className="flex items-center gap-2 px-3 border-t border-white/10" style={{ height: '40px', flexShrink: 0, paddingTop: '4px' }}>
                        <span className="text-white/50 text-[10px] font-medium flex-shrink-0">Zoom</span>
                        <input
                          type="range"
                          min={getCropMinZoom()}
                          max={Math.max(getCropMinZoom() * 4, 3)}
                          step={0.01}
                          value={Math.max(cropZoom, getCropMinZoom())}
                          onChange={(e) => {
                            const newZoom = Number(e.target.value);
                            setCropZoom(newZoom);
                            setCropPosition(prev => clampCropPosition(prev.x, prev.y, newZoom));
                          }}
                          className="flex-1 accent-[#C9A55C] h-1"
                        />
                        <span className="text-white/70 text-[10px] font-mono w-8 text-right flex-shrink-0">
                          {Math.max(cropZoom, getCropMinZoom()).toFixed(1)}x
                        </span>
                      </div>

                      {/* AI Auto-Crop row */}
                      <div className="px-3" style={{ flexShrink: 0, paddingTop: '6px' }}>
                        <p className="text-white/40 text-[9px] font-semibold uppercase tracking-wider mb-1 text-center">AI Auto-Crop + Enhance</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            onClick={() => handleAiCrop('headshot')}
                            className="py-1.5 rounded-lg bg-[#C9A55C]/10 border border-[#C9A55C]/30 text-[#C9A55C] font-semibold text-[10px] flex flex-col items-center gap-0 hover:bg-[#C9A55C]/20 transition-colors"
                          >
                            <span className="text-xs leading-tight">👤</span>
                            Headshot
                          </button>
                          <button
                            onClick={() => handleAiCrop('shoulders')}
                            className="py-1.5 rounded-lg bg-[#C9A55C]/10 border border-[#C9A55C]/30 text-[#C9A55C] font-semibold text-[10px] flex flex-col items-center gap-0 hover:bg-[#C9A55C]/20 transition-colors"
                          >
                            <span className="text-xs leading-tight">🧑</span>
                            Shoulders
                          </button>
                          <button
                            onClick={() => handleAiCrop('fullbody')}
                            className="py-1.5 rounded-lg bg-[#C9A55C]/10 border border-[#C9A55C]/30 text-[#C9A55C] font-semibold text-[10px] flex flex-col items-center gap-0 hover:bg-[#C9A55C]/20 transition-colors"
                          >
                            <span className="text-xs leading-tight">🧍</span>
                            Full Body
                          </button>
                        </div>
                      </div>

                      {/* Bottom buttons */}
                      <div className="flex gap-2 px-3" style={{ flexShrink: 0, paddingTop: '6px', paddingBottom: '12px' }}>
                        <button
                          onClick={() => setPhotoStep('choose')}
                          className="flex-1 py-2.5 rounded-xl border border-white/20 text-white font-semibold text-xs"
                        >
                          Back
                        </button>
                        <button
                          onClick={async () => {
                            const dataUrl = getCroppedCanvas();
                            setPhotoPreview(dataUrl);
                            setCropZoom(1);
                            setCropPosition({ x: 0, y: 0 });
                            const res = await fetch(dataUrl);
                            const blob = await res.blob();
                            const file = new File([blob], 'cropped.jpg', { type: 'image/jpeg' });
                            setPhotoFile(file);
                            await handlePhotoSave(file);
                          }}
                          className="flex-1 py-2.5 rounded-xl bg-[#C9A55C] text-[#0e0c09] font-bold text-xs"
                        >
                          Apply Crop
                        </button>
                      </div>

                    </div>
                  )}

                  {/* PREVIEW STEP */}
                  {photoStep === 'preview' && (
                    <div className="flex flex-col items-center justify-center flex-1 p-6 gap-6">
                      <p className="text-white font-semibold text-lg">
                        {t('editor.previewPhoto')}
                      </p>
                      <div className="w-full rounded-2xl overflow-hidden border-2 border-[#C9A55C]/50 aspect-video">
                        <img
                          src={photoPreview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                          style={{
                            objectPosition: `${photoOffset.x}% ${photoOffset.y}%`,
                            transform: `scale(${photoScale})`,
                            transformOrigin: 'center',
                          }}
                        />
                      </div>
                      <div className="flex gap-3 w-full max-w-xs">
                        <button
                          onClick={() => setPhotoStep('choose')}
                          className="flex-1 py-3 rounded-2xl border border-white/20 text-white font-semibold"
                          disabled={photoSaving}
                        >
                          {t('editor.cancel')}
                        </button>
                        <button
                          onClick={() => handlePhotoSave()}
                          disabled={photoSaving}
                          className="flex-1 py-3 rounded-2xl bg-[#C9A55C] text-[#0e0c09] font-semibold"
                        >
                          {photoSaving ? '...' : t('editor.savePhoto')}
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </>
          )}
          {page.bio && (
            <p className="text-sm mt-2 max-w-xs mx-auto" style={{ color: chrome.textMuted, textShadow: chrome.isLight ? 'none' : '0 1px 4px rgba(0,0,0,0.3)' }}>
              {page.bio}
            </p>
          )}

          {/* Social icons in non-edit mode are rendered via headerCardOrder above */}
        </div>


        {/* Blocks */}
        {editMode ? (
          /* Preview block cards for edit mode */
          <div
            className="pb-32 flex flex-col gap-[6px]"
            style={{ marginTop: -HEADER_LIFT }}
          >
            {/* Free-drag header cards (outside DndContext) — hidden during photo crop/edit */}
            <div className="flex flex-col gap-[6px]" style={{ position: 'relative', zIndex: 5, transform: `translateY(${-HEADER_OFFSET_Y}px)` }}>
            {photoStep === 'idle' && (() => {
              const allItems = socialBlocks.flatMap(b => b.items);
              const seen = new Set<string>();
              const dedupedSocialItems = allItems.filter(item => {
                const key = item.label.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
              return headerCardOrder.map(cardId => {
                if (cardId === '__name_handle__') return (
                  <NameHandleCard
                    key={cardId}
                    chrome={chrome}
                    page={page}
                    expanded={expandedHeaderCard === '__name_handle__'}
                    onToggleExpand={() => setExpandedHeaderCard(expandedHeaderCard === '__name_handle__' ? null : '__name_handle__')}
                    localNameSize={localNameSize} setLocalNameSize={setLocalNameSize}
                    localHandleSize={localHandleSize} setLocalHandleSize={setLocalHandleSize}
                    localNameColor={localNameColor} setLocalNameColor={setLocalNameColor}
                    localHandleColor={localHandleColor} setLocalHandleColor={setLocalHandleColor}
                    localNamePadTop={localNamePadTop} setLocalNamePadTop={setLocalNamePadTop}
                    localNamePadBottom={localNamePadBottom} setLocalNamePadBottom={setLocalNamePadBottom}
                    localNameHandleGap={localNameHandleGap} setLocalNameHandleGap={setLocalNameHandleGap}
                    nameCardY={nameCardY} onNameCardYChange={setNameCardY}
                    onDragEnd={() => saveHeaderConfig({ nameCardY })}
                    onSave={() => saveHeaderConfig({
                      nameSize: localNameSize,
                      handleSize: localHandleSize,
                      nameColor: localNameColor,
                      handleColor: localHandleColor,
                      namePadTop: localNamePadTop,
                      namePadBottom: localNamePadBottom,
                      nameHandleGap: localNameHandleGap,
                    })}
                    onDisplayNameChange={async (name) => {
                      await supabase.from('pages').update({ display_name: name }).eq('id', page.id);
                      onRefresh();
                    }}
                  />
                );
                if (cardId === '__social_icons__') return (
                  <SocialIconsCard
                    key={cardId}
                    chrome={chrome}
                    socialItems={dedupedSocialItems}
                    expanded={expandedHeaderCard === '__social_icons__'}
                    onToggleExpand={() => setExpandedHeaderCard(expandedHeaderCard === '__social_icons__' ? null : '__social_icons__')}
                    localIconsPaddingY={localIconsPaddingY} setLocalIconsPaddingY={setLocalIconsPaddingY}
                    localIconSize={localIconSize} setLocalIconSize={setLocalIconSize}
                    iconsCardY={iconsCardY} onIconsCardYChange={setIconsCardY}
                    onDragEnd={() => saveHeaderConfig({ iconsCardY })}
                    contentStartY={contentStartY} setContentStartY={setContentStartY}
                    onEditSocial={() => {
                      const socialBlock = socialBlocks[0];
                      if (socialBlock) onBlockEdit(socialBlock.id);
                    }}
                    onSave={() => saveHeaderConfig({
                      iconsPaddingY: localIconsPaddingY,
                      iconSize: localIconSize,
                      contentStartY,
                    })}
                  />
                );
                return null;
              });
            })()}
            </div>
            {/* Block cards (sortable via DndContext) */}
            <div className="flex flex-col gap-[6px]" style={{ marginTop: `${-CARDS_LIFT}px` }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}>
              <SortableContext items={allSortableItems} strategy={verticalListSortingStrategy}>
                {allSortableItems.map((itemId) => {
                  const block = displayBlocks.find(b => b.id === itemId);
                  if (!block) return null;
                  return (
                    <SortablePreviewCard
                      key={block.id}
                      block={block}
                      onEdit={() => onBlockEdit(block.id)}
                      onToggle={(enabled) => onBlockToggle(block.id, enabled)}
                      onGalleryAdd={openGalleryPicker}
                      onGalleryDelete={handleGalleryDelete}
                      onItemEdit={onItemEdit}
                      onItemDelete={onItemDelete}
                      onItemAdd={onItemAdd}
                      onItemsReorder={(ids) => onItemsReorder?.(block.id, ids)}
                      isDragActive={isDragActive}
                      theme={theme}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
            </div>
          </div>
        ) : (
          /* Full block content for view mode */
          <div
            className="px-4 pb-20 flex flex-col gap-[6px]"
            style={{ marginTop: `${-CARDS_LIFT}px` }}
          >
            {displayBlocks.length === 0 ? (
              <EmptyState textColor={theme.typography.text_color} />
            ) : (
              displayBlocks.map((block, index) => (
                <motion.section
                  key={block.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <BlockRenderer block={block} onOutboundClick={viewModeClick} theme={theme} pageId={page.id} />
                </motion.section>
              ))
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 pb-8 text-center">
          <p className="text-xs opacity-60" style={{ color: theme.typography.text_color }}>
            Powered by <span className="font-bold"><span style={{ color: '#F5F3EE' }}>Titi</span><span style={{ color: '#C9A55C', fontStyle: 'italic' }}>Links</span></span>
          </p>
        </footer>
      </div>

      {/* Hidden file input for gallery instant upload */}
      <input
        ref={galleryFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={handleGalleryFileSelect}
      />

      {/* Hidden file input for profile photo upload */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={handlePhotoSelect}
      />
    </div>
  );
}
