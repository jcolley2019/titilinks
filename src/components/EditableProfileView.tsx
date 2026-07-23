import { useState, useRef, useEffect, cloneElement, type ReactElement } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { motion } from 'framer-motion';
import Cropper from 'react-easy-crop';
import { getCroppedImage, cropErrorCauseKey, type Area as CropArea } from '@/lib/crop';
import { canonicalHeroAspect, canonicalFullBleedAspect } from '@/lib/device-presets';
// FIX.MEDIA.1 — the one definition of hero framing. Every hero-media surface in
// this file resolves through it; nothing here may hardcode object-fit again.
import {
  resolveHeroMediaStyle,
  heroFramingAttr,
  useElementAspect,
  imageAspect,
  videoAspect,
  type HeroFraming,
} from '@/lib/hero-framing';
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
import { getThemeWithDefaults, applyAutoContrast, type ThemeJson, type BlockStyleConfig, type PageId, DEFAULT_BLOCK_STYLE } from '@/lib/theme-defaults';
import { getChromeTokens, relativeLuminance, type ChromeTokens } from '@/lib/contrast';
import { fullBleedText, GLASS_AFFORDANCE, GLASS_TILE, ACTION_ACCENT, withEffectivePageStyle, isFullBleedTheme, resolveHeroConfig } from '@/lib/surface';
import { LinkButton } from '@/components/LinkButton';
import { ThumbnailImage } from '@/components/ThumbnailImage';
import { SmoothImage } from '@/components/SmoothImage';
import { cn, randomUUID } from '@/lib/utils';
import { isEffectivelyGated } from '@/lib/adult-gate';
import { triggerHaptic } from '@/hooks/useHapticFeedback';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';
import { translateContent } from '@/lib/content-i18n';
import { pageLabel } from '@/lib/page-labels';
import type { Tables, Enums } from '@/integrations/supabase/types';
import type { ClickHandler } from '@/components/blocks/types';
import { PrimaryCtaBlock } from '@/components/blocks/PrimaryCtaBlock';
import { LinksBlock } from '@/components/blocks/LinksBlock';
import { ProfileAvatarContext } from '@/components/blocks/link-leading-icon';
import { SocialLinksBlock } from '@/components/blocks/SocialLinksBlock';
import { ProductCardsBlock } from '@/components/blocks/ProductCardsBlock';
import { FeaturedMediaBlock } from '@/components/blocks/FeaturedMediaBlock';
import { VideoFeedBlock } from '@/components/blocks/VideoFeedBlock';
import { HeroCardBlock } from '@/components/blocks/HeroCardBlock';
import { SocialIconRowBlock } from '@/components/blocks/SocialIconRowBlock';
import { PlatformIcon, resolveGlyphColor } from '@/components/PlatformIcon';
import { EmailSubscribeBlock } from '@/components/blocks/EmailSubscribeBlock';
import { ContentSectionBlock } from '@/components/blocks/ContentSectionBlock';
import { TextBlock } from '@/components/blocks/TextBlock';
import { CarouselBlock } from '@/components/blocks/CarouselBlock';
import { resolveFontFamily } from '@/lib/fonts';
import type { HeaderDraft } from '@/lib/header-draft';
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
  selectedMode: 'page1' | 'page2';
  onModeChange: (mode: 'page1' | 'page2') => void;
  onOutboundClick?: ClickHandler;
  /** PRICE.TRUTH.1: shows/hides the public footer credit — Free plans show
   *  it, Pro/Business don't (removeBranding entitlement). Callers resolve
   *  the plan; EPV just renders the boolean. */
  showBranding: boolean;
  onAddContent?: () => void;
  onEditVideo?: () => void;
  // PHOTO.ROUTE.1: external "open the photo editor" request, from the guided
  // checklist's Video Profile menu. A counter rather than a boolean, so the
  // same request can be made twice; each increment is one request.
  openPhotoRequest?: number;
  // FIX.MEDIA.1: in-flight hero-video framing from the Video Profile panel's
  // sliders. Declarative (unlike openPhotoRequest's counter), so both mounted
  // editor instances may safely receive it. Absent → render the saved framing.
  videoPosDraft?: HeroFraming | null;
  // Per-item edit affordances for links blocks (G2). Optional — absent on the
  // public/live render.
  onItemEdit?: (blockId: string, itemId: string) => void;
  onItemDelete?: (itemId: string) => void;
  onItemAdd?: (blockId: string) => void;
  onItemsReorder?: (blockId: string, orderedItemIds: string[]) => void;
  // Live-mirror (L4): the Name & Handle hub's in-progress edits. Present fields
  // win over the saved values in the edit-mode preview; absent means "no override".
  headerDraft?: HeaderDraft | null;
  // Live-mirror (L5): the Customize Profile panel's in-progress theme. When
  // present it replaces the saved theme for the whole preview render.
  themeDraft?: ThemeJson | null;
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
    default: return resolveFontFamily(theme.typography.font) ?? "'Inter', sans-serif";
  }
}

// NAMEFX.1b: optional name/handle text effect from
// theme_json.typography.text_effect ({ type: 'none'|'shadow'|'outline',
// intensity?, width?, color? }). Shadow scales with intensity; outline
// paints a stroke BEHIND the fill (paint-order), width doubled so the
// visible outside edge matches the chosen 1/2/3px.
// Pure so both the public header and the edit-mode name card can share it.
function getNameFx(fx: any): React.CSSProperties {
  if (!fx || !fx.type || fx.type === 'none') return { textShadow: 'none' };
  if (fx.type === 'shadow') {
    const i = (typeof fx.intensity === 'number' ? fx.intensity : 60) / 100;
    return { textShadow: `0 1px 3px rgba(0,0,0,${(0.85 * i).toFixed(2)}), 0 0 14px rgba(0,0,0,${(0.6 * i).toFixed(2)})` };
  }
  const w = (typeof fx.width === 'number' ? fx.width : 2) * 2;
  return {
    textShadow: 'none',
    WebkitTextStroke: `${w}px ${fx.color || '#000000'}`,
    paintOrder: 'stroke fill',
  } as React.CSSProperties;
}

// ─── SocialSvgIcon ───────────────────────────────────────────────────────────

function SocialSvgIcon({ label, size = 20, color }: { label: string; size?: number; color?: string }) {
  return <PlatformIcon label={label} size={size} color={color} />;
}

// ─── Icon row (IR.1) ─────────────────────────────────────────────────────────

// IR.1 icon-row sizing (architect defaults; tune by number here). Glyphs are
// +20% vs pre-IR.1 (14/18/24 -> 17/22/29); circles step up one size
// (h-8/h-10/h-12 -> h-9/h-11/h-[52px], i.e. 32/40/48px -> 36/44/52px); the
// inter-icon gap tightens (gap-3 12px -> gap-1.5 6px, per ICON.GAP.1).
const ICON_GLYPH_PX: Record<string, number> = { small: 17, medium: 22, large: 29 };
const ICON_CIRCLE_CLASS: Record<string, string> = { small: 'h-9 w-9', medium: 'h-11 w-11', large: 'h-[52px] w-[52px]' };
const ICON_ROW_GAP = 'gap-1.5';
const ICON_GAP_PX = 6; // matches gap-1.5; used as per-icon marginRight in drift mode
// Slow horizontal drift when the row overflows. Reuses the Gallery/Carousel rAF
// scrollLeft loop; larger = slower. Velocity = clientWidth * 0.72 / DRIFT_MS.
const ICON_DRIFT_MS = 14000;

type IconBgResolved = { className: string; background: string };

// IR.1: resolve the icon-circle background. Unset or 'default' preserves the
// pre-IR.1 appearance (theme tint in color mode, transparent otherwise) so
// existing pages are visually unchanged until the creator opts into a named
// style. Both live surfaces (header render + edit card) read through this.
function resolveIconBg(
  style: string | undefined,
  colorMode: 'color' | 'black' | 'white',
  themeBg: string,
): IconBgResolved {
  switch (style) {
    case 'off':   return { className: '', background: 'transparent' };
    case 'glass': return { className: 'backdrop-blur-md', background: 'rgba(255,255,255,0.14)' };
    case 'dark':  return { className: '', background: 'rgba(0,0,0,0.45)' };
    case 'white': return { className: '', background: '#ffffff' };
    case 'black': return { className: '', background: '#000000' };
    default:      return { className: '', background: colorMode === 'color' ? themeBg : 'transparent' };
  }
}

