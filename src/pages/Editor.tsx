import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { DEVICE_PRESETS, DEFAULT_DEVICE_ID, resolveDevicePreset } from '@/lib/device-presets';
import type { HeroFraming } from '@/lib/hero-framing';
import { Loader2, Eye, Pencil } from 'lucide-react';
import { AdultGateModal } from '@/components/AdultGateModal';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { Navigate } from 'react-router-dom';
import { EditableProfileView } from '@/components/EditableProfileView';
import { useEntitlements } from '@/hooks/useEntitlements';
import { ProfileDashboard, type EditingBlockTarget } from '@/components/ProfileDashboard';
import type { LinkItem } from '@/components/editors/LinksEditor';
import type { HeaderDraft } from '@/lib/header-draft';
import { planLinkLayout, type ItemSize } from '@/lib/link-layout';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

type Page = Tables<'pages'>;
type Mode = Tables<'modes'> & { sticky_cta_enabled?: boolean };
type Block = Tables<'blocks'>;
type BlockItem = Tables<'block_items'>;

interface BlockWithItems extends Block {
  items: BlockItem[];
}

// The REAL theme type (background/buttons/typography/motion) — aliased
// because the local skeleton below shares its name. The L5 draft must
// use this one: it flows into EditableProfileView's themeDraft prop.
import type { ThemeJson as FullThemeJson } from '@/lib/theme-defaults';

// Local skeleton: only the keys this page reads off raw theme_json
// (autoPopulatePlaceholders). NOT the real ThemeJson — do not pass
// values typed with this into theme-consuming components.
interface ThemeJson {
  pages?: {
    page1?: { label?: string };
    page2?: { label?: string };
  };
  linkLayout?: string;
  linkCount?: number;
  [key: string]: unknown;
}

