import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Globe, Sun, Moon, Bell, BadgeCheck, Lock } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from 'next-themes';
import { useAuth } from '@/hooks/useAuth';
import { useEntitlements } from '@/hooks/useEntitlements';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export default function Settings() {
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const { atLeast, showBadge } = useEntitlements();
  const isPaid = atLeast('pro');
  const queryClient = useQueryClient();

  // PROMO.TOGGLE.1: toggle the public "Made with TitiLinks" badge (paid tiers).
  // Optimistically flips the shared ['plan', user.id] cache so the editor
  // preview follows immediately; rolls back + toasts on error.
  const badgeMutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (!user) throw new Error('not signed in');
      const { error } = await supabase.from('profiles').update({ show_badge: next }).eq('id', user.id);
      if (error) throw error;
      return next;
    },
    onMutate: async (next: boolean) => {
      const key = ['plan', user?.id];
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old: { plan?: string; show_badge?: boolean } | null | undefined) =>
        old ? { ...old, show_badge: next } : old,
      );
      return { prev, key };
    },
    onError: (_err, _next, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.key, ctx.prev);
      toast({ title: t('settings.badgeError'), variant: 'destructive' });
    },
    onSuccess: () => {
      toast({ title: t('settings.badgeSaved') });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', user?.id] });
    },
  });

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{t('settings.title')}</h1>
          <p className="text-muted-foreground mt-1">{t('settings.subtitle')}</p>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              {t('settings.languageTitle')}
            </CardTitle>
            <CardDescription>
              {t('settings.languageDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">
                  {language === 'en' ? t('settings.languageEn') : t('settings.languageEs')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {language === 'en'
                    ? t('settings.switchToEs')
                    : t('settings.switchToEn')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-medium ${language === 'en' ? 'text-primary' : 'text-muted-foreground'}`}>
                  EN
                </span>
                <Switch
                  checked={language === 'es'}
                  onCheckedChange={(checked) => setLanguage(checked ? 'es' : 'en')}
                />
                <span className={`text-sm font-medium ${language === 'es' ? 'text-primary' : 'text-muted-foreground'}`}>
                  ES
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sun className="h-5 w-5 text-primary" />
              {t('settings.appearanceTitle')}
            </CardTitle>
            <CardDescription>
              {t('settings.appearanceDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">
                  {theme === 'dark' ? t('settings.darkMode') : t('settings.lightMode')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('settings.themeToggleDesc')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Sun className={`h-4 w-4 ${theme !== 'dark' ? 'text-primary' : 'text-muted-foreground'}`} />
                <Switch
                  checked={theme === 'dark'}
                  onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                />
                <Moon className={`h-4 w-4 ${theme === 'dark' ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              {t('settings.notificationsTitle')}
            </CardTitle>
            <CardDescription>
              {t('settings.notificationsDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">{t('settings.emailNotifications')}</Label>
                <p className="text-sm text-muted-foreground">{t('settings.emailNotificationsDesc')}</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">{t('settings.weeklyDigest')}</Label>
                <p className="text-sm text-muted-foreground">{t('settings.weeklyDigestDesc')}</p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>

        {/* PROMO.TOGGLE.1 — optional "Made with TitiLinks" badge (paid tiers) */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-primary" />
              {t('settings.badgeTitle')}
            </CardTitle>
            <CardDescription>
              {t('settings.badgeDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-2">
                <Label className="text-base font-medium">{t('settings.badgeToggleLabel')}</Label>
                {!isPaid && (
                  <Link
                    to="/#pricing"
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#C9A55C]/15 px-2 py-0.5 text-[10px] font-bold text-[#C9A55C]"
                  >
                    <Lock className="h-2.5 w-2.5" /> PRO
                  </Link>
                )}
              </div>
              {isPaid ? (
                <Switch
                  checked={showBadge}
                  disabled={badgeMutation.isPending}
                  onCheckedChange={(checked) => badgeMutation.mutate(checked)}
                />
              ) : (
                // Free stays branded — the switch is locked ON.
                <Switch checked disabled />
              )}
            </div>

            {/* Coming-soon rewards teaser — informational, not interactive */}
            <div className="mt-4 flex items-start gap-2 opacity-60">
              <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {t('settings.badgeRewardsChip')}
              </span>
              <p className="text-xs text-muted-foreground">{t('settings.badgeRewardsTeaser')}</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
          <Link to="/terms" className="transition-colors hover:text-foreground">{t('footer.terms')}</Link>
          <span aria-hidden="true">·</span>
          <Link to="/privacy" className="transition-colors hover:text-foreground">{t('footer.privacy')}</Link>
        </div>
      </motion.div>
    </DashboardLayout>
  );
}