// IR.1: the public header icon row. Fits on one line => static, centered (the
// pre-IR.1 look). Overflows => the row becomes a single drifting strip that
// reuses the Gallery block's rAF scrollLeft loop (duplicated for a seamless
// wrap), disabled under prefers-reduced-motion. A pointer/touch pauses it 8s.
function HeaderIconRow({ nodes, gapTop }: { nodes: ReactElement[]; gapTop: number }) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const pausedUntil = useRef(0);
  const pause = () => { pausedUntil.current = Date.now() + 8000; };

  // Does the single copy exceed the container? (Once looping, the strip is
  // doubled, so halve scrollWidth to recover the single-copy width.)
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const measure = () => {
      const single = overflowing ? el.scrollWidth / 2 : el.scrollWidth;
      setOverflowing(single > el.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [nodes.length, overflowing]);

  useEffect(() => {
    if (!overflowing) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = stripRef.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    // Accumulate in a float: reading el.scrollLeft back each frame rounds to an
    // integer, so on a narrow (mobile) row the sub-pixel step would round away
    // and the strip would never move. Keeping our own position avoids that.
    let pos = el.scrollLeft;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (el.scrollWidth > 0 && Date.now() >= pausedUntil.current) {
        const oneCopy = el.scrollWidth / 2;
        const pxPerSec = (el.clientWidth * 0.72 * 1000) / ICON_DRIFT_MS;
        pos += pxPerSec * dt;
        if (oneCopy > 0 && pos >= oneCopy) pos -= oneCopy;
        el.scrollLeft = pos;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [overflowing]);

  // Drift mode spaces icons with a per-icon right margin (not flex gap) so the
  // doubled strip wraps at exactly scrollWidth/2 with no jump — the Gallery
  // block's technique. The duplicate copy is inert (aria-hidden, not tabbable).
  const spaced = (arr: ReactElement[], dup: boolean) =>
    arr.map((n) =>
      cloneElement(n, {
        key: dup ? `${n.key}-dup` : n.key,
        style: { ...(n.props.style || {}), marginRight: ICON_GAP_PX },
        ...(dup ? { 'aria-hidden': true, tabIndex: -1 } : {}),
      })
    );

  return (
    <div
      ref={stripRef}
      data-icon-row=""
      onPointerDown={pause}
      onTouchStart={pause}
      style={{ marginTop: gapTop }}
      className={cn(
        'flex scrollbar-hide',
        overflowing ? 'justify-start overflow-x-auto' : `justify-center overflow-x-hidden ${ICON_ROW_GAP}`,
      )}
    >
      {overflowing ? [...spaced(nodes, false), ...spaced(nodes, true)] : nodes}
    </div>
  );
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
  const blockProps = { block, onOutboundClick, theme, editMode };

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
    case 'carousel':
      return <CarouselBlock {...blockProps} />;
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
    <div className={cn('px-1 py-1', alignClass)} style={fontFamily ? { fontFamily } : undefined}>
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

  // FS.SURFACE.1c→1d: full-bleed-safe label (shared helper in lib/surface).
  const galleryLabelStyle = fullBleedText(theme, theme.typography.text_color);

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

  // Seamless infinite loop: filmstrip layout, 2+ photos, auto-scroll on. Render
  // the strip twice and glide continuously, wrapping by exactly one copy width
  // (pixel-identical) so the first photo flows back around with no rewind/jump.
  // Runs in the edit preview too (so the creator can see speeds): delete handles
  // render on the first copy only, and any touch pauses the glide for 8s to tap.
  const loop = layout === 'filmstrip' && autoScroll && count >= 2;
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
        <p className="text-sm font-semibold" style={galleryLabelStyle}>
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
              {onDelete && i < count && (
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
        <p className="text-sm font-semibold" style={galleryLabelStyle}>
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
      <p className="text-sm font-semibold" style={galleryLabelStyle}>
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
              ...GLASS_TILE,
            }}
          >
            <span className="text-4xl font-light" style={{ color: ACTION_ACCENT, opacity: 0.7 }}>+</span>
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
const HEADER_GAP_A = -2;     // default gap name -> handle, px (negative = tighter); HDR.SPACE.2 fallback for headerConfig.spacing.nameHandle
const HEADER_GAP_B = 6;      // default gap handle -> icons, px; HDR.SPACE.2 fallback for headerConfig.spacing.handleIcons
const HEADER_GAP_C = 16;     // default gap icons -> first content in view mode, px (the pre-HDR.SPACE.2 '1rem'); fallback for headerConfig.spacing.iconsContent
const HEADER_LIFT = 25;      // px the name/handle/icons ride UP toward the seam; dial on a REAL phone (bigger = higher; content below rides up with them).
const HEADER_OFFSET_Y =95; // name/handle/icons lift over the hero, in px. Raise to float them up; 0 = none.
const CARDS_LIFT = 85;      // px the link cards ride UP under the icons, closing the gap the header lift leaves behind. Bigger = cards higher / smaller gap; smaller = bigger gap.
const HERO_EXTRA = 60;       // px added to hero height; gradient follows down with it. Dial on a REAL phone until the hero fills ~half the screen. 6px ~ 1/16 in.

function NameHandleCard({
  page,
  localNameSize,
  localHandleSize,
  localNameColor,
  localHandleColor,
  onDisplayNameChange,
  draftDisplayName,
  nameFx,
  chrome,
  gapNameHandle,
}: {
  page: any;
  chrome: ChromeTokens;
  draftDisplayName?: string;
  // HDR.SPACE.2 — resolved name -> handle gap (draft ?? saved ?? HEADER_GAP_A).
  gapNameHandle: number;
  // Text-effect style (shadow/outline) for the name + handle. Carries no layout
  // properties, so it spreads over the text styles without moving anything.
  nameFx?: React.CSSProperties;
  localNameSize: number;
  localHandleSize: number;
  localNameColor: string;
  localHandleColor: string;
  onDisplayNameChange: (name: string) => void;
}) {
  const [localDisplayName, setLocalDisplayName] = useState(page.display_name || '');
  // Re-seed the draft when a Name & Handle hub save refreshes the page prop; an
  // in-progress hub draft (L4) wins until it clears.
  useEffect(() => {
    setLocalDisplayName(draftDisplayName ?? (page.display_name || ''));
  }, [page.display_name, draftDisplayName]);

  const nameSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const debouncedNameSave = (name: string) => {
    clearTimeout(nameSaveTimer.current);
    nameSaveTimer.current = setTimeout(() => onDisplayNameChange(name), 500);
  };

  const resolvedNameColor = localNameColor || chrome.text;

  return (
    <div
      style={{ position: 'relative', zIndex: 20 }}
      className="relative"
    >
      {/* Content — tap name to edit inline. */}
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
              ...nameFx,
            }}
          />
          <p style={{ fontSize: localHandleSize, color: localHandleColor === '#ffffff99' ? 'rgba(255,255,255,1)' : localHandleColor, textShadow: 'none', ...nameFx, margin: 0, marginTop: gapNameHandle }}>
            @{page.handle}
          </p>
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
  localIconColorMode,
  localIconBgStyle,
  iconsCardY, onIconsCardYChange, onDragEnd,
  contentStartY, setContentStartY,
  onEditSocial,
  onSave,
  gapHandleIcons,
}: {
  socialItems: any[];
  chrome: ChromeTokens;
  expanded: boolean;
  onToggleExpand: () => void;
  localIconsPaddingY: number; setLocalIconsPaddingY: (v: number) => void;
  localIconSize: 'small'|'medium'|'large'; setLocalIconSize: (v: 'small'|'medium'|'large') => void;
  localIconColorMode: 'color'|'black'|'white';
  localIconBgStyle?: string;
  iconsCardY: number; onIconsCardYChange: (v: number) => void; onDragEnd: () => void;
  contentStartY: number; setContentStartY: (v: number) => void;
  onEditSocial: () => void;
  onSave: () => void;
  // HDR.SPACE.2 — resolved handle -> icons gap (draft ?? saved ?? HEADER_GAP_B).
  gapHandleIcons: number;
}) {
  const { t } = useLanguage();
  const dragStart = useRef({ y: 0, cardY: 0 });

  const resolvedIconColor = localIconColorMode === 'black' ? '#000000' : localIconColorMode === 'white' ? '#ffffff' : undefined;
  const iconBg = resolveIconBg(localIconBgStyle, localIconColorMode, chrome.iconBg);

  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const debouncedSave = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(onSave, 500);
  };

  return (
    <div
      style={{ marginTop: gapHandleIcons, position: 'relative', zIndex: 20 }}
      className="relative"
    >
      {/* Icon row — size comes from the Social Platforms menu (headerConfig.iconSize) */}
      <div
        className="relative"
        style={{ paddingTop: 0, paddingBottom: 0 }}
      >
        <div className={cn('flex flex-wrap justify-center px-4', ICON_ROW_GAP)}>
          {socialItems.map((item) => (
            <a
              key={item.id}
              href={item.url || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className={cn('flex items-center justify-center rounded-full', ICON_CIRCLE_CLASS[localIconSize], iconBg.className)}
              style={{ background: iconBg.background }}
              title={item.label}
            >
              <SocialSvgIcon label={item.label} size={ICON_GLYPH_PX[localIconSize]} color={resolveGlyphColor(item.label, resolvedIconColor, iconBg.background)} />
            </a>
          ))}
          {/* Add / manage platforms — opens the Manage Platforms menu (edit mode only) */}
          <button
            type="button"
            onClick={onEditSocial}
            aria-label={t('editor.editSocial')}
            title={t('editor.editSocial')}
            className={cn('flex items-center justify-center rounded-full border border-dashed border-white/30 text-white/50 hover:text-white/80 hover:border-white/50 transition-colors', ICON_CIRCLE_CLASS[localIconSize])}
            style={{ background: chrome.iconBg }}
          >
            <Plus size={ICON_GLYPH_PX[localIconSize]} />
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
            'w-[33px] h-[18px] rounded-full flex-shrink-0 p-[1.5px] transition-colors',
            block.is_enabled ? 'bg-[#C9A55C]' : 'bg-white/20'
          )}
        >
          <div
            className={cn(
              'h-[15px] w-[15px] rounded-full bg-white shadow-md transition-transform',
              block.is_enabled ? 'translate-x-[15px]' : 'translate-x-0'
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
        <div className="p-3">
          {block.type === 'gallery' ? (
            <GalleryBlock block={block} theme={theme} onEdit={() => onGalleryAdd(block.id)} onDelete={onGalleryDelete} />
          ) : block.items.length === 0 && block.type !== 'video_feed' && block.type !== 'text' ? (
            <div className="py-6 text-center">
              <p className="text-xs text-white/75">{t(`blocks.${block.type}.subtitle`)}</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (block.type === 'links' && onItemAdd) onItemAdd(block.id);
                  else onEdit();
                }}
                className={`mt-3 w-full rounded-xl ${GLASS_AFFORDANCE}`}
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

// FIX.MEDIA.1: HeroVideo owns video framing outright. Callers hand it the
// stored framing plus the MEASURED aspect of the box it paints into; it reads
// the clip's own aspect from metadata and resolves through the shared resolver.
// Callers may no longer pass a style — that is how three surfaces drifted into
// three geometries (one of which silently dropped framing entirely).
export function HeroVideo({
  src,
  poster,
  fit,
  blurImage,
  framing,
  containerAspect,
  playbackMode = 'once',
  audioMode = 'silent',
  voiceoverUrl = '',
  overlayOnTop = false,
  overlayPortalEl = null,
}: {
  src: string;
  poster?: string;
  fit: string;
  blurImage?: string;
  framing?: HeroFraming | null;
  containerAspect?: number | null;
  playbackMode?: 'once' | 'loop' | 'bounce';
  audioMode?: 'silent' | 'clip' | 'voiceover';
  voiceoverUrl?: string;
  overlayOnTop?: boolean;
  overlayPortalEl?: HTMLElement | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Null until metadata arrives; the resolver covers correctly meanwhile.
  const [mediaAspect, setMediaAspect] = useState<number | null>(null);
  const framingInput = { mediaAspect, containerAspect, framing };
  const imgStyle = resolveHeroMediaStyle(framingInput);
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
      {/* Dark fill behind the video — black edges when zoomed out, and bridges load (no old-image flash). */}
      <div aria-hidden="true" className="absolute inset-0 bg-[#0e0c09]" />
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
        onLoadedMetadata={(e) => setMediaAspect(videoAspect(e.currentTarget))}
        className="brightness-110"
        style={imgStyle}
        data-hero-framing={heroFramingAttr(framingInput)}
      />
      {hasVoiceover && (
        <audio ref={audioRef} src={voiceoverUrl} preload="auto" />
      )}
      {showReplay && (() => {
        const replayBtn = (
          <button
            onClick={replay}
            aria-label="Replay video"
            className={overlayOnTop
              ? 'fixed inset-0 z-[40]'
              : 'absolute inset-0 z-[6] flex items-center justify-center'}
          >
            <span className={overlayOnTop
              ? 'absolute left-1/2 top-[25dvh] -translate-x-1/2 -translate-y-1/2 flex h-14 w-14 items-center justify-center rounded-full ring-1 ring-white/25'
              : 'flex h-14 w-14 items-center justify-center rounded-full ring-1 ring-white/25'}>
              <Play className="h-6 w-6 text-white/45" fill="currentColor" />
            </span>
          </button>
        );
        return overlayOnTop ? createPortal(replayBtn, overlayPortalEl ?? document.body) : replayBtn;
      })()}
      {hasSound && !showReplay && (() => {
        const soundBtn = (
        <button
          onClick={toggleSound}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className={overlayOnTop
            ? 'fixed bottom-3 right-3 z-[40] bg-black/45 backdrop-blur-sm rounded-full p-2 transition-opacity hover:opacity-90'
            : 'absolute bottom-3 right-3 z-10 bg-black/45 backdrop-blur-sm rounded-full p-2 transition-opacity hover:opacity-90'}
        >
          {muted ? (
            <VolumeX className="h-5 w-5 text-white" />
          ) : (
            <Volume2 className="h-5 w-5 text-white" />
          )}
        </button>
        );
        return overlayOnTop ? createPortal(soundBtn, overlayPortalEl ?? document.body) : soundBtn;
      })()}
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
  showBranding,
  onAddContent,
  onEditVideo,
  openPhotoRequest = 0,
  videoPosDraft = null,
  onItemEdit,
  onItemDelete,
  onItemAdd,
  onItemsReorder,
  headerDraft,
  themeDraft,
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
  const [localHeroImages, setLocalHeroImages] = useState<{ page1: string | null; page2: string | null }>({ page1: null, page2: null });
  const [photoStep, setPhotoStep] = useState<'idle' | 'choose' | 'manual' | 'ai' | 'ai-preview' | 'preview'>('idle');
  const [aiPreviewData, setAiPreviewData] = useState<string | null>(null); // holds AI-cropped+enhanced data URL
  const [aiPreviewEnhanced, setAiPreviewEnhanced] = useState(false); // true = AI ran, false = crop only fallback
  const [photoOffset, setPhotoOffset] = useState({ x: 50, y: 30 });
  const [photoScale, setPhotoScale] = useState(1);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 }); // image pan offset
  // Two-page hero (HERO-PAGE2): Page 2 reads/writes its OWN hero config
  // unless it inherits Page 1's. `heroConfigKey` is the single key the hero
  // handlers + render selection target.
  const heroInherit: boolean = (page.theme_json as any)?.pages?.page2?.heroInherit === true;
  const usePage2Own = selectedMode === 'page2' && !heroInherit;
  const heroConfigKey = usePage2Own ? 'heroConfig_page2' : 'heroConfig';
  // HERO.DEFAULTS.1: the page whose effective hero config the resolver reads —
  // Page 2's own when editing it un-inherited, else Page 1's (an inheriting
  // Page 2 mirrors Page 1). Writers still target heroConfigKey; readers resolve.
  const heroPageId: PageId = usePage2Own ? 'page2' : 'page1';
  // HERO-1 display mode (B1): live Fill/Fit + vertical position, persisted to theme_json[heroConfigKey].
  // HERO.DEFAULTS.1: drafts open from the RESOLVED config, so the control lands
  // on the dialed-in default (Fill, posY 25) on a config-less page — matching
  // the render and the entering-hero seed, never the raw posY-50 dead-center.
  const [heroFitDraft, setHeroFitDraft] = useState<'fill' | 'fit'>(
    resolveHeroConfig(page.theme_json, heroPageId).fit === 'fit' ? 'fit' : 'fill'
  );
  const [heroPosYDraft, setHeroPosYDraft] = useState<number>(
    resolveHeroConfig(page.theme_json, heroPageId).posY ?? 50
  );
  const [heroPosXDraft, setHeroPosXDraft] = useState<number>(
    resolveHeroConfig(page.theme_json, heroPageId).posX ?? 50
  );
  // Resync hero display drafts when the edited page (or inherit toggle) changes.
  useEffect(() => {
    const cfg = resolveHeroConfig(page.theme_json, heroPageId);
    setHeroFitDraft(cfg.fit === 'fit' ? 'fit' : 'fill');
    setHeroPosYDraft(cfg.posY ?? 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroConfigKey]);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const cropImgRef = useRef<HTMLImageElement>(null);
  const cropFrameRef = useRef<HTMLDivElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const [, setCropImgLoaded] = useState(0); // triggers re-render on img load
  // CROP.2b: react-easy-crop state for the manual crop step —
  // replaces the legacy pan/zoom interaction (which remains below
  // as scaffolding for the AI paths until CROP.2d).
  const [rcCrop, setRcCrop] = useState({ x: 0, y: 0 });
  const [rcZoom, setRcZoom] = useState(1);
  const [rcAreaPixels, setRcAreaPixels] = useState<CropArea | null>(null);
  // CROP.3a readiness (STEP 2): true once the TinyFaceDetector model is loaded.
  // Gates the AI-crop buttons so the first click can't race the model load.
  const [faceModelReady, setFaceModelReady] = useState(faceapi.nets.tinyFaceDetector.isLoaded);
  // CROP.3a slider-truth (STEP 2/Defect D): the hero preview box + the photo's
  // natural aspect drive whether the Top/Bottom slider has any vertical travel.
  const heroPreviewRef = useRef<HTMLDivElement>(null);
  const [heroImgAspect, setHeroImgAspect] = useState<number | null>(null);
  // FIX.MEDIA.1: measured off the dialog's preview box — which now renders at
  // the LIVE container aspect, so this answers a question about the real page.
  // It previously measured a 320x224 LANDSCAPE box while the hero is portrait,
  // which is why "already fills top-to-bottom" fired on photos that had plenty
  // of vertical travel. Cover pans only the axis that overflows: vertical
  // travel exists iff the photo is narrower than the box it paints into.
  const heroPreviewAspect = useElementAspect(heroPreviewRef);
  const posYHasTravel =
    heroImgAspect == null || heroPreviewAspect == null
      ? true
      : heroImgAspect < heroPreviewAspect - 0.01;

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

  // PHOTO.ROUTE.1: an external request opens the SAME picker the camera button
  // does — handlePhotoSelect then routes into the 'choose' step, so no photo-flow
  // logic is duplicated here. The ref makes it edge-driven (fires on an increment
  // only, never on mount with a stale count); a request arriving mid-flow is
  // dropped rather than interrupting a crop in progress.
  const photoRequestRef = useRef(openPhotoRequest);
  useEffect(() => {
    const prev = photoRequestRef.current;
    photoRequestRef.current = openPhotoRequest;
    if (openPhotoRequest === prev) return;
    if (!editMode || photoStep !== 'idle') return;
    photoInputRef.current?.click();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPhotoRequest]);

  // CROP.3a readiness (STEP 2): preload the TinyFaceDetector model the moment
  // the manual crop step opens, so the AI-crop buttons gate on real readiness
  // (disabled + loading) instead of letting the first click race the load. A
  // load failure is logged (name+message) and leaves the buttons disabled.
  useEffect(() => {
    if (photoStep !== 'manual') return;
    if (faceapi.nets.tinyFaceDetector.isLoaded) { setFaceModelReady(true); return; }
    let cancelled = false;
    faceapi.nets.tinyFaceDetector.loadFromUri('/models')
      .then(() => { if (!cancelled) setFaceModelReady(true); })
      .catch((e) => console.error('[AI CROP] model preload failed:', (e as any)?.name, (e as any)?.message));
    return () => { cancelled = true; };
  }, [photoStep]);

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

  // HDR.SPACE.2 — user-tunable header gaps (headerConfig.spacing). Absent keys
  // fall back to the HEADER_GAP_* constants, so a page that never touched the
  // sliders renders byte-identically. An open Name & Handle hub draft (L4)
  // wins so the Spacing sliders preview live.
  const headerSpacing = {
    nameHandle: headerDraft?.spacing?.nameHandle ?? headerConfig.spacing?.nameHandle ?? HEADER_GAP_A,
    handleIcons: headerDraft?.spacing?.handleIcons ?? headerConfig.spacing?.handleIcons ?? HEADER_GAP_B,
    iconsContent: headerDraft?.spacing?.iconsContent ?? headerConfig.spacing?.iconsContent ?? HEADER_GAP_C,
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
  const [localIconColorMode, setLocalIconColorMode] = useState<'color'|'black'|'white'>(headerConfig.iconColorMode ?? 'color');
  const [localIconBgStyle, setLocalIconBgStyle] = useState<string | undefined>(headerConfig.iconBgStyle);
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
  useEffect(() => {
    setLocalIconColorMode(headerConfig.iconColorMode ?? 'color');
  }, [headerConfig.iconColorMode]);
  useEffect(() => {
    setLocalIconBgStyle(headerConfig.iconBgStyle);
  }, [headerConfig.iconBgStyle]);

  // Same idea for the name/handle drafts — keep the editor preview in sync with
  // the Name & Handle menu (headerConfig.name*/handle*).
  // An in-progress hub draft (L4) wins over the saved value; once it clears, the
  // effect re-runs and falls back to headerConfig.
  useEffect(() => {
    setLocalNameSize(headerDraft?.nameSize ?? headerConfig.nameSize ?? 28);
  }, [headerDraft?.nameSize, headerConfig.nameSize]);
  useEffect(() => {
    setLocalHandleSize(headerDraft?.handleSize ?? headerConfig.handleSize ?? 14);
  }, [headerDraft?.handleSize, headerConfig.handleSize]);
  useEffect(() => {
    setLocalNameColor(headerDraft?.nameColor ?? headerConfig.nameColor ?? '#ffffff');
  }, [headerDraft?.nameColor, headerConfig.nameColor]);
  useEffect(() => {
    setLocalHandleColor(headerDraft?.handleColor ?? headerConfig.handleColor ?? '#ffffff99');
  }, [headerDraft?.handleColor, headerConfig.handleColor]);
  useEffect(() => {
    setLocalNamePadTop(headerConfig.namePadTop ?? headerConfig.namePaddingY ?? 0);
  }, [headerConfig.namePadTop, headerConfig.namePaddingY]);
  useEffect(() => {
    setLocalNamePadBottom(headerConfig.namePadBottom ?? headerConfig.namePaddingY ?? 0);
  }, [headerConfig.namePadBottom, headerConfig.namePaddingY]);
  useEffect(() => {
    setLocalNameHandleGap(headerConfig.nameHandleGap ?? 2);
  }, [headerConfig.nameHandleGap]);

  const handleGalleryFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !activeGalleryBlockId || !user) return;

    const filesToAdd = Array.from(files).slice(0, 20);

    for (const file of filesToAdd) {
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${randomUUID()}.${fileExt}`;

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
      toast.error(t('editor.photo.deleteFailed'));
      return;
    }
    toast.success(t('editor.photo.removed'));
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
    // WYSIWYG: derive the frame from the SAME formula as the target
    // canvas. Hero pages use the hero window's CSS (width capped 640;
    // height = 50dvh + HERO_EXTRA, capped 500 + HERO_EXTRA).
    // Full-screen pages use the phone viewport — real dims on a
    // phone, capped at 430x932 reference dims on desktop so the
    // desktop editor never yields a landscape frame. With matching
    // aspects, cover-fill of the saved crop displays exactly what was
    // framed.
    const heroW = Math.min(window.innerWidth, 640);
    const heroH = Math.min(window.innerHeight * 0.5 + 60, 560);
    const ratio = isFullBleed
      ? Math.min(window.innerWidth, 430) / Math.min(window.innerHeight, 932)
      : heroW / heroH;
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

    // Image display size — use the EFFECTIVE zoom, exactly as the
    // on-screen transform, slider, and pan clamp do. Raw cropZoom
    // can sit below the cover minimum (e.g. state still 1 while the
    // display enforces minZoom), and computing with it maps the
    // frame onto a larger region than the user saw.
    const baseScale = Math.min(cw / nw, ch / nh);
    const effectiveZoom = Math.max(cropZoom, getCropMinZoom());
    const dispW = nw * baseScale * effectiveZoom;
    const dispH = nh * baseScale * effectiveZoom;

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
      const existingHero = existingTheme[heroConfigKey] || {};
      const { error } = await supabase
        .from('pages')
        .update({ theme_json: { ...existingTheme, [heroConfigKey]: { ...existingHero, fit: heroFitDraft, posY: heroPosYDraft, posX: heroPosXDraft } } })
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

  const handlePhotoSave = async (overrideFile?: File, posYOverride?: number) => {
    // CROP.3a-C rule 2: a manual crop is composed at the canonical hero aspect,
    // so the apply path passes posY 50 (centered) — cover-at-matching-aspect is
    // an identity there. Every other caller omits it and keeps the user's draft.
    const posYToSave = posYOverride ?? heroPosYDraft;
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
      const fileName = `${user.id}/${randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, fileToUpload, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // If this is a fresh upload (user picked a new file), also store the
      // original full-size photo so they can re-crop later with full
      // flexibility. Skipped only on re-crop (photoOriginalFile is null).
      // Page 1 stores it in the avatar_original_url column; Page 2 in theme_json.
      let originalUrl: string | null = null;
      if (photoOriginalFile) {
        const origExt = photoOriginalFile.name.split('.').pop() || 'jpg';
        const origFileName = `${user.id}/${randomUUID()}-original.${origExt}`;
        const { error: origUploadError } = await supabase.storage
          .from('avatars')
          .upload(origFileName, photoOriginalFile, { upsert: true });
        if (origUploadError) {
          console.error('Original photo upload failed (non-fatal):', origUploadError);
        } else {
          originalUrl = supabase.storage.from('avatars').getPublicUrl(origFileName).data.publicUrl;
        }
      }

      if (usePage2Own) {
        // Save Page 2's own hero into theme_json: image, display config, and
        // (when a fresh file was picked) the full-size original for re-crop.
        const existingTheme = (page.theme_json as any) || {};
        const existingHero = { ...(existingTheme.heroConfig_page2 || {}) };
        delete existingHero.video; // an image hero replaces any video — clean swap
        const nextTheme: any = {
          ...existingTheme,
          avatar_url_page2: urlData.publicUrl,
          heroConfig_page2: { ...existingHero, fit: heroFitDraft, posY: posYToSave, posX: heroPosXDraft },
        };
        if (originalUrl) nextTheme.avatar_original_url_page2 = originalUrl;
        await supabase
          .from('pages')
          .update({ theme_json: nextTheme })
          .eq('id', page.id);
      } else {
        const existingTheme = (page.theme_json as any) || {};
        const existingHero = { ...(existingTheme.heroConfig || {}) };
        delete existingHero.video; // an image hero replaces any video — clean swap, no leftover video
        const updates: { avatar_url: string; avatar_original_url?: string; theme_json: any } = {
          avatar_url: urlData.publicUrl,
          theme_json: { ...existingTheme, heroConfig: { ...existingHero, fit: heroFitDraft, posY: posYToSave, posX: heroPosXDraft } },
        };
        if (originalUrl) {
          updates.avatar_original_url = originalUrl;
        }
        await supabase
          .from('pages')
          .update(updates)
          .eq('id', page.id);
      }
      toast.success(t('editor.hero.photoUpdated'));
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
      toast.error(t('editor.photo.uploadFailed'));
    } finally {
      setPhotoSaving(false);
    }
  };

  const handleVideoUpload = async (file: File) => {
    if (!user) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error(t('editor.video.tooLarge'));
      return;
    }
    toast('Uploading video…');
    setPhotoSaving(true);
    try {
      const fileExt = file.name.split('.').pop() || 'mp4';
      const fileName = `${user.id}/hero-video-${randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);
      const existingTheme = (page.theme_json as any) || {};
      const existingHero = existingTheme[heroConfigKey] || {};
      const { error } = await supabase
        .from('pages')
        .update({ theme_json: { ...existingTheme, [heroConfigKey]: { ...existingHero, video: urlData.publicUrl, fit: 'fill' } } })
        .eq('id', page.id);
      if (error) throw error;
      toast.success(t('editor.video.added'));
      onRefresh();
    } catch (err) {
      console.error('Video upload error:', err);
      toast.error(t('editor.video.uploadFailed'));
    } finally {
      setPhotoSaving(false);
    }
  };

  const handleVideoRemove = async () => {
    setPhotoSaving(true);
    try {
      const existingTheme = (page.theme_json as any) || {};
      const existingHero = { ...(existingTheme[heroConfigKey] || {}) };
      delete existingHero.video;
      const { error } = await supabase
        .from('pages')
        .update({ theme_json: { ...existingTheme, [heroConfigKey]: existingHero } })
        .eq('id', page.id);
      if (error) throw error;
      toast.success(t('editor.video.removed'));
      onRefresh();
    } catch (err) {
      console.error('Video remove error:', err);
      toast.error(t('editor.video.removeFailed'));
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
      // CROP.3a error truth: re-throw so a model-load / decode / detection
      // failure reaches the caller as a real cause hint — only a clean run that
      // finds nothing falls through to the null "no face" result below.
      console.error('[AI CROP] face-api.js error:', (e as any)?.name, (e as any)?.message, e);
      throw e;
    }

    return null; // no face detected (clean run — genuinely no face)
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
        toast.error(t('editor.crop.noFace'));
        setRcCrop({ x: 0, y: 0 }); setRcZoom(1); setRcAreaPixels(null);
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
      // CROP.3a error truth: log name+message and carry a concise cause hint so
      // a model-load / decode failure is distinguishable from a clean no-face.
      console.error('[AI CROP] failed:', (err as any)?.name, (err as any)?.message, err);
      toast.error(`${t('editor.aiCropFailed')} — ${t(cropErrorCauseKey(err))}`);
      setRcCrop({ x: 0, y: 0 }); setRcZoom(1); setRcAreaPixels(null);
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
      toast.error(t('editor.crop.enhanceFailed'));
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
    setRcCrop({ x: 0, y: 0 }); setRcZoom(1); setRcAreaPixels(null);
  };

  // Get theme
  // LIVE.THEME.1 (L5): an in-progress Customize Profile draft overrides the
  // saved theme for the whole preview (chrome tokens included). Raw
  // theme_json readers (heroConfig/pages/headerConfig) intentionally stay on
  // saved values — the theme editor never writes those keys.
  const rawTheme = getThemeWithDefaults(themeDraft ?? page.theme_json);
  const contrastTheme = rawTheme.auto_contrast ? applyAutoContrast(rawTheme) : rawTheme;
  // PAGES.STYLE.1: THE swap for the render tree. Everything below (LinkButton,
  // the blocks, every full-bleed predicate) reads `theme.pageStyle`, so
  // resolving it to the ACTIVE page's style here — once — makes the whole page
  // follow the edited page with no id threaded through the tree. Resolved from
  // the SAVED raw json on purpose: per-page style lives under `pages`, a key
  // getThemeWithDefaults drops and the theme editor never drafts.
  const theme = withEffectivePageStyle(contrastTheme, page.theme_json, selectedMode);
  // An in-progress hub font draft (L4) wins; resolveFontFamily returns undefined
  // for an absent draft, so the saved font is the fallback.
  const fontFamily = resolveFontFamily(headerDraft?.font) ?? getFontFamily(theme);
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

  // Hero image — per-page. Page 2 uses its own image unless it
  // inherits Page 1's hero (heroInherit), in which case it mirrors Page 1.
  const page2AvatarUrl = (page.theme_json as any)?.avatar_url_page2 || null;
  // Avatar offered to links as a leading-icon option — matches the page in view.
  const linkAvatarUrl: string | undefined =
    (selectedMode === 'page2' ? page2AvatarUrl : page.avatar_url) || undefined;
  const page1HeroImage = localHeroImages.page1 || (theme.header?.image_url) || page.avatar_url || '';
  const heroImage = selectedMode === 'page2'
    ? (heroInherit ? page1HeroImage : (localHeroImages.page2 || page2AvatarUrl || ''))
    : page1HeroImage;
  // Hero display config (HERO-1). HERO.DEFAULTS.1: resolved at read time, so an
  // absent/partial config renders the dialed-in default (Fill, posY 25 — faces
  // in the top third) with no stored data. Feeds heroFit/heroPosY below and the
  // full-bleed background's objectPosition. Public + editor share this path.
  const heroConfig = resolveHeroConfig(page.theme_json, heroPageId);
  const heroVideo: string = heroConfig.video || '';
  const heroFit: 'fill' | 'fit' = heroConfig.fit === 'fit' ? 'fit' : 'fill';
  const heroPosY: number = typeof heroConfig.posY === 'number' ? heroConfig.posY : 50;
  const heroAudio: 'silent' | 'clip' | 'voiceover' =
    heroConfig.audio === 'clip' || heroConfig.audio === 'voiceover' ? heroConfig.audio : 'silent';
  const heroPlayback: 'once' | 'loop' | 'bounce' =
    heroConfig.playback === 'loop' || heroConfig.playback === 'bounce' ? heroConfig.playback : 'once';
  const heroVoiceover: string = heroConfig.voiceover || '';
  // FB.4f: portal host for full-bleed overlay controls — lives inside
  // the component tree so a transformed ancestor (the desktop phone
  // frame) contains the fixed overlays.
  const [overlayHost, setOverlayHost] = useState<HTMLDivElement | null>(null);
  // Hero videos always render cover (never letterboxed); 'fit' applies to images only.
  const heroFitEffective: 'fill' | 'fit' = heroVideo ? 'fill' : heroFit;
  // FIX.MEDIA.1 — stored framing, no longer a per-surface style. The VIDEO keeps
  // its OWN config (decoupled from the image's fit/posY; absent on legacy videos
  // → centred, no zoom). `videoPosDraft` is the live channel from the Video
  // Profile panel's sliders: while a drag is in flight the panel owns the truth,
  // so the page under it moves in real time instead of waiting on the debounced
  // save + refetch. Absent (public route, or no drag) → the saved value.
  const heroVideoFraming: HeroFraming = videoPosDraft ?? (heroConfig.videoPos || {});
  const heroImgFraming: HeroFraming = {
    fit: heroFitEffective,
    posX: heroConfig.posX,
    posY: heroPosY,
  };
  // Measured, never assumed — the resolver emits an explicit rectangle, so a
  // guessed container aspect would stretch the media. Two boxes: the sticky
  // hero window, and the full-bleed layer (viewport-sized).
  const heroContainerRef = useRef<HTMLDivElement>(null);
  const heroContainerAspect = useElementAspect(heroContainerRef);
  const fullBleedRef = useRef<HTMLDivElement>(null);
  const fullBleedAspect = useElementAspect(fullBleedRef);
  // Hero photo aspect — known only once decoded; until then the resolver covers.
  // Decoded here rather than via an onLoad prop because the hero photo renders
  // through SmoothImage, which owns its own onLoad. The browser serves this from
  // cache (same URL the <img> requests), so it costs no extra fetch.
  const [heroPhotoAspect, setHeroPhotoAspect] = useState<number | null>(null);
  useEffect(() => {
    setHeroPhotoAspect(null);
    if (!heroImage) return;
    let live = true;
    const probe = new Image();
    probe.onload = () => { if (live) setHeroPhotoAspect(imageAspect(probe)); };
    probe.src = heroImage;
    return () => { live = false; };
  }, [heroImage]);

  // Page labels + two-page switcher (shown in both editor preview and live page).
  const themePages = (page.theme_json as any)?.pages;
  const page1Label = pageLabel(themePages?.page1?.label, 'page1', t);
  const page2Label = pageLabel(themePages?.page2?.label, 'page2', t);
  const pagesEnabled: boolean = themePages?.enabled === true;
  const renderPageSwitcher = () => {
    if (!pagesEnabled) return null;
    return (
      <div className="flex justify-center mt-4">
        <div className="flex items-center gap-1 bg-white/10 rounded-full p-0.5 max-w-full">
          <button
            onClick={() => onModeChange('page1')}
            className={cn(
              'px-4 py-1 rounded-full text-xs font-medium transition-colors truncate max-w-[45vw]',
              selectedMode !== 'page2' ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/60 hover:text-white'
            )}
          >
            {page1Label}
          </button>
          <button
            onClick={() => onModeChange('page2')}
            className={cn(
              'px-4 py-1 rounded-full text-xs font-medium transition-colors truncate max-w-[45vw]',
              selectedMode === 'page2' ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/60 hover:text-white'
            )}
          >
            {page2Label}
          </button>
        </div>
      </div>
    );
  };

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

  // Hero fade must END on a real color. New gradient pages keep the gradient in
  // gradient_css, but legacy/early-onboarding pages stashed a gradient STRING in
  // solid_color (type:'solid'); a gradient nested inside the fade is invalid CSS
  // and silently kills the fade (hard line under the hero photo). So derive the
  // page's effective bg, then pull its first hex when it's a gradient — the
  // gradient's top color, which is what the hero seam sits against.
  const heroBgValue = theme.background?.type === 'gradient' && theme.background?.gradient_css
    ? theme.background.gradient_css
    : (theme.background?.solid_color || '#0e0c09');
  const heroFadeColor = heroBgValue.includes('gradient')
    ? (heroBgValue.match(/#[0-9a-fA-F]{3,8}/)?.[0] || '#0e0c09')
    : heroBgValue;
  // Dark backgrounds (the fade's original design target) keep the long, gentle
  // ramp — photo-into-dark is invisible. Colored/light backgrounds reach the bg
  // color much higher up so the photo's brightness-mismatched lower edge is
  // covered before it reads as a band at the seam.
  const heroFadeStop = relativeLuminance(heroFadeColor) > 0.15 ? 45 : 80;

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

  // FB.1a: full_bleed pages render the photo as a fixed full-viewport
  // background instead of the sticky hero window.
  // PAGES.STYLE.1: derived from the effective theme, so Page 2 can be
  // full-bleed while Page 1 stays hero.
  const isFullBleed = isFullBleedTheme(theme);

  // NAMEFX.1b: the public header's text effect, from the saved theme (see getNameFx).
  const nameFx: React.CSSProperties = getNameFx((page.theme_json as any)?.typography?.text_effect);
  // Same effect for the edit-mode name card, previewing the hub's in-progress
  // draft (L4) when there is one, else the saved value.
  const editNameFx: React.CSSProperties = getNameFx(
    headerDraft?.textEffect ?? (page.theme_json as any)?.typography?.text_effect
  );

  return (
    <ProfileAvatarContext.Provider value={linkAvatarUrl}>
    <div
      className="relative max-w-[640px] mx-auto"
      style={{ fontFamily, color: theme.typography.text_color }}
    >
      {/* FB.1a/FB.4a: full-bleed background — fixed to the viewport with
          a legibility gradient; content floats above it. A profile video
          (uploaded via the Pro Video Profile menu) takes precedence over
          the photo. */}
      {isFullBleed && (heroVideo || heroImage) && (
        <div
          aria-hidden="true"
          ref={fullBleedRef}
          className={editMode ? 'w-full overflow-hidden' : 'fixed inset-0 z-0 overflow-hidden'}
          // FS.PAGE.1: the editor preview lives inside a phone frame whose
          // `transform: translateZ(0)` re-parents position:fixed, so the live
          // page's fixed layer would scroll away with the content. In edit mode
          // pin against the frame's own scroller instead: sticky at the top of
          // the flow, with a negative margin cancelling its height so the
          // content below still starts where it always did and scrolls over it.
          style={
            editMode
              ? { position: 'sticky', top: 0, height: 'calc(var(--pv-vh, 1dvh) * 100)', marginBottom: 'calc(var(--pv-vh, 1dvh) * -100)', zIndex: 0 }
              : undefined
          }
        >
          {heroVideo ? (
            <HeroVideo
              src={heroVideo}
              fit="fill"
              framing={heroVideoFraming}
              containerAspect={fullBleedAspect}
              playbackMode={heroPlayback}
              audioMode={heroAudio}
              voiceoverUrl={heroVoiceover}
              overlayOnTop
              overlayPortalEl={overlayHost}
            />
          ) : (
            // Full-bleed backgrounds are always cover — the Fill/Fit toggle is
            // hero-only, so pin fit here rather than inherit the image's.
            <img
              src={heroImage}
              alt=""
              style={resolveHeroMediaStyle({
                mediaAspect: heroPhotoAspect,
                containerAspect: fullBleedAspect,
                framing: { ...heroImgFraming, fit: 'fill' },
              })}
              data-hero-framing={heroFramingAttr({
                mediaAspect: heroPhotoAspect,
                containerAspect: fullBleedAspect,
                framing: { ...heroImgFraming, fit: 'fill' },
              })}
            />
          )}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.65) 100%)' }} />
        </div>
      )}
      {/* FB.4f: overlay portal host for full-bleed controls */}
      {isFullBleed && <div ref={setOverlayHost} />}
      {/* Fixed hero image — stays pinned while content scrolls over it */}
      {/* DP.2: 50dvh is resolved through --pv-vh so the editor preview measures
          against the previewed device frame, not the desktop window. On the
          public route the var is absent, so `var(--pv-vh, 1dvh) * 50` falls back
          to `50dvh` and the computed geometry is byte-identical. */}
      <div ref={heroContainerRef} data-testid="hero-sticky" className="relative w-full" style={{ position: 'sticky', top: stickyTop, height: 'calc(var(--pv-vh, 1dvh) * 50 + ' + HERO_EXTRA + 'px)', maxHeight: 'calc(500px + ' + HERO_EXTRA + 'px)', overflow: 'hidden', zIndex: 1 }}>
        {isFullBleed ? null : heroVideo ? (
          <HeroVideo
            src={heroVideo}
            fit={heroFitEffective}
            blurImage={heroImage}
            framing={heroVideoFraming}
            containerAspect={heroContainerAspect}
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
            <div
              className="h-full w-full"
              data-hero-framing={heroFramingAttr({
                mediaAspect: heroPhotoAspect,
                containerAspect: heroContainerAspect,
                framing: heroImgFraming,
              })}
            >
              <SmoothImage
                src={heroImage}
                alt={page.display_name || page.handle}
                className="brightness-110"
                imgStyle={resolveHeroMediaStyle({
                  mediaAspect: heroPhotoAspect,
                  containerAspect: heroContainerAspect,
                  framing: heroImgFraming,
                })}
                containerClassName="h-full w-full"
                skeletonClassName="bg-neutral-900"
              />
            </div>
          </>
        ) : (
          <div className="h-full w-full bg-[#0e0c09] flex flex-col items-center justify-center gap-3">
            {editMode && selectedMode === 'page2' && (
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
        {/* Controls render even with no hero media: the camera is the only
            way to add a first photo; the pencil is inert until one exists. */}
        {editMode && photoStep === 'idle' && (
          <div className="absolute top-3 right-3 z-[15] flex flex-col gap-2">
            {!heroVideo && (
              <button
                onClick={() => {
                  // No image yet — pencil is inert; the camera adds the first photo.
                  if (!heroImage) return;
                  // Prefer the saved original (full-size) so the cropper has the
                  // unrestricted source. Falls back to the cropped hero for
                  // legacy photos uploaded before avatar_original_url existed.
                  const editSource = (usePage2Own ? ((page.theme_json as any)?.avatar_original_url_page2 || heroImage) : (page.avatar_original_url || heroImage));
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
            )}
            {heroVideo && onEditVideo && (
              <button
                onClick={() => onEditVideo()}
                className="bg-black/40 backdrop-blur-sm rounded-full p-3"
                title={t('editor.hero.editVideo')}
              >
                <Pencil className="h-6 w-6 text-white opacity-80 hover:opacity-100" />
              </button>
            )}
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
          background: isFullBleed
            ? 'transparent'
            : theme.background?.type === 'gradient' && theme.background?.gradient_css
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
            background: isFullBleed ? 'none' : `linear-gradient(to bottom, transparent 0%, ${heroFadeColor} ${heroFadeStop}%, ${heroFadeColor} 80%)`,
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
            paddingBottom: editMode ? 0 : headerSpacing.iconsContent,
          }}
        >
          {/* In edit mode, name/handle render as sortable cards below */}
          {!editMode && headerCardOrder.map(id => {
            const headerNameColor = headerConfig.nameColor || chrome.text;
            const headerHandleColor = headerConfig.handleColor && headerConfig.handleColor !== '#ffffff99' ? headerConfig.handleColor : 'rgba(255,255,255,1)';
            if (id === '__name_handle__') return (
              <div key={id} style={{ paddingTop: HEADER_NAME_TOP, display: 'flex', flexDirection: 'column' as const, alignItems: 'center' }}>
                <h1
                  className="font-bold mb-0"
                  style={{
                    fontSize: `${headerConfig.nameSize}px`,
                    color: headerNameColor,
                    textShadow: 'none',
                    ...nameFx,
                  }}
                >
                  {page.display_name || `@${page.handle}`}
                </h1>
                <p
                  style={{
                    fontSize: `${headerConfig.handleSize}px`,
                    color: headerHandleColor,
                    textShadow: 'none',
                    ...nameFx,
                    margin: 0,
                    marginTop: headerSpacing.nameHandle,
                  }}
                >
                  @{page.handle}
                </p>
              </div>
            );
            if (id === '__social_icons__') {
              // Each icon keeps its parent block so a click can be attributed.
              const allSocialItems = socialBlocks.flatMap(b => b.items.map(item => ({ item, block: b })));
              const seenLabels = new Set<string>();
              const dedupedItems = allSocialItems.filter(({ item }) => {
                const key = item.label.toLowerCase();
                if (seenLabels.has(key)) return false;
                seenLabels.add(key);
                return true;
              });
              if (dedupedItems.length === 0) return null;
              const iSize = headerConfig.iconSize ?? 'medium';
              const iconColorMode = headerConfig.iconColorMode ?? 'color';
              const resolvedIconColor = iconColorMode === 'black' ? '#000000' : iconColorMode === 'white' ? '#ffffff' : undefined;
              const iconBg = resolveIconBg(headerConfig.iconBgStyle, iconColorMode, chrome.iconBg);
              const iconNodes = dedupedItems.map(({ item, block }) => {
                    // ADULT.2a: these are the page's real platform links. A
                    // gated one carries NO href — the destination stays in JS
                    // and opens only once the 18+ modal is confirmed, so a
                    // crawler reading this DOM never sees an adult URL.
                    //
                    // The interactive element must stay layout-neutral: it
                    // reuses the span's exact classes and style, and <a> (unlike
                    // <button>) adds no UA padding, border, or margin, so the
                    // box next to the protected header geometry is unchanged.
                    const gated = isEffectivelyGated(item);
                    const href = gated ? undefined : item.url || undefined;
                    const boxClass = cn('flex items-center justify-center rounded-full', ICON_CIRCLE_CLASS[iSize], iconBg.className);
                    const icon = <SocialSvgIcon label={item.label} size={ICON_GLYPH_PX[iSize]} color={resolveGlyphColor(item.label, resolvedIconColor, iconBg.background)} />;

                    // No destination and nothing to gate — stays decorative.
                    if (!gated && !href) {
                      return (
                        <span key={item.id} className={boxClass} style={{ background: iconBg.background }} title={item.label}>
                          {icon}
                        </span>
                      );
                    }

                    return (
                      <a
                        key={item.id}
                        href={href}
                        target={href ? '_blank' : undefined}
                        rel={href ? 'noopener noreferrer' : undefined}
                        role={gated ? 'button' : undefined}
                        tabIndex={0}
                        title={item.label}
                        className={cn(boxClass, 'cursor-pointer')}
                        style={{ background: iconBg.background }}
                        onClick={(e) => {
                          if (gated) {
                            e.preventDefault();
                            onOutboundClick?.(block.type, block.id, item.id, item.url, true);
                            return;
                          }
                          if (onOutboundClick && !onOutboundClick(block.type, block.id, item.id, item.url, false)) {
                            e.preventDefault();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (gated && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            onOutboundClick?.(block.type, block.id, item.id, item.url, true);
                          }
                        }}
                      >
                        {icon}
                      </a>
                    );
                  });
              return <HeaderIconRow nodes={iconNodes} gapTop={headerSpacing.handleIcons} />;
            }
            return null;
          })}
          {!editMode && renderPageSwitcher()}
          {editMode && (
            <>

              {photoPreview && photoStep !== 'idle' && createPortal(
                <div
                  className="fixed inset-0 z-[130] flex flex-col bg-black/95"
                  style={{ overflow: 'hidden', touchAction: 'none', overscrollBehavior: 'none', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
                >
                  {/* Background scroll is blocked by touchAction +
                      overscrollBehavior above — preventDefault in
                      passive React listeners is a no-op and only
                      spams console warnings. */}

                  {/* CHOOSE STEP — simplified, just preview + Crop Image */}
                  {photoStep === 'choose' && (
                    <div className="flex flex-col items-center justify-center flex-1 p-6 gap-4 overflow-y-auto">
                      <p className="text-white font-bold text-xl">
                        {t('editor.editPhoto')}
                      </p>

                      {/* Live preview in the real hero shape — what you see is what publishes */}
                      {/* FIX.MEDIA.1: framed at the LIVE container aspect, from
                          the same device presets the crop step uses. It was a
                          320x224 landscape box for a portrait hero — the shape
                          the user framed against was never the shape that
                          published, and the Top/Bottom slider's travel was
                          judged against it. */}
                      <div
                        ref={heroPreviewRef}
                        data-testid="hero-photo-preview"
                        className="relative w-full max-w-[13rem] mx-auto rounded-2xl overflow-hidden border-2 border-white/20 bg-black"
                        style={{ aspectRatio: String(isFullBleed ? canonicalFullBleedAspect() : canonicalHeroAspect()) }}
                        data-hero-framing={heroFramingAttr({
                          mediaAspect: heroImgAspect,
                          containerAspect: heroPreviewAspect,
                          framing: { fit: isFullBleed ? 'fill' : heroFitDraft, posX: heroPosXDraft, posY: heroPosYDraft },
                        })}
                      >
                        {heroFitDraft === 'fit' && !isFullBleed && (
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
                          alt={t('editor.hero.previewAlt')}
                          onLoad={(e) => setHeroImgAspect(imageAspect(e.currentTarget))}
                          style={resolveHeroMediaStyle({
                            mediaAspect: heroImgAspect,
                            containerAspect: heroPreviewAspect,
                            // Full-screen backgrounds are always cover — the
                            // Fill/Fit toggle is hero-only.
                            framing: { fit: isFullBleed ? 'fill' : heroFitDraft, posX: heroPosXDraft, posY: heroPosYDraft },
                          })}
                        />
                      </div>

                      {/* Fill / Fit toggle — hero only; full-screen
                          backgrounds are always cover */}
                      {!isFullBleed && (<>
                      <div className="flex w-full max-w-xs rounded-xl bg-white/5 p-1 gap-1">
                        <button
                          onClick={() => setHeroFitDraft('fill')}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            heroFitDraft === 'fill' ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/70'
                          }`}
                        >
                          {t('editor.hero.fill')}
                        </button>
                        <button
                          onClick={() => setHeroFitDraft('fit')}
                          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            heroFitDraft === 'fit' ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/70'
                          }`}
                        >
                          {t('editor.hero.fit')}
                        </button>
                      </div>
                      <p className="text-white/40 text-xs text-center max-w-xs -mt-1">
                        {heroFitDraft === 'fill'
                          ? t('editor.hero.fillCaption')
                          : t('editor.hero.fitCaption')}
                      </p>
                      </>)}

                      {/* Horizontal position — full-screen only */}
                      {isFullBleed && (
                        <div className="w-full max-w-xs flex items-center gap-3">
                          <span className="text-white/40 text-[10px]">{t('editor.hero.posLeft')}</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={heroPosXDraft}
                            onChange={(e) => setHeroPosXDraft(Number(e.target.value))}
                            className="flex-1 accent-[#C9A55C]"
                          />
                          <span className="text-white/40 text-[10px]">{t('editor.hero.posRight')}</span>
                        </div>
                      )}
                      {/* Vertical position — hero Fill, or full-screen.
                          CROP.3a (Defect D): object-cover only pans an axis that
                          overflows; when the photo already fills top-to-bottom
                          the slider is inert, so disable it and say why. */}
                      {(heroFitDraft === 'fill' || isFullBleed) && (
                        <div className="w-full max-w-xs">
                          <div className="flex items-center gap-3">
                            <span className="text-white/40 text-[10px]">{t('editor.hero.posTop')}</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={heroPosYDraft}
                              onChange={(e) => setHeroPosYDraft(Number(e.target.value))}
                              disabled={!posYHasTravel}
                              className={`flex-1 accent-[#C9A55C]${!posYHasTravel ? ' opacity-40 cursor-not-allowed' : ''}`}
                            />
                            <span className="text-white/40 text-[10px]">{t('editor.hero.posBottom')}</span>
                          </div>
                          {!posYHasTravel && (
                            <p className="text-white/40 text-[10px] mt-1.5 text-center leading-snug">{t('editor.hero.posYNoTravel')}</p>
                          )}
                        </div>
                      )}

                      {/* Save (no crop needed) — new photo uploads uncropped + config;
                          existing photo writes display config only */}
                      <button
                        onClick={() => (photoFile ? handlePhotoSave() : handleHeroDisplaySave())}
                        disabled={photoSaving}
                        className="w-full max-w-xs py-4 rounded-2xl bg-[#C9A55C] text-[#0e0c09] font-bold text-sm disabled:opacity-60"
                      >
                        {photoSaving ? t('editor.hero.saving') : t('editor.hero.save')}
                      </button>

                      {/* Crop manually — secondary, optional */}
                      <button
                        onClick={() => {
                          setRcCrop({ x: 0, y: 0 }); setRcZoom(1); setRcAreaPixels(null);
                          setPhotoStep('manual');
                        }}
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
                      <p className="text-white font-semibold">{t('editor.crop.aiProcessing')}</p>
                      <p className="text-white/40 text-xs">{t('editor.crop.aiDetecting')}</p>
                    </div>
                  )}

                  {/* AI PREVIEW STEP — shows result, accept or go back */}
                  {photoStep === 'ai-preview' && aiPreviewData && (
                    <div className="flex flex-col items-center justify-center flex-1 p-6 gap-5">
                      <p className="text-white font-bold text-lg">
                        {aiPreviewEnhanced ? t('editor.crop.aiResult') : t('editor.crop.cropPreview')}
                      </p>
                      <div className="relative">
                        <div className={`w-64 h-64 rounded-2xl overflow-hidden border-2 ${aiPreviewEnhanced ? 'border-[#C9A55C]/50' : 'border-amber-500/40'}`}>
                          <img src={aiPreviewData} alt={t('editor.crop.aiPreviewAlt')} className="w-full h-full object-cover" />
                        </div>
                        {/* Status badge */}
                        <div className={`absolute top-2 left-2 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide backdrop-blur-md ${
                          aiPreviewEnhanced
                            ? 'bg-[#C9A55C]/90 text-[#0e0c09]'
                            : 'bg-amber-500/90 text-[#0e0c09]'
                        }`}>
                          {aiPreviewEnhanced ? t('editor.crop.aiEnhanced') : t('editor.crop.aiFailed')}
                        </div>
                      </div>
                      <div className="flex gap-3 w-full max-w-xs">
                        <button
                          onClick={() => {
                            setAiPreviewData(null);
                            setRcCrop({ x: 0, y: 0 }); setRcZoom(1); setRcAreaPixels(null);
                            setPhotoStep('manual');
                          }}
                          className="flex-1 py-3 rounded-2xl border border-white/20 text-white font-semibold text-sm"
                        >
                          {t('editor.crop.aiPreviewBack')}
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
                          {t('editor.crop.accept')}
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

                      {/* CROP.2b: react-easy-crop replaces the legacy pan/zoom interaction for the manual step */}
                      <div className="relative bg-black rounded-xl overflow-hidden w-full" style={{ height: 'min(52dvh, 460px)' }}>
                        <Cropper
                          image={photoPreview || ''}
                          crop={rcCrop}
                          zoom={rcZoom}
                          aspect={isFullBleed ? canonicalFullBleedAspect() : canonicalHeroAspect()}
                          onCropChange={setRcCrop}
                          onZoomChange={setRcZoom}
                          onCropComplete={(_, areaPixels) => setRcAreaPixels(areaPixels)}
                        />
                      </div>
                      {/* CROP.2c: controls below the Cropper — padded, emoji-free, brand-styled */}
                      <div className="px-5 pb-5 pt-4 flex flex-col gap-3" style={{ flexShrink: 0 }}>
                        {/* Zoom row */}
                        <div className="w-full flex items-center gap-3">
                          <span className="text-white/40 text-xs font-semibold uppercase tracking-wider">{t('editor.crop.zoom')}</span>
                          <input
                            type="range"
                            min={1}
                            max={3}
                            step={0.05}
                            value={rcZoom}
                            onChange={(e) => setRcZoom(Number(e.target.value))}
                            className="flex-1 accent-[#C9A55C]"
                          />
                        </div>

                        <p className="text-white/40 text-xs font-semibold uppercase tracking-wider text-center">{t('editor.crop.aiEnhance')}{!faceModelReady && ` · ${t('editor.crop.modelLoading')}`}</p>

                        {/* Hero mode: 3-column AI preset grid; full-screen folds Full Body into the button row below.
                            CROP.3a (STEP 2): disabled until the face model is loaded so the first click can't race it. */}
                        {!isFullBleed && (
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              onClick={() => handleAiCrop('headshot')}
                              disabled={!faceModelReady || aiProcessing}
                              className="py-2.5 rounded-lg bg-[#C9A55C]/10 border border-[#C9A55C]/30 text-[#C9A55C] font-semibold text-[10px] hover:bg-[#C9A55C]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {t('editor.crop.headshot')}
                            </button>
                            <button
                              onClick={() => handleAiCrop('shoulders')}
                              disabled={!faceModelReady || aiProcessing}
                              className="py-2.5 rounded-lg bg-[#C9A55C]/10 border border-[#C9A55C]/30 text-[#C9A55C] font-semibold text-[10px] hover:bg-[#C9A55C]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {t('editor.crop.shoulders')}
                            </button>
                            <button
                              onClick={() => handleAiCrop('fullbody')}
                              disabled={!faceModelReady || aiProcessing}
                              className="py-2.5 rounded-lg bg-[#C9A55C]/10 border border-[#C9A55C]/30 text-[#C9A55C] font-semibold text-[10px] hover:bg-[#C9A55C]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {t('editor.crop.fullBody')}
                            </button>
                          </div>
                        )}

                        {/* Button row — full-screen: [Full Body] [Back] [Apply Crop]; hero: [Back] [Apply Crop] */}
                        <div className={isFullBleed ? 'grid grid-cols-3 gap-2' : 'flex gap-2'}>
                          {isFullBleed && (
                            <button
                              onClick={() => handleAiCrop('fullbody')}
                              disabled={!faceModelReady || aiProcessing}
                              className="py-2.5 rounded-xl bg-[#C9A55C]/10 border border-[#C9A55C]/30 text-[#C9A55C] font-semibold text-xs hover:bg-[#C9A55C]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {t('editor.crop.fullBody')}
                            </button>
                          )}
                          <button
                            onClick={() => setPhotoStep('choose')}
                            className={`${isFullBleed ? '' : 'flex-1 '}py-2.5 rounded-xl border border-white/20 text-white font-semibold text-xs`}
                          >
                            {t('editor.crop.back')}
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                if (!photoPreview || !rcAreaPixels) return;
                                const croppedFile = await getCroppedImage(photoPreview, rcAreaPixels);
                                const dataUrl = URL.createObjectURL(croppedFile);
                                setPhotoPreview(dataUrl);
                                setCropZoom(1);
                                setCropPosition({ x: 0, y: 0 });
                                // CROP.3a-C rule 2: the crop was composed at the
                                // canonical hero aspect, so cover-at-center shows
                                // the EXACT framed shot. Reset posY to 50 so no
                                // leftover top-third pan (the posY-25 seed) shifts
                                // it. Persist the same 50 in the save that follows.
                                setHeroPosYDraft(50);
                                setPhotoFile(croppedFile);
                                await handlePhotoSave(croppedFile, 50);
                              } catch (err) {
                                // CROP.3a error truth: never fail silently —
                                // log name+message and carry a concise cause
                                // hint so a tainted-canvas / decode failure is
                                // distinguishable in the toast.
                                console.error('[CROP] apply failed:', (err as any)?.name, (err as any)?.message, err);
                                toast.error(`${t('editor.crop.cropFailed')} — ${t(cropErrorCauseKey(err))}`);
                              }
                            }}
                            className={`${isFullBleed ? '' : 'flex-1 '}py-2.5 rounded-xl bg-[#C9A55C] text-[#0e0c09] font-bold text-xs`}
                          >
                            {t('editor.crop.applyCrop')}
                          </button>
                        </div>
                      </div>

                    </div>
                  )}

                  {/* PREVIEW STEP */}
                  {photoStep === 'preview' && (
                    <div className="flex flex-col items-center justify-center flex-1 p-6 gap-6">
                      <p className="text-white font-semibold text-lg">
                        {t('editor.previewPhoto')}
                      </p>
                      {/* FIX.MEDIA.1: was aspect-video — a 16:9 landscape
                          confirmation of a portrait hero. Same live aspect and
                          same resolver as every other surface. */}
                      <div
                        className="relative w-full max-w-[13rem] mx-auto rounded-2xl overflow-hidden border-2 border-[#C9A55C]/50"
                        style={{ aspectRatio: String(isFullBleed ? canonicalFullBleedAspect() : canonicalHeroAspect()) }}
                      >
                        <img
                          src={photoPreview}
                          alt={t('editor.hero.previewAlt')}
                          onLoad={(e) => setHeroImgAspect(imageAspect(e.currentTarget))}
                          style={resolveHeroMediaStyle({
                            mediaAspect: heroImgAspect,
                            containerAspect: isFullBleed ? canonicalFullBleedAspect() : canonicalHeroAspect(),
                            framing: { fit: isFullBleed ? 'fill' : heroFitDraft, posX: heroPosXDraft, posY: heroPosYDraft },
                          })}
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
              , document.body)}
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
            {/* Free-drag header cards (outside DndContext) — hidden during photo crop/edit.
                HDR.SPACE.2: the edit canvas composes the below-icons gap differently
                (card gaps, no view-mode paddingBottom), so it mirrors the slider as a
                DELTA from the default — absent config = 0 = today's canvas, and a drag
                shifts the canvas by exactly the px the public page will shift. */}
            <div className="flex flex-col gap-[6px]" style={{ position: 'relative', zIndex: 5, transform: `translateY(${-HEADER_OFFSET_Y}px)`, marginBottom: headerSpacing.iconsContent - HEADER_GAP_C }}>
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
                    draftDisplayName={headerDraft?.displayName}
                    nameFx={editNameFx}
                    gapNameHandle={headerSpacing.nameHandle}
                    localNameSize={localNameSize}
                    localHandleSize={localHandleSize}
                    localNameColor={localNameColor}
                    localHandleColor={localHandleColor}
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
                    gapHandleIcons={headerSpacing.handleIcons}
                    expanded={expandedHeaderCard === '__social_icons__'}
                    onToggleExpand={() => setExpandedHeaderCard(expandedHeaderCard === '__social_icons__' ? null : '__social_icons__')}
                    localIconsPaddingY={localIconsPaddingY} setLocalIconsPaddingY={setLocalIconsPaddingY}
                    localIconSize={localIconSize} setLocalIconSize={setLocalIconSize}
                    localIconColorMode={localIconColorMode}
                    localIconBgStyle={localIconBgStyle}
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
            {photoStep === 'idle' && renderPageSwitcher()}
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
            className="px-4 pb-20 flex flex-col gap-3"
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
        {showBranding && (
          <footer className="mt-12 pb-10 text-center">
            <a
              href="/?ref=badge"
              onClick={editMode ? (e) => e.preventDefault() : undefined}
              className="text-xs opacity-60 hover:opacity-90"
              style={{ color: theme.typography.text_color }}
            >
              <span className="block">{t('publicFooter.madeWith')} <span className="font-bold"><span style={{ color: '#F5F3EE' }}>Titi</span><span style={{ color: '#C9A55C', fontStyle: 'italic' }}>Links</span></span></span>
              <span className="mt-1 block text-sm font-medium" style={{ color: '#C9A55C' }}>{t('publicFooter.cta')} →</span>
            </a>
          </footer>
        )}
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
    </ProfileAvatarContext.Provider>
  );
}
