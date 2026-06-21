import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import {
  Loader2,
  Link as LinkIcon,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ShieldAlert,
  Settings2,
  Camera,
  Lock,
  Plus,
  ArrowLeftRight,
  Info,
  X,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { Tables } from '@/integrations/supabase/types';
import { ITEM_CAPS, validateUrl } from '@/lib/validation';
import { ThumbnailUpload } from './ThumbnailUpload';
import { LinkButton } from '@/components/LinkButton';
import { ColorPicker, InlineColorPicker } from '@/components/ui/color-picker';
import { leadingIconFor } from '@/components/blocks/link-leading-icon';
import { DEFAULT_BLOCK_STYLE, DEFAULT_THEME, type BlockStyleConfig } from '@/lib/theme-defaults';
import { findPartnerId } from '@/lib/link-layout';
import { cn } from '@/lib/utils';

const MAX_ITEMS = ITEM_CAPS.links;

type BlockItem = Tables<'block_items'>;

const VALID_SIZES = ['big', 'medium', 'small', 'button'] as const;
type ItemSize = typeof VALID_SIZES[number];

function parseSize(value: string | null | undefined): ItemSize {
  return (VALID_SIZES as readonly string[]).includes(value || '')
    ? (value as ItemSize)
    : 'big';
}

// (button shapes moved to src/lib/button-shapes.ts — now a GLOBAL theme setting)

// Accept bare web domains (FL.12). When the input looks like a web URL/domain
// WITHOUT a protocol, prepend "https://" so users need not type it. Leaves
// already-schemed URLs, emails, and phone numbers untouched — phone/email
// handling is unchanged. The scheme class excludes "." so a bare domain with a
// port ("x.com:8080") is still normalized rather than mistaken for a scheme.
function normalizeUrl(raw: string | null | undefined): string {
  const v = (raw || '').trim();
  if (!v) return v;
  if (/^[a-z][a-z0-9+-]*:/i.test(v)) return v; // already has a scheme (https://, mailto:, tel:)
  if (v.includes('@')) return v;               // email
  if (/^[\d+\-\s()]+$/.test(v)) return v;       // phone (digits / + / - / spaces / parens)
  if (v.includes('.')) return `https://${v}`;   // bare web domain
  return v;
}

// Title is optional — when empty, fall back to the URL's hostname so the card
// is not blank (FL.11). Tolerates a missing protocol; strips a leading "www.".
function labelFromUrl(url: string | null | undefined): string {
  const raw = (url || '').trim();
  if (!raw) return 'Link';
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return raw;
  }
}

interface LinksBlockConfig {
  style: BlockStyleConfig;
}

export interface LinkItem {
  id: string;
  label: string;
  url: string;
  subtitle?: string;
  badge?: string;
  is_adult?: boolean;
  image_url?: string | null;
  size?: 'big' | 'medium' | 'small' | 'button';
  bg_color?: string | null;
  title_color?: string | null;
  style_json?: Record<string, any> | null;
}

