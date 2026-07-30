import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/DashboardLayout';
import { DeleteAccountCard } from '@/components/settings/DeleteAccountCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Globe, Sun, Moon, Bell, BadgeCheck, Check, Copy, CreditCard, Loader2, Lock } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from 'next-themes';
import { useAuth } from '@/hooks/useAuth';
import { useEntitlements } from '@/hooks/useEntitlements';
import { openBillingPortal } from '@/lib/billing';
import { referralLinkFor } from '@/lib/referrals';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export default function Settings() {
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const { atLeast, showBadge, entitlements, referralCode } = useEntitlements();
  const isPaid = atLeast('pro');
  const queryClient = useQueryClient();
  const [portalLoading, setPortalLoading] = useState(false);
  const [referralCopied, setReferralCopied] = useState(false);

  // BILL.B3 — share link. Matches the ShortLinks copy affordance (transient
  // check, toast on failure) rather than inventing a second one.
  const handleCopyReferral = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralLinkFor(referralCode));
      setReferralCopied(true);
      toast({ title: t('settings.referralCopied') });
      setTimeout(() => setReferralCopied(false), 1500);
    } catch {
      toast({ title: t('settings.referralCopyFailed'), variant: 'destructive' });
    }
  };

  // BILL.B1 — hand off to the Stripe Customer Portal. Cancellations, card
  // updates and invoices all live there; nothing about the subscription is
  // editable in this app.
  const handleManageBilling = async () => {
    setPortalLoading(true);
    const { error, status } = await openBillingPortal();
    if (error) {
      setPortalLoading(false);
      // 409 from create-portal-session = a paid plan with no Stripe customer
      // (e.g. granted by hand). Point them at pricing rather than a dead portal.
      const noAccount = status === 409;
      toast({
        title: noAccount ? t('settings.billingNoAccount') : t('settings.billingPortalError'),
        description: noAccount ? undefined : error,
        variant: 'destructive',
      });
    }
  };

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

        {/* BILL.B1 — plan + Stripe Customer Portal handoff */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              {t('settings.billingTitle')}
            </CardTitle>
            <CardDescription>
              {t('settings.billingDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-base font-medium">{t('settings.billingCurrentPlan')}</Label>
                <p className="truncate text-sm text-muted-foreground" data-testid="settings-current-plan">
                  {entitlements.label}
                </p>
              </div>
              {isPaid ? (
                <Button
                  variant="outline"
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                  data-testid="settings-manage-billing"
                >
                  {portalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('settings.billingManage')}
                </Button>
              ) : (
                <Button asChild className="gradient-primary text-primary-foreground" data-testid="settings-billing-upgrade">
                  <Link to="/#pricing">{t('settings.billingUpgrade')}</Link>
                </Button>
              )}
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

            {/* BILL.B3 — the referral link is live now; the "Coming soon" chip it
                replaces was a placeholder for exactly this. The rewards TEASER
                copy stays, but points at the future cash program rather than the
                give/get month, which ships today. */}
            <div className="mt-5 border-t border-border pt-4">
              <Label className="text-base font-medium">{t('settings.referralTitle')}</Label>
              <p className="mt-1 text-sm text-muted-foreground">{t('settings.referralDesc')}</p>

              {referralCode ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code
                    className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted/50 px-3 py-2 text-xs"
                    data-testid="settings-referral-link"
                  >
                    {referralLinkFor(referralCode)}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyReferral}
                    data-testid="settings-referral-copy"
                    className="shrink-0"
                  >
                    {referralCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                    {referralCopied ? t('settings.referralCopied') : t('settings.referralCopy')}
                  </Button>
                </div>
              ) : (
                // No code yet (migration not run, or still loading) — say so
                // rather than rendering a link to /?ref=null.
                <p className="mt-3 text-xs text-muted-foreground" data-testid="settings-referral-pending">
                  {t('settings.referralUnavailable')}
                </p>
              )}

              <p className="mt-3 text-xs text-muted-foreground">{t('settings.referralHowItWorks')}</p>

              {/* Still-coming cash program — informational, not interactive */}
              <div className="mt-3 flex items-start gap-2 opacity-60">
                <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {t('settings.badgeRewardsChip')}
                </span>
                <p className="text-xs text-muted-foreground">{t('settings.badgeRewardsTeaser')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* BILL.B4 — danger zone, last on the page and visually separated */}
        <DeleteAccountCard />

        <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
          <Link to="/terms" className="transition-colors hover:text-foreground">{t('footer.terms')}</Link>
          <span aria-hidden="true">·</span>
          <Link to="/privacy" className="transition-colors hover:text-foreground">{t('footer.privacy')}</Link>
        </div>
      </motion.div>
    </DashboardLayout>
  );
}
