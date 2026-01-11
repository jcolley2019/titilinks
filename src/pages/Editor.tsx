import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Link as LinkIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { OnboardingForm } from '@/components/OnboardingForm';

export default function Editor() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasPage, setHasPage] = useState(false);

  const checkUserPage = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('pages')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      setHasPage(!!data);
    } catch (error) {
      console.error('Error checking user page:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkUserPage();
  }, [user]);

  const handleOnboardingComplete = () => {
    setHasPage(true);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!hasPage) {
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Link Editor</h1>
            <p className="text-muted-foreground mt-1">Manage your links and content</p>
          </div>
          <Button className="gradient-primary text-primary-foreground gap-2">
            <Plus className="h-4 w-4" />
            Add Link
          </Button>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <LinkIcon className="h-5 w-5 text-primary" />
              Your Links
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-secondary p-4 mb-4">
                <LinkIcon className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground">No links yet</h3>
              <p className="text-muted-foreground mt-1 max-w-sm">
                Add your first link to start building your page. Click the "Add Link" button above.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </DashboardLayout>
  );
}