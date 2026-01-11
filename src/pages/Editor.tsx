import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ShoppingBag, Users, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { OnboardingForm } from '@/components/OnboardingForm';
import { BlockList } from '@/components/BlockList';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type Page = Tables<'pages'>;
type Mode = Tables<'modes'>;

export default function Editor() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page | null>(null);
  const [modes, setModes] = useState<Mode[]>([]);
  const [selectedMode, setSelectedMode] = useState<'shop' | 'recruit'>('shop');

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
    // For now, just show a toast - block editing can be implemented later
    toast.info('Block editor coming soon!');
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
      </motion.div>
    </DashboardLayout>
  );
}
