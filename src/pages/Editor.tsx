import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ensureDefaultBlocks, PAGE_SINGLETON_TYPES } from '@/lib/default-blocks';
import type { HeroFraming } from '@/lib/hero-framing';
import { Loader2 } from 'lucide-react';
import { AdultGateModal } from '@/components/AdultGateModal';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { Navigate } from 'react-router-dom';
import { EditableProfileView } from '@/components/EditableProfileView';
import { EditorStage } from '@/components/EditorStage';
import { useEntitlements } from '@/hooks/useEntitlements';
import { ProfileDashboard, type EditingBlockTarget } from '@/components/ProfileDashboard';
import { useApplyLayout } from '@/components/editors/gallery-shared';
import { TPL_PRESETS, PENDING_TEMPLATE_KEY } from '@/lib/tpl-presets';
import type { LinkItem } from '@/components/editors/LinksEditor';
import type { GalleryDraft } from '@/components/editors/GalleryEditor';
import type { EventsDraft } from '@/components/editors/EventsEditor';
import type { HeaderDraft } from '@/lib/header-draft';
import { planLinkLayout, type ItemSize } from '@/lib/link-layout';
import { toast } from 'sonner';
import { safeHref } from '@/lib/safe-url';
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
  const { can, showBadge } = useEntitlements();
  // PROMO.TOGGLE.1: free is always branded; paid tiers follow the owner's
  // profiles.show_badge toggle. Same rule the public page applies.
  const showBranding = !can('removeBranding') || showBadge;
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page | null>(null);
  const [modes, setModes] = useState<Mode[]>([]);
  const [selectedMode, setSelectedMode] = useState<'page1' | 'page2'>('page1');
  const [editingBlock, setEditingBlock] = useState<EditingBlockTarget | null>(null);
  const [allBlocks, setAllBlocks] = useState<BlockWithItems[]>([]);
  const [profileDashboardOpen, setProfileDashboardOpen] = useState(false);
  // Opens the dashboard straight to the Video Profile menu (hero video pencil).
  const [openVideoProfile, setOpenVideoProfile] = useState(false);
  // TL.SECT.4: the block whose editor the dashboard panel currently has open,
  // reported by the panel. Distinct from `editingBlock`, which is what the
  // CANVAS asked to edit — this one is set by the panel's own doors (a rail
  // row, a section-list row, a checklist route) and is what keeps a hidden
  // block previewable while it is being edited.
  const [panelEditingId, setPanelEditingId] = useState<string | null>(null);
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
  // Live-mirror (L6): the gallery panel's whole staged state — config chips,
  // staged adds (data URLs, no DB row yet), removes, crops and order. Null means
  // "no panel is drafting", and the preview reads DB truth.
  //
  // TL.GAL.6b: the draft carries its OWN blockId (unlike L2/L3, which scope
  // themselves by `editingBlock`). That inference only holds for the doors
  // routing through onBlockEdit; ProfileDashboard's section list and guided
  // checklist open editors by setting activeBlockId directly, leaving
  // editingBlock null — and every draft published through those doors was
  // being thrown away. See GalleryDraft.
  const [galleryDraft, setGalleryDraft] = useState<GalleryDraft | null>(null);
  // Live-mirror (TL.EVNT.3b): the events panel's whole staged list — titles,
  // wall-clock dates, venue/city, flags, staged posters (data URLs) and the
  // staged framing. Same contract as L6: it names its own block, null means
  // "no panel is drafting", and the rows are exactly what Save would write.
  const [eventsDraft, setEventsDraft] = useState<EventsDraft | null>(null);

  // The gated destination pending an 18+ confirmation in visitor mode. Mirrors
  // the public route's handler, but opens in a new tab so the editor stays put.
  const [pendingGate, setPendingGate] = useState<{ url: string } | null>(null);

  // ── Data Fetching ──

  const autoPopulatePlaceholders = async (pageData: Page, modesData: Mode[]) => {
    const theme = pageData.theme_json as ThemeJson;
    if (!theme?.linkLayout || !theme?.linkCount) return;

    const shopMode = modesData.find((m) => m.type === 'page1');
    if (!shopMode) return;

    const targetBlockType = theme.linkLayout === 'gallery' ? 'product_cards' : 'links';

    // TL.BLOCK.1: `.limit(1)` before `.maybeSingle()`. This is the same
    // one-row-per-(mode,type) assumption that broke resolveBlockId — bare
    // maybeSingle throws PGRST116 on a duplicate. Here the error was swallowed
    // (only `data` is destructured), so the prefill silently did nothing on a
    // page carrying duplicates. Take the first row instead.
    const { data: targetBlock } = await supabase
      .from('blocks')
      .select('id')
      .eq('mode_id', shopMode.id)
      .eq('type', targetBlockType)
      .order('created_at', { ascending: true })
      .limit(1)
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

  // TL.BLOCK.1: the default-block seed moved to src/lib/default-blocks.ts. It
  // used to live here as a read-then-blind-INSERT with no lock, and this
  // component calls it from `fetchBlocks` on every refresh — two overlapping
  // fetches for one mode both seeded, minting duplicate blocks. The engine is
  // now idempotent, serialized per mode, and refuses to seed off an empty read.

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

      // Auto-create missing default blocks for existing users. The engine
      // re-reads authoritatively behind its own per-mode lock, so `blocks`
      // above is only the render payload — it is not what the seed decides on.
      const created = await ensureDefaultBlocks(mode.id);
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

      // TL.EVNT.SGL: page-singleton blocks (events) live on ONE mode — their
      // canonical home is page1 — but both page styles render them. When the
      // selected mode does not host one, graft the page's copy in from the
      // other mode(s), sorted by its own order_index (position and enablement
      // are shared across styles by design). Read-only: the graft never
      // inserts, and every downstream write (reorder, toggle, editor saves)
      // targets the block by id, so edits land on the one shared row.
      const otherModeIds = modes.filter((m) => m.id !== mode.id).map((m) => m.id);
      if (otherModeIds.length) {
        const present = new Set(blocks.map((b) => b.type));
        const missingTypes = [...PAGE_SINGLETON_TYPES].filter((t) => !present.has(t));
        if (missingTypes.length) {
          const { data: shared, error: sharedError } = await supabase
            .from('blocks')
            .select('*')
            .in('mode_id', otherModeIds)
            .in('type', missingTypes)
            .order('created_at', { ascending: true });
          if (sharedError) throw sharedError;
          const grafted = new Set<string>();
          for (const b of shared ?? []) {
            if (grafted.has(b.type)) continue; // one per type — oldest wins
            grafted.add(b.type);
            blocks.push(b);
          }
          if (grafted.size) blocks.sort((a, b) => a.order_index - b.order_index);
        }
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
    setPanelEditingId(null);
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

  // Live-mirror (L6): store the panel's draft as published. It names its own
  // block, so this works from every door into the editor. Null (panel
  // unmounted) clears it.
  const handleGalleryDraftChange = useCallback((draft: GalleryDraft | null) => {
    setGalleryDraft(draft);
  }, []);

  // TL.EVNT.3b: same store-as-published contract as the gallery draft above.
  const handleEventsDraftChange = useCallback((draft: EventsDraft | null) => {
    setEventsDraft(draft);
  }, []);

  // TL.GAL.6 — the preview keeps its own per-photo trash, so while a gallery
  // panel is drafting that block the two surfaces are editing the same list.
  // The panel wins: its state is the draft of record, and the DB write is its
  // Save. A preview delete of a drafted photo therefore STAGES (revertible by
  // the panel's Cancel, committed by its Save) rather than deleting the row and
  // its storage object out from under an editor that would then save against it.
  // Photos outside the draft — another gallery block, or no panel open — fall
  // through to EditableProfileView's immediate delete, unchanged.
  const handleGalleryStagedDelete = useCallback((itemId: string): boolean => {
    if (!galleryDraft?.photos.some((p) => p.id === itemId)) return false;
    galleryDraft.remove(itemId);
    return true;
  }, [galleryDraft]);

  // Merge the draft into the preview's blocks: replace the matching item by id,
  // or append it when it's a not-yet-persisted new- item. Cast bridges the
  // editor's LinkItem onto the preview's BlockItem row — preview reads only the
  // shared fields, so the missing DB columns are inert here.
  const previewBlocks = useMemo(() => {
    if (!draftItem && !draftTitle && !galleryDraft && !eventsDraft) return allBlocks;
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
      // L6: the gallery draft REPLACES the block's list rather than patching it,
      // because it is the whole list — removes are the absence of a row, and
      // order is the array's own order. Existing rows keep their DB columns and
      // take the draft's image/crop; a staged add has no row yet, so it gets a
      // synthetic one (the preview reads id/image_url/label/style_json only).
      // block.title carries the layout/autoScroll/speed config the preview parses.
      if (galleryDraft && b.id === galleryDraft.blockId) {
        const byId = new Map((b.items ?? []).map(it => [it.id, it]));
        nb = {
          ...nb,
          title: JSON.stringify(galleryDraft.config),
          items: galleryDraft.photos.map((p, i) => ({
            ...(byId.get(p.id) ?? { id: p.id, block_id: b.id, label: 'Photo', url: '' }),
            image_url: p.image_url,
            style_json: p.style_json,
            order_index: i,
          }) as BlockItem),
        };
      }
      // TL.EVNT.3b: the events draft REPLACES the block's list for the same
      // reason the gallery one does — it IS the whole list, deletes are the
      // absence of a row and order is the array's own order. An existing row
      // keeps its DB columns and takes the draft's fields on top; a staged add
      // has no row yet, so it gets a synthetic base (EventsBlock reads only the
      // columns the draft carries).
      if (eventsDraft && b.id === eventsDraft.blockId) {
        const byId = new Map((b.items ?? []).map(it => [it.id, it]));
        nb = {
          ...nb,
          items: eventsDraft.items.map(row => ({
            ...(byId.get(row.id) ?? { id: row.id, block_id: b.id }),
            ...row,
          }) as BlockItem),
        };
      }
      return nb;
    });
  }, [allBlocks, draftItem, draftTitle, galleryDraft, eventsDraft]);

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
  // that here.
  const visitorBlocks = useMemo(
    () => previewBlocks.filter((b) => b.is_enabled),
    [previewBlocks]
  );

  // TL.SECT.1: the edit canvas treats toggles honestly — a disabled block never
  // renders publicly, so it renders nowhere in the phone preview either (its
  // card, toggle and all, vanishes; re-enabling lives in the Sections rail).
  // Exemption: a block whose editor panel is open stays visible while it is
  // being worked on, whichever door opened it.
  //
  // TL.SECT.4 made that promise true for every door. `editingBlock` only ever
  // covered the canvas doors, and a hidden block HAS no canvas card — so the
  // rail (the one place you can reach a hidden block) was editing it blind
  // unless its editor happened to publish a draft on mount, which most do not.
  // `panelEditingId` is the dashboard's own open-editor id, reported by the
  // panel itself, so the rail, the section list, the checklist AND the canvas
  // doors exempt alike (a canvas tap sets `editingBlock`, which the panel
  // mirrors into that same id) and every exit clears it.
  //
  // TL.SECT.5: `editingBlock` is deliberately NOT in this set. It is a REQUEST
  // to open an editor, not a statement that one is open, and now that back
  // returns to the list instead of closing the panel it outlives the editor it
  // opened — leaving a hidden block stuck on screen with nothing being edited.
  // The panel's own id cannot say that, because it IS the editor's presence.
  // The draft channels stay: they cover a block whose panel published a draft,
  // and a Set makes the overlap free.
  const editBlocks = useMemo(() => {
    const exempt = new Set(
      [
        panelEditingId,
        draftItem?.blockId,
        draftTitle?.blockId,
        galleryDraft?.blockId,
        eventsDraft?.blockId,
      ].filter(Boolean) as string[],
    );
    return previewBlocks.filter((b) => b.is_enabled || exempt.has(b.id));
  }, [previewBlocks, panelEditingId, draftItem, draftTitle, galleryDraft, eventsDraft]);

  /**
   * The ONE enable/disable path for a block, wherever the gesture came from —
   * the canvas card's toggle, the Sections rail, or the text-blocks list
   * (TL.SECT.2 folded that one in). Instant persist, no staging: a boolean has
   * nothing to draft.
   *
   * TL.SECT.1 (architect ruling): re-enabling surfaces the block at the TOP of
   * the page — deterministic, and honest about where it reappeared (the toast
   * says so and points at drag-to-reorder). order_index goes below the current
   * minimum in the same write, so a hidden block's stale index can never decide
   * the landing slot. Disable stays a silent one-column write.
   *
   * Optimistic, because the rail's Switch is controlled by this state and would
   * otherwise sit dead for a round-trip. A rejected write resyncs from the DB
   * rather than restoring a snapshot — the same recovery `handleBlockReorder`
   * uses, and the only one that cannot clobber a concurrent change.
   * Returns whether the write landed, so callers holding their own row state
   * (TextBlocksPanel) know whether to roll back.
   */
  const handleBlockToggle = async (blockId: string, enabled: boolean): Promise<boolean> => {
    const minOrder = Math.min(...allBlocks.map((b) => b.order_index));
    const newOrder = Number.isFinite(minOrder) ? minOrder - 1 : 0;

    setAllBlocks((prev) => {
      const target = prev.find((b) => b.id === blockId);
      if (!target) return prev;
      if (!enabled) {
        return prev.map((b) => (b.id === blockId ? { ...b, is_enabled: false } : b));
      }
      return [
        { ...target, is_enabled: true, order_index: newOrder },
        ...prev.filter((b) => b.id !== blockId),
      ];
    });

    const { error } = await supabase
      .from('blocks')
      .update(enabled ? { is_enabled: true, order_index: newOrder } : { is_enabled: false })
      .eq('id', blockId);

    if (error) {
      console.error('Error toggling block:', error);
      toast.error(t('editor.failedToggle'));
      fetchBlocks();
      return false;
    }

    if (enabled) toast(t('editor.blockEnabledTop'));
    return true;
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

  // ── TPL.PAGE.1: post-signup template handoff ──
  // A visitor who picked a style on /templates arrives here (after onboarding
  // built their page1) with a preset id stashed in localStorage. Apply it once,
  // through the SAME snapshot-guarded TPL path the Layouts gallery uses, then
  // consume the flag. Login already cleared the flag for returning accounts, so
  // this only fires for a fresh signup's first Editor mount.
  const pendingApplyRan = useRef(false);
  const { applyLayout: applyPendingLayout } = useApplyLayout({
    pageId: page?.id ?? '',
    modeId: currentMode?.id ?? null,
    activePageId: selectedMode,
    themeJson: page?.theme_json,
    onApply: refresh,
  });
  useEffect(() => {
    if (pendingApplyRan.current) return;
    if (loading || !page || !currentMode) return;
    let id: string | null = null;
    try { id = localStorage.getItem(PENDING_TEMPLATE_KEY); } catch { id = null; }
    if (!id) return;
    // Consume the handoff exactly once — whether or not it resolves to a preset.
    try { localStorage.removeItem(PENDING_TEMPLATE_KEY); } catch { /* storage disabled */ }
    const preset = TPL_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    pendingApplyRan.current = true;
    applyPendingLayout(preset);
  }, [loading, page, currentMode, applyPendingLayout]);

  // TL.SOC.4 item 5 — the "your live page hides these" notice.
  //
  // SURFACE: a toast on the View Live click, not a persistent banner. That is
  // the exact moment the mismatch bites (the creator is about to go look at
  // the public page and wonder where their icons went), it is structurally
  // creator-only because it hangs off the editor chrome's own handler with no
  // path that could reach a visitor, and sonner is already the house's notice
  // channel — non-blocking and dismissible without inventing dismiss-state to
  // persist. Anything permanent belongs in the sidebar's Profile Completion
  // card, which is already the house's home for unfinished work.
  //
  // The count is what a VISITOR actually loses, not the raw number of blank
  // rows: a platform that also has a linked row still shows publicly, so it
  // is not hidden. Labels, because that is what the icon row dedupes on.
  const hiddenSocialCount = useMemo(() => {
    const socialItems = allBlocks
      .filter((b) => b.type === 'social_links' || b.type === 'social_icon_row')
      .flatMap((b) => b.items ?? []);
    const linked = new Set(
      socialItems.filter((i) => (i.url ?? '').trim()).map((i) => i.label.toLowerCase()),
    );
    return new Set(
      socialItems
        .filter((i) => !(i.url ?? '').trim())
        .map((i) => i.label.toLowerCase())
        .filter((label) => !linked.has(label)),
    ).size;
  }, [allBlocks]);

  const openLive = useCallback(() => {
    if (!page?.handle) return;
    if (hiddenSocialCount > 0) {
      toast(
        t(hiddenSocialCount === 1 ? 'editor.hiddenIconsOne' : 'editor.hiddenIconsMany')
          .replace('{count}', String(hiddenSocialCount)),
      );
    }
    window.open(`/${page.handle}`, '_blank');
  }, [hiddenSocialCount, page?.handle, t]);

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
    <DashboardLayout
      onAddContent={page ? () => setProfileDashboardOpen(true) : undefined}
      onViewLive={openLive}
    >
      {/* ═══ DESKTOP: Blurred hero bg + phone frame — TL.ONB.STAGE.1: lifted into EditorStage ═══ */}
      <EditorStage
        page={page}
        editBlocks={editBlocks}
        visitorBlocks={visitorBlocks}
        headerDraft={headerDraft}
        themeDraft={themeDraft}
        showBranding={showBranding}
        selectedMode={selectedMode}
        onModeChange={setSelectedMode}
        panelOpen={profileDashboardOpen}
        onOpenPanel={() => setProfileDashboardOpen(true)}
        onViewLive={openLive}
        onVisitorOutbound={handleVisitorOutbound}
        onBlockEdit={handleEditBlock}
        onBlockToggle={handleBlockToggle}
        onBlockReorder={handleBlockReorder}
        onRefresh={refresh}
        onEditVideo={handleEditVideo}
        openPhotoRequest={photoRequestDesktop}
        videoPosDraft={videoPosDraft}
        onGalleryStagedDelete={handleGalleryStagedDelete}
        onItemEdit={handleItemEdit}
        onItemDelete={handleItemDelete}
        onItemAdd={handleItemAdd}
        onItemsReorder={handleItemsReorder}
      />

      {/* ═══ MOBILE: Full screen live profile ═══ */}
      <div className="lg:hidden -mx-4 -mt-6 min-h-screen bg-[#0e0c09]">
        <EditableProfileView
          stickyTop="4rem"
          page={page}
          blocks={editBlocks}
          headerDraft={headerDraft}
          themeDraft={themeDraft}
          editMode={true}
          showBranding={showBranding}
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
          onGalleryStagedDelete={handleGalleryStagedDelete}
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
        blocks={allBlocks}
        onBlockToggle={handleBlockToggle}
        onEditingBlockChange={setPanelEditingId}
        editingBlock={editingBlock}
        openVideoProfile={openVideoProfile}
        onVideoPosDraft={setVideoPosDraft}
        onDraftChange={handleDraftChange}
        onTitleDraftChange={handleTitleDraftChange}
        onHeaderDraftChange={handleHeaderDraftChange}
        onThemeDraftChange={handleThemeDraftChange}
        onGalleryDraftChange={handleGalleryDraftChange}
        onEventsDraftChange={handleEventsDraftChange}
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
          // TL.SEC.XSS.1: window.open runs a `javascript:` URL too. An unsafe
          // destination just closes the gate without opening anything.
          const destination = pendingGate ? safeHref(pendingGate.url) : undefined;
          if (destination) window.open(destination, '_blank', 'noopener,noreferrer');
          setPendingGate(null);
        }}
        onCancel={() => setPendingGate(null)}
      />
    </DashboardLayout>
  );
}
