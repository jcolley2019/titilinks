import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, ShoppingBag, Users, ExternalLink, Link2, Copy, Check, QrCode, Palette, Pin, FileText, Sparkles } from 'lucide-react';
import { LivePreviewPanel } from '@/components/LivePreviewPanel';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { OnboardingForm } from '@/components/OnboardingForm';
import { BlockList } from '@/components/BlockList';
import { GoalsPanel } from '@/components/GoalsPanel';
import { BlockEditorDialog } from '@/components/BlockEditorDialog';
import { MobileDashboard } from '@/components/MobileDashboard';
import { DesignEditor } from '@/components/editors/DesignEditor';
import { SuggestLinksDialog } from '@/components/editors/SuggestLinksDialog';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { LinkTools } from '@/components/LinkTools';
import { WelcomeCoach } from '@/components/WelcomeCoach';
import { MobileInlineEditor } from '@/components/MobileInlineEditor';
import { triggerHaptic } from '@/hooks/useHapticFeedback';
import type { Tables } from '@/integrations/supabase/types';
import type { Json } from '@/integrations/supabase/types';

type Page = Tables<'pages'>;
type Mode = Tables<'modes'> & { sticky_cta_enabled?: boolean };

interface ThemeJson {
  pages?: {
    page1?: { label?: string };
    page2?: { label?: string };
  };
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
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [editorTab, setEditorTab] = useState<'content' | 'design'>('content');
  const [page1Label, setPage1Label] = useState('');
  const [page2Label, setPage2Label] = useState('');
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [suggestLinksOpen, setSuggestLinksOpen] = useState(false);
  const [mobileBlocks, setMobileBlocks] = useState<Array<{
    id: string;
    type: string;
    title: string | null;
    is_enabled: boolean;
    order_index: number;
  }>>([]);

  const refreshPreview = () => setPreviewRefreshKey((k) => k + 1);
  const baseUrl = `${window.location.protocol}//${window.location.host}`;
  const domain = window.location.host;
  const mainLink = page ? `${baseUrl}/${page.handle}` : '';
  const page2Link = page ? `${mainLink}?page=2` : '';

  // Parse theme_json for page labels
  const themeJson = (page?.theme_json as ThemeJson) || {};
  const displayPage1Label = page1Label || themeJson.pages?.page1?.label || t('editor.page1');
  const displayPage2Label = page2Label || themeJson.pages?.page2?.label || t('editor.page2');

  // Initialize labels from theme_json when page loads
  useEffect(() => {
    if (page?.theme_json) {
      const theme = page.theme_json as ThemeJson;
      setPage1Label(theme.pages?.page1?.label || '');
      setPage2Label(theme.pages?.page2?.label || '');
    }
  }, [page?.id]);

  const updatePageLabel = async (pageKey: 'page1' | 'page2', label: string) => {
    if (!page) return;
    
    try {
      const currentTheme = (page.theme_json as ThemeJson) || {};
      const updatedTheme: ThemeJson = {
        ...currentTheme,
        pages: {
          ...currentTheme.pages,
          [pageKey]: {
            ...currentTheme.pages?.[pageKey],
            label: label || undefined, // Remove if empty
          },
        },
      };

      const { error } = await supabase
        .from('pages')
        .update({ theme_json: updatedTheme as Json })
        .eq('id', page.id);

      if (error) throw error;

      setPage({ ...page, theme_json: updatedTheme as Json });
      toast.success(t('editor.labelUpdated'));
      refreshPreview();
    } catch (error) {
      console.error('Error updating page label:', error);
      toast.error(t('editor.labelFailed'));
    }
  };

