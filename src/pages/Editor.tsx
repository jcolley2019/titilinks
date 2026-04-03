import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
import { DesignEditor } from '@/components/editors/DesignEditor';
import { SuggestLinksDialog } from '@/components/editors/SuggestLinksDialog';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { LinkTools } from '@/components/LinkTools';
import { WelcomeCoach } from '@/components/WelcomeCoach';
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
      <div className="flex flex-col xl:flex-row gap-6">
        {/* Left: Editor content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6 flex-1 min-w-0 xl:max-w-[600px]"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{t('editor.title')}</h1>
              <p className="text-muted-foreground mt-1">
                {t('editor.editing')} <span className="text-primary">@{page.handle}</span>
              </p>
            </div>
            <Button
              variant="outline"
              className="gap-2 lg:hidden"
              onClick={() => window.open(`/${page.handle}`, '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
              {t('editor.viewPage')}
            </Button>
          </div>

          {/* Main Editor Tabs: Content vs Design */}
          <Tabs value={editorTab} onValueChange={(v) => setEditorTab(v as 'content' | 'design')}>
            <TabsList data-coach="tabs" className="grid w-full grid-cols-2 max-w-xs">
              <TabsTrigger value="content" className="gap-2">
                <Link2 className="h-4 w-4" />
                {t('editor.content')}
              </TabsTrigger>
              <TabsTrigger value="design" className="gap-2">
                <Palette className="h-4 w-4" />
                {t('editor.design')}
              </TabsTrigger>
            </TabsList>

            {/* Content Tab */}
            <TabsContent value="content" className="space-y-6 mt-6">

          {/* Mode Selector */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-medium text-foreground">{t('editor.pages')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Page Label Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{t('editor.page1Label')}</label>
                  <Input
                    value={page1Label}
                    onChange={(e) => setPage1Label(e.target.value)}
                    onBlur={() => updatePageLabel('page1', page1Label)}
                    placeholder={t('editor.page1')}
                    className="bg-secondary/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{t('editor.page2Label')}</label>
                  <Input
                    value={page2Label}
                    onChange={(e) => setPage2Label(e.target.value)}
                    onBlur={() => updatePageLabel('page2', page2Label)}
                    placeholder={t('editor.page2')}
                    className="bg-secondary/50"
                  />
                </div>
              </div>

              {/* Mode Tabs */}
              <Tabs value={selectedMode} onValueChange={(v) => {
                triggerHaptic('medium');
                setSelectedMode(v as 'shop' | 'recruit');
              }}>
                <TabsList className="grid w-full grid-cols-2 max-w-md">
                  <TabsTrigger value="shop" className="gap-2">
                    <FileText className="h-4 w-4" />
                    {displayPage1Label}
                  </TabsTrigger>
                  <TabsTrigger value="recruit" className="gap-2">
                    <FileText className="h-4 w-4" />
                    {displayPage2Label}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-sm text-muted-foreground">
                {selectedMode === 'shop'
                  ? t('editor.configureFirst')
                  : t('editor.configureSecond')}
              </p>
              
              {/* Sticky CTA Toggle */}
              {currentMode && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-2">
                    <Pin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{t('editor.stickyCta')}</p>
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
                        
                        setModes(prev => prev.map(m => 
                          m.id === currentMode.id 
                            ? { ...m, sticky_cta_enabled: checked } 
                            : m
                        ));
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
            </CardContent>
          </Card>

          {/* Blocks */}
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {`${selectedMode === 'shop' ? displayPage1Label : displayPage2Label} ${t('editor.blocks')}`}
              </CardTitle>
              {currentMode && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-primary/30 hover:bg-primary/10 hover:border-primary/50 text-primary"
                  onClick={() => setSuggestLinksOpen(true)}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('editor.suggestLinks')}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {currentMode ? (
                <div data-coach="blocks">
                <BlockList modeId={currentMode.id} onEditBlock={handleEditBlock} />
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {t('editor.noMode')}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Share Links */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                {t('editor.shareLinks')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{t('editor.defaultLink')}</label>
                <div className="flex gap-2">
                  <Input
                    value={mainLink}
                    readOnly
                    className="bg-secondary/50 font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(mainLink, 'main')}
                    className="flex-shrink-0"
                  >
                    {copiedLink === 'main' ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('editor.defaultLinkDesc')}
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{displayPage2Label} {t('editor.link')}</label>
                <div className="flex gap-2">
                  <Input
                    value={page2Link}
                    readOnly
                    className="bg-secondary/50 font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(page2Link, 'page2')}
                    className="flex-shrink-0"
                  >
                    {copiedLink === 'page2' ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('editor.forcePage2')}
                </p>
              </div>

              {/* Link Tools Section */}
              <div className="pt-4 border-t border-border space-y-4">
                <div className="flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">{t('editor.linkTools')}</span>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm text-muted-foreground flex-shrink-0">{t('editor.defaultLink')}</label>
                    <LinkTools
                      baseUrl={baseUrl}
                      pageId={page.id}
                      destinationUrl={mainLink}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm text-muted-foreground flex-shrink-0">{displayPage2Label} {t('editor.link')}</label>
                    <LinkTools
                      baseUrl={baseUrl}
                      pageId={page.id}
                      destinationUrl={page2Link}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

              {/* Goals Panel */}
              <GoalsPanel page={page} onUpdate={fetchPageData} />
            </TabsContent>

            {/* Design Tab */}
            <TabsContent value="design" className="mt-6">
              <DesignEditor
                pageId={page.id}
                themeJson={page.theme_json}
                onUpdate={() => { fetchPageData(); refreshPreview(); }}
                displayName={page.display_name || undefined}
                bio={page.bio || undefined}
                avatarUrl={page.avatar_url || undefined}
              />
            </TabsContent>
          </Tabs>
        </motion.div>

        {/* Right: Live Preview (desktop only) */}
        <div data-coach="preview" className="hidden xl:block sticky top-24 self-start flex-shrink-0">
          <LivePreviewPanel handle={page.handle} externalRefreshKey={previewRefreshKey} />
        </div>
      </div>

      {/* Block Editor Dialog */}
      <BlockEditorDialog
        blockId={editingBlockId}
        open={editorOpen}
        onOpenChange={handleEditorClose}
        onSave={refreshPreview}
      />

      {/* Suggest Links Dialog */}
      {currentMode && (
        <SuggestLinksDialog
          open={suggestLinksOpen}
          onOpenChange={setSuggestLinksOpen}
          modeId={currentMode.id}
          onLinksAdded={refreshPreview}
        />
      )}

      <WelcomeCoach username={page?.handle || ''} />
    </DashboardLayout>
  );
}