// Text input with a clear (X) button and an INSET focus ring. The shared Input's
// default focus ring is outset (ring-2 + ring-offset-2 = 4px beyond the box),
// which clips at the narrow slide-in panel's edges; ring-inset keeps the gold
// "editing" outline inside the box so it always fits. The X clears the field.
function ClearableInput({
  onClear,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { onClear: () => void }) {
  const hasValue = typeof props.value === 'string' && props.value.length > 0;
  return (
    <div className="relative">
      <Input className={cn('pr-9 focus-visible:ring-inset', className)} {...props} />
      {hasValue && (
        <button
          type="button"
          aria-label="Clear"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClear}
          className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function LinkDetailPanel({
  item,
  partnerItem,
  initialActiveSlot,
  isNew,
  blockStyle,
  onBack,
  onSave,
  onDelete,
  onDraftChange,
  panelMode,
  avatarUrl,
}: {
  item: LinkItem;
  partnerItem?: LinkItem | null;
  initialActiveSlot?: 'a' | 'b';
  isNew: boolean;
  blockStyle: BlockStyleConfig;
  onBack: () => void;
  onSave: (primary: LinkItem, partner: LinkItem | null) => void;
  onDelete: (id: string) => void;
  onDraftChange?: (item: LinkItem | null) => void;
  panelMode?: boolean;
  avatarUrl?: string;
}) {
  // Card A is the primary (left) item; Card B is the Small partner (right). The
  // tapped half is the initial active slot so editing starts where you clicked.
  const [cardA, setCardA] = useState<LinkItem>(item);
  const [cardB, setCardB] = useState<LinkItem | null>(partnerItem ?? null);
  const [activeSlot, setActiveSlot] = useState<'a' | 'b'>(
    initialActiveSlot === 'b' && partnerItem ? 'b' : 'a',
  );
  const [colorTab, setColorTab] = useState<'title' | 'background'>('background');
  const [colorOpen, setColorOpen] = useState(false);
  const [gradientStop, setGradientStop] = useState<'from' | 'to'>('from');
  const [unfurling, setUnfurling] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Cards vs Buttons is DERIVED from the primary card's size — a single
  // Big/Medium/Small/Button row drives the whole page (no separate tab).
  const sizeTab: 'cards' | 'buttons' = (cardA.size === 'medium' || cardA.size === 'button') ? 'buttons' : 'cards';

  // Pair mode is on whenever the primary card is Small: two half-width slots are
  // edited as a unit and the form below binds to whichever slot is active.
  const isPair = cardA.size === 'small';
  const activeIsB = activeSlot === 'b' && cardB != null;
  const activeKey: 'a' | 'b' = activeIsB ? 'b' : 'a';
  const active = activeIsB ? (cardB as LinkItem) : cardA;

  // Per-slot unfurl bookkeeping so each card auto-fills independently. lastUrl
  // marks the existing URL as already-seen; titleEdited/imageEdited freeze a
  // field once the user edits it this session.
  const unfurlState = useRef<Record<'a' | 'b', { lastUrl: string; titleEdited: boolean; imageEdited: boolean }>>({
    a: { lastUrl: normalizeUrl(item.url || ''), titleEdited: false, imageEdited: false },
    b: { lastUrl: normalizeUrl(partnerItem?.url || ''), titleEdited: false, imageEdited: false },
  });

  const setActive = (updater: (prev: LinkItem) => LinkItem) => {
    if (activeIsB) setCardB(prev => (prev ? updater(prev) : prev));
    else setCardA(updater);
  };
  const update = (field: keyof LinkItem, value: any) => {
    setActive(prev => ({ ...prev, [field]: value }));
  };

  // Choose the size for the whole link group (Card A). Picking Small opens pair
  // mode (Card B slot appears); any other size closes it and drops Card B.
  const pickSize = (key: 'big' | 'medium' | 'small' | 'button') => {
    setActiveSlot('a');
    if (key === 'small') {
      setCardA(prev => ({ ...prev, size: 'small' }));
    } else {
      setCardB(null);
      setCardA(prev => ({ ...prev, size: key }));
    }
  };

  // Tap the second slot: create an empty Small partner on first tap, then edit it.
  const selectSlotB = () => {
    if (!cardB) {
      setCardB({
        id: `new-${Date.now()}-${Math.random()}`,
        label: '', url: '', subtitle: '', badge: '',
        is_adult: false, image_url: null, size: 'small',
        bg_color: null, title_color: null, style_json: null,
      });
    }
    setActiveSlot('b');
  };

  // Swap left/right: exchange Card A and Card B content (ids travel with the
  // content, so on Save the swap persists as a reorder). The active highlight
  // stays on its side; the per-slot unfurl bookkeeping travels too.
  const swapCards = () => {
    if (!cardB) return;
    const a = cardA;
    const b = cardB;
    setCardA({ ...b, size: 'small' });
    setCardB({ ...a, size: 'small' });
    const t = unfurlState.current.a;
    unfurlState.current.a = unfurlState.current.b;
    unfurlState.current.b = t;
  };

  // Live-mirror the draft to the preview (single-card only). Pair mode suppresses
  // the partial mirror — the channel can't represent two cards — so the panel's
  // own two-slot preview shows the pair and the live preview refreshes on Save.
  useEffect(() => { onDraftChange?.(isPair ? null : cardA); }, [cardA, isPair]);
  useEffect(() => () => { onDraftChange?.(null); }, []);

  // --- unfurl: auto-fill title + image from the active card's URL (best-effort) ---
  const handleUnfurl = async () => {
    const st = unfurlState.current[activeKey];
    const normalized = normalizeUrl(active.url);
    if (!/^https?:\/\//i.test(normalized)) return;            // only real web URLs
    if (st.titleEdited && st.imageEdited && active.label.trim() && active.image_url) return; // user set both → nothing to auto-fill
    if (st.lastUrl === normalized) return;                    // already tried this exact URL
    st.lastUrl = normalized;

    setUnfurling(true);
    try {
      const { data, error } = await supabase.functions.invoke('unfurl', {
        body: { url: normalized },
      });
      if (error || !data) return;
      const meta = data as { title?: string | null; image?: string | null; description?: string | null };
      setActive(prev => {
        const next = { ...prev };
        // Auto-fill only fields the user hasn't touched. Once a field is edited
        // (including cleared), it's frozen — so a deleted title stays deleted.
        if (!st.titleEdited && meta.title && meta.title.trim()) next.label = meta.title.trim();
        if (!st.imageEdited && meta.image) next.image_url = meta.image;
        // Subtitle is user-only — never auto-filled from the link's OG description (it's optional).
        return next;
      });
    } catch {
      /* silent — autofill is best-effort, never blocks the user */
    } finally {
      setUnfurling(false);
    }
  };

  // Auto-unfurl as the user types (Link.me-style): when typing pauses and the
  // active card's URL looks like a complete domain, fetch metadata. handleUnfurl's
  // per-slot guards prevent duplicate fetches and never overwrite user fields.
  useEffect(() => {
    const candidate = (active.url || '').trim();
    if (!/\.[a-z]{2,}([/:?#].*)?$/i.test(candidate)) return;
    const id = setTimeout(() => { handleUnfurl(); }, 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.url, activeSlot]);

  // Per-link style overrides live on block_items.style_json (additive — any
  // future keys are preserved). Writing null removes the key; empty → null.
  const setStyleField = (key: string, value: string | number | boolean | Record<string, unknown> | null) => {
    setActive(prev => {
      const next: Record<string, any> = { ...(prev.style_json || {}) };
      if (value === null) delete next[key];
      else next[key] = value;
      return { ...prev, style_json: Object.keys(next).length ? next : null };
    });
  };

  // Per-card preview theme/style — mirror LinksBlock's per-item overrides so the
  // slot previews match the live profile: bg_color → fill, title_color → text.
  // Per-link gradient → CSS string (135deg, start→end). Mirrors LinksBlock.
  const gradFor = (c: LinkItem): string | undefined => {
    const g = (c.style_json as Record<string, any> | null)?.bg_gradient as { from?: string; to?: string } | undefined;
    return g ? `linear-gradient(135deg, ${g.from || '#C9A55C'}, ${g.to || '#5B3FA0'})` : undefined;
  };
  const themeFor = (c: LinkItem) => {
    const g = (c.style_json as Record<string, any> | null)?.bg_gradient as { from?: string } | undefined;
    const fillBase = c.bg_color || g?.from;
    return (fillBase || c.title_color)
      ? {
          ...DEFAULT_THEME,
          buttons: {
            ...DEFAULT_THEME.buttons,
            ...(fillBase ? { fill_color: fillBase } : {}),
            ...(c.title_color ? { text_color: c.title_color } : {}),
          },
        }
      : DEFAULT_THEME;
  };
  const blockStyleFor = (c: LinkItem): Partial<BlockStyleConfig> => {
    const cj = c.style_json || {};
    const filled = !!c.bg_color || !!gradFor(c);
    return {
      ...blockStyle,
      ...(cj.border_width != null ? { border_width: cj.border_width } : {}),
      ...(cj.border_color ? { border_color: cj.border_color } : {}),
      ...(filled ? { variant: 'filled' as const, background_opacity: 1 } : {}),
    };
  };
  const previewTheme = themeFor(active);
  const previewBlockStyle = blockStyleFor(active);

  // One small slot in the pair preview: a filled card (cover + title + camera) or
  // an "add second" placeholder. Tapping the body selects the slot as active.
  const renderPairSlot = (card: LinkItem | null, slot: 'a' | 'b') => {
    const isActiveSlot = (slot === 'b') === activeIsB;
    if (!card) {
      return (
        <button
          type="button"
          onClick={selectSlotB}
          className="relative aspect-[4/3] w-full rounded-[14px] border-2 border-dashed border-[#C9A55C]/40 bg-[#C9A55C]/5 flex flex-col items-center justify-center gap-1 text-[#C9A55C] hover:bg-[#C9A55C]/10 transition-colors"
        >
          <Plus className="h-6 w-6" />
          <span className="text-xs font-semibold">Add second</span>
        </button>
      );
    }
    return (
      <ThumbnailUpload
        value={card.image_url}
        onChange={(url) => {
          unfurlState.current[slot].imageEdited = true;
          if (slot === 'b') setCardB(prev => (prev ? { ...prev, image_url: url } : prev));
          else setCardA(prev => ({ ...prev, image_url: url }));
        }}
        renderTrigger={({ open, uploading }) => (
          <div
            onClick={() => setActiveSlot(slot)}
            className="relative aspect-[4/3] w-full overflow-hidden rounded-[14px] cursor-pointer"
          >
            {card.image_url ? (
              <img src={card.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(180deg, rgba(201,165,92,0.10) 0%, rgba(255,255,255,0.02) 100%)' }}
              />
            )}
            {/* Title only when set — a deleted title shows no overlay, matching
                the live card; positioned bottom-left like the reference. */}
            {card.label && (
              <div
                className="absolute inset-x-0 bottom-0 px-2.5 pb-2 pt-6 text-left"
                style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.72) 72%, rgba(0,0,0,0.85) 100%)' }}
              >
                <span className="text-[13px] font-bold text-white" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
                  {card.label}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setActiveSlot(slot); open(); }}
              disabled={uploading}
              aria-label={card.image_url ? 'Replace image' : 'Add image'}
              className="absolute top-1.5 left-1.5 h-7 w-7 rounded-full bg-black/55 border border-white/20 backdrop-blur-sm flex items-center justify-center text-white disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </button>
            {/* Active-slot highlight as an INSET frame (drawn on top, inside the
                card) so it never overflows/clips the panel edge like an outset
                ring would — cards stay at the exact live grid size. */}
            {isActiveSlot && (
              <div className="pointer-events-none absolute inset-0 z-[2] rounded-[14px] ring-2 ring-inset ring-[#C9A55C]" />
            )}
          </div>
        )}
      />
    );
  };

  // (size options now come from the single Big/Medium/Small/Button row below)
  // A card is "started" if it has any of URL / title / image — used to detect a
  // half-filled pair on Save.
  const cardHasContent = (c: LinkItem | null) =>
    !!c && (!!c.url.trim() || !!c.label.trim() || !!c.image_url);

  // Save: a complete pair saves both. A half-filled pair (one card blank) asks
  // the user to fill the other or fall back to a single large card. Otherwise
  // it saves as one item.
  const handleSave = () => {
    if (isPair) {
      const aHas = cardHasContent(cardA);
      const bHas = cardHasContent(cardB);
      if (aHas && bHas) { onSave(cardA, cardB as LinkItem); return; }
      if (aHas !== bHas) { setConfirmRevert(true); return; }
    }
    onSave(cardA, null);
  };

  // Confirmed "save as large": persist the one filled card as a full-width Big.
  const proceedRevert = () => {
    setConfirmRevert(false);
    const filled = cardHasContent(cardA) ? cardA : (cardB as LinkItem);
    onSave({ ...filled, size: 'big' }, null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* One-page editor: the Big/Medium/Small/Button row drives Cards vs
          Buttons (no tab). Delete lives at the bottom. */}

      <ScrollArea className={panelMode ? 'flex-1 px-4' : 'flex-1 -mx-6 px-6'}>
        <div className="space-y-2.5">
          {/* Live Preview. Pair mode → two Small slots side-by-side with a swap
              control between them. Otherwise the single-card preview (EMPTY
              big/medium/small show a TitiLinks-brand placeholder; once an image
              exists, or size=button, it renders the real LinkButton).
              ThumbnailUpload still owns the hidden input + upload via open(). */}
          {isPair ? (
            <div className="relative w-full" style={{ aspectRatio: '16 / 10' }}>
              <div className="absolute inset-0 flex flex-col justify-center">
                <div className="relative">
                {/* Same grid as the live page (lb-row): two equal columns, 10px
                    gap — so the cards size/space exactly as they render live. */}
                <div className="grid grid-cols-2 gap-2.5">
                  {renderPairSlot(cardA, 'a')}
                  {renderPairSlot(cardB, 'b')}
                </div>
                {/* Swap floats centered over the gap, slightly overlapping both
                    cards, so it never changes the cards' size or spacing. */}
                <button
                  type="button"
                  onClick={swapCards}
                  disabled={!cardB}
                  aria-label="Swap cards"
                  className="absolute left-1/2 top-1/2 z-10 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0e0c09] bg-[#C9A55C] shadow-lg shadow-black/40 flex items-center justify-center text-[#0e0c09] disabled:opacity-40 hover:bg-[#d9b86c] transition-colors"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-2 text-sm text-center text-[#C9A55C]">
                {!cardB
                  ? 'Now add your second small card link →'
                  : activeIsB
                  ? 'Editing the right card'
                  : 'Editing the left card'}
              </p>
              </div>
            </div>
          ) : sizeTab === 'buttons' ? (
            // Buttons: a compact live button preview — no image upload, no camera,
            // natural height. The leading icon defaults to the platform glyph.
            <div className="flex w-full justify-center py-3">
              <div className="w-full max-w-[300px]">
                <LinkButton
                  as="button"
                  type="button"
                  theme={previewTheme}
                  blockStyle={previewBlockStyle}
                  fillGradient={gradFor(active)}
                  titleColor={active.title_color || undefined}
                  title={active.label || 'Title'}
                  size={active.size === 'medium' ? 'medium' : 'button'}
                  socialIcon={leadingIconFor({
                    url: active.url,
                    iconSource: active.style_json?.icon_source as string | undefined,
                    hasImage: false,
                    avatarUrl,
                    iconColor: active.style_json?.icon_color as string | undefined,
                  })}
                  onClick={(e) => e.preventDefault()}
                />
              </div>
            </div>
          ) : (
          <ThumbnailUpload
            value={active.image_url}
            onChange={(url) => { unfurlState.current[activeKey].imageEdited = true; update('image_url', url); }}
            renderTrigger={({ open, uploading }) => {
              const noImage = !active.image_url;
              const isCover = active.size === 'big' || active.size === 'small';
              const camBtn = (px: number, small: boolean) => (
                <button
                  type="button"
                  onClick={open}
                  disabled={uploading}
                  aria-label={noImage ? 'Add image' : 'Replace image'}
                  style={{ height: px, width: px }}
                  className="rounded-full bg-black/50 border border-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors disabled:opacity-60"
                >
                  {uploading
                    ? <Loader2 className={small ? 'h-4 w-4 animate-spin' : 'h-5 w-5 animate-spin'} />
                    : <Camera className={small ? 'h-4 w-4' : 'h-5 w-5'} />}
                </button>
              );
              const placeholderBg =
                'linear-gradient(180deg, rgba(201,165,92,0.10) 0%, rgba(255,255,255,0.02) 100%)';

              let body: React.ReactNode;

              if (noImage && isCover) {
                // Empty Big/Small → cover-shaped brand placeholder
                body = (
                  <div
                    className="relative w-full overflow-hidden border border-white/10"
                    style={{
                      aspectRatio: active.size === 'big' ? '16 / 10' : '16 / 7',
                      borderRadius: active.size === 'big' ? 16 : 14,
                      background: placeholderBg,
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      {camBtn(48, false)}
                    </div>
                    <div
                      className={active.size === 'big'
                        ? 'absolute left-4 right-4 bottom-3 text-left'
                        : 'absolute inset-x-0 bottom-3 px-4 text-center'}
                    >
                      <span
                        className="font-bold text-white/90"
                        style={{
                          fontSize: active.size === 'big' ? 17 : 15,
                          textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                        }}
                      >
                        {active.label || 'Title'}
                      </span>
                    </div>
                    <div className="absolute top-2 left-2 z-10">{camBtn(30, true)}</div>
                  </div>
                );
              } else if (noImage && active.size === 'medium') {
                // Empty Medium → row placeholder with a SQUARE (1:1) thumb slot
                body = (
                  <div
                    className="w-full flex items-center gap-3 border border-white/10 px-3 py-3"
                    style={{ borderRadius: 14, background: placeholderBg }}
                  >
                    <button
                      type="button"
                      onClick={open}
                      disabled={uploading}
                      aria-label="Add image"
                      className="shrink-0 h-12 w-12 rounded-[10px] bg-black/40 border border-white/20 flex items-center justify-center text-white hover:bg-black/60 transition-colors disabled:opacity-60"
                    >
                      {uploading
                        ? <Loader2 className="h-5 w-5 animate-spin" />
                        : <Camera className="h-5 w-5" />}
                    </button>
                    <span className="font-semibold text-white/90 text-[15px]">
                      {active.label || 'Title'}
                    </span>
                  </div>
                );
              } else {
                // Button (no image) or any size WITH image → real LinkButton + corner camera
                body = (
                  <div className="relative w-full flex items-center justify-center">
                    <LinkButton
                      as="button"
                      type="button"
                      theme={previewTheme}
                      blockStyle={previewBlockStyle}
                      titleColor={active.title_color || undefined}
                      title={active.label || 'Title'}
                      subtitle={active.subtitle || undefined}
                      media={active.image_url ? { kind: 'image', src: active.image_url } : undefined}
                      socialIcon={leadingIconFor({
                        url: active.url,
                        iconSource: active.style_json?.icon_source as string | undefined,
                        hasImage: !!active.image_url,
                        avatarUrl,
                      })}
                      meta={
                        active.is_adult && active.badge
                          ? `18+ · ${active.badge}`
                          : active.is_adult
                          ? '18+'
                          : active.badge
                          ? active.badge
                          : undefined
                      }
                      size={active.size}
                      onClick={(e) => e.preventDefault()}
                    />
                    <div className="absolute top-2 left-2 z-10">{camBtn(30, true)}</div>
                  </div>
                );
              }

              // Fixed footprint: always reserve the Big placeholder's 16/10
              // height so switching sizes never resizes the preview area; the
              // active card/placeholder is centered inside it.
              return (
                <div className="relative w-full" style={{ aspectRatio: '16 / 10' }}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    {body}
                  </div>
                </div>
              );
            }}
          />
          )}
          {/* Size — ONE row of Big / Medium / Small / Button drives the whole
              page (Cards vs Buttons is derived from this; no tabs). */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Style</p>
            <div className="grid grid-cols-4 gap-2">
              {([
                { key: 'big', label: 'Big' },
                { key: 'medium', label: 'Medium' },
                { key: 'small', label: 'Small' },
                { key: 'button', label: 'Button' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => pickSize(key)}
                  className={`py-2 text-xs font-semibold rounded-lg border-2 transition-all ${
                    cardA.size === key
                      ? 'border-[#C9A55C] bg-[#C9A55C]/10 text-[#C9A55C]'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* Button shape is now GLOBAL — set in Design → Buttons. */}

          {/* Cards-only: a Big/Small with no image falls back to a button. */}
          {sizeTab === 'cards' && (
            <p
              aria-hidden={!((active.size === 'big' || active.size === 'small') && !active.image_url)}
              className={`text-sm text-[#C9A55C] ${
                (active.size === 'big' || active.size === 'small') && !active.image_url
                  ? ''
                  : 'invisible'
              }`}
            >
              This will display as a button because there's no image. Add an image to use the{' '}
              {active.size === 'big' ? 'large' : 'small'} thumbnail.
            </p>
          )}

          {/* URL Input */}
          <div className="space-y-1">
            <Label className="text-sm">Link, phone number, or email</Label>
            <ClearableInput
              value={active.url}
              onChange={(e) => update('url', e.target.value)}
              onBlur={handleUnfurl}
              onClear={() => update('url', '')}
              placeholder="https://..."
              className="h-10"
            />
            {unfurling && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Fetching link details…</span>
              </div>
            )}
          </div>

          {/* Title Input */}
          <div className="space-y-1">
            <Label className="text-sm">Title</Label>
            <ClearableInput
              value={active.label}
              onChange={(e) => { unfurlState.current[activeKey].titleEdited = true; update('label', e.target.value); }}
              onClear={() => { unfurlState.current[activeKey].titleEdited = true; update('label', ''); }}
              placeholder="My Link"
              className="h-10"
            />
          </div>

          {/* Customize Color — collapsible (Link.me style): Title / Background,
              an optional gradient on the button background, and an inline picker. */}
          {(() => {
            const grad = active.style_json?.bg_gradient as { from?: string; to?: string } | undefined;
            const gradientOn = !!grad;
            const isButtons = sizeTab === 'buttons';
            const editingBg = isButtons && colorTab === 'background';
            const solidField: 'title_color' | 'bg_color' = editingBg ? 'bg_color' : 'title_color';
            const setGradient = (next: { from?: string; to?: string } | null) => setStyleField('bg_gradient', next);
            return (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setColorOpen((o) => !o)}
                  className="flex w-full items-center justify-between py-1"
                >
                  <span className="text-base font-semibold">Customize Color</span>
                  <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${colorOpen ? 'rotate-180' : ''}`} />
                </button>

                {colorOpen && (
                  <div className="space-y-3">
                    {/* Title | Background — buttons only (cards = title only). */}
                    {isButtons && (
                      <div className="flex rounded-lg overflow-hidden border border-border">
                        {(['title', 'background'] as const).map((tabKey) => (
                          <button
                            key={tabKey}
                            onClick={() => setColorTab(tabKey)}
                            className={`flex-1 py-2 text-sm font-medium transition-colors ${
                              colorTab === tabKey ? 'bg-secondary text-foreground' : 'text-muted-foreground'
                            }`}
                          >
                            {tabKey === 'title' ? 'Title' : 'Background'}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Color Gradient toggle — only for the button background. */}
                    {editingBg && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">Color Gradient</span>
                        <Switch
                          checked={gradientOn}
                          onCheckedChange={(on) =>
                            setGradient(on ? { from: active.bg_color || '#C9A55C', to: '#5B3FA0' } : null)
                          }
                        />
                      </div>
                    )}

                    {editingBg && gradientOn ? (
                      <>
                        <div
                          className="h-6 w-full rounded-md border border-border"
                          style={{ background: `linear-gradient(135deg, ${grad?.from || '#C9A55C'}, ${grad?.to || '#5B3FA0'})` }}
                        />
                        <div className="flex rounded-lg overflow-hidden border border-border">
                          {(['from', 'to'] as const).map((stop) => (
                            <button
                              key={stop}
                              onClick={() => setGradientStop(stop)}
                              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                                gradientStop === stop ? 'bg-secondary text-foreground' : 'text-muted-foreground'
                              }`}
                            >
                              {stop === 'from' ? 'Start' : 'End'}
                            </button>
                          ))}
                        </div>
                        <InlineColorPicker
                          value={grad?.[gradientStop] || (gradientStop === 'from' ? '#C9A55C' : '#5B3FA0')}
                          onChange={(c) => setGradient({ ...grad, [gradientStop]: c })}
                        />
                      </>
                    ) : (
                      <>
                        <InlineColorPicker
                          value={(active[solidField] as string | null) || (solidField === 'bg_color' ? '#C9A55C' : '#ffffff')}
                          onChange={(c) => update(solidField, c)}
                        />
                        <button
                          onClick={() => update(solidField, null)}
                          className="w-full py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-secondary"
                        >
                          No color
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Leading icon (buttons only) — the small glyph on the LEFT of a
              button. Default auto-detects the platform from the URL; creators can
              instead use their profile photo, or hide it. Stored on style_json. */}
          {sizeTab !== 'cards' && (
            <div className="space-y-2">
              <p className="text-base font-semibold">Leading icon</p>
              <div className="flex rounded-lg overflow-hidden border border-border">
                {([
                  { key: 'platform', label: 'Platform' },
                  { key: 'avatar', label: 'Photo' },
                  { key: 'none', label: 'None' },
                ] as const).map(({ key, label }) => {
                  const current = (active.style_json?.icon_source as string | undefined) || 'platform';
                  const selected = current === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setStyleField('icon_source', key === 'platform' ? null : key)}
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${
                        selected ? 'bg-secondary text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Photo uses your own profile picture.
              </p>
            </div>
          )}

          {/* Icon color (buttons, platform glyph) — Brand keeps each platform's
              own color; White/Black force it monochrome (like Manage Platforms). */}
          {sizeTab !== 'cards' && ((active.style_json?.icon_source as string | undefined) || 'platform') === 'platform' && (
            <div className="space-y-2">
              <p className="text-base font-semibold">Icon color</p>
              <div className="flex rounded-lg overflow-hidden border border-border">
                {([
                  { key: 'brand', label: 'Brand' },
                  { key: 'white', label: 'White' },
                  { key: 'black', label: 'Black' },
                ] as const).map(({ key, label }) => {
                  const current = (active.style_json?.icon_color as string | undefined) || 'brand';
                  const selected = current === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setStyleField('icon_color', key === 'brand' ? null : key)}
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${
                        selected ? 'bg-secondary text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-link Border — stored on block_items.style_json (additive;
              takes precedence over the block-level Style Variants border) */}
          <div className="space-y-3">
            <p className="text-base font-semibold">Border</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">
                  Width ({(active.style_json?.border_width as number | undefined) ?? 0}px)
                </Label>
                <Slider
                  value={[(active.style_json?.border_width as number | undefined) ?? 0]}
                  onValueChange={([v]) => setStyleField('border_width', v)}
                  min={0}
                  max={4}
                  step={1}
                  className="py-2"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Color</Label>
                <div className="flex gap-2 items-center">
                  <ColorPicker
                    value={(active.style_json?.border_color as string | undefined) || '#C9A55C'}
                    onChange={(c) => setStyleField('border_color', c)}
                  />
                  <button
                    onClick={() => setStyleField('border_color', null)}
                    className="flex-1 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-secondary"
                  >
                    None
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 18+ Toggle */}
          <div className="flex items-center justify-between py-3 border-t border-border">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-normal text-muted-foreground">
                18+ Link
              </Label>
            </div>
            <Switch
              checked={active.is_adult || false}
              onCheckedChange={(checked) => update('is_adult', checked)}
            />
          </div>

          {/* Animations PRO Upsell — on-brand locked state (visual only) */}
          <div className="rounded-xl border border-[#C9A55C]/30 bg-black/30 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#C9A55C]/20">
              <div>
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-[#C9A55C]" />
                  <p className="text-base font-semibold text-white">Animations</p>
                </div>
                <p className="text-sm text-white/70">
                  Add motion to your link to draw attention.
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-white/50" />
            </div>
            <div className="p-4">
              <p className="text-sm text-white/90 mb-3">
                Animations are part of TitiLinks Pro. Upgrade to unlock
                motion effects for your links.
              </p>
              <button className="w-full py-2 text-sm font-semibold rounded-lg bg-[#C9A55C] text-[#0e0c09] hover:bg-[#C9A55C]/90 transition-colors">
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Save button */}
      <div className="pt-3 mt-3 border-t border-border">
        {confirmRevert && (
          <div className="mb-3 rounded-xl border border-[#C9A55C]/40 bg-[#1a160f] px-3 py-3">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#C9A55C]" />
              <p className="text-[13px] leading-snug text-white/85">
                Only one card is filled in. Fill out the second small card to keep
                the pair — otherwise it saves as a single large card.
              </p>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRevert(false)}
                className="rounded-md border border-white/20 px-3 py-1.5 text-[13px] font-medium text-white/80 hover:text-white hover:border-white/40 transition-colors"
              >
                Fill out second card
              </button>
              <button
                type="button"
                onClick={proceedRevert}
                className="rounded-md bg-[#C9A55C] px-3 py-1.5 text-[13px] font-semibold text-[#0e0c09] hover:bg-[#C9A55C]/90 transition-colors"
              >
                Save as large
              </button>
            </div>
          </div>
        )}
        <Button
          onClick={handleSave}
          className="w-full gradient-primary text-primary-foreground"
        >
          {isPair && cardB
            ? (isNew ? 'Add pair' : 'Update pair')
            : (isNew ? 'Add' : 'Update')}
        </Button>
        {/* Delete — labeled + confirm (replaces the confusing header trashcan). */}
        {!active.id.startsWith('new-') && (
          confirmDelete ? (
            <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
              <p className="mb-2 text-[13px] text-white/85">Delete this link? This can't be undone.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-md border border-white/20 py-1.5 text-[13px] font-medium text-white/80 hover:border-white/40 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(active.id)}
                  className="flex-1 rounded-md bg-destructive py-1.5 text-[13px] font-semibold text-white hover:bg-destructive/90 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="mt-2 flex w-full items-center justify-center gap-2 py-2 text-sm font-medium text-destructive hover:text-destructive/80 transition-colors"
            >
              <Trash2 className="h-4 w-4" /> Delete link
            </button>
          )
        )}
      </div>
    </div>
  );
}

interface LinksEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
  /**
   * Direct single-item entry (grouped-model G1). When set, the editor opens
   * straight into LinkDetailPanel for ONE item and persists just that item
   * on Save (create-on-save for new). Dormant until a caller passes them
   * (e.g. preview taps in G2); the list view is unaffected when unset.
   */
  directItemId?: string | null;
  directNew?: boolean;
  /**
   * Live-mirror channel (L2): fires with the in-progress draft on every edit
   * and with null on panel unmount, so the parent can reflect unsaved changes
   * in the preview before Save.
   */
  onDraftChange?: (item: LinkItem | null) => void;
  /** Creator's profile photo — offered as a per-link "leading icon" option. */
  avatarUrl?: string;
}

export function LinksEditor({ blockId, open, onOpenChange, onSave, panelMode, directItemId, directNew, onDraftChange, avatarUrl }: LinksEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<LinkItem[]>([]);
  const [existingItems, setExistingItems] = useState<BlockItem[]>([]);
  const [styleConfig, setStyleConfig] = useState<BlockStyleConfig>(DEFAULT_BLOCK_STYLE);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [editingItem, setEditingItem] = useState<LinkItem | null>(null);
  const [editingPartner, setEditingPartner] = useState<LinkItem | null>(null);
  const [editingInitialSlot, setEditingInitialSlot] = useState<'a' | 'b'>('a');
  const [isNewItem, setIsNewItem] = useState(false);

  // Direct single-item mode (G1): open straight into the detail panel.
  const directMode = directItemId != null || directNew === true;

  useEffect(() => {
    if (open) {
      fetchItems();
      if (!directMode) {
        setView('list');
        setEditingItem(null);
        setEditingPartner(null);
        setEditingInitialSlot('a');
      }
    }
  }, [open, blockId, directItemId, directNew]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      // Fetch block to get style config from title
      const { data: blockData, error: blockError } = await supabase
        .from('blocks')
        .select('title')
        .eq('id', blockId)
        .single();

      if (blockError) throw blockError;

      // Parse style config from title
      try {
        const parsed = JSON.parse(blockData?.title || '{}');
        if (parsed.style) {
          setStyleConfig({ ...DEFAULT_BLOCK_STYLE, ...parsed.style });
        } else {
          setStyleConfig(DEFAULT_BLOCK_STYLE);
        }
      } catch {
        setStyleConfig(DEFAULT_BLOCK_STYLE);
      }

      const { data, error } = await supabase
        .from('block_items')
        .select('*')
        .eq('block_id', blockId)
        .order('order_index', { ascending: true });

      if (error) throw error;

      setExistingItems(data || []);
      const mapped: LinkItem[] = (data || []).map((item) => ({
        id: item.id,
        label: item.label,
        url: item.url,
        subtitle: item.subtitle || '',
        badge: item.badge || '',
        is_adult: item.is_adult || false,
        image_url: item.image_url || null,
        size: parseSize(item.size),
        bg_color: item.bg_color ?? null,
        title_color: item.title_color ?? null,
        style_json: (item.style_json as Record<string, any> | null) ?? null,
      }));
      setItems(mapped);

      // Direct single-item entry (G1): jump straight to the detail panel.
      if (directNew) {
        setEditingItem({
          id: `new-${Date.now()}-${Math.random()}`,
          label: '',
          url: '',
          subtitle: '',
          badge: '',
          is_adult: false,
          image_url: null,
          size: 'big',
          bg_color: null,
          title_color: null,
          style_json: null,
        });
        setEditingPartner(null);
        setEditingInitialSlot('a');
        setIsNewItem(true);
        setView('detail');
      } else if (directItemId) {
        const found = mapped.find((i) => i.id === directItemId);
        if (found) {
          // If the tapped card is a paired Small, open the WHOLE pair in visual
          // order (earlier = left = Card A; later = right = Card B), regardless of
          // which half was tapped — so saving never silently swaps them. The
          // tapped half becomes the active slot.
          let primary = found;
          let partner: LinkItem | null = null;
          let slot: 'a' | 'b' = 'a';
          if (parseSize(found.size) === 'small') {
            const mate = findPartnerId(mapped, found.id, (s) => parseSize(s));
            if (mate) {
              const fi = mapped.findIndex((i) => i.id === found.id);
              const mi = mapped.findIndex((i) => i.id === mate.id);
              if (mi < fi) { primary = mate; partner = found; slot = 'b'; }
              else { primary = found; partner = mate; slot = 'a'; }
            }
          }
          setEditingItem({ ...primary });
          setEditingPartner(partner ? { ...partner } : null);
          setEditingInitialSlot(slot);
          setIsNewItem(false);
          setView('detail');
        } else {
          setView('list');
        }
      }
    } catch (error) {
      console.error('Error fetching items:', error);
      toast.error('Failed to load links');
    } finally {
      setLoading(false);
    }
  };

  // Direct single-item Delete (G1) closes the panel; this helper is retained
  // only for LinkDetailPanel's now-unreachable non-direct onDelete branch.
  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Shared payload shape for a single block_items row (used by the direct
  // single-item Save).
  const buildItemPayload = (item: LinkItem, orderIndex: number) => ({
    // Image cards (cover thumbnails) may have NO title — the image carries the
    // meaning, so a deleted title stays deleted. Only fall back to the hostname
    // when there's no image, so a plain button/text link is never left blank.
    label: item.label.trim() || (item.image_url ? '' : labelFromUrl(item.url)),
    url: normalizeUrl(item.url),
    subtitle: item.subtitle || null,
    badge: item.badge || null,
    is_adult: item.is_adult || false,
    image_url: item.image_url || null,
    size: item.size || null,
    bg_color: item.bg_color || null,
    title_color: item.title_color || null,
    style_json: (item.style_json && Object.keys(item.style_json).length > 0
      ? item.style_json
      : null) as Tables<'block_items'>['style_json'],
    order_index: orderIndex,
  });

  // Direct single-item Save (G1): persist ONLY this item. New → insert
  // (append); existing → update preserving its order_index. Validates just
  // this item; does not touch block.title style or sibling rows.
  const saveSingleItem = async (item: LinkItem) => {
    if (item.label.length > 100) {
      toast.error('Title must be less than 100 characters');
      return;
    }
    const urlError = validateUrl(normalizeUrl(item.url));
    if (urlError) {
      toast.error(urlError);
      return;
    }

    setSaving(true);
    try {
      if (item.id.startsWith('new-')) {
        const payload = buildItemPayload(item, items.length);
        const { error } = await supabase
          .from('block_items')
          .insert({ block_id: blockId, ...payload });
        if (error) throw error;
      } else {
        const existing = existingItems.find((ei) => ei.id === item.id);
        const orderIndex = existing ? existing.order_index : items.length;
        const payload = buildItemPayload(item, orderIndex);
        const { error } = await supabase
          .from('block_items')
          .update(payload)
          .eq('id', item.id);
        if (error) throw error;
      }
      toast.success('Link saved');
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving link:', error);
      toast.error(error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Upsert one item row, returning its id (insert for new-, update for existing).
  const upsertItem = async (item: LinkItem, fallbackOrder: number): Promise<string> => {
    if (item.id.startsWith('new-')) {
      const payload = buildItemPayload(item, fallbackOrder);
      const { data, error } = await supabase
        .from('block_items')
        .insert({ block_id: blockId, ...payload })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    }
    const existing = existingItems.find((ei) => ei.id === item.id);
    const orderIndex = existing ? existing.order_index : fallbackOrder;
    const payload = buildItemPayload(item, orderIndex);
    const { error } = await supabase.from('block_items').update(payload).eq('id', item.id);
    if (error) throw error;
    return item.id;
  };

  // Small-pair Save: persist both cards (forced size 'small'), then rewrite the
  // block's item order so B sits immediately after A — consecutive Smalls pair
  // per the shared rule, and a swap in the panel persists as this reorder.
  const saveSmallPair = async (a: LinkItem, b: LinkItem) => {
    for (const it of [a, b]) {
      if (it.label.length > 100) { toast.error('Title must be less than 100 characters'); return; }
      const urlError = validateUrl(normalizeUrl(it.url));
      if (urlError) { toast.error(urlError); return; }
    }
    setSaving(true);
    try {
      const aId = await upsertItem({ ...a, size: 'small' }, items.length);
      const bId = await upsertItem({ ...b, size: 'small' }, items.length + 1);

      // Re-fetch current order, drop B, reinsert right after A, rewrite indices.
      const { data, error } = await supabase
        .from('block_items')
        .select('id')
        .eq('block_id', blockId)
        .order('order_index', { ascending: true });
      if (error) throw error;
      const ids = (data || []).map((r) => (r as { id: string }).id).filter((id) => id !== bId);
      const aIdx = ids.indexOf(aId);
      ids.splice(aIdx >= 0 ? aIdx + 1 : ids.length, 0, bId);
      for (let i = 0; i < ids.length; i++) {
        await supabase.from('block_items').update({ order_index: i }).eq('id', ids[i]);
      }

      toast.success('Cards saved');
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving cards:', error);
      toast.error(error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Direct single-item Delete (G1): a never-persisted new item just closes;
  // an existing item is removed from block_items.
  const deleteSingleItem = async (itemId: string) => {
    if (itemId.startsWith('new-')) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('block_items').delete().eq('id', itemId);
      if (error) throw error;
      toast.success('Link deleted');
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error deleting link:', error);
      toast.error(error.message || 'Failed to delete');
    } finally {
      setSaving(false);
    }
  };

  const innerContent = (
    <>
      {view === 'detail' && editingItem ? (
        <LinkDetailPanel
          key={editingItem.id}
          item={editingItem}
          partnerItem={editingPartner}
          initialActiveSlot={editingInitialSlot}
          isNew={isNewItem}
          blockStyle={styleConfig}
          onDraftChange={onDraftChange}
          panelMode={panelMode}
          avatarUrl={avatarUrl}
          onBack={directMode
            ? () => onOpenChange(false)
            : () => { setView('list'); setEditingItem(null); }}
          onSave={directMode
            ? (primary, partner) => { if (partner) saveSmallPair(primary, partner); else saveSingleItem(primary); }
            : (primary) => {
                if (isNewItem) {
                  setItems(prev => [...prev, primary]);
                } else {
                  setItems(prev => prev.map(i => i.id === primary.id ? primary : i));
                }
                setView('list');
                setEditingItem(null);
              }}
          onDelete={directMode
            ? (id) => { deleteSingleItem(id); }
            : (id) => { deleteItem(id); setView('list'); setEditingItem(null); }}
        />
      ) : (
        <>
          {!panelMode && (
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5 text-primary" />
                Edit Links
              </DialogTitle>
              <DialogDescription>
                Add custom links to display on your page.
              </DialogDescription>
            </DialogHeader>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            // Links are edited entirely in the live preview now (tap a card,
            // "+ Add link", grip to reorder, X to delete). The block-level list
            // view and Style Variants editor were retired (G5); links always
            // open straight into LinkDetailPanel via directMode, so this branch
            // is only briefly reachable during the initial load and renders
            // nothing. styleConfig is still parsed/passed to the detail panel.
            <div className="flex flex-col flex-1 min-h-0" />
          )}
        </>
      )}
    </>
  );

  if (panelMode) {
    return (
      <div className="flex flex-col h-full bg-[#0e0c09] text-white overflow-y-auto px-4 py-4">
        {innerContent}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