  const copyToClipboard = async (text: string, linkType: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLink(linkType);
      toast.success(t('editor.copied'));
      setTimeout(() => setCopiedLink(null), 2000);
    } catch {
      toast.error(t('editor.copyFailed'));
    }
  };

  const autoPopulatePlaceholders = async (pageData: Page, modesData: Mode[]) => {
    const theme = pageData.theme_json as ThemeJson & { linkLayout?: string; linkCount?: number };
    if (!theme?.linkLayout || !theme?.linkCount) return;

    const shopMode = modesData.find((m) => m.type === 'shop');
    if (!shopMode) return;

    // Determine the target block type based on layout
    const targetBlockType = theme.linkLayout === 'gallery' ? 'product_cards' : 'links';

    const { data: targetBlock } = await supabase
      .from('blocks')
      .select('id')
      .eq('mode_id', shopMode.id)
      .eq('type', targetBlockType)
      .maybeSingle();

    if (!targetBlock) return;

    // Check if block already has items (not a fresh page)
    const { data: existingItems } = await supabase
      .from('block_items')
      .select('id')
      .eq('block_id', targetBlock.id)
      .limit(1);

    if (existingItems && existingItems.length > 0) return;

    // Create placeholder items
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
      // Fetch user's page
      const { data: pageData, error: pageError } = await supabase
        .from('pages')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (pageError) throw pageError;

      if (pageData) {
        setPage(pageData);

        // Fetch modes for the page
        const { data: modesData, error: modesError } = await supabase
          .from('modes')
          .select('*')
          .eq('page_id', pageData.id);

        if (modesError) throw modesError;
        setModes(modesData || []);

        // Auto-populate placeholder blocks for newly onboarded users
        await autoPopulatePlaceholders(pageData, modesData || []);
      }
    } catch (error) {
      console.error('Error fetching page data:', error);
      toast.error(t('editor.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPageData();
  }, [user]);

  useEffect(() => {
    if (!currentMode) return;
    const fetchMobileBlocks = async () => {
      const { data } = await supabase
        .from('blocks')
        .select('id, type, title, is_enabled, order_index')
        .eq('mode_id', currentMode.id)
        .order('order_index', { ascending: true });
      if (data) setMobileBlocks(data);
    };
    fetchMobileBlocks();
  }, [currentMode?.id, previewRefreshKey]);

  const handleOnboardingComplete = () => {
    fetchPageData();
  };

  const handleEditBlock = (blockId: string) => {
    setEditingBlockId(blockId);
    setEditorOpen(true);
  };

  const handleEditorClose = (open: boolean) => {
    setEditorOpen(open);
    if (!open) {
      setEditingBlockId(null);
    }
  };

  const handleMobileToggle = async (blockId: string, enabled: boolean) => {
    setMobileBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, is_enabled: enabled } : b))
    );
    await supabase
      .from('blocks')
      .update({ is_enabled: enabled })
      .eq('id', blockId);
    refreshPreview();
  };

  const currentMode = modes.find((m) => m.type === selectedMode);

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

      {/* ── DESKTOP: Link.me-style two-panel split ── */}
      <div className="hidden lg:flex h-[calc(100vh-4rem)] overflow-hidden -mx-4 xl:-mx-8 -mt-6">

        {/* LEFT PANEL — 400px fixed, scrollable */}
        <div className="w-[400px] flex-shrink-0 flex flex-col h-full border-r border-border bg-background">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <div>
              <h1 className="text-sm font-semibold text-foreground">{t('editor.title')}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">@{page.handle}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={() => window.open(`/${page.handle}`, '_blank')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View
            </Button>
          </div>

          {/* Content / Design tabs */}
          <Tabs
            value={editorTab}
            onValueChange={(v) => setEditorTab(v as 'content' | 'design')}
            className="flex flex-col flex-1 overflow-hidden"
          >
            <div className="px-5 pt-3 pb-2 flex-shrink-0">
              <TabsList className="grid w-full grid-cols-2 h-9">
                <TabsTrigger value="content" className="gap-1.5 text-xs">
                  <Link2 className="h-3.5 w-3.5" />
                  {t('editor.content')}
                </TabsTrigger>
                <TabsTrigger value="design" className="gap-1.5 text-xs">
                  <Palette className="h-3.5 w-3.5" />
                  {t('editor.design')}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* CONTENT TAB */}
            <TabsContent value="content" className="flex-1 overflow-y-auto px-5 pb-6 mt-0 space-y-4">

              {/* Page switcher */}
              <Tabs
                value={selectedMode}
                onValueChange={(v) => {
                  triggerHaptic('medium');
                  setSelectedMode(v as 'shop' | 'recruit');
                }}
              >
                <TabsList className="grid w-full grid-cols-2 h-9">
                  <TabsTrigger value="shop" className="text-xs gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    {displayPage1Label}
                  </TabsTrigger>
                  <TabsTrigger value="recruit" className="text-xs gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    {displayPage2Label}
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Blocks header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Blocks</span>
                {currentMode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs h-7 px-2 text-primary hover:bg-primary/10"
                    onClick={() => setSuggestLinksOpen(true)}
                  >
                    <Sparkles className="h-3 w-3" />
                    {t('editor.suggestLinks')}
                  </Button>
                )}
              </div>

              {/* Block list */}
              {currentMode ? (
                <div data-coach="blocks">
                  <BlockList modeId={currentMode.id} onEditBlock={handleEditBlock} />
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {t('editor.noMode')}
                </div>
              )}

              {/* Sticky CTA toggle */}
              {currentMode && (
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex items-center gap-2">
                    <Pin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-medium">{t('editor.stickyCta')}</p>
                      <p className="text-xs text-muted-foreground">{t('editor.stickyCtaDesc')}</p>
                    </div>
                  </div>
                  <Switch
                    checked={currentMode.sticky_cta_enabled ?? false}
                    onCheckedChange={async (checked) => {
                      try {
                        const { error } = await supabase
                          .from('modes')
                          .update({ sticky_cta_enabled: checked })
                          .eq('id', currentMode.id);
                        if (error) throw error;
                        setModes((prev) =>
                          prev.map((m) =>
                            m.id === currentMode.id ? { ...m, sticky_cta_enabled: checked } : m
                          )
                        );
                        toast.success(checked ? t('editor.stickyEnabled') : t('editor.stickyDisabled'));
                        refreshPreview();
                      } catch (error) {
                        console.error('Error updating sticky CTA:', error);
                        toast.error(t('editor.settingFailed'));
                      }
                    }}
                  />
                </div>
              )}

              {/* Share link — compact */}
              <div className="pt-3 border-t border-border space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t('editor.shareLinks')}
                </p>
                <div className="flex gap-2">
                  <Input
                    value={mainLink}
                    readOnly
                    className="bg-secondary/50 font-mono text-xs h-8"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={() => copyToClipboard(mainLink, 'main')}
                  >
                    {copiedLink === 'main' ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Goals */}
              <GoalsPanel page={page} onUpdate={fetchPageData} />
            </TabsContent>

            {/* DESIGN TAB */}
            <TabsContent value="design" className="flex-1 overflow-y-auto px-5 pb-6 mt-0">
              <DesignEditor
                pageId={page.id}
                themeJson={page.theme_json}
                onUpdate={() => {
                  fetchPageData();
                  refreshPreview();
                }}
                displayName={page.display_name || undefined}
                bio={page.bio || undefined}
                avatarUrl={page.avatar_url || undefined}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* RIGHT PANEL — live preview centered */}
        <div className="flex-1 bg-muted/20 flex items-center justify-center overflow-auto py-8">
          <div data-coach="preview">
            <LivePreviewPanel handle={page.handle} externalRefreshKey={previewRefreshKey} />
          </div>
        </div>
      </div>

      {/* ── MOBILE: Inline editor ── */}
      <div className="lg:hidden">
        {currentMode ? (
          <MobileInlineEditor
            page={page}
            blocks={mobileBlocks}
            onEditBlock={handleEditBlock}
            onToggleBlock={handleMobileToggle}
          />
        ) : (
          <div className="flex items-center justify-center h-64 text-[#666] bg-[#0e0c09]">
            <p className="text-sm">Loading...</p>
          </div>
        )}
      </div>

      {/* ── DIALOGS — unchanged ── */}
      <BlockEditorDialog
        blockId={editingBlockId}
        open={editorOpen}
        onOpenChange={handleEditorClose}
        onSave={refreshPreview}
      />

      {currentMode && (
        <SuggestLinksDialog
          open={suggestLinksOpen}
          onOpenChange={setSuggestLinksOpen}
          modeId={currentMode.id}
          onLinksAdded={refreshPreview}
        />
      )}

      <WelcomeCoach username={page?.handle || ''} />

      <MobileDashboard
        pageId={page.id}
        modeId={currentMode?.id || null}
        onSave={refreshPreview}
      />
    </DashboardLayout>
  );
}
