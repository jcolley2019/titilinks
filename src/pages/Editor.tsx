import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { OnboardingForm } from '@/components/OnboardingForm';
import { BlockEditorContent } from '@/components/BlockEditorContent';
import { EditableProfileView } from '@/components/EditableProfileView';
import { ProfileDashboard } from '@/components/ProfileDashboard';
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
  const [selectedMode, setSelectedMode] = useState<'shop' | 'recruit'>('shop');
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [allBlocks, setAllBlocks] = useState<BlockWithItems[]>([]);
  const [profileDashboardOpen, setProfileDashboardOpen] = useState(false);

  // Page labels from theme
  const themeJson = (page?.theme_json as ThemeJson) || {};
  const page1Label = themeJson.pages?.page1?.label || 'Page 1';
  const page2Label = themeJson.pages?.page2?.label || 'Page 2';

  // ── Data Fetching ──

  const autoPopulatePlaceholders = async (pageData: Page, modesData: Mode[]) => {
    const theme = pageData.theme_json as ThemeJson;
    if (!theme?.linkLayout || !theme?.linkCount) return;

    const shopMode = modesData.find((m) => m.type === 'shop');
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

  const fetchBlocks = async () => {
    const mode = modes.find((m) => m.type === selectedMode);
    if (!mode) {
      setAllBlocks([]);
      return;
    }

    try {
      const { data: blocksData, error: blocksError } = await supabase
        .from('blocks')
        .select('*')
        .eq('mode_id', mode.id)
        .order('order_index', { ascending: true });

      if (blocksError) throw blocksError;

      const blocks = blocksData || [];
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
    setEditingBlockId(blockId);
    setEditorOpen(true);
  };

  const handleEditorClose = (open: boolean) => {
    setEditorOpen(open);
    if (!open) {
      setEditingBlockId(null);
      fetchBlocks();
    }
  };

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
    setAllBlocks(reordered);

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

  const handleOnboardingComplete = () => {
    fetchPageData();
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

  if (!page) {
    return (
      <DashboardLayout>
        <OnboardingForm onComplete={handleOnboardingComplete} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* ═══ DESKTOP: Blurred hero bg + phone frame ═══ */}
      <div className="hidden lg:block fixed inset-0 left-64 top-0 overflow-hidden">
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

          {/* Page 1 / Page 2 tabs */}
          <div className="flex items-center gap-1 bg-white/10 rounded-full p-0.5">
            <button
              onClick={() => setSelectedMode('shop')}
              className={cn(
                'px-4 py-1 rounded-full text-xs font-medium transition-colors',
                selectedMode === 'shop'
                  ? 'bg-[#C9A55C] text-[#0e0c09]'
                  : 'text-white/60 hover:text-white'
              )}
            >
              {page1Label}
            </button>
            <button
              onClick={() => setSelectedMode('recruit')}
              className={cn(
                'px-4 py-1 rounded-full text-xs font-medium transition-colors',
                selectedMode === 'recruit'
                  ? 'bg-[#C9A55C] text-[#0e0c09]'
                  : 'text-white/60 hover:text-white'
              )}
            >
              {page2Label}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-white/50">@{page.handle}</span>
            <button
              onClick={() => window.open(`/${page.handle}`, '_blank')}
              className="text-xs px-3 py-1.5 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors"
            >
              {t('editor.viewLive')} ↗
            </button>
          </div>
        </div>

        {/* Phone frame */}
        <div className="relative z-10 flex items-start justify-center pt-6 pb-8 h-[calc(100vh-52px)] overflow-hidden">
          <div
            className="w-[390px] h-full overflow-y-auto"
            style={{
              borderRadius: '44px',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 0 0 2px rgba(255,255,255,0.05), 0 30px 80px rgba(0,0,0,0.8)',
            }}
          >
            <EditableProfileView
              page={page}
              blocks={allBlocks}
              editMode={true}
              onBlockEdit={handleEditBlock}
              onBlockToggle={handleBlockToggle}
              onBlockReorder={handleBlockReorder}
              onRefresh={fetchBlocks}
              selectedMode={selectedMode}
              onModeChange={setSelectedMode}
              onAddContent={() => setProfileDashboardOpen(true)}
            />
          </div>
        </div>
      </div>

      {/* ═══ MOBILE: Full screen live profile ═══ */}
      <div className="lg:hidden -mx-4 -mt-6 min-h-screen bg-[#0e0c09]">
        <EditableProfileView
          page={page}
          blocks={allBlocks}
          editMode={true}
          onBlockEdit={handleEditBlock}
          onBlockToggle={handleBlockToggle}
          onBlockReorder={handleBlockReorder}
          onRefresh={fetchBlocks}
          selectedMode={selectedMode}
          onModeChange={setSelectedMode}
          onAddContent={() => setProfileDashboardOpen(true)}
        />
      </div>

      {/* ═══ ProfileDashboard panel ═══ */}
      <ProfileDashboard
        open={profileDashboardOpen}
        onClose={() => setProfileDashboardOpen(false)}
        pageId={page.id}
        modeId={currentMode?.id || null}
        onBlockEdit={handleEditBlock}
        onRefresh={fetchBlocks}
      />

      {/* ═══ Block editor dialog ═══ */}
      <BlockEditorContent
        blockId={editingBlockId}
        open={editorOpen}
        onOpenChange={handleEditorClose}
        onSave={fetchBlocks}
      />
    </DashboardLayout>
  );
}
