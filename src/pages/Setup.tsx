import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PenSquare, Sparkles, Loader2, Rocket } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export default function Setup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasPage, setHasPage] = useState(false);

  useEffect(() => {
    async function checkUserPage() {
      if (!user) return;

      const { data, error } = await supabase
        .from('pages')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && data) {
        setHasPage(true);
        navigate('/dashboard/editor', { replace: true });
      } else {
        setHasPage(false);
        setLoading(false);
      }
    }

    checkUserPage();
  }, [user, navigate]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4"
      >
        <div className="rounded-full bg-primary/10 p-6 mb-6">
          <Rocket className="h-12 w-12 text-primary" />
        </div>
        
        <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-3">
          Welcome to <span className="gradient-text">TitiLINKS</span>
        </h1>
        <p className="text-muted-foreground text-lg max-w-md mb-10">
          Let's create your personalized link page. How would you like to get started?
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
          <Card 
            className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer group"
            onClick={() => navigate('/dashboard/editor')}
          >
            <CardHeader className="pb-2">
              <div className="rounded-full bg-secondary p-3 w-fit mx-auto mb-2 group-hover:bg-primary/10 transition-colors">
                <PenSquare className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <CardTitle className="text-lg text-foreground">Set up manually</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Build your page step by step with full control over every detail
              </CardDescription>
            </CardContent>
          </Card>

          <Card 
            className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer group"
            onClick={() => navigate('/dashboard/ai-setup')}
          >
            <CardHeader className="pb-2">
              <div className="rounded-full bg-secondary p-3 w-fit mx-auto mb-2 group-hover:bg-primary/10 transition-colors">
                <Sparkles className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <CardTitle className="text-lg text-foreground">Build with AI</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Let AI create your page in seconds based on your preferences
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </DashboardLayout>
  );
}
