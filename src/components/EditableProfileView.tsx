import { useState, useRef, useEffect, cloneElement, type ReactElement } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePlanLock } from '@/hooks/usePlanLock';
import { motion } from 'framer-motion';
import { cropErrorCauseKey, HERO_MAX_PX } from '@/lib/crop';
import { prepareImage, validateImageInput } from '@/lib/prepare-image';
import { canonicalHeroAspect, canonicalFullBleedAspect, DEFAULT_DEVICE_ID, resolveDevicePreset } from '@/lib/device-presets';
// FIX.MEDIA.1 — the one definition of hero framing. Every hero-media surface in
// this file resolves through it; nothing here may hardcode object-fit again.
import {
  resolveHeroMediaStyle,
  resolveHeroGeometry,
  heroFramingAttr,
  useElementAspect,
  imageAspect,
  videoAspect,
  type HeroFraming,
  type HeroMediaStyleInput,
  type ResolvedHeroFraming,
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
  Lock,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getThemeWithDefaults, applyAutoContrast, type ThemeJson, type BlockStyleConfig, type PageId, DEFAULT_BLOCK_STYLE } from '@/lib/theme-defaults';
import { getChromeTokens, relativeLuminance, type ChromeTokens } from '@/lib/contrast';
import { fullBleedText, GLASS_AFFORDANCE, GLASS_TILE, ACTION_ACCENT, withEffectivePageStyle, isFullBleedTheme, resolveHeroConfig } from '@/lib/surface';
import { LinkButton } from '@/components/LinkButton';
import { ThumbnailImage } from '@/components/ThumbnailImage';
import { SmoothImage } from '@/components/SmoothImage';
import { cn, randomUUID } from '@/lib/utils';
import { isEffectivelyGated } from '@/lib/adult-gate';
import { safeHref } from '@/lib/safe-url';
import { sampleHeroBand, needsNameScrim } from '@/lib/hero-luminance';
import { resolveHeroWindowFraming } from '@/lib/hero-window';
import { pictureFitSeed, pictureFitSourceAspect } from '@/lib/picture-fit';
import { readHeroEnhance, writeHeroEnhance, type HeroEnhance } from '@/lib/hero-enhance';
import { HeroPhotoEditor, type HeroPhotoResult } from '@/components/HeroPhotoEditor';
import { analyzeImageForLogo } from '@/lib/logo-detect';
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
import { EventsBlock } from '@/components/blocks/EventsBlock';
import { resolveFontFamily } from '@/lib/fonts';
import { removePublicObject } from '@/lib/storage-cleanup';
import { resolveGalleryCrop, resolveGalleryMediaStyle } from '@/lib/gallery-framing';
import { ResponsiveImg } from '@/components/ResponsiveImg';
import { coverOverflow, scaleBox, transformUrl, type SizesBox } from '@/lib/media-url';
import { glidePxPerSec } from '@/lib/glide';
import type { HeaderDraft } from '@/lib/header-draft';
import { resolveLookWithDraft } from '@/lib/page-look';
import { createPortal } from 'react-dom';
import { countSampleItems } from '@/lib/placeholder-item';
import type { Plan } from '@/lib/entitlements';
import { gateFontForVisitor, gateThemeForVisitor, visiblePageCount } from '@/lib/plan-gate';
import { SampleTag } from '@/components/SampleTag';
import { PlanLockTag } from '@/components/PlanLock';

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
  /** BILL.B3 — the page owner's referral code, so the public badge credits
   *  them. Null/absent falls back to the generic /?ref=badge link. */
  badgeRefCode?: string | null;
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
  // TL.AI.LINKS.1 — "Suggest with AI" door on the links block (edit preview only).
  onSuggestAi?: (blockId: string) => void;
  onItemsReorder?: (blockId: string, orderedItemIds: string[]) => void;
  // Live-mirror (L4): the Name & Handle hub's in-progress edits. Present fields
  // win over the saved values in the edit-mode preview; absent means "no override".
  headerDraft?: HeaderDraft | null;
  // Live-mirror (L5): the Customize Profile panel's in-progress theme. When
  // present it replaces the saved theme for the whole preview render.
  themeDraft?: ThemeJson | null;
  // Live-mirror (L6) escape hatch: while a gallery panel is open and drafting,
  // that panel owns its photo list — so the preview's own trash has to stage the
  // removal there instead of deleting the row underneath it. Return true to say
  // "the draft claimed this photo"; false/absent falls through to the DB delete
  // below, which is what every photo outside an open draft still gets.
  onGalleryStagedDelete?: (itemId: string) => boolean;
  stickyTop?: number | string;
  /** TL.PLAN.ENFORCE.2: the PAGE OWNER's plan, passed only by visitor surfaces
   *  (the public page, the editor's visitor preview). When present, fonts, the
   *  page-level animation and the page switcher render at that plan's tier
   *  (src/lib/plan-gate.ts). Absent — the owner's edit canvas — nothing is gated. */
  visitorPlan?: Plan;
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
// TL.POLISH.1a: the legibility scrim the public name/handle get ONLY when the
// hero band behind them samples light (see heroIsLight). Explicit theme
// text_effect (nameFx) is spread after it and still wins.
const NAME_SCRIM_SHADOW = '0 1px 2px rgba(0,0,0,0.65), 0 0 14px rgba(0,0,0,0.55)';
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
// TL.SOC.8: shrink-0 — the circles are flex items in a row that must OVERFLOW
// (and drift) as soon as the icons exceed the width, never squeeze to fit.
const ICON_CIRCLE_CLASS: Record<string, string> = { small: 'h-9 w-9 shrink-0', medium: 'h-11 w-11 shrink-0', large: 'h-[52px] w-[52px] shrink-0' };
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
// TL.SOC.7: `trailing` is an optional extra child (the edit canvas's "+") that
// rides inside the centred row while the icons fit and is left out of the
// drifting strip; `onOverflowChange` reports each flip so the caller can place
// it elsewhere. The public mount passes neither, so its render is unchanged:
// no trailing => children are exactly `nodes`, and the measure subtracts 0.
// TP.F4: `align` (look.options.iconsAlign) justifies the FITTED row only;
// 'center' (the default) keeps today's class string. The drifting row is
// unchanged.
const ICON_ROW_JUSTIFY = { left: 'justify-start', center: 'justify-center', right: 'justify-end' } as const;
type IconsAlign = keyof typeof ICON_ROW_JUSTIFY;

function HeaderIconRow({ nodes, gapTop, trailing, onOverflowChange, align = 'center' }: {
  nodes: ReactElement[];
  gapTop: number;
  trailing?: ReactElement;
  onOverflowChange?: (overflowing: boolean) => void;
  align?: IconsAlign;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const reported = useRef<boolean | null>(null);
  const pausedUntil = useRef(0);
  const pause = () => { pausedUntil.current = Date.now() + 8000; };

  // Does the single copy exceed the container? (Once looping, the strip is
  // doubled, so halve scrollWidth to recover the single-copy width.)
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const measure = () => {
      // TL.SOC.7: while fitted, `trailing` sits inside the row and scrollWidth
      // counts it. Overflow means "the ICONS alone don't fit", so take its
      // width (plus the flex gap before it) back out of the measurement.
      const tr = overflowing ? null : el.querySelector<HTMLElement>('[data-icon-trailing]');
      const extra = tr ? tr.offsetWidth + ICON_GAP_PX : 0;
      const single = (overflowing ? el.scrollWidth / 2 : el.scrollWidth) - extra;
      const next = single > el.clientWidth + 1;
      setOverflowing(next);
      if (reported.current !== next) {
        reported.current = next;
        onOverflowChange?.(next);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [nodes.length, overflowing, !!trailing]);

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
        overflowing ? 'justify-start overflow-x-auto' : `${ICON_ROW_JUSTIFY[align]} overflow-x-hidden ${ICON_ROW_GAP}`,
      )}
    >
      {overflowing
        ? [...spaced(nodes, false), ...spaced(nodes, true)]
        : trailing
          ? [...nodes, cloneElement(trailing, { key: '__trailing', 'data-icon-trailing': '' })]
          : nodes}
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
  onSuggestAi,
  onItemsReorder,
  visitorPlan,
}: ThemedBlockProps & {
  pageId?: string;
  editMode?: boolean;
  onItemEdit?: (id: string) => void;
  onItemDelete?: (id: string) => void;
  onItemAdd?: () => void;
  onSuggestAi?: () => void;
  onItemsReorder?: (orderedItemIds: string[]) => void;
  visitorPlan?: Plan;
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
          onSuggestAi={onSuggestAi}
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
      return <TextBlock {...blockProps} visitorPlan={visitorPlan} />;
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
    case 'events':
      return <EventsBlock {...blockProps} />;
    case 'bio':
      return <BioBlock block={block} theme={theme} visitorPlan={visitorPlan} />;
    default:
      return null;
  }
}

function BioBlock({ block, theme, visitorPlan }: Omit<ThemedBlockProps, 'onOutboundClick'> & { visitorPlan?: Plan }) {
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
  const fontFamily = resolveFontFamily(visitorPlan ? gateFontForVisitor(visitorPlan, cfg.font) : cfg.font);

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

// TL.STOR.5 — a gallery delete is permanent (the row AND the storage object, see
// handleGalleryDelete), so the trash asks first. A tooltip-sized popover anchored
// to the trash handle, never a panel over the photo: two rows, "Delete?" then
// Yes / No. It PORTALS (the ui/popover primitive does this for us) because every
// gallery tile is `rounded-xl overflow-hidden` and would otherwise clip it.
// `modal` so the dismissing outside-click is swallowed rather than falling
// through to the tile and opening the lightbox behind the popover.
function PhotoDeleteConfirm({
  open,
  onOpen,
  onClose,
  onConfirm,
  buttonClassName,
  iconClassName,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onConfirm: () => void;
  buttonClassName: string;
  iconClassName: string;
}) {
  const { t } = useLanguage();
  return (
    <Popover modal open={open} onOpenChange={(next) => (next ? onOpen() : onClose())}>
      <PopoverTrigger asChild>
        {/* stopPropagation: the tile itself opens the lightbox on click. */}
        <button type="button" onClick={(e) => e.stopPropagation()} className={buttonClassName}>
          <Trash2 className={iconClassName} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={6}
        collisionPadding={8}
        // Radix would autofocus "Yes" on open and paint the UA's blue focus
        // ring over a gold-and-black surface. Keyboard focus still works (the
        // buttons carry their own gold ring); it just isn't grabbed on open.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        className="w-auto rounded-xl border border-white/10 bg-[#0e0c09] p-2.5 shadow-xl shadow-black/60"
      >
        <p className="text-center font-display text-[13px] font-semibold leading-none text-[#F5F3EE]">
          {t('editor.photo.confirmShort')}
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-[#8A2A31] px-3 py-1 text-xs font-semibold text-[#F5F3EE] hover:bg-[#A03139] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A55C] transition-colors"
          >
            {t('editor.photo.confirmYes')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/70 hover:border-white/40 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A55C] transition-colors"
          >
            {t('editor.photo.confirmNo')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** MEDIA.PHOTO.1 — the tile a gallery photo paints into, at the 402px reference
 *  phone (370px content column): its nominal CSS width and its `sizes` box. */
type GalleryTileBox = { cssWidth: number; sizes: SizesBox };
const GALLERY_TILE_BOX = {
  full: { cssWidth: 370, sizes: { column: 1, insetPx: 32 } },
  filmstrip: { cssWidth: 266, sizes: { column: 0.72, insetPx: 32 } },
  grid: { cssWidth: 181, sizes: { column: 0.5, insetPx: 40 } },
} as const satisfies Record<string, GalleryTileBox>;

/** TL.GAL.3a — the photo inside a gallery tile, for all three layouts.
 *
 *  Framing has ONE definition (src/lib/gallery-framing.ts), the way hero media
 *  has resolveHeroMediaStyle: an item with a stored crop paints the resolved
 *  rectangle, and an item without one — a photo never framed in the crop sheet
 *  — keeps TL.GAL.2's object-cover classes byte-identical. The three layouts
 *  render this from a single component so the crop UI lands in one place.
 *
 *  The crop path drops `inset-0 w-full h-full`: the resolved rectangle IS the
 *  geometry, and leaving those classes on would fight it. `object-cover` stays
 *  in both paths. A crop can never leave the tile showing (TL.GAL.3b.1's fill
 *  floor), so no matte of any colour is ever behind the photo. */
function GalleryPhoto({ src, label, styleJson, box }: { src: string; label: string | null; styleJson: unknown; box: GalleryTileBox }) {
  const crop = resolveGalleryMediaStyle(styleJson);
  // MEDIA.PHOTO.1: the renditions come off the one stored master. `src` stays
  // that master (the specs locate tiles by it); srcset/sizes carry the sizes.
  //  - Unframed: a centred cover into a square tile, so the rendition is cropped
  //    server-side to exactly the tile (a landscape photo would otherwise be
  //    scaled up to cover, and a width-only candidate would come out soft).
  //  - Framed: the crop is percentages of the WHOLE source and the image is
  //    painted 100/crop.w times the tile, so the candidates are that much wider
  //    and aspect-preserving — a server-side crop would move the maths under it.
  const zoom = crop ? Math.min(4, 100 / (resolveGalleryCrop(styleJson)?.w ?? 100)) : 1;
  return (
    <ResponsiveImg
      src={src}
      alt={label || 'Gallery photo'}
      className={crop ? 'absolute object-cover' : 'absolute inset-0 w-full h-full object-cover'}
      style={crop ?? undefined}
      loading="lazy"
      cssWidth={Math.round(box.cssWidth * zoom)}
      sizes={scaleBox(box.sizes, zoom)}
      aspect={crop ? undefined : 1}
    />
  );
}

function GalleryBlock({ block, theme, onEdit, onDelete }: Omit<ThemedBlockProps, 'onOutboundClick'> & { onEdit?: () => void; onDelete?: (itemId: string) => void }) {
  const { t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = block.items.length;
  // Which photo is awaiting confirmation (null = none). One id for all three
  // layouts: only one tile can be confirming at a time.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

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
  // TL.GAL.6b — the grid's tile container, so a newly added tile below the fold
  // can be scrolled into view the same way the other two layouts answer an add.
  const gridRef = useRef<HTMLDivElement>(null);
  const pausedUntil = useRef(0);
  const pauseAutoScroll = () => { pausedUntil.current = Date.now() + 8000; };
  useEffect(() => {
    if (!loop) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = stripRef.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    // Accumulate in a float — the same fix the icon-row drift above already
    // carries, and the reason TL.GAL.4 had to touch this loop at all.
    // `el.scrollLeft` ROUNDS TO AN INTEGER on write (measured: setting 0.5 reads
    // back 1), so re-reading it every frame quantised the whole glide: a step
    // under half a pixel rounded to nothing and the strip froze, and any step
    // over it rounded up to a flat 1px/frame — 60px/s on every tier, which is
    // why slow, medium and fast all glided at the same wrong speed. Keeping our
    // own position makes the tier arithmetic mean something again.
    let pos = el.scrollLeft;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (el.scrollWidth > 0 && Date.now() >= pausedUntil.current) {
        const oneCopy = el.scrollWidth / 2;
        // 0.72 = the `w-[72%]` tile. Scale and formula: lib/glide.
        pos += glidePxPerSec(el.clientWidth, 0.72, speedMs) * dt;
        if (oneCopy > 0 && pos >= oneCopy) pos -= oneCopy;
        el.scrollLeft = pos;
      } else {
        // Paused (a touch parks the glide for 8s): the visitor is driving, so
        // take their position rather than snapping back to ours when time is up.
        pos = el.scrollLeft;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loop, speedMs]);

  // Lightbox: tap a photo → fullscreen swipe viewer. Auto-scroll pauses while open.
  //
  // TL.GAL.3b.2 — the viewer navigates the whole gallery without closing:
  // chevrons, keyboard arrows, and the swipe the snap-mandatory strip already
  // gave us for free. TL.GAL.3b.3 made that navigation circular — see
  // stepLightbox. Two rules hold it together:
  //
  //   1. the STRIP's scroll position is the truth, not `lightboxIndex`. The
  //      effect below positions the strip ONCE, on open, at the photo that was
  //      tapped; from then on `onScroll` reports and the index follows. Feeding
  //      the index back into a scrollTo would yank the strip out from under a
  //      swipe still in flight.
  //   2. the lightbox shows the UNCROPPED original. `style_json.crop` frames
  //      the square tile (see GalleryPhoto); full-size is where the rest of the
  //      photo is, so nothing here resolves a crop — object-contain, always.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const lightboxOpen = lightboxIndex !== null;
  // Guards rule 1: false until the strip has been parked on the tapped photo.
  const lightboxPositioned = useRef(false);
  const openLightbox = (i: number) => { pausedUntil.current = Date.now() + 1e9; setLightboxIndex(i); };
  const closeLightbox = () => { pausedUntil.current = Date.now() + 5000; setLightboxIndex(null); };
  useEffect(() => {
    if (lightboxIndex === null) { lightboxPositioned.current = false; return; }
    if (lightboxPositioned.current) return;
    lightboxPositioned.current = true;
    const el = lightboxRef.current;
    if (el) el.scrollTo({ left: lightboxIndex * el.clientWidth });
  }, [lightboxIndex]);

  // One step, CIRCULAR (TL.GAL.3b.3): past the last photo is the first, before
  // the first is the last. So the viewer has no ends, and its chevrons never
  // disable — there is nothing to disable them at. The inline carousel below
  // deliberately still clamps: it is a strip you can see the edges of, while
  // this is one photo at a time with no sense of position.
  //
  // Read the slide off the STRIP, not off `lightboxIndex`: the keyboard handler
  // subscribes once per open, so a captured index would be frozen at whatever
  // photo was tapped and every arrow press would step from there.
  //
  // And jump — TL.GAL.1's lesson, on the same kind of snap-mandatory strip. A
  // smooth scroll leaves the position mid-flight between two snap points, so
  // the NEXT step reads a fraction, targets a half-slide, and the snap engine
  // pulls it straight back where it came from. Verified: two chevron clicks in
  // a row moved exactly one photo. An instant scroll always lands dead on a
  // snap point, so every step starts from a whole number — and it is what makes
  // the wrap possible at all, since last→first is a jump across the whole strip
  // that no amount of smooth scrolling could sell as a step.
  const stepLightbox = (dir: -1 | 1) => {
    const el = lightboxRef.current;
    if (!el || !el.clientWidth) return;
    // Clamp what we READ (iOS rubber-banding scrolls past both ends) before
    // wrapping it, or an over-scrolled position would wrap from the wrong slide.
    const at = Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / el.clientWidth)));
    const next = (at + dir + count) % count;
    el.scrollTo({ left: next * el.clientWidth, behavior: 'instant' });
  };

  // Keyboard, only while the viewer is up. Escape closes: the backdrop does
  // not, so without it an overlay that answers the arrow keys still traps the
  // one key everyone reaches for.
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') stepLightbox(1);
      else if (e.key === 'ArrowLeft') stepLightbox(-1);
      else if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // stepLightbox reads the strip and closeLightbox only touches refs/state,
    // so listing them would re-subscribe on every render for nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxOpen]);

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
        onScroll={(e) => {
          // Which photo the strip has landed on. Rounded, because a snap strip
          // reports fractional offsets mid-gesture, and clamped because iOS
          // rubber-banding scrolls past both ends.
          const el = e.currentTarget;
          if (!el.clientWidth) return;
          const i = Math.max(0, Math.min(count - 1, Math.round(el.scrollLeft / el.clientWidth)));
          setLightboxIndex((cur) => (cur === null || cur === i ? cur : i));
        }}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {block.items.map((item) => (
          <div key={item.id} className="relative flex-shrink-0 w-full h-full snap-center snap-always flex items-center justify-center p-4">
            {item.image_url && (
              // Rule 2: no crop, no object-cover — the original, whole.
              <img src={item.image_url} alt={item.label || 'Photo'} className="max-w-full max-h-full object-contain rounded-lg" />
            )}
            {item.label && item.label !== 'Photo' && (
              <p className="absolute bottom-6 left-0 right-0 text-center text-white/80 text-sm px-6">{item.label}</p>
            )}
          </div>
        ))}
      </div>

      {/* The carousel's chevrons, at this overlay's scale: same lucide glyphs
          in the same round button, sized and tinted to the × above them —
          bg-black/60 would vanish into a bg-black/95 backdrop. Never disabled:
          navigation is circular, so neither one is ever at an end. */}
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => stepLightbox(-1)}
            aria-label={t('gallery.prevPhoto')}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center transition-colors hover:bg-white/20"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => stepLightbox(1)}
            aria-label={t('gallery.nextPhoto')}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center transition-colors hover:bg-white/20"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
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

  // TL.GAL.1 — a new photo lands on the LAST slide while the strip sits wherever
  // the user left it, so an add looks like a no-op. Bring the newest one into
  // view when the item count grows — count-increase only, so layout/auto-scroll/
  // speed tweaks and manual scrolling are never fought.
  //
  // TL.GAL.6b widened this past 'full'. It was written when the count could only
  // grow on SAVE, and 'full' was the only layout that needed it; TL.GAL.6 made
  // the count grow on a STAGED add too, and on a filmstrip the new tile lands
  // ~5.7 tiles right of the window (measured) — mirrored correctly, invisible in
  // practice, which reads as "the draft channel is broken". Every layout now
  // answers an add, because the preview is the truth of what Save will produce.
  //
  // Instant, not behavior:'smooth': Chrome cancels programmatic smooth scrolls
  // on a snap-mandatory container (verified — the strip parks between slides
  // or never moves). Target = the slide's offsetLeft, not count*clientWidth:
  // slide widths are fractional and the arithmetic drifts off-snap.
  const prevCount = useRef(count);
  useEffect(() => {
    const grew = count > prevCount.current;
    prevCount.current = count;
    if (!grew) return;

    if (layout === 'full') {
      const el = scrollRef.current;
      // children = photo slides then the "+" tile; the newest photo is count-1.
      const lastPhoto = el?.children[count - 1] as HTMLElement | undefined;
      if (el && lastPhoto) el.scrollLeft = lastPhoto.offsetLeft;
      return;
    }

    if (layout === 'filmstrip') {
      // The glide OWNS scrollLeft — it writes it every frame — so a bare write
      // here is overwritten within one frame. Park it first with the same 8s
      // pause a touch uses: while paused the loop re-reads scrollLeft into its
      // own accumulator every frame, which is what makes this jump stick AND
      // lets the glide resume from the new photo instead of snapping back.
      // In loop mode children are two copies; the newest is count-1 either way.
      const el = stripRef.current;
      const lastTile = el?.children[count - 1] as HTMLElement | undefined;
      if (el && lastTile) {
        pauseAutoScroll();
        // A rect DELTA, not offsetLeft. Unlike the 'full' carousel — whose strip
        // sits at the left edge of a `relative` wrapper, making offsetLeft come
        // out right by luck of the markup — the filmstrip has no positioned
        // ancestor of its own, so its tiles measure from further up the tree and
        // offsetLeft overshoots by the strip's inset (measured: 29px, which left
        // the new photo clipped at the window's left edge).
        // TL.GAL.7: rects are SCREEN px, scrollLeft is the strip's own layout px.
        // Inside the editor's scaled device frame (DP.1 transform: scale) they
        // differ by the frame's scale, so divide the delta by the strip's measured
        // scale — rect width over layout width; exactly 1 on the public page and
        // at 100%, where this reduces to the previous line.
        const stripRect = el.getBoundingClientRect();
        const stripScale = el.offsetWidth > 0 ? stripRect.width / el.offsetWidth : 1;
        el.scrollLeft += (lastTile.getBoundingClientRect().left - stripRect.left) / stripScale;
      }
      return;
    }

    // 'grid' — nothing scrolls horizontally, but the newest tile is appended at
    // the bottom of a two-column grid and can sit below the fold. `nearest`
    // moves whichever ancestor actually owns the scroll (the editor's
    // device-frame-scroll, the window on the public page) and only when the
    // tile is genuinely out of view, so an already-visible add never jumps.
    const tile = gridRef.current?.children[count - 1] as HTMLElement | undefined;
    tile?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [count, layout]);

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
                <GalleryPhoto src={item.image_url} label={item.label} styleJson={item.style_json} box={GALLERY_TILE_BOX.filmstrip} />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="h-6 w-6 opacity-30" style={{ color: theme.typography.text_color }} />
                </div>
              )}
              {/* i < count: in loop mode every item renders twice — the delete
                  handle lives on the first copy only. */}
              {onDelete && i < count && (
                <PhotoDeleteConfirm
                  open={confirmingId === item.id}
                  onOpen={() => setConfirmingId(item.id)}
                  onClose={() => setConfirmingId(null)}
                  onConfirm={() => { setConfirmingId(null); onDelete(item.id); }}
                  buttonClassName="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                  iconClassName="h-3 w-3"
                />
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
        <div ref={gridRef} className="grid grid-cols-2 gap-2">
          {block.items.map((item, i) => (
            <div
              key={item.id}
              onClick={(e) => { e.stopPropagation(); openLightbox(i); }}
              className="relative rounded-xl overflow-hidden cursor-pointer"
              style={{ aspectRatio: '1/1', backgroundColor: `${theme.buttons.fill_color}10` }}
            >
              {item.image_url ? (
                <GalleryPhoto src={item.image_url} label={item.label} styleJson={item.style_json} box={GALLERY_TILE_BOX.grid} />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="h-6 w-6 opacity-30" style={{ color: theme.typography.text_color }} />
                </div>
              )}
              {onDelete && (
                <PhotoDeleteConfirm
                  open={confirmingId === item.id}
                  onOpen={() => setConfirmingId(item.id)}
                  onClose={() => setConfirmingId(null)}
                  onConfirm={() => { setConfirmingId(null); onDelete(item.id); }}
                  buttonClassName="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
                  iconClassName="h-3 w-3"
                />
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
                // TL.GAL.2 — photos FILL the square tile (crop the overflow,
                // centered), matching the filmstrip/grid layouts and the
                // GalleryEditor panel's tiles. The old object-contain + black
                // matte letterboxed every non-square photo. This is also the
                // default framing that TL.GAL.3's per-photo zoom/pan sits on.
                <GalleryPhoto src={item.image_url} label={item.label} styleJson={item.style_json} box={GALLERY_TILE_BOX.full} />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 opacity-30" style={{ color: theme.typography.text_color }} />
                </div>
              )}
              {onDelete && (
                <PhotoDeleteConfirm
                  open={confirmingId === item.id}
                  onOpen={() => setConfirmingId(item.id)}
                  onClose={() => setConfirmingId(null)}
                  onConfirm={() => { setConfirmingId(null); onDelete(item.id); }}
                  buttonClassName="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-red-400 hover:bg-black/80 transition-colors"
                  iconClassName="h-4 w-4"
                />
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
// TP.F4 — namePlacement 'below' (hero pages): the header is not lifted over the
// photo; it starts this many px under the content panel's top edge (where the
// photo ends). Applied as PADDING on the header wrapper, not margin: the
// wrapper's top margin collapses into the panel's -2rem (today's -HEADER_LIFT
// has no effect for that reason), so a positive margin would move the panel —
// and the photo join with it — instead of the header.
const HEADER_BELOW_TOP = 12;
const HANDLE_BESIDE_GAP = 8; // TP.F4 — handlePosition 'beside': px between the name and the @handle
const HEADER_SIDE_INSET = '1.5rem'; // the public header's side padding; the canvas cards mirror it for left / beside / side-aligned icons

// MEDIA.PHOTO.1 — the boxes the hero paints into, for srcset/sizes (visitor path).
// The page column is the default device preset wide (402px); the hero fills it. The
// full-bleed layer is viewport-sized and covered across by HEIGHT, so for the canonical
// hero aspect (~0.81 in a ~0.46 viewport) the photo ends up ~1.8x the viewport width.
const HERO_REF_WIDTH = resolveDevicePreset(DEFAULT_DEVICE_ID).width;
const HERO_FULL_BLEED_CSS_WIDTH = 480; // 480 / 960 / 1440 — all under the master (HERO_MAX_PX 2500, MEDIA.PHOTO.2)
const HERO_FULL_BLEED_COVER_SCALE = 1.8;

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
  align = 'center',
  showHandle = true,
  handleBeside = false,
}: {
  page: any;
  chrome: ChromeTokens;
  draftDisplayName?: string;
  // HDR.SPACE.2 — resolved name -> handle gap (draft ?? saved ?? HEADER_GAP_A).
  gapNameHandle: number;
  // TP.F4 — the look's nameAlign / showHandle / handlePosition. The defaults
  // render today's card exactly.
  align?: 'center' | 'left';
  showHandle?: boolean;
  handleBeside?: boolean;
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

  // TP.F4 — the arrangement. Left and beside mirror the public header's side
  // padding (the canvas card has none today, and a centred line needs none).
  const left = align === 'left';
  const inset = left || handleBeside;
  const contentStyle: React.CSSProperties = inset
    ? { paddingTop: HEADER_NAME_TOP, textAlign: left ? 'left' : 'center', paddingLeft: HEADER_SIDE_INSET, paddingRight: HEADER_SIDE_INSET }
    : { paddingTop: HEADER_NAME_TOP, textAlign: 'center' };
  const stackStyle: React.CSSProperties = handleBeside
    ? { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: left ? 'flex-start' : 'center', columnGap: HANDLE_BESIDE_GAP }
    : { display: 'flex', flexDirection: 'column', alignItems: left ? 'flex-start' : 'center' };

  const nameInput = (
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
      className={`font-bold mb-0 bg-transparent border-0 outline-none ${handleBeside ? 'text-left' : left ? 'text-left w-full' : 'text-center w-full'}`}
      style={{
        fontSize: localNameSize,
        lineHeight: 1,
        padding: 0,
        color: resolvedNameColor,
        textShadow: 'none',
        caretColor: '#C9A55C',
        ...nameFx,
        // Beside: sized to its text — it shares one grid cell with a hidden
        // copy of the text, contributes no width of its own (width 0), and
        // fills the cell the copy sizes (min-width 100%).
        ...(handleBeside ? { gridArea: '1 / 1', width: 0, minWidth: '100%' } : {}),
      }}
    />
  );

  return (
    <div
      style={{ position: 'relative', zIndex: 20 }}
      className="relative"
    >
      {/* Content — tap name to edit inline. */}
      <div
        className="relative"
        style={contentStyle}
      >
        <div style={stackStyle}>
          {handleBeside ? (
            <span style={{ display: 'inline-grid', gridTemplateColumns: 'minmax(0, max-content)', maxWidth: '100%' }}>
              {nameInput}
              <span
                aria-hidden="true"
                className="font-bold"
                style={{ gridArea: '1 / 1', visibility: 'hidden', whiteSpace: 'pre', overflow: 'hidden', fontSize: localNameSize, lineHeight: 1 }}
              >
                {localDisplayName || `@${page.handle}`}
              </span>
            </span>
          ) : nameInput}
          {showHandle && (
            <p style={{ fontSize: localHandleSize, color: localHandleColor === '#ffffff99' ? 'var(--handle-default, rgba(255,255,255,1))' : localHandleColor, textShadow: 'none', ...nameFx, margin: 0, marginTop: handleBeside ? 0 : gapNameHandle }}>
              @{page.handle}
            </p>
          )}
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
  align = 'center',
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
  // TP.F4 — look.options.iconsAlign. 'center' (the default) renders today's card.
  align?: IconsAlign;
}) {
  const { t } = useLanguage();
  const dragStart = useRef({ y: 0, cardY: 0 });
  // TL.SOC.7: reported by HeaderIconRow — true only when the icons alone no
  // longer fit on one line, which is when the "+" drops beneath the strip.
  const [rowOverflowing, setRowOverflowing] = useState(false);

  const resolvedIconColor = localIconColorMode === 'black' ? '#000000' : localIconColorMode === 'white' ? '#ffffff' : undefined;
  const iconBg = resolveIconBg(localIconBgStyle, localIconColorMode, chrome.iconBg);

  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const debouncedSave = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(onSave, 500);
  };

  return (
    <div
      // TP.F4: a side-aligned row mirrors the public header's side padding,
      // so its icons start (or end) where the public row's do.
      style={align === 'center'
        ? { marginTop: gapHandleIcons, position: 'relative', zIndex: 20 }
        : { marginTop: gapHandleIcons, position: 'relative', zIndex: 20, paddingLeft: HEADER_SIDE_INSET, paddingRight: HEADER_SIDE_INSET }}
      className="relative"
    >
      {/* Icon row — size comes from the Social Platforms menu (headerConfig.iconSize) */}
      <div
        className="relative"
        style={{ paddingTop: 0, paddingBottom: 0 }}
      >
        {(() => {
          // TL.SOC.7: the per-item nodes are unchanged; they now feed the same
          // HeaderIconRow the public page uses (fits => centred line, overflow
          // => drifting strip). The "+" rides inline while the row fits and
          // moves to a centred circle beneath the strip once it overflows.
          // Horizontal inset comes from the padded header container, as it
          // does for the public row (the old px-4 was on top of that).
          const iconNodes = socialItems.map((item) => {
            const href = safeHref(item.url);
            const glyph = (
              <SocialSvgIcon label={item.label} size={ICON_GLYPH_PX[localIconSize]} color={resolveGlyphColor(item.label, resolvedIconColor, iconBg.background)} />
            );
            // TL.SOC.3: a row with no URL yet is a legitimate saved state —
            // onboarding writes exactly that so the creator can pick platforms
            // before they have links. Here on the edit canvas it must stay
            // VISIBLE (the page has to reflect the picks) but read as
            // unfinished: dimmed behind a dashed gold ring, the house's
            // "action needed" accent, which also survives a white icon chip
            // where a white/30 ring would vanish. Tapping it opens Manage
            // Platforms, where the URL field lives. The public page renders
            // through the non-edit path, which drops these rows entirely.
            if (!href) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={onEditSocial}
                  title={`${item.label} — ${t('editor.socialNeedsLink')}`}
                  aria-label={`${item.label} — ${t('editor.socialNeedsLink')}`}
                  data-needs-link="true"
                  className={cn(
                    'flex items-center justify-center rounded-full border border-dashed border-[#C9A55C]/70 opacity-60 hover:opacity-100 transition-opacity',
                    ICON_CIRCLE_CLASS[localIconSize],
                    iconBg.className,
                  )}
                  style={{ background: iconBg.background }}
                >
                  {glyph}
                </button>
              );
            }
            return (
              <a
                key={item.id}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn('flex items-center justify-center rounded-full', ICON_CIRCLE_CLASS[localIconSize], iconBg.className)}
                style={{ background: iconBg.background }}
                title={item.label}
              >
                {glyph}
              </a>
            );
          });
          // Add / manage platforms — opens the Manage Platforms menu (edit mode only)
          const addButton = (
            <button
              type="button"
              onClick={onEditSocial}
              aria-label={t('editor.editSocial')}
              title={t('editor.editSocial')}
              data-testid="icon-row-add"
              className={cn('flex items-center justify-center rounded-full border border-dashed border-white/30 text-white/50 hover:text-white/80 hover:border-white/50 transition-colors', ICON_CIRCLE_CLASS[localIconSize])}
              style={{ background: chrome.iconBg }}
            >
              <Plus size={ICON_GLYPH_PX[localIconSize]} />
            </button>
          );
          return (
            <>
              <HeaderIconRow
                nodes={iconNodes}
                gapTop={0}
                trailing={rowOverflowing ? undefined : addButton}
                onOverflowChange={setRowOverflowing}
                align={align}
              />
              {rowOverflowing && (
                <div className={`flex ${ICON_ROW_JUSTIFY[align]}`} style={{ marginTop: 8 }}>{addButton}</div>
              )}
            </>
          );
        })()}
      </div>

    </div>
  );
}

// ─── Preview Block Card (edit mode) ─────────────────────────────────────────

function SortablePreviewCard({
  block,
  onEdit,
  onToggle,
  onGalleryDelete,
  onItemEdit,
  onItemDelete,
  onItemAdd,
  onSuggestAi,
  onItemsReorder,
  isDragActive,
  theme,
  lockHint,
}: {
  block: BlockWithItems;
  onEdit: () => void;
  onToggle: (enabled: boolean) => void;
  onGalleryDelete: (itemId: string) => void;
  onItemEdit?: (blockId: string, itemId: string) => void;
  onItemDelete?: (itemId: string) => void;
  onItemAdd?: (blockId: string) => void;
  onSuggestAi?: (blockId: string) => void;
  onItemsReorder?: (orderedItemIds: string[]) => void;
  isDragActive: boolean;
  theme: ThemeJson;
  /** TL.PLAN.ENFORCE.3: set = the owner's plan locks this block — the caller
   *  has pointed onEdit at the upsell; the card dims and carries the PRO pill. */
  lockHint?: string;
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
        {lockHint && <PlanLockTag hint={lockHint} />}
        {countSampleItems(block) > 0 && <SampleTag count={countSampleItems(block)} total={block.items.length} color={chrome.textMuted} />}
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
          isDragActive ? 'max-h-0' : 'max-h-[2000px]',
          lockHint && 'opacity-50'
        )}
        title={lockHint}
        onClick={block.type !== 'links' && !isDragActive ? onEdit : undefined}
      >
        <div className="p-3">
          {block.type === 'gallery' ? (
            <GalleryBlock block={block} theme={theme} onEdit={onEdit} onDelete={onGalleryDelete} />
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
              onSuggestAi={onSuggestAi ? () => onSuggestAi(block.id) : undefined}
              onItemsReorder={onItemsReorder}
            />
          ) : block.type === 'events' ? (
            /* TL.EVNT.STAGE3a.2 — the blanket edit-canvas suppressor below
               left the ticket pill a DEAD-LOOKING anchor (hover showed the
               URL, click did nothing). Events carry no adult gate and no
               item-editor click route, so the pill follows the header-icon
               precedent instead: it really opens (the anchor is already
               target=_blank rel=noopener, so the editor stays put). Visitor
               mode and the public page open it the same way — one behavior
               on every surface. */
            <BlockRenderer block={block} onOutboundClick={() => true} theme={theme} />
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
  badgeRefCode,
  onAddContent,
  onEditVideo,
  openPhotoRequest = 0,
  videoPosDraft = null,
  onItemEdit,
  onItemDelete,
  onItemAdd,
  onSuggestAi,
  onItemsReorder,
  headerDraft,
  themeDraft,
  onGalleryStagedDelete,
  stickyTop = 0,
  visitorPlan,
}: EditableProfileViewProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  // TL.PLAN.ENFORCE.3: the OWNER's plan locks saved Pro items on the edit
  // canvas (separate from visitorPlan, which only visitor surfaces pass).
  const planLock = usePlanLock();
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoOriginalFile, setPhotoOriginalFile] = useState<File | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [localHeroImages, setLocalHeroImages] = useState<{ page1: string | null; page2: string | null }>({ page1: null, page2: null });
  // HERO.FIT.2 — the framed window the last photo save stored (or its absence),
  // kept beside the local URL above and keyed by the hero SLOT it was written
  // to. While that URL is the one showing, the canvas paints with this instead
  // of the row's, so it does not snap when the refreshed row lands.
  const [localHeroWindows, setLocalHeroWindows] = useState<{
    page1: { url: string; window: unknown; enhance: HeroEnhance | null } | null;
    page2: { url: string; window: unknown; enhance: HeroEnhance | null } | null;
  }>({ page1: null, page2: null });
  // HERO.FIT.2 — what the open dialog's picture (photoPreview) is: a fresh
  // 'pick', the kept 'original' (pencil), or the page's own 'display' file
  // (pencil on a hero that has no kept original).
  const [photoSource, setPhotoSource] = useState<'pick' | 'original' | 'display'>('pick');
  // PHOTO.EDITOR.1 — 'edit' while the photo editor (HeroPhotoEditor) is open.
  const [photoStep, setPhotoStep] = useState<'idle' | 'edit'>('idle');
  // One editor per opening: a new pick (or the pencil) remounts it, so its
  // frame, its zoom and its Auto enhance switch always start afresh.
  const [photoSession, setPhotoSession] = useState(0);
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
  // PHOTO.ROUTE.1: an external request opens the SAME picker the camera button
  // does — handlePhotoSelect then opens the photo editor, so no photo-flow
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

  const handleGalleryDelete = async (itemId: string) => {
    // TL.GAL.6 — an open gallery panel is drafting this photo list, so the
    // removal is staged there and committed by its Save (and undone by its
    // Cancel). Deleting the row here instead would leave that panel saving
    // against a row that no longer exists, and its Cancel unable to undo a
    // file this already removed from storage.
    if (onGalleryStagedDelete?.(itemId)) return;

    // Read the URL BEFORE the delete: the row is the only pointer to the file.
    const { data: doomed } = await supabase
      .from('block_items')
      .select('image_url')
      .eq('id', itemId)
      .maybeSingle();

    const { error } = await supabase.from('block_items').delete().eq('id', itemId);
    if (error) {
      console.error('Delete error:', error);
      toast.error(t('editor.photo.deleteFailed'));
      return;
    }
    // Only after the row is gone, and only best-effort — see removePublicObject.
    removePublicObject('products', doomed?.image_url);
    toast.success(t('editor.photo.removed'));
    onRefresh();
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith('video/')) {
      // A video picked from the photo editor's New photo replaces the photo being edited.
      if (photoStep !== 'idle') resetPhoto();
      handleVideoUpload(file);
      e.target.value = '';
      return;
    }
    if (photoInputRef.current) photoInputRef.current.value = '';
    // MEDIA.PHOTO.2 — the hero pick had no gate at all (audit gap #7): any
    // type, any size, raw to a public bucket. Same gate as every other site.
    const gate = validateImageInput(file);
    if (!gate.valid) {
      toast.error(gate.error || t('editor.photo.uploadFailed'));
      return;
    }
    // One prepare step: decode with EXIF orientation baked in, bound to the
    // master size, re-encode WebP — EXIF/GPS gone by construction. The result
    // is BOTH the ORIGINAL that uploads for re-crop and the source the crop
    // pipeline (photoPreview) reads. GIFs pass through as picked.
    let prepared: File;
    try {
      prepared = (await prepareImage(file)).file;
    } catch (err) {
      console.error('[MEDIA.PHOTO.2] hero prepare failed:', err);
      toast.error((err as Error)?.message || t('editor.photo.uploadFailed'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(reader.result as string);
      setPhotoFile(prepared);
      setPhotoOriginalFile(prepared);
      setPhotoSource('pick');
      // PHOTO.EDITOR.1: the editor opens straight away, on a fresh session (the
      // switch off, zoom 1, centred) — also when the pick came from its own New photo.
      setPhotoSession((n) => n + 1);
      setPhotoStep('edit');
    };
    reader.readAsDataURL(prepared);
  };

  const handlePhotoSave = async (
    overrideFile?: File,
    posYOverride?: number,
    // HERO.FIT.2 — the framed window over the display file being saved
    // (`window`, what paints) and over the kept original (`windowSource`, what
    // reopens the editor; null when the editor's picture was not the kept
    // original). PHOTO.EDITOR.1: every save but a GIF's carries one, and every
    // save writes Fill.
    windows?: { window: Record<string, unknown>; windowSource: Record<string, unknown> | null },
    // PHOTO.POLISH.1 — the Auto enhance baked into the file being saved, or
    // null / absent for none. Written or removed with the rest of the config.
    enhance?: HeroEnhance | null,
  ) => {
    // CROP.3a-C rule 2: a crop is composed at the canonical hero aspect, so
    // the save writes posY 50 (centered) — cover-at-matching-aspect is an
    // identity there. PHOTO.EDITOR.1: a GIF, saved as picked, is centred too.
    const posYToSave = posYOverride ?? 50;
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
      // MEDIA.PHOTO.2 (audit gap #8): object names are fresh UUIDs, never
      // reused, so the object is immutable — cache it for a year, not an hour.
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, fileToUpload, { upsert: true, cacheControl: '31536000' });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // If this is a fresh upload (user picked a new file), also store the
      // original full-size photo so they can re-crop later with full
      // flexibility. Skipped only on re-crop (photoOriginalFile is null).
      // Page 1 stores it in the avatar_original_url column; Page 2 in theme_json.
      // MEDIA.PHOTO.2: photoOriginalFile is the PREPARED master (WebP ≤ 4096 px,
      // EXIF-free) from handlePhotoSelect — never the raw pick.
      let originalUrl: string | null = null;
      if (photoOriginalFile) {
        const origExt = photoOriginalFile.name.split('.').pop() || 'jpg';
        const origFileName = `${user.id}/${randomUUID()}-original.${origExt}`;
        const { error: origUploadError } = await supabase.storage
          .from('avatars')
          .upload(origFileName, photoOriginalFile, { upsert: true, cacheControl: '31536000' });
        if (origUploadError) {
          console.error('Original photo upload failed (non-fatal):', origUploadError);
        } else {
          originalUrl = supabase.storage.from('avatars').getPublicUrl(origFileName).data.publicUrl;
        }
      }

      // HERO.FIT.2 — the hero config this save writes. A fresh pick whose
      // original failed to upload has no kept original to reopen against.
      const windowSourceToSave = windows && (!photoOriginalFile || originalUrl) ? windows.windowSource : null;
      const nextHeroConfig = (stored: Record<string, unknown> | undefined) => {
        // PHOTO.POLISH.1: the enhancement belongs to the display file too — it is
        // written when this save baked one in, and dropped otherwise.
        const existingHero: Record<string, unknown> = writeHeroEnhance(stored, enhance ?? null);
        delete existingHero.video; // an image hero replaces any video — clean swap, no leftover video
        // The display picture changes with every photo save, so a window stored
        // against the old one never survives it.
        delete existingHero.window;
        delete existingHero.windowSource;
        // A GIF, saved as picked: Fill, centred, no window.
        if (!windows) return { ...existingHero, fit: 'fill', posY: posYToSave, posX: 50 };
        // With a window the page paints THAT: a stale scale or posX must not ride on.
        delete existingHero.scale;
        return {
          ...existingHero,
          fit: 'fill',
          posX: 50,
          posY: 50,
          window: windows.window,
          ...(windowSourceToSave ? { windowSource: windowSourceToSave } : {}),
        };
      };

      if (usePage2Own) {
        // Save Page 2's own hero into theme_json: image, display config, and
        // (when a fresh file was picked) the full-size original for re-crop.
        const existingTheme = (page.theme_json as any) || {};
        const nextTheme: any = {
          ...existingTheme,
          avatar_url_page2: urlData.publicUrl,
          heroConfig_page2: nextHeroConfig(existingTheme.heroConfig_page2),
        };
        if (originalUrl) nextTheme.avatar_original_url_page2 = originalUrl;
        const { error: updateError } = await supabase
          .from('pages')
          .update({ theme_json: nextTheme })
          .eq('id', page.id);
        if (updateError) throw updateError;
      } else {
        // TL.STOR.8.1 — the object(s) this save supersedes, read from the row as
        // it was when the save started. The old ORIGINAL is a candidate only
        // when a new original was uploaded this save (a fresh pick); a pencil
        // re-crop reuses the original, so it must survive.
        const prevAvatarUrl = page.avatar_url ?? null;
        const prevOriginalUrl = originalUrl ? (page.avatar_original_url ?? null) : null;
        const existingTheme = (page.theme_json as any) || {};
        const updates: { avatar_url: string; avatar_original_url?: string; theme_json: any } = {
          avatar_url: urlData.publicUrl,
          theme_json: { ...existingTheme, heroConfig: nextHeroConfig(existingTheme.heroConfig) },
        };
        if (originalUrl) {
          updates.avatar_original_url = originalUrl;
        }
        const { error: updateError } = await supabase
          .from('pages')
          .update(updates)
          .eq('id', page.id);
        if (updateError) throw updateError;
        // TL.STOR.8.1 — the row now points at the new object(s); the previous
        // ones are unreachable and would leak forever. Best-effort, after the
        // write, never before — a failed save must never delete the live image.
        // Skipped when the old URL is still referenced by another hero slot on
        // this row (page 2 may share page 1's image).
        const stillReferenced = (url: string): boolean => {
          const tj = (page.theme_json as any) || {};
          return [
            urlData.publicUrl,
            originalUrl ?? page.avatar_original_url,
            tj.avatar_url_page2,
            tj.avatar_original_url_page2,
            tj.heroConfig?.video,
            tj.heroConfig_page2?.video,
          ].some((u) => typeof u === 'string' && u === url);
        };
        for (const old of [prevAvatarUrl, prevOriginalUrl]) {
          if (old && !stillReferenced(old)) removePublicObject('avatars', old);
        }
      }
      toast.success(t('editor.hero.photoUpdated'));
      setLocalHeroImages(prev => ({ ...prev, [selectedMode]: urlData.publicUrl }));
      // HERO.FIT.2: the window just saved (or its absence) rides beside that URL.
      setLocalHeroWindows(prev => ({
        ...prev,
        [heroPageId]: { url: urlData.publicUrl, window: windows?.window, enhance: enhance ?? null },
      }));
      setPhotoStep('idle');
      setPhotoPreview(null);
      setPhotoFile(null);
      setPhotoOriginalFile(null);
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

  const resetPhoto = () => {
    setPhotoPreview(null);
    setPhotoFile(null);
    setPhotoOriginalFile(null);
    setPhotoStep('idle');
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
  // TL.PLAN.ENFORCE.2: a visitor surface renders the theme at the owner's tier
  // (page font + page-level animation); the edit canvas passes no plan.
  const styledTheme = withEffectivePageStyle(contrastTheme, page.theme_json, selectedMode);
  const theme = visitorPlan ? gateThemeForVisitor(visitorPlan, styledTheme) : styledTheme;
  // TP.F4: the page look (theme_json.look), resolved once for the active page:
  // at the owner's plan on a visitor surface, as saved on the edit canvas. An
  // open Name & Handle hub draft (L4) is written over the saved record first,
  // so a draft and a saved value take one path. Today's values are the
  // defaults below, and each only branches the render when it differs.
  const pageLook = resolveLookWithDraft(page.theme_json, headerDraft, selectedMode, visitorPlan);
  // 'below' counts only on a hero page: a full-screen page renders it as 'page'.
  const nameBelow = pageLook.namePlacement === 'below' && !isFullBleedTheme(theme);
  const nameLeft = pageLook.nameAlign === 'left';
  const handleShown = pageLook.showHandle !== 'off';
  const handleBeside = pageLook.handlePosition === 'beside';
  const iconsAlign: IconsAlign = pageLook.iconsAlign;
  // An in-progress hub font draft (L4) wins; resolveFontFamily returns undefined
  // for an absent draft, so the saved font is the fallback.
  const draftFont = visitorPlan ? gateFontForVisitor(visitorPlan, headerDraft?.font) : headerDraft?.font;
  const fontFamily = resolveFontFamily(draftFont) ?? getFontFamily(theme);
  const chrome = getChromeTokens(theme);

  const saveHeaderConfig = async (config: Record<string, unknown>): Promise<boolean> => {
    const existingTheme = (page.theme_json as any) || {};
    const { error } = await supabase
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
    // FRAGILE.WRITES.1: report the result; only a landed write refreshes.
    if (error) {
      console.error('Error saving header config:', error);
      toast.error(t('editor.saveFailed'));
      return false;
    }
    onRefresh();
    return true;
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
  // MEDIA.PHOTO.1 — hero renditions, VISITOR path only. The owner's editor keeps
  // the master URL everywhere: crop/pan maths reads natural pixels. On the
  // public page (and the visitor preview) the master is NOT what the screen
  // needs, so every non-display read of it — the aspect probe, the luminance
  // sample, the logo check, the blurred Fit backdrop — takes a small rendition
  // instead of pulling a second full-size copy next to the <img>'s own srcset.
  //   480 wide: aspect to <0.1% (the framing maths is aspect-exact), and 32px
  //   downsamples read the same pixels either way.
  const heroAnalysisUrl = editMode ? heroImage : transformUrl(heroImage, { width: 480, maxWidth: HERO_MAX_PX });
  //   96 wide: it sits under a 28px blur.
  const heroBlurUrl = editMode ? heroImage : transformUrl(heroImage, { width: 96, maxWidth: HERO_MAX_PX });
  // HERO.FIT.2 — the framed window in play. A manual crop stores a window over
  // the DISPLAY file (the slot's `window`); it only means anything while that
  // file is the picture showing. Right after a save the local URL shows before
  // the refreshed row lands, so the window saved with it (or its absence) is
  // used for as long as that URL is the one on screen. Read off the RAW slot the
  // writers target, like neverChoseFit below. No window → undefined → every
  // reader below takes today's path, untouched.
  const heroSlot = (page.theme_json as any)?.[heroConfigKey] as Record<string, unknown> | undefined;
  const localHeroWindow = localHeroWindows[heroPageId];
  const heroWindowIsLocal = !!localHeroWindow && localHeroWindow.url === heroImage;
  const heroRowIsShowing = !!heroImage && heroImage === (usePage2Own ? page2AvatarUrl : page.avatar_url);
  const heroWindowJson: unknown = heroWindowIsLocal
    ? localHeroWindow.window
    : heroRowIsShowing ? heroSlot?.window : undefined;
  // The display file's own aspect, read off the window: known before the
  // picture decodes, null when no usable window is stored.
  const heroWindowAspect = pictureFitSourceAspect(heroWindowJson);
  // The name band follows the window only where the window is what paints.
  const heroBandWindowed = heroWindowAspect != null && !heroSlot?.video && heroSlot?.fit !== 'fit';
  // TL.POLISH.1a: is the band the name sits over LIGHT? White text over a
  // white logo hero is unreadable (/mecivietnam), so the public name/handle
  // get a legibility scrim only when this is true. Public path only; edit
  // mode never reads it. Stale samples are ignored on src change / unmount.
  const [heroIsLight, setHeroIsLight] = useState(false);
  useEffect(() => {
    if (editMode || !heroImage) { setHeroIsLight(false); return; }
    // HERO.FIT.2: a windowed hero is sampled once its box is measured (below).
    if (heroBandWindowed) return;
    let cancelled = false;
    sampleHeroBand(heroAnalysisUrl).then((lum) => {
      if (cancelled) return;
      setHeroIsLight(lum != null && needsNameScrim(lum));
    });
    return () => { cancelled = true; };
  }, [heroImage, heroAnalysisUrl, editMode, heroBandWindowed]);
  // TL.POLISH.1b: auto-Fit for LOGO-like heroes on pages that NEVER chose a
  // display mode. resolveHeroConfig merges HERO_DEFAULTS in and loses that
  // distinction, so "never chose" is read off the RAW theme_json slot the
  // writers target (heroConfigKey — Page 2's own slot when editing it
  // un-inherited, else Page 1's). Any explicit fit — 'fill' included — wins
  // and switches this off for good. Render-time only: nothing is written.
  // Runs in edit mode too, so the canvas shows what the page shows.
  const neverChoseFit: boolean = (page.theme_json as any)?.[heroConfigKey]?.fit === undefined;
  const [heroAutoFit, setHeroAutoFit] = useState(false);
  useEffect(() => {
    if (!neverChoseFit || !heroImage) { setHeroAutoFit(false); return; }
    let cancelled = false;
    analyzeImageForLogo(heroAnalysisUrl).then((isLogo) => {
      if (cancelled) return;
      setHeroAutoFit(isLogo === true);
    });
    return () => { cancelled = true; };
  }, [heroImage, heroAnalysisUrl, neverChoseFit]);
  // Hero display config (HERO-1). HERO.DEFAULTS.1: resolved at read time, so an
  // absent/partial config renders the dialed-in default (Fill, posY 25 — faces
  // in the top third) with no stored data. Feeds heroFit/heroPosY below and the
  // full-bleed background's objectPosition. Public + editor share this path.
  const heroConfig = resolveHeroConfig(page.theme_json, heroPageId);
  const heroVideo: string = heroConfig.video || '';
  // TL.POLISH.1b: explicit Fit → Fit; never-chose + logo-like → Fit; else Fill.
  const heroFit: 'fill' | 'fit' = heroConfig.fit === 'fit' ? 'fit' : (heroAutoFit ? 'fit' : 'fill');
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
  // through SmoothImage, which owns its own onLoad. In the editor the browser
  // serves this from cache (same URL the <img> requests), so it costs no extra
  // fetch; for a visitor it reads the small analysis rendition (aspect is
  // preserved), since the <img> itself picks a srcset candidate.
  const [heroPhotoAspect, setHeroPhotoAspect] = useState<number | null>(null);
  useEffect(() => {
    setHeroPhotoAspect(null);
    if (!heroAnalysisUrl) return;
    let live = true;
    const probe = new Image();
    probe.onload = () => { if (live) setHeroPhotoAspect(imageAspect(probe)); };
    probe.src = heroAnalysisUrl;
    return () => { live = false; };
  }, [heroAnalysisUrl]);
  // MEDIA.PHOTO.1 — how many times wider than its box the hero photo PAINTS.
  // Cover pins the photo by whichever axis would leave a gap, so a photo wider
  // than its box (a square one in the portrait hero window) overflows sideways
  // and needs that many more pixels than the column is wide. The canonical hero
  // aspect gives 1; until the aspects are measured the srcset assumes that (the
  // full-bleed layer, which is almost always height-pinned, assumes its typical).
  // HERO.FIT.2 — a stored window paints wherever the layer is Fill and there is
  // no hero video: the hero box when the effective fit is Fill, the full-screen
  // layer always. The window is re-shaped for the MEASURED box and converted to
  // the framing the unchanged resolver paints. Until the probe answers, the
  // file's aspect comes off the window itself, so the first paint is already
  // the window. Null (no window, Fit, a video, or a box not yet measured) →
  // today's inputs, the same objects as before.
  const heroWindowMediaAspect = heroPhotoAspect ?? heroWindowAspect;
  const heroWindowPaints = heroWindowAspect != null && !heroVideo;
  const heroBoxWindowFraming: ResolvedHeroFraming | null = heroWindowPaints && heroFitEffective === 'fill'
    ? resolveHeroWindowFraming(heroWindowJson, heroWindowMediaAspect, heroContainerAspect)
    : null;
  const fullBleedWindowFraming: ResolvedHeroFraming | null = heroWindowPaints
    ? resolveHeroWindowFraming(heroWindowJson, heroWindowMediaAspect, fullBleedAspect)
    : null;
  const heroBoxMedia: HeroMediaStyleInput = heroBoxWindowFraming
    ? { mediaAspect: heroWindowMediaAspect, containerAspect: heroContainerAspect, framing: heroBoxWindowFraming }
    : { mediaAspect: heroPhotoAspect, containerAspect: heroContainerAspect, framing: heroImgFraming };
  const fullBleedMedia: HeroMediaStyleInput = fullBleedWindowFraming
    ? { mediaAspect: heroWindowMediaAspect, containerAspect: fullBleedAspect, framing: fullBleedWindowFraming }
    : { mediaAspect: heroPhotoAspect, containerAspect: fullBleedAspect, framing: { ...heroImgFraming, fit: 'fill' } };
  // How many box widths wide a windowed photo paints (the srcset's question).
  const windowPaintScale = (media: HeroMediaStyleInput): number | null => {
    const geo = resolveHeroGeometry(media.mediaAspect, media.containerAspect, media.framing);
    return geo ? Math.min(3, Math.max(1, geo.widthPct / 100)) : null;
  };
  // HERO.FIT.2 — the name band of a windowed hero: the band of what the hero
  // box shows. One sample, taken once the box is measured (not one of the whole
  // file first), and not again when the box changes shape under a sliding
  // browser bar. Public path only, like the un-windowed sample above.
  const heroBoxMeasured = heroContainerAspect != null;
  const heroBandKey = heroBandWindowed ? JSON.stringify(heroWindowJson) : '';
  useEffect(() => {
    if (editMode || !heroImage || !heroBandWindowed || heroContainerAspect == null) return;
    let cancelled = false;
    sampleHeroBand(heroAnalysisUrl, pictureFitSeed(heroWindowJson, heroContainerAspect).crop).then((lum) => {
      if (cancelled) return;
      setHeroIsLight(lum != null && needsNameScrim(lum));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroImage, heroAnalysisUrl, editMode, heroBandWindowed, heroBoxMeasured, heroBandKey]);
  const heroCoverScale = heroFitEffective === 'fit'
    ? 1
    : (heroBoxWindowFraming ? windowPaintScale(heroBoxMedia) : null) ?? coverOverflow(heroPhotoAspect, heroContainerAspect);
  const fullBleedCoverScale = (fullBleedWindowFraming ? windowPaintScale(fullBleedMedia) : null)
    ?? coverOverflow(heroPhotoAspect, fullBleedAspect, HERO_FULL_BLEED_COVER_SCALE);

  // Page labels + two-page switcher (shown in both editor preview and live page).
  const themePages = (page.theme_json as any)?.pages;
  const page1Label = pageLabel(themePages?.page1?.label, 'page1', t);
  const page2Label = pageLabel(themePages?.page2?.label, 'page2', t);
  const pagesEnabled: boolean = themePages?.enabled === true;
  const renderPageSwitcher = () => {
    if (!pagesEnabled) return null;
    // TL.PLAN.ENFORCE.2: a visitor sees no switcher when the owner's plan shows one page.
    if (visitorPlan && visiblePageCount(visitorPlan, 2) < 2) return null;
    // TL.PLAN.ENFORCE.3: on the edit canvas the owner keeps the page-2 tab,
    // locked — a tap raises the upsell and the selected page does not change.
    const page2Locked = editMode && planLock.pagesLocked(2);
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
            onClick={() => (page2Locked ? planLock.upsell('page2') : onModeChange('page2'))}
            title={page2Locked ? planLock.hint('page2') : undefined}
            data-testid={page2Locked ? 'page2-tab-locked' : undefined}
            className={cn(
              'px-4 py-1 rounded-full text-xs font-medium transition-colors truncate max-w-[45vw]',
              selectedMode === 'page2' ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/60 hover:text-white',
              page2Locked && 'inline-flex items-center gap-1'
            )}
          >
            {page2Locked ? (
              <>
                <Lock className="h-3 w-3 flex-shrink-0 text-[#C9A55C]" />
                <span className="min-w-0 truncate">{page2Label}</span>
              </>
            ) : page2Label}
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

  // TP.F2a — the join under the hero photo. The content panel always paints its
  // own OPAQUE background and only the 64px fade strip above it is translucent:
  // no text ever sits on a masked surface (a mask under text costs desktop its
  // subpixel antialiasing). Strip and panel cannot disagree because both paint
  // from ONE value, heroBgValue:
  //   · solid colour — the panel paints the colour and the strip ramps from
  //     transparent to that same colour. Exactly the paint Joey tuned.
  //   · gradient — two slices of one image. The gradient is laid over the box
  //     that starts 60px above the panel's top edge and ends at its bottom; the
  //     panel shows it from its own top edge down, the strip shows its top 64px
  //     through a mask that carries the same ramp. (The strip used to be the
  //     gradient's first hex, which a 135-degree gradient equals in one corner
  //     only — audit S1.)
  const heroBgValue = theme.background?.type === 'gradient' && theme.background?.gradient_css
    ? theme.background.gradient_css
    : (theme.background?.solid_color || '#0e0c09');
  // Tested on the value, not the type: legacy/early-onboarding pages stashed a
  // gradient STRING in solid_color with type:'solid'.
  const heroBgIsGradient = heroBgValue.includes('gradient');
  // Only chooses the ramp LENGTH below; on a gradient it is never painted. A
  // gradient's first hex is the colour the seam sits against.
  const heroJoinTone = heroBgIsGradient
    ? (heroBgValue.match(/#[0-9a-fA-F]{3,8}/)?.[0] || '#0e0c09')
    : heroBgValue;
  // Dark backgrounds (the fade's original design target) keep the long, gentle
  // ramp — photo-into-dark is invisible. Colored/light backgrounds reach the bg
  // color much higher up so the photo's brightness-mismatched lower edge is
  // covered before it reads as a band at the seam.
  const heroFadeStop = relativeLuminance(heroJoinTone) > 0.15 ? 45 : 80;
  // The same ramp as an alpha mask, for the gradient strip: clear at the top,
  // opaque at heroFadeStop% of 64px, and nothing at all from 64px down — below
  // that the panel's own slice is the only paint.
  const heroFadeMask = `linear-gradient(to bottom, transparent 0px, #000 ${(64 * heroFadeStop) / 100}px, #000 64px, transparent 64px)`;
  const heroPanelPaint: React.CSSProperties = heroBgIsGradient
    ? {
        backgroundImage: heroBgValue,
        backgroundRepeat: 'no-repeat',
        backgroundSize: '100% calc(100% + 60px)',
        backgroundPosition: '0 -60px',
      }
    : { background: heroBgValue };
  const heroStripPaint: React.CSSProperties = heroBgIsGradient
    ? {
        bottom: 0,
        backgroundImage: heroBgValue,
        backgroundRepeat: 'no-repeat',
        maskImage: heroFadeMask,
        WebkitMaskImage: heroFadeMask,
        clipPath: 'inset(0 0 calc(100% - 64px) 0)',
      }
    : {
        height: '64px',
        background: `linear-gradient(to bottom, transparent 0%, ${heroBgValue} ${heroFadeStop}%, ${heroBgValue} 80%)`,
      };

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
  // PHOTO.EDITOR.1 — what the photo editor (HeroPhotoEditor) opens on. Its frame
  // is the shape the page shows the photo in; its picture is a new pick, the
  // kept original (pencil), or — with no kept original — the page's own display
  // file. It reopens where it was left: on the window stored over the kept
  // original (`windowSource`) while the row on screen is the one that stored it,
  // or on the display file's own `window`. Otherwise undefined → zoom 1, centred.
  const cropFrameAspect = isFullBleed ? canonicalFullBleedAspect() : canonicalHeroAspect();
  const cropReopenWindow = photoSource === 'original'
    ? (heroRowIsShowing ? pictureFitSeed(heroSlot?.windowSource, cropFrameAspect).crop : null)
    : photoSource === 'display' ? pictureFitSeed(heroWindowJson, cropFrameAspect).crop : null;
  const cropReopenArea = cropReopenWindow
    ? { x: cropReopenWindow.x, y: cropReopenWindow.y, width: cropReopenWindow.w, height: cropReopenWindow.h }
    : undefined;

  // PHOTO.POLISH.1 — Auto enhance. What the picture showing was baked with: the
  // value saved beside the local URL while that URL is the one on screen (as
  // the window is), else the row's.
  const heroEnhanceStored: HeroEnhance | null = heroWindowIsLocal
    ? localHeroWindow.enhance
    : heroRowIsShowing ? readHeroEnhance(heroSlot) : null;
  // A GIF is saved as picked (it would stop moving): no crop, no enhancement.
  const dialogIsGif = photoFile ? photoFile.type === 'image/gif' : /\.gif(\?|#|$)/i.test(heroImage);

  // OK in the photo editor. The file is already baked (bakeHeroPhoto); the
  // editor keeps its real source (photoPreview, photoFile) until the save lands,
  // so a failed save does not leave it holding the baked file.
  const handlePhotoApply = async (result: HeroPhotoResult) => {
    if (!result.file || !result.window) {
      // A GIF: saved as picked — Fill, centred, no window, no enhancement.
      await handlePhotoSave(photoFile ?? undefined, 50);
      return;
    }
    await handlePhotoSave(result.file, 50, { window: result.window, windowSource: result.windowSource }, result.enhance);
  };

  // NAMEFX.1b: the public header's text effect, from the saved theme (see getNameFx).
  const nameFx: React.CSSProperties = getNameFx((page.theme_json as any)?.typography?.text_effect);
  // TL.POLISH.1a: getNameFx returns textShadow:'none' for the no-effect case
  // too, so "spread nameFx last" alone would erase the scrim. The scrim
  // applies only when NO explicit effect is set; shadow/outline still win.
  const nameFxType = (page.theme_json as any)?.typography?.text_effect?.type;
  const nameFxExplicit = !!nameFxType && nameFxType !== 'none';
  const nameScrimFx: React.CSSProperties = heroIsLight && !nameFxExplicit ? { textShadow: NAME_SCRIM_SHADOW } : {};
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
            // MEDIA.PHOTO.1 (visitor path): the layer is viewport-sized and the
            // hero is covered across it, so on a phone the photo is scaled until
            // its HEIGHT fills — roughly 1.8x the viewport width for the canonical
            // hero aspect. Candidates run up to the master (HERO_MAX_PX).
            <ResponsiveImg
              src={heroImage}
              alt=""
              cssWidth={editMode ? undefined : HERO_FULL_BLEED_CSS_WIDTH}
              sizes={{ fullBleed: true, scale: fullBleedCoverScale }}
              maxWidth={HERO_MAX_PX}
              style={resolveHeroMediaStyle(fullBleedMedia)}
              data-hero-framing={heroFramingAttr(fullBleedMedia)}
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
      <div ref={heroContainerRef} data-testid="hero-sticky" data-hero-autofit={heroAutoFit ? 'on' : 'off'} className="relative w-full" style={{ position: 'sticky', top: stickyTop, height: 'calc(var(--pv-vh, 1dvh) * 50 + ' + HERO_EXTRA + 'px)', maxHeight: 'calc(500px + ' + HERO_EXTRA + 'px)', overflow: 'hidden', zIndex: 1 }}>
        {isFullBleed ? null : heroVideo ? (
          <HeroVideo
            src={heroVideo}
            fit={heroFitEffective}
            blurImage={heroBlurUrl}
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
                  backgroundImage: `url(${heroBlurUrl})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: 'blur(28px) brightness(0.7)',
                  transform: 'scale(1.1)',
                }}
              />
            )}
            <div
              className="h-full w-full"
              data-hero-framing={heroFramingAttr(heroBoxMedia)}
            >
              <SmoothImage
                src={heroImage}
                alt={page.display_name || page.handle}
                // MEDIA.PHOTO.1: visitor path only — the editor's crop maths reads
                // the master's pixels. The hero fills the page column (times how
                // far cover overflows it); the master is at most HERO_MAX_PX wide,
                // so no candidate asks for more.
                cssWidth={editMode ? undefined : Math.round(HERO_REF_WIDTH * heroCoverScale)}
                sizes={{ column: heroCoverScale }}
                maxWidth={HERO_MAX_PX}
                // MEDIA.PHOTO.2 (audit gap #2): the hero is above the fold —
                // eager + fetchpriority=high here, and only here.
                priority
                className="brightness-110"
                imgStyle={resolveHeroMediaStyle(heroBoxMedia)}
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
          // TL.HDR.OVL.1 — below the 56px public header so add-contact keeps its live position.
          <div className="absolute top-[68px] right-3 z-[15] flex flex-col gap-2">
            {!heroVideo && (
              <button
                onClick={() => {
                  // No image yet — pencil is inert; the camera adds the first photo.
                  if (!heroImage) return;
                  // Prefer the saved original (full-size) so the cropper has the
                  // unrestricted source. Falls back to the cropped hero for
                  // legacy photos uploaded before avatar_original_url existed.
                  const editSource = (usePage2Own ? ((page.theme_json as any)?.avatar_original_url_page2 || heroImage) : (page.avatar_original_url || heroImage));
                  setPhotoSource(editSource === heroImage ? 'display' : 'original');
                  setPhotoPreview(editSource);
                  setPhotoFile(null);
                  setPhotoOriginalFile(null);
                  setPhotoSession((n) => n + 1);
                  setPhotoStep('edit');
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
          ...(isFullBleed ? { background: 'transparent' } : heroPanelPaint),
          minHeight: '60vh',
          marginTop: '-2rem',
          paddingTop: '0',
          // TP.F2 (audit S4): the @handle's colour when the creator has not
          // picked one, published once so the edit card and the public header
          // cannot disagree. Pure white wherever it always was (dark and
          // mid-tone pages, and every full-screen page, whose handle sits on the
          // photo); on a light page the theme's own text colour — the name's
          // default — or ink when that text colour is itself light.
          ['--handle-default' as string]: isFullBleed || !chrome.isLight
            ? 'rgba(255,255,255,1)'
            : relativeLuminance(chrome.text) > 0.5 ? '#0e0c09' : chrome.text,
        } as React.CSSProperties}
      >
        {/* Gradient fade — scrolls over the sticky hero photo */}
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            left: 0,
            right: 0,
            ...(isFullBleed ? { height: '64px', background: 'none' } : heroStripPaint),
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
            transform: editMode || nameBelow ? undefined : `translateY(${-HEADER_OFFSET_Y}px)`,
            paddingBottom: editMode ? 0 : headerSpacing.iconsContent,
            // TP.F4 'below': not lifted over the photo; it starts
            // HEADER_BELOW_TOP under the panel's top edge (padding, see the constant).
            ...(!editMode && nameBelow ? { paddingTop: HEADER_BELOW_TOP } : {}),
          }}
        >
          {/* In edit mode, name/handle render as sortable cards below */}
          {!editMode && headerCardOrder.map(id => {
            const headerNameColor = headerConfig.nameColor || chrome.text;
            const headerHandleColor = headerConfig.handleColor && headerConfig.handleColor !== '#ffffff99' ? headerConfig.handleColor : 'var(--handle-default, rgba(255,255,255,1))';
            // TP.F4: left aligns this card inside the side padding (icons and the
            // page switcher keep the wrapper's centring); beside puts the handle
            // on the name's line, wrapping under it when the name is too long.
            const scrimStyle: React.CSSProperties = handleBeside
              ? { paddingTop: HEADER_NAME_TOP, display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: nameLeft ? 'flex-start' : 'center', columnGap: HANDLE_BESIDE_GAP, ...(nameLeft ? { textAlign: 'left' as const } : {}) }
              : { paddingTop: HEADER_NAME_TOP, display: 'flex', flexDirection: 'column' as const, alignItems: nameLeft ? 'flex-start' : 'center', ...(nameLeft ? { textAlign: 'left' as const } : {}) };
            if (id === '__name_handle__') return (
              <div key={id} data-name-scrim={heroIsLight ? 'on' : 'off'} style={scrimStyle}>
                <h1
                  className="font-bold mb-0"
                  style={{
                    fontSize: `${headerConfig.nameSize}px`,
                    color: headerNameColor,
                    textShadow: 'none',
                    ...nameFx,
                    // TL.POLISH.1a: legibility scrim over a light hero only,
                    // and only when no explicit theme text_effect is set.
                    ...nameScrimFx,
                  }}
                >
                  {page.display_name || `@${page.handle}`}
                </h1>
                {handleShown && (
                  <p
                    style={{
                      fontSize: `${headerConfig.handleSize}px`,
                      color: headerHandleColor,
                      textShadow: 'none',
                      ...nameFx,
                      ...nameScrimFx,
                      margin: 0,
                      // Beside: on the name's line, so the name→handle gap does not apply.
                      marginTop: handleBeside ? 0 : headerSpacing.nameHandle,
                    }}
                  >
                    @{page.handle}
                  </p>
                )}
              </div>
            );
            if (id === '__social_icons__') {
              // Each icon keeps its parent block so a click can be attributed.
              const allSocialItems = socialBlocks.flatMap(b => b.items.map(item => ({ item, block: b })));
              // TL.SOC.3: this is the NON-edit path — the public page and the
              // editor's Visitor toggle, which exists to tell the truth about
              // what a visitor sees. A row with no URL yet (onboarding writes
              // url '') used to render here as a decorative icon that goes
              // nowhere; the edit canvas keeps showing it as a "needs a link"
              // placeholder, but a visitor must never meet a dead icon.
              //
              // Presence, not validity, is the test: a malformed or unsafe URL
              // still means the creator BELIEVES the row is linked, and hiding
              // it would read as data loss. safeHref already renders those
              // inert further down — that is the layer that owns bad schemes.
              //
              // Filtering BEFORE the label dedupe also settles a latent bug of
              // its own: dedupe keeps the FIRST row of a label, so a leftover
              // URL-less "Instagram" used to shadow the real linked one saved
              // beneath it, and the page showed neither a link nor an error.
              const linkedItems = allSocialItems.filter(({ item }) => !!(item.url ?? '').trim());
              const seenLabels = new Set<string>();
              const dedupedItems = linkedItems.filter(({ item }) => {
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
                    // TL.SEC.XSS.1: the 18+ gate has no opinion on a
                    // `javascript:` URI — it is not an adult domain — so what
                    // survives gating is sanitized here. One assignment covers
                    // the href, target, rel, and the decorative-span fallback.
                    const href = gated ? undefined : safeHref(item.url);
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
              return <HeaderIconRow nodes={iconNodes} gapTop={headerSpacing.handleIcons} align={iconsAlign} />;
            }
            return null;
          })}
          {!editMode && renderPageSwitcher()}
          {editMode && (
            <>

              {/* PHOTO.EDITOR.1 — the ONE photo editor (it portals itself to the
                  body): a pick or the pencil opens it directly. With a kept
                  original it reopens on `windowSource` with the stored
                  enhancement; on the display file it reopens on its `window`
                  and offers no Auto enhance (its pixels may already be enhanced). */}
              {photoPreview && photoStep !== 'idle' && (
                <HeroPhotoEditor
                  key={photoSession}
                  image={photoPreview}
                  kind={isFullBleed ? 'full_bleed' : 'hero'}
                  initialArea={cropReopenArea}
                  initialEnhance={photoSource === 'original' ? heroEnhanceStored : null}
                  isOriginal={photoSource !== 'display'}
                  enhanceOffered={photoSource !== 'display'}
                  croppable={!dialogIsGif}
                  isExisting={photoSource !== 'pick'}
                  saving={photoSaving}
                  onApply={handlePhotoApply}
                  onNewPhoto={() => photoInputRef.current?.click()}
                  onClose={resetPhoto}
                  // CROP.3a error truth: never fail silently — a concise cause
                  // hint so a tainted-canvas / decode failure is distinguishable.
                  onBakeError={(err) => toast.error(`${t('editor.crop.cropFailed')} — ${t(cropErrorCauseKey(err))}`)}
                />
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
            {/* Free-drag header cards (outside DndContext) — hidden during photo crop/edit.
                HDR.SPACE.2: the edit canvas composes the below-icons gap differently
                (card gaps, no view-mode paddingBottom), so it mirrors the slider as a
                DELTA from the default — absent config = 0 = today's canvas, and a drag
                shifts the canvas by exactly the px the public page will shift.
                TP.F4 'below': no lift — the cards start HEADER_BELOW_TOP under the
                panel's top edge, as the public header does. */}
            <div className="flex flex-col gap-[6px]" style={nameBelow
              ? { position: 'relative', zIndex: 5, marginBottom: headerSpacing.iconsContent - HEADER_GAP_C, paddingTop: HEADER_BELOW_TOP }
              : { position: 'relative', zIndex: 5, transform: `translateY(${-HEADER_OFFSET_Y}px)`, marginBottom: headerSpacing.iconsContent - HEADER_GAP_C }}>
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
                    align={pageLook.nameAlign}
                    showHandle={handleShown}
                    handleBeside={handleBeside}
                    localNameSize={localNameSize}
                    localHandleSize={localHandleSize}
                    localNameColor={localNameColor}
                    localHandleColor={localHandleColor}
                    onDisplayNameChange={async (name) => {
                      const { error } = await supabase.from('pages').update({ display_name: name }).eq('id', page.id);
                      if (error) {
                        console.error('Error saving display name:', error);
                        toast.error(t('editor.saveFailed'));
                        return;
                      }
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
                    align={iconsAlign}
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
            {/* Block cards (sortable via DndContext). TP.F4 'below': the header is
                not lifted, so the cards ride up by the lift's difference only —
                today's distance from the icons. */}
            <div className="flex flex-col gap-[6px]" style={{ marginTop: `${nameBelow ? HEADER_OFFSET_Y - CARDS_LIFT : -CARDS_LIFT}px` }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}>
              <SortableContext items={allSortableItems} strategy={verticalListSortingStrategy}>
                {allSortableItems.map((itemId) => {
                  const block = displayBlocks.find(b => b.id === itemId);
                  if (!block) return null;
                  // TL.PLAN.ENFORCE.3: a saved Pro block the owner's plan lacks
                  // stays on the canvas, locked — opening it raises the upsell
                  // instead of its editor; drag and the on/off toggle still work.
                  const lockFeature = planLock.blockLock(block.type);
                  return (
                    <SortablePreviewCard
                      key={block.id}
                      block={block}
                      lockHint={lockFeature ? planLock.hint(lockFeature) : undefined}
                      onEdit={lockFeature ? () => planLock.upsell(lockFeature) : () => onBlockEdit(block.id)}
                      onToggle={(enabled) => onBlockToggle(block.id, enabled)}
                      onGalleryDelete={handleGalleryDelete}
                      onItemEdit={onItemEdit}
                      onItemDelete={onItemDelete}
                      onItemAdd={onItemAdd}
                      onSuggestAi={onSuggestAi}
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
          /* Full block content for view mode. TP.F4 'below': the header is not
             translated up, so the blocks keep today's distance from the icons
             with HEADER_OFFSET_Y - CARDS_LIFT instead of -CARDS_LIFT. */
          <div
            className="px-4 pb-20 flex flex-col gap-3"
            style={{ marginTop: `${nameBelow ? HEADER_OFFSET_Y - CARDS_LIFT : -CARDS_LIFT}px` }}
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
                  <BlockRenderer block={block} onOutboundClick={viewModeClick} theme={theme} pageId={page.id} visitorPlan={visitorPlan} />
                </motion.section>
              ))
            )}
          </div>
        )}

        {/* Footer */}
        {showBranding && (
          <footer className="mt-12 pb-10 text-center">
            <a
              href={badgeRefCode ? `/?ref=${badgeRefCode}` : '/?ref=badge'}
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
