import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, ShoppingBag, Users, ExternalLink, Link2, Copy, Check, QrCode, Palette, Pin, FileText } from 'lucide-react';
import { LivePreviewPanel } from '@/components/LivePreviewPanel';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { OnboardingForm } from '@/components/OnboardingForm';
import { BlockList } from '@/components/BlockList';
import { GoalsPanel } from '@/components/GoalsPanel';
import { BlockEditorDialog } from '@/components/BlockEditorDialog';
import { DesignEditor } from '@/components/editors/DesignEditor';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { LinkTools } from '@/components/LinkTools';
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

  const baseUrl = `${window.location.protocol}//${window.location.host}`;
  const domain = window.location.host;
  const mainLink = page ? `${baseUrl}/${page.handle}` : '';
  const page2Link = page ? `${mainLink}?page=2` : '';

  // Parse theme_json for page labels
  const themeJson = (page?.theme_json as ThemeJson) || {};
  const displayPage1Label = page1Label || themeJson.pages?.page1?.label || 'Page 1';
  const displayPage2Label = page2Label || themeJson.pages?.page2?.label || 'Page 2';

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
      toast.success('Page label updated');
    } catch (error) {
      console.error('Error updating page label:', error);
      toast.error('Failed to update label');
    }
  };

  const copyToClipboard = async (text: string, linkType: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLink(linkType);
      toast.success('Copied to clipboard!');
      setTimeout(() => setCopiedLink(null), 2000);
    } catch {
      toast.error('Failed to copy');
    }
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
      }
    } catch (error) {
      console.error('Error fetching page data:', error);
      toast.error('Failed to load page data');
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
      <div className="flex gap-8">
        {/* Left: Editor content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6 flex-1 min-w-0 lg:max-w-[600px]"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Link Editor</h1>
              <p className="text-muted-foreground mt-1">
                Editing <span className="text-primary">@{page.handle}</span>
              </p>
            </div>
            <Button
              variant="outline"
              className="gap-2 lg:hidden"
              onClick={() => window.open(`/${page.handle}`, '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
              View Page
            </Button>
          </div>

          {/* Main Editor Tabs: Content vs Design */}
          <Tabs value={editorTab} onValueChange={(v) => setEditorTab(v as 'content' | 'design')}>
            <TabsList className="grid w-full grid-cols-2 max-w-xs">
              <TabsTrigger value="content" className="gap-2">
                <Link2 className="h-4 w-4" />
                Content
              </TabsTrigger>
              <TabsTrigger value="design" className="gap-2">
                <Palette className="h-4 w-4" />
                Design
              </TabsTrigger>
            </TabsList>

            {/* Content Tab */}
            <TabsContent value="content" className="space-y-6 mt-6">

          {/* Mode Selector */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-medium text-foreground">Pages</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Page Label Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Page 1 Label</label>
                  <Input
                    value={page1Label}
                    onChange={(e) => setPage1Label(e.target.value)}
                    onBlur={() => updatePageLabel('page1', page1Label)}
                    placeholder="Page 1"
                    className="bg-secondary/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Page 2 Label</label>
                  <Input
                    value={page2Label}
                    onChange={(e) => setPage2Label(e.target.value)}
                    onBlur={() => updatePageLabel('page2', page2Label)}
                    placeholder="Page 2"
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
                  ? 'Configure content for your first page.'
                  : 'Configure content for your second page.'}
              </p>
              
              {/* Sticky CTA Toggle */}
              {currentMode && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-2">
                    <Pin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Sticky CTA</p>
                      <p className="text-xs text-muted-foreground">Show floating CTA after scroll</p>
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
                        toast.success(checked ? 'Sticky CTA enabled' : 'Sticky CTA disabled');
                      } catch (error) {
                        console.error('Error updating sticky CTA:', error);
                        toast.error('Failed to update setting');
                      }
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Blocks */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {selectedMode === 'shop' ? displayPage1Label : displayPage2Label} Blocks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {currentMode ? (
                <BlockList modeId={currentMode.id} onEditBlock={handleEditBlock} />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No mode found. Please refresh the page.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Share Links */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
                <Link2 className="h-5 w-5 text-primary" />
                Share Links
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Default Link</label>
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
                  Default link that can auto-detect which page to show.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{displayPage2Label} Link</label>
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
                  Forces Page 2 regardless of referrer.
                </p>
              </div>

              {/* Link Tools Section */}
              <div className="pt-4 border-t border-border space-y-4">
                <div className="flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Link Tools</span>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">Default Link</label>
                  <LinkTools
                    baseUrl={baseUrl}
                    pageId={page.id}
                    destinationUrl={mainLink}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">{displayPage2Label} Link</label>
                  <LinkTools
                    baseUrl={baseUrl}
                    pageId={page.id}
                    destinationUrl={page2Link}
                  />
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
                onUpdate={fetchPageData}
                displayName={page.display_name || undefined}
                bio={page.bio || undefined}
                avatarUrl={page.avatar_url || undefined}
              />
            </TabsContent>
          </Tabs>
        </motion.div>

        {/* Right: Live Preview (desktop only) */}
        <div className="hidden lg:block sticky top-24 self-start flex-shrink-0">
          <LivePreviewPanel handle={page.handle} />
        </div>
      </div>

      {/* Block Editor Dialog */}
      <BlockEditorDialog
        blockId={editingBlockId}
        open={editorOpen}
        onOpenChange={handleEditorClose}
      />
    </DashboardLayout>
  );
}
