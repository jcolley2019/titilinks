import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Sparkles, PenLine, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { supabase } from '@/integrations/supabase/client';

export default function Setup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkUserPage() {
      if (!user) return;
      const { data, error } = await supabase
        .from('pages')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && data) {
        navigate('/dashboard/editor', { replace: true });
      } else {
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

  const aiFeatures = [t('setup.aiFeature1'), t('setup.aiFeature2'), t('setup.aiFeature3')];
  const manualFeatures = [t('setup.manualFeature1'), t('setup.manualFeature2'), t('setup.manualFeature3')];

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-10"
      >
        <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-10 text-center">
          {t('setup.heading')}
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
          {/* AI Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            whileHover={{ scale: 1.03 }}
            className="glass-card relative border border-primary/60 rounded-xl p-6 flex flex-col cursor-pointer group"
            onClick={() => navigate('/dashboard/ai-setup')}
          >
            {/* Recommended badge */}
            <span className="absolute top-3 right-3 bg-primary text-primary-foreground text-[11px] font-semibold px-2.5 py-0.5 rounded-full">
              {t('setup.recommended')}
            </span>

            <div className="rounded-full bg-primary/15 p-3 w-fit mb-4">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>

            <h2 className="text-xl font-bold text-foreground mb-1">{t('setup.aiTitle')}</h2>
            <p className="text-muted-foreground text-sm mb-5">
              {t('setup.aiDesc')}
            </p>

            <ul className="space-y-2 mb-6 flex-1">
              {aiFeatures.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            <Button className="w-full gradient-gold text-primary-foreground font-semibold rounded-lg">
              {t('setup.aiButton')} →
            </Button>
          </motion.div>

          {/* Manual Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            whileHover={{ scale: 1.03 }}
            className="glass-card border border-border rounded-xl p-6 flex flex-col cursor-pointer group"
            onClick={() => navigate('/dashboard/setup')}
          >
            <div className="rounded-full bg-secondary p-3 w-fit mb-4">
              <PenLine className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>

            <h2 className="text-xl font-bold text-foreground mb-1">{t('setup.manualTitle')}</h2>
            <p className="text-muted-foreground text-sm mb-5">
              {t('setup.manualDesc')}
            </p>

            <ul className="space-y-2 mb-6 flex-1">
              {manualFeatures.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="h-4 w-4 text-muted-foreground shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            <Button variant="outline" className="w-full rounded-lg font-semibold">
              {t('setup.manualButton')} →
            </Button>
          </motion.div>
        </div>
      </motion.div>
    </DashboardLayout>
  );
}
