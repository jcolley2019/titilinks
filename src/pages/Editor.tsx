import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, ShoppingBag, Users, ExternalLink, Link2, Copy, Check, QrCode, Palette } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { OnboardingForm } from '@/components/OnboardingForm';
import { BlockList } from '@/components/BlockList';
import { GoalsPanel } from '@/components/GoalsPanel';
import { BlockEditorDialog } from '@/components/BlockEditorDialog';
import { DesignEditor } from '@/components/editors/DesignEditor';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { LinkTools } from '@/components/LinkTools';
import type { Tables } from '@/integrations/supabase/types';

type Page = Tables<'pages'>;
type Mode = Tables<'modes'>;

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

  const baseUrl = `${window.location.protocol}//${window.location.host}`;
  const domain = window.location.host;
  const mainLink = page ? `${baseUrl}/${page.handle}` : '';
  const recruitLink = page ? `${mainLink}?mode=recruit` : '';

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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
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
            className="gap-2"
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
            <CardTitle className="text-lg font-medium text-foreground">Page Mode</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedMode} onValueChange={(v) => setSelectedMode(v as 'shop' | 'recruit')}>
              <TabsList className="grid w-full grid-cols-2 max-w-md">
                <TabsTrigger value="shop" className="gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  Shop
                </TabsTrigger>
                <TabsTrigger value="recruit" className="gap-2">
                  <Users className="h-4 w-4" />
                  Recruit
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="text-sm text-muted-foreground mt-3">
              {selectedMode === 'shop'
                ? 'Showcase products and drive sales with your audience.'
                : 'Attract and recruit new team members or collaborators.'}
            </p>
          </CardContent>
        </Card>

        {/* Blocks */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
              {selectedMode === 'shop' ? (
                <ShoppingBag className="h-5 w-5 text-primary" />
              ) : (
                <Users className="h-5 w-5 text-primary" />
              )}
              {selectedMode === 'shop' ? 'Shop' : 'Recruit'} Blocks
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
              <label className="text-sm font-medium text-foreground">Main Link</label>
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
                Default link that auto-detects mode based on referrer
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Recruit Link</label>
              <div className="flex gap-2">
                <Input
                  value={recruitLink}
                  readOnly
                  className="bg-secondary/50 font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(recruitLink, 'recruit')}
                  className="flex-shrink-0"
                >
                  {copiedLink === 'recruit' ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Forces recruit mode regardless of referrer
              </p>
            </div>

            {/* Link Tools Section */}
            <div className="pt-4 border-t border-border space-y-4">
              <div className="flex items-center gap-2">
                <QrCode className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Link Tools</span>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Main Hub Link</label>
                <LinkTools
                  baseUrl={baseUrl}
                  pageId={page.id}
                  destinationUrl={mainLink}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Recruit Link</label>
                <LinkTools
                  baseUrl={baseUrl}
                  pageId={page.id}
                  destinationUrl={recruitLink}
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

      {/* Block Editor Dialog */}
      <BlockEditorDialog
        blockId={editingBlockId}
        open={editorOpen}
        onOpenChange={handleEditorClose}
      />
    </DashboardLayout>
  );
}