export default function Editor() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { can } = useEntitlements();
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page | null>(null);
  const [modes, setModes] = useState<Mode[]>([]);
  const [selectedMode, setSelectedMode] = useState<'page1' | 'page2'>('page1');
  const [editingBlock, setEditingBlock] = useState<EditingBlockTarget | null>(null);
  const [allBlocks, setAllBlocks] = useState<BlockWithItems[]>([]);
  const [profileDashboardOpen, setProfileDashboardOpen] = useState(false);
  // Opens the dashboard straight to the Video Profile menu (hero video pencil).
  const [openVideoProfile, setOpenVideoProfile] = useState(false);
  // PHOTO.ROUTE.1: "open the photo editor" request counters. Two of them because
  // BOTH EditableProfileView instances below stay mounted (desktop `hidden lg:block`
  // + mobile `lg:hidden` — CSS picks the visible one), and a request that reached
  // both would race two hidden file inputs for the one picker the browser allows.
  //
  // FIX.MEDIA.1 removed the only caller along with the Video Profile menu's photo
  // button — a photo's home is the camera on the hero. The counters stay wired to
  // both instances so a future external surface can re-open the flow: increment
  // the one matching the live breakpoint, read imperatively at call time (never
  // held as state, or a window resize re-delivers to the wrong instance).
  const [photoRequestDesktop, setPhotoRequestDesktop] = useState(0);
  const [photoRequestMobile, setPhotoRequestMobile] = useState(0);
  // Live-mirror (L2): the editor panel's in-progress draft, scoped to its block.
  const [draftItem, setDraftItem] = useState<{ blockId: string; item: LinkItem } | null>(null);
  // Live-mirror (L3): the editor's in-progress block.title config (Text/Bio), scoped to its block.
  const [draftTitle, setDraftTitle] = useState<{ blockId: string; title: string } | null>(null);
  // Live-mirror (L4): the Name & Handle hub's in-progress header edits. Page-scoped,
  // so unlike L2/L3 there's no block to pin it to — it goes straight to the preview.
  const [headerDraft, setHeaderDraft] = useState<HeaderDraft | null>(null);
  // Live-mirror (L5): the Customize Profile panel's in-progress theme. Whole-object
  // replace on every mutation, unlike L4's per-field patches.
  const [themeDraft, setThemeDraft] = useState<FullThemeJson | null>(null);

  // ── DP.1: device-truthful preview frame ──
  // The desktop preview renders at a real device's LOGICAL CSS viewport
  // (src/lib/device-presets.ts) instead of a made-up 390×844 box, so what the
  // user composes matches what phones actually show. Selection persists.
  const devicePrefKey = 'titilinks-editor-device';
  const [deviceId, setDeviceId] = useState<string>(
    () => resolveDevicePreset(localStorage.getItem(devicePrefKey)).id
  );
  const devicePreset = resolveDevicePreset(deviceId);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);

  // ── DP.2: visitor-preview toggle ──
  // 'edit' shows the WYSIWYG editing chrome; 'visitor' renders the same shared
  // EditableProfileView in view mode (editMode=false) — exactly what a visitor
  // gets, including public 18+ gating (stripped hrefs + tap-to-gate). Session-
  // only on purpose: it resets to 'edit' on reload so the editor never boots into
  // a read-only surface. The device selector stays live in both modes.
  const [previewMode, setPreviewMode] = useState<'edit' | 'visitor'>('edit');
  // The gated destination pending an 18+ confirmation in visitor mode. Mirrors
  // the public route's handler, but opens in a new tab so the editor stays put.
  const [pendingGate, setPendingGate] = useState<{ url: string } | null>(null);
  const isVisitor = previewMode === 'visitor';

  useEffect(() => {
    try { localStorage.setItem(devicePrefKey, deviceId); } catch { /* storage disabled */ }
  }, [deviceId]);

  // Scale the frame uniformly to fit the preview column (never magnify past
  // 100%). Recomputes on column resize — including the dashboard panel opening,
  // which narrows the column — and on preset change.
  useEffect(() => {
    const el = previewAreaRef.current;
    if (!el) return;
    const fitPad = 24; // px of breathing room around the frame
    const compute = () => {
      const availW = el.clientWidth - fitPad * 2;
      const availH = el.clientHeight - fitPad * 2;
      if (availW <= 0 || availH <= 0) return;
      const s = Math.min(availW / devicePreset.width, availH / devicePreset.height, 1);
      setPreviewScale(s > 0 ? s : 1);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [devicePreset.width, devicePreset.height]);

  // ── Data Fetching ──

  const autoPopulatePlaceholders = async (pageData: Page, modesData: Mode[]) => {
    const theme = pageData.theme_json as ThemeJson;
    if (!theme?.linkLayout || !theme?.linkCount) return;

    const shopMode = modesData.find((m) => m.type === 'page1');
    if (!shopMode) return;

    const targetBlockType = theme.linkLayout === 'gallery' ? 'product_cards' : 'links';

    const { data: targetBlock } = await supabase
      .from('blocks')
      .select('id')
      .eq('mode_id', shopMode.id)
      .eq('type', targetBlockType)
      .maybeSingle();

    if (!targetBlock) return;

    const { data: existingItems } = await supabase
      .from('block_items')
      .select('id')
      .eq('block_id', targetBlock.id)
      .limit(1);

    if (existingItems && existingItems.length > 0) return;

    const count = theme.linkLayout === 'featured' ? theme.linkCount - 1 : theme.linkCount;
    const placeholderItems = Array.from({ length: count }, (_, i) => ({
      block_id: targetBlock.id,
      label: theme.linkLayout === 'gallery' ? `Product ${i + 1}` : `My Link`,
      url: '',
      order_index: i,
    }));

    await supabase.from('block_items').insert(placeholderItems);
  };

  const fetchPageData = async () => {
    if (!user) return;

    try {
      const { data: pageData, error: pageError } = await supabase
        .from('pages')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (pageError) throw pageError;

      if (pageData) {
        setPage(pageData);

        const { data: modesData, error: modesError } = await supabase
          .from('modes')
          .select('*')
          .eq('page_id', pageData.id);

        if (modesError) throw modesError;
        setModes(modesData || []);

        await autoPopulatePlaceholders(pageData, modesData || []);
      }
    } catch (error) {
      console.error('Error fetching page data:', error);
      toast.error(t('editor.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  // Default block types every mode should have
  const DEFAULT_BLOCK_TYPES = [
    { type: 'primary_cta', title: 'Primary CTA' },
    { type: 'product_cards', title: 'Products' },
    { type: 'social_links', title: 'Social Links' },
    { type: 'links', title: 'Links' },
    { type: 'gallery', title: 'Gallery' },
  ] as const;

  const ensureDefaultBlocks = async (modeId: string, existingTypes: string[]) => {
    const missing = DEFAULT_BLOCK_TYPES.filter((d) => !existingTypes.includes(d.type));
    if (missing.length === 0) return false;

    const maxOrder = existingTypes.length;
    const inserts = missing.map((d, i) => ({
      mode_id: modeId,
      type: d.type as any,
      title: d.title,
      is_enabled: true,
      order_index: maxOrder + i,
    }));

    await supabase.from('blocks').insert(inserts);
    return true;
  };

  // Re-fetch the page row only (no modes / placeholder side-effects).
  // Used after photo saves so `page.avatar_original_url` stays in sync.
  const refreshPage = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('pages')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!error && data) setPage(data);
  };

  // Re-fetch the modes list. Modes were previously fetched only on mount, so a
  // Page 2 created on demand (Second page toggle) never entered state — leaving
  // its modeId prop null and its blocks unreachable by fetchBlocks until a full
  // reload (the FIX.P2 noMode race). Refreshing here lets the born-complete
  // Page 2 appear the moment the user switches to it. setModes re-fires the
  // [modes] effect, which re-runs fetchBlocks with the fresh list.
  const fetchModes = async () => {
    const pid = page?.id;
    if (!pid) return;
    const { data, error } = await supabase
      .from('modes')
      .select('*')
      .eq('page_id', pid);
    if (!error && data) setModes(data);
  };

  // Combined refresh: page + modes + blocks. Pass to children that may save data
  // affecting any of them (including creating a new page mode).
  const refresh = async () => {
    await refreshPage();
    await fetchModes();
    await fetchBlocks();
  };

  const fetchBlocks = async () => {
    const mode = modes.find((m) => m.type === selectedMode);
    if (!mode) {
      setAllBlocks([]);
      return;
    }

    try {
      let { data: blocksData, error: blocksError } = await supabase
        .from('blocks')
        .select('*')
        .eq('mode_id', mode.id)
        .order('order_index', { ascending: true });

      if (blocksError) throw blocksError;

      let blocks = blocksData || [];

      // Auto-create missing default blocks for existing users
      const existingTypes = blocks.map((b) => b.type);
      const created = await ensureDefaultBlocks(mode.id, existingTypes);
      if (created) {
        const { data: refreshed } = await supabase
          .from('blocks')
          .select('*')
          .eq('mode_id', mode.id)
          .order('order_index', { ascending: true });
        blocks = refreshed || [];
      }
      if (blocks.length === 0) {
        setAllBlocks([]);
        return;
      }

      const blockIds = blocks.map((b) => b.id);
      const { data: itemsData, error: itemsError } = await supabase
        .from('block_items')
        .select('*')
        .in('block_id', blockIds)
        .order('order_index', { ascending: true });

      if (itemsError) throw itemsError;

      const items = itemsData || [];
      const blocksWithItems: BlockWithItems[] = blocks.map((b) => ({
        ...b,
        items: items.filter((i) => i.block_id === b.id),
      }));

      setAllBlocks(blocksWithItems);
    } catch (error) {
      console.error('Error fetching blocks:', error);
    }
  };

  useEffect(() => {
    fetchPageData();
  }, [user]);

  useEffect(() => {
    if (modes.length > 0) {
      fetchBlocks();
    }
  }, [modes, selectedMode]);

  // ── Block Actions ──

  const handleEditBlock = (blockId: string) => {
    const block = allBlocks.find((b) => b.id === blockId);
    if (!block) return;
    // The block.title field is overloaded for some block types (it stores a
    // JSON config blob). For the panel header we want the localized type name.
    const title = t(`blocks.${block.type}.title`) || block.type;
    setEditingBlock({ id: block.id, type: block.type, title });
    setProfileDashboardOpen(true);
  };

  const handleEditVideo = () => {
    setOpenVideoProfile(true);
    setProfileDashboardOpen(true);
  };

  const handleProfileDashboardClose = () => {
    setProfileDashboardOpen(false);
    setEditingBlock(null);
    setOpenVideoProfile(false);
    setDraftItem(null);
    setDraftTitle(null);
    fetchBlocks();
  };


  // FIX.MEDIA.1: the Video Profile panel's in-flight framing. Declarative, so
  // BOTH mounted preview instances can safely receive it (unlike the photo
  // request's counter, which must target exactly one). This is what makes the
  // page preview move while a slider is dragged, with no save.
  const [videoPosDraft, setVideoPosDraft] = useState<HeroFraming | null>(null);

  // ── Per-item actions (G2: edit-aware preview cards, links blocks) ──

  const handleItemEdit = (blockId: string, itemId: string) => {
    const block = allBlocks.find((b) => b.id === blockId);
    if (!block) return;
    const title = t(`blocks.${block.type}.title`) || block.type;
    setEditingBlock({ id: block.id, type: block.type, title, directItemId: itemId });
    setProfileDashboardOpen(true);
  };

  const handleItemAdd = (blockId: string) => {
    const block = allBlocks.find((b) => b.id === blockId);
    if (!block) return;
    const title = t(`blocks.${block.type}.title`) || block.type;
    setEditingBlock({ id: block.id, type: block.type, title, directNew: true });
    setProfileDashboardOpen(true);
  };

  const handleItemDelete = async (itemId: string) => {
    // Optimistic: strip the item from its block immediately.
    const prev = allBlocks;

    // If removing this item leaves a Small card with no partner, it reverts to a
    // full-size large card. Notify with a toast (no blocking dialog) — only when
    // this delete actually increases the count of unpaired Smalls.
    const ownerBlock = prev.find((b) => b.items.some((i) => i.id === itemId));
    const sizeOf = (s: string | null | undefined): ItemSize =>
      s === 'big' || s === 'medium' || s === 'small' || s === 'button' ? s : 'medium';
    const loneCount = (items: { size?: string | null }[]) =>
      planLinkLayout(items, sizeOf).filter((r) => r.kind === 'lone-small').length;
    const revertsToLarge =
      !!ownerBlock &&
      ownerBlock.type === 'links' &&
      loneCount(ownerBlock.items.filter((i) => i.id !== itemId)) > loneCount(ownerBlock.items);

    setAllBlocks((bs) =>
      bs.map((b) => ({ ...b, items: b.items.filter((i) => i.id !== itemId) }))
    );
    try {
      const { error } = await supabase.from('block_items').delete().eq('id', itemId);
      if (error) throw error;
      if (revertsToLarge) {
        toast('Now showing as a large card. Small cards come in pairs — add another in the editor to pair them.');
      } else {
        toast.success(t('editor.linkRemoved') || 'Link removed');
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error(t('editor.failedDelete') || 'Failed to remove link');
      setAllBlocks(prev);
      fetchBlocks();
    }
  };

  // Live-mirror (L2): receive the editor's draft and pin it to the block being
  // edited. Null clears the mirror (panel unmount / cancel).
  const handleDraftChange = useCallback((item: LinkItem | null) => {
    setDraftItem(item && editingBlock ? { blockId: editingBlock.id, item } : null);
  }, [editingBlock]);

  // Live-mirror (L3): receive the editor's draft block.title (JSON) and pin it to the edited block.
  const handleTitleDraftChange = useCallback((title: string | null) => {
    setDraftTitle(title != null && editingBlock ? { blockId: editingBlock.id, title } : null);
  }, [editingBlock]);

  // Live-mirror (L4): merge the hub's patch into the header draft, so a tab can
  // publish just the field it owns. Null clears the mirror (panel close / cancel).
  const handleHeaderDraftChange = useCallback((patch: HeaderDraft | null) => {
    if (!patch) { setHeaderDraft(null); return; }
    setHeaderDraft(prev => ({ ...prev, ...patch }));
  }, []);

  const handleThemeDraftChange = useCallback((draft: unknown) => {
    setThemeDraft(draft as FullThemeJson | null);
  }, []);

  // Merge the draft into the preview's blocks: replace the matching item by id,
  // or append it when it's a not-yet-persisted new- item. Cast bridges the
  // editor's LinkItem onto the preview's BlockItem row — preview reads only the
  // shared fields, so the missing DB columns are inert here.
  const previewBlocks = useMemo(() => {
    if (!draftItem && !draftTitle) return allBlocks;
    return allBlocks.map(b => {
      let nb = b;
      if (draftItem && b.id === draftItem.blockId) {
        const items = b.items ? [...b.items] : [];
        const idx = items.findIndex(it => it.id === draftItem.item.id);
        if (idx >= 0) items[idx] = { ...items[idx], ...draftItem.item } as BlockItem;
        else items.push({ ...draftItem.item } as BlockItem);
        nb = { ...nb, items };
      }
      if (draftTitle && b.id === draftTitle.blockId) {
        nb = { ...nb, title: draftTitle.title };
      }
      return nb;
    });
  }, [allBlocks, draftItem, draftTitle]);

  // DP.2: in visitor mode the preview mirrors the public gating contract — a
  // gated tap raises the 18+ modal instead of navigating, and confirmation opens
  // the destination in a new tab (the editor itself never leaves). Non-gated
  // links behave as ordinary target=_blank anchors.
  const handleVisitorOutbound = useCallback(
    (_blockType: string, _blockId: string, _itemId: string, url: string, isAdult?: boolean): boolean => {
      if (isAdult) { setPendingGate({ url }); return false; }
      return true;
    },
    []
  );

  // Visitor mode shows only ENABLED blocks — the public route filters is_enabled
  // at the query level and EditableProfileView's view branch does not, so mirror
  // that here. Edit mode keeps disabled blocks visible (they carry their toggle).
  const visitorBlocks = useMemo(
    () => previewBlocks.filter((b) => b.is_enabled),
    [previewBlocks]
  );

  const handleBlockToggle = async (blockId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('blocks')
        .update({ is_enabled: enabled })
        .eq('id', blockId);

      if (error) throw error;

      setAllBlocks((prev) =>
        prev.map((b) => (b.id === blockId ? { ...b, is_enabled: enabled } : b))
      );
    } catch (error) {
      console.error('Error toggling block:', error);
      toast.error(t('editor.failedToggle'));
    }
  };

  const handleBlockReorder = async (blockIds: string[]) => {
    const reordered = blockIds
      .map((id) => allBlocks.find((b) => b.id === id))
      .filter(Boolean) as BlockWithItems[];
    // Preserve blocks not in the reorder list (e.g. social_links used in header)
    const preserved = allBlocks.filter(b => !blockIds.includes(b.id));
    setAllBlocks([...reordered, ...preserved]);

    try {
      for (let i = 0; i < blockIds.length; i++) {
        await supabase
          .from('blocks')
          .update({ order_index: i })
          .eq('id', blockIds[i]);
      }
    } catch (error) {
      console.error('Error reordering blocks:', error);
      toast.error(t('editor.failedReorder'));
      fetchBlocks();
    }
  };

  // Item reorder (G3): mirrors handleBlockReorder but on block_items, scoped to
  // one block. Optimistic reorder of that block's items, then per-row order_index
  // writes; refetch on failure.
  const handleItemsReorder = async (blockId: string, orderedItemIds: string[]) => {
    setAllBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b;
      const byId = new Map((b.items ?? []).map(i => [i.id, i]));
      const reordered = orderedItemIds.map(id => byId.get(id)).filter(Boolean) as BlockItem[];
      return { ...b, items: reordered };
    }));
    try {
      for (let i = 0; i < orderedItemIds.length; i++) {
        await supabase.from('block_items').update({ order_index: i }).eq('id', orderedItemIds[i]);
      }
    } catch (e) {
      toast.error('Failed to reorder links');
      fetchBlocks();
    }
  };

  const currentMode = modes.find((m) => m.type === selectedMode);

  // ── Render ──

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  // No page yet (brand-new account, or an older account whose page was removed):
  // route through the single, unified onboarding flow — never the legacy form.
  if (!page) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <DashboardLayout onAddContent={page ? () => setProfileDashboardOpen(true) : undefined}>
      {/* ═══ DESKTOP: Blurred hero bg + phone frame ═══ */}
      <div
        className={cn(
          "hidden lg:block fixed top-0 bottom-0 left-64 overflow-hidden transition-all duration-300 ease-out",
          profileDashboardOpen ? "right-[420px]" : "right-0"
        )}
      >
        {/* Blurred hero background */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          <div
            style={{
              backgroundImage: `url(${page.avatar_url || ''})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'blur(40px)',
              transform: 'scale(1.15)',
              opacity: 0.35,
              position: 'absolute',
              inset: '-20px',
            }}
          />
          <div className="absolute inset-0 bg-black/50" />
        </div>

        {/* Desktop top bar */}
        <div className="relative z-30 flex items-center justify-between px-6 h-[52px] bg-black/30 backdrop-blur-md border-b border-white/5">
          <span className="text-sm font-bold text-white">
            Titi<span className="italic text-[#C9A55C]">Links</span>
          </span>

          <div className="flex items-center gap-3">
            {/* DP.1: device-truthful preview selector. Device names stay
                untranslated; the aria-label / caption are localized. */}
            <div className="flex items-center gap-1.5">
              <select
                data-testid="device-selector"
                aria-label={t('editor.devicePreset')}
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                className="text-xs bg-black/40 text-white/80 border border-white/15 rounded-full px-3 py-1.5 max-w-[210px] cursor-pointer hover:border-white/30 focus:outline-none focus:border-[#C9A55C]/60 transition-colors"
              >
                {DEVICE_PRESETS.map((d) => (
                  <option key={d.id} value={d.id} className="bg-[#1a1a1a] text-white">
                    {d.label} · {d.width}×{d.height}
                  </option>
                ))}
              </select>
              {previewScale < 0.999 && (
                <span
                  data-testid="device-scale"
                  title={t('editor.deviceScaled')}
                  className="text-[10px] text-white/40 tabular-nums"
                >
                  {Math.round(previewScale * 100)}%
                </span>
              )}
            </div>
            {/* DP.2: visitor-preview toggle — flips the frame between the editing
                chrome and the exact public view (view mode + public 18+ gating).
                Session-only; the device selector stays live in both modes. */}
            <button
              type="button"
              data-testid="preview-mode-toggle"
              onClick={() => setPreviewMode((m) => (m === 'edit' ? 'visitor' : 'edit'))}
              aria-pressed={isVisitor}
              aria-label={isVisitor ? t('editor.previewBackToEditing') : t('editor.previewAsVisitor')}
              title={isVisitor ? t('editor.previewBackToEditing') : t('editor.previewAsVisitor')}
              className={cn(
                'flex items-center gap-1.5 text-xs rounded-full border px-3 py-1.5 transition-colors',
                isVisitor
                  ? 'bg-[#C9A55C] text-[#0e0c09] border-[#C9A55C] font-bold'
                  : 'bg-black/40 text-white/80 border-white/15 hover:border-white/30'
              )}
            >
              {isVisitor ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span>{isVisitor ? t('editor.previewEditingLabel') : t('editor.previewVisitorLabel')}</span>
            </button>
            <span className="text-xs text-white/50">@{page.handle}</span>
            <button
              onClick={() => setProfileDashboardOpen(true)}
              className="text-xs font-bold px-4 py-1.5 rounded-full bg-[#C9A55C] text-[#0e0c09] active:scale-95 transition-transform"
            >
              {t('dashLayout.editProfile')}
            </button>
            <button
              onClick={() => window.open(`/${page.handle}`, '_blank')}
              className="text-xs px-3 py-1.5 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors"
            >
              {t('editor.viewLive')} ↗
            </button>
          </div>
        </div>

        {/* Phone frame — DP.1 device-truthful preview */}
        <div
          ref={previewAreaRef}
          className="relative z-10 flex items-center justify-center h-[calc(100vh-52px)] overflow-hidden"
        >
          {devicePreset.note && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 text-[10px] text-white/45 bg-black/40 px-2 py-0.5 rounded-full pointer-events-none">
              {t('editor.deviceAndroidNote')}
            </div>
          )}
          <div
            data-testid="device-frame"
            className="overflow-y-auto overflow-x-hidden scrollbar-hide"
            style={{
              // Exact logical CSS-viewport of the selected device — the frame
              // renders at these px so the composition is device-truthful. The
              // hairline uses `outline` (not `border`) so the box stays exactly
              // width×height. Scaled to fit; offsetWidth/Height ignore transform.
              width: `${devicePreset.width}px`,
              height: `${devicePreset.height}px`,
              // DP.2: expose the frame's logical height / 100 as a viewport-unit
              // proxy. Descendant `dvh` reads that opt in via `var(--pv-vh, 1dvh)`
              // then resolve against the DEVICE frame instead of the desktop
              // window, so the hero container's `50dvh` is truthful per preset.
              // Absent on the public route → the 1dvh fallback keeps it identical.
              '--pv-vh': `${devicePreset.height / 100}px`,
              flex: '0 0 auto',
              transform: `scale(${previewScale})`,
              transformOrigin: 'center center',
              borderRadius: '44px',
              outline: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 0 0 2px rgba(255,255,255,0.05), 0 30px 80px rgba(0,0,0,0.8)',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            } as CSSProperties}
          >
            {/* DP.2: same shared render path in both modes. Visitor mode drops
                editMode (public chrome + gating), shows enabled blocks only, and
                routes gated taps through the 18+ modal. The live-mirror props
                (previewBlocks/headerDraft/themeDraft) still flow, so unsaved
                drafts remain visible in visitor mode. */}
            <EditableProfileView
              page={page}
              blocks={isVisitor ? visitorBlocks : previewBlocks}
              headerDraft={headerDraft}
              themeDraft={themeDraft}
              editMode={!isVisitor}
              showBranding={!can('removeBranding')}
              onOutboundClick={isVisitor ? handleVisitorOutbound : undefined}
              onBlockEdit={handleEditBlock}
              onBlockToggle={handleBlockToggle}
              onBlockReorder={handleBlockReorder}
              onRefresh={refresh}
              selectedMode={selectedMode}
              onModeChange={setSelectedMode}
              onAddContent={() => setProfileDashboardOpen(true)}
              onEditVideo={handleEditVideo}
              openPhotoRequest={photoRequestDesktop}
              videoPosDraft={videoPosDraft}
              onItemEdit={handleItemEdit}
              onItemDelete={handleItemDelete}
              onItemAdd={handleItemAdd}
              onItemsReorder={handleItemsReorder}
            />
          </div>
        </div>
      </div>

      {/* ═══ MOBILE: Full screen live profile ═══ */}
      <div className="lg:hidden -mx-4 -mt-6 min-h-screen bg-[#0e0c09]">
        <EditableProfileView
          stickyTop="4rem"
          page={page}
          blocks={previewBlocks}
          headerDraft={headerDraft}
          themeDraft={themeDraft}
          editMode={true}
          showBranding={!can('removeBranding')}
          onBlockEdit={handleEditBlock}
          onBlockToggle={handleBlockToggle}
          onBlockReorder={handleBlockReorder}
          onRefresh={refresh}
          selectedMode={selectedMode}
          onModeChange={setSelectedMode}
          onAddContent={() => setProfileDashboardOpen(true)}
          onEditVideo={handleEditVideo}
          openPhotoRequest={photoRequestMobile}
          videoPosDraft={videoPosDraft}
          onItemEdit={handleItemEdit}
          onItemDelete={handleItemDelete}
          onItemAdd={handleItemAdd}
          onItemsReorder={handleItemsReorder}
        />
      </div>

      {/* ═══ ProfileDashboard panel — handles both add-content (section list) ═══ */}
      {/* ═══ and edit-existing (direct-to-editor) flows.                    ═══ */}
      <ProfileDashboard
        open={profileDashboardOpen}
        onClose={handleProfileDashboardClose}
        pageId={page.id}
        modeId={currentMode?.id || null}
        selectedMode={selectedMode}
        onSelectedModeChange={setSelectedMode}
        onBlockEdit={handleEditBlock}
        onRefresh={refresh}
        editingBlock={editingBlock}
        openVideoProfile={openVideoProfile}
        onVideoPosDraft={setVideoPosDraft}
        onDraftChange={handleDraftChange}
        onTitleDraftChange={handleTitleDraftChange}
        onHeaderDraftChange={handleHeaderDraftChange}
        onThemeDraftChange={handleThemeDraftChange}
        themeJson={page.theme_json}
        displayName={page.display_name ?? undefined}
        bio={page.bio ?? undefined}
        avatarUrl={page.avatar_url ?? undefined}
      />

      {/* DP.2: the 18+ gate for visitor-mode taps. Same modal the public route
          uses; confirmation opens the destination in a new tab so the editor
          itself is never navigated away. */}
      <AdultGateModal
        open={!!pendingGate}
        onOpenChange={(o) => { if (!o) setPendingGate(null); }}
        onConfirm={() => {
          if (pendingGate) window.open(pendingGate.url, '_blank', 'noopener,noreferrer');
          setPendingGate(null);
        }}
        onCancel={() => setPendingGate(null)}
      />
    </DashboardLayout>
  );
}
