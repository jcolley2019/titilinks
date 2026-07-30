// UPGRADE.1 — the in-app upgrade surface.
//
// Until now the only place to buy Pro was the public landing page's pricing
// grid: every in-app upsell sent a signed-in creator out to /#pricing, past
// three marketing sections, to a card that then had to re-detect their auth
// state. This page is that pitch, compact, inside the dashboard — same price,
// same anchor, same feature list (all from src/lib/pricing.ts), one button.
//
// Already paying? There is nothing to sell. The page swaps to a plan readout
// plus the Stripe Customer Portal handoff, matching the Settings billing card
// rather than showing a second, competing "Upgrade" CTA.

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Crown, Loader2, Sparkles } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/hooks/useLanguage';
import { useEntitlements } from '@/hooks/useEntitlements';
import { openBillingPortal, startCheckout } from '@/lib/billing';
import {
  PRO_PRICE,
  intervalToggleLabels,
  proAnchorLabel,
  proDesc,
  proFeatures,
  proFoundingLabel,
  proPeriodLabel,
} from '@/lib/pricing';
import { toast } from 'sonner';

const GOLD = '#C9A55C';

export default function Upgrade() {
  const { language, t } = useLanguage();
  const { entitlements, atLeast } = useEntitlements();
  const isPaid = atLeast('pro');

  // Annual first — it surfaces the lower founding rate, same as the landing
  // grid (PRICE.TRUTH.1 TASK 3).
  const [isAnnual, setIsAnnual] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const interval = isAnnual ? 'year' : 'month';
  const toggle = intervalToggleLabels(language);

  const handleUpgrade = async () => {
    setCheckoutLoading(true);
    const { error } = await startCheckout(interval);
    // On success `startCheckout` has already navigated to Stripe; only the
    // failure path reaches the lines below.
    if (error) {
      setCheckoutLoading(false);
      toast.error(t('upgrade.checkoutError'), { description: error });
    }
  };

  // Mirrors Settings' portal handoff, including the 409 ("paid plan, no Stripe
  // customer") case that a dead portal link would otherwise swallow.
  const handleManageBilling = async () => {
    setPortalLoading(true);
    const { error, status } = await openBillingPortal();
    if (error) {
      setPortalLoading(false);
      const noAccount = status === 409;
      toast.error(noAccount ? t('settings.billingNoAccount') : t('settings.billingPortalError'), {
        description: noAccount ? undefined : error,
      });
    }
  };

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6 max-w-2xl"
        data-testid="upgrade-page"
      >
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-6 w-6" style={{ color: GOLD }} />
            {isPaid ? t('upgrade.paidTitle') : t('upgrade.title')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isPaid ? t('upgrade.paidSubtitle') : t('upgrade.subtitle')}
          </p>
        </div>

        {isPaid ? (
          /* ---------------- Already on a paid plan ---------------- */
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('upgrade.currentPlan')}
                  </p>
                  <p
                    className="mt-1 flex items-center gap-1.5 truncate text-xl font-bold text-foreground"
                    data-testid="upgrade-current-plan"
                  >
                    <Crown className="h-4 w-4 flex-shrink-0" style={{ color: GOLD }} />
                    {entitlements.label}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                  data-testid="upgrade-manage-billing"
                >
                  {portalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('settings.billingManage')}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{t('upgrade.paidBody')}</p>
            </CardContent>
          </Card>
        ) : (
          /* ---------------- The Pro pitch ---------------- */
          <Card style={{ borderColor: `${GOLD}66` }}>
            <CardContent className="p-5 space-y-5">
              {/* Interval toggle */}
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`text-sm font-medium ${!isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  {toggle.monthly}
                </span>
                <button
                  type="button"
                  onClick={() => setIsAnnual((v) => !v)}
                  aria-label={toggle.aria}
                  data-testid="upgrade-interval-toggle"
                  className="relative h-7 w-14 flex-shrink-0 rounded-full transition-colors"
                  style={{ backgroundColor: isAnnual ? GOLD : 'hsl(var(--muted))' }}
                >
                  <span
                    className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${isAnnual ? 'translate-x-7' : ''}`}
                  />
                </button>
                <span
                  className={`text-sm font-medium ${isAnnual ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  {toggle.annual}
                </span>
                {isAnnual && (
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: `${GOLD}22`, color: GOLD }}
                  >
                    {toggle.save}
                  </span>
                )}
              </div>

              {/* Price + anchor + founding promise */}
              <div>
                <div className="flex flex-wrap items-baseline gap-1">
                  <span className="text-4xl font-bold text-foreground" data-testid="upgrade-price">
                    {PRO_PRICE[interval]}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {proPeriodLabel(language, interval)}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground line-through" data-testid="upgrade-anchor">
                    {proAnchorLabel(language)}
                  </span>
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{ backgroundColor: `${GOLD}22`, color: GOLD }}
                    data-testid="upgrade-founding"
                  >
                    {proFoundingLabel(language)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{proDesc(language)}</p>
              </div>

              {/* What Pro unlocks */}
              <ul className="flex flex-col gap-2.5" data-testid="upgrade-features">
                {proFeatures(language).map((f) => (
                  <li key={f} className="flex items-center gap-2.5">
                    <span
                      className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full"
                      style={{ backgroundColor: `${GOLD}22` }}
                    >
                      <Check className="h-3 w-3" style={{ color: GOLD }} />
                    </span>
                    <span className="min-w-0 text-sm text-foreground">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleUpgrade}
                  disabled={checkoutLoading}
                  data-testid="upgrade-cta"
                  data-billing-interval={interval}
                  className="flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold transition-transform duration-150 hover:-translate-y-px active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
                  style={{ backgroundColor: GOLD, color: '#0e0c09' }}
                >
                  {checkoutLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {checkoutLoading ? t('upgrade.redirecting') : t('upgrade.cta')}
                </button>
                <p className="text-center text-xs text-muted-foreground">{t('upgrade.reassurance')}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
