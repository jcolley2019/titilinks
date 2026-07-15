import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { Navigate } from 'react-router-dom';
import { EditableProfileView } from '@/components/EditableProfileView';
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
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page | null>(null);
  const [modes, setModes] = useState<Mode[]>([]);
  const [selectedMode, setSelectedMode] = useState<'page1' | 'page2'>('page1');
  const [editingBlock, setEditingBlock] = useState<EditingBlockTarget | null>(null);
  const [allBlocks, setAllBlocks] = useState<BlockWithItems[]>([]);
  const [profileDashboardOpen, setProfileDashboardOpen] = useState(false);
  // Opens the dashboard straight to the Video Profile menu (hero video pencil).
  const [openVideoProfile, setOpenVideoProfile] = useState(false);
  // Live-mirror (L2): the editor panel's in-progress draft, scoped to its block.
  const [draftItem, setDraftItem] = useState<{ blockId: string; item: LinkItem } | null>(null);
  // Live-mirror (L3): the editor's in-progress block.title config (Text/Bio), scoped to its block.
  const [draftTitle, setDraftTitle] = useState<{ blockId: string; title: string } | null>(null);
  // Live-mirror (L4): the Name & Handle hub's in-progress header edits. Page-scoped,
  // so unlike L2/L3 there's no block to pin it to — it goes straight to the preview.
  const [headerDraft, setHeaderDraft] = useState<HeaderDraft | null>(null);

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

  // Combined refresh: page + blocks. Pass to children that may save data
  // affecting either.
  const refresh = async () => {
    await refreshPage();
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
            <span className="text-xs text-white/50">@{page.handle}</span>
            <button
              onClick={() => setProfileDashboardOpen(true)}
              className="text-xs font-bold px-4 py-1.5 rounded-full bg-[#C9A55C] text-[#0e0c09] active:scale-95 transition-transform"
            >
              Edit Profile
            </button>
            <button
              onClick={() => window.open(`/${page.handle}`, '_blank')}
              className="text-xs px-3 py-1.5 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors"
            >
              {t('editor.viewLive')} ↗
            </button>
          </div>
        </div>

        {/* Phone frame */}
        <div className="relative z-10 flex items-center justify-center pt-6 pb-8 h-[calc(100vh-52px)] overflow-hidden">
          <div
            className="overflow-y-auto scrollbar-hide"
            style={{
              aspectRatio: '390 / 844',
              height: 'min(100%, 844px)',
              maxWidth: '100%',
              borderRadius: '44px',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 0 0 2px rgba(255,255,255,0.05), 0 30px 80px rgba(0,0,0,0.8)',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              transform: 'translateZ(0)',
            }}
          >
            <EditableProfileView
              page={page}
              blocks={previewBlocks}
              headerDraft={headerDraft}
              editMode={true}
              onBlockEdit={handleEditBlock}
              onBlockToggle={handleBlockToggle}
              onBlockReorder={handleBlockReorder}
              onRefresh={refresh}
              selectedMode={selectedMode}
              onModeChange={setSelectedMode}
              onAddContent={() => setProfileDashboardOpen(true)}
              onEditVideo={handleEditVideo}
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
          editMode={true}
          onBlockEdit={handleEditBlock}
          onBlockToggle={handleBlockToggle}
          onBlockReorder={handleBlockReorder}
          onRefresh={refresh}
          selectedMode={selectedMode}
          onModeChange={setSelectedMode}
          onAddContent={() => setProfileDashboardOpen(true)}
          onEditVideo={handleEditVideo}
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
        onDraftChange={handleDraftChange}
        onTitleDraftChange={handleTitleDraftChange}
        onHeaderDraftChange={handleHeaderDraftChange}
        themeJson={page.theme_json}
        displayName={page.display_name ?? undefined}
        bio={page.bio ?? undefined}
        avatarUrl={page.avatar_url ?? undefined}
      />
    </DashboardLayout>
  );
}
