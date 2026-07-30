// BILL.B1 — /billing/success, where Stripe Checkout returns the customer.
//
// This page deliberately does NOT grant anything. The plan flips only when the
// stripe-webhook function (B2) processes the event, which usually lands within a
// couple of seconds but is not synchronous with the redirect. So the page shows
// an honest "activating" state and softly re-polls the shared ['plan', user.id]
// query until it sees `pro` — every other consumer of that cache (editor gates,
// settings, dashboard) follows the same refresh for free.

import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useLanguage } from '@/hooks/useLanguage';

/** Poll cadence and ceiling for the webhook to land. 20 × 3s = 60s. */
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 20;

export default function BillingSuccess() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { atLeast } = useEntitlements();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [pollsExhausted, setPollsExhausted] = useState(false);
  const pollsRef = useRef(0);

  const isPro = atLeast('pro');

  // Stripe echoes the session id back; we only surface it as a support
  // reference. Verifying it would mean a Stripe call from the client, and the
  // webhook is already the authority on whether the money moved.
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    if (!user || isPro) return;

    const timer = setInterval(() => {
      pollsRef.current += 1;
      if (pollsRef.current > MAX_POLLS) {
        setPollsExhausted(true);
        clearInterval(timer);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['plan', user.id] });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [user, isPro, queryClient]);

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mx-auto max-w-xl"
      >
        <Card className="border-border bg-card" data-testid="billing-success-card">
          <CardContent className="flex flex-col items-center px-6 py-10 text-center">
            {isPro ? (
              <>
                <span className="grid h-14 w-14 place-items-center rounded-full bg-primary/15">
                  <CheckCircle2 className="h-7 w-7 text-primary" data-testid="billing-success-active-icon" />
                </span>
                <h1 className="mt-5 text-2xl font-bold text-foreground" data-testid="billing-success-title">
                  {t('billingSuccess.activeTitle')}
                </h1>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  {t('billingSuccess.activeBody')}
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Button asChild className="gradient-primary text-primary-foreground">
                    <Link to="/dashboard/editor">
                      <Sparkles className="mr-2 h-4 w-4" />
                      {t('billingSuccess.goToEditor')}
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/dashboard/settings">{t('billingSuccess.manageBilling')}</Link>
                  </Button>
                </div>
              </>
            ) : pollsExhausted ? (
              <>
                <h1 className="text-2xl font-bold text-foreground" data-testid="billing-success-title">
                  {t('billingSuccess.slowTitle')}
                </h1>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  {t('billingSuccess.slowBody')}
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Button asChild variant="outline">
                    <Link to="/dashboard/settings">{t('billingSuccess.manageBilling')}</Link>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Loader2
                  className="h-8 w-8 animate-spin text-primary"
                  data-testid="billing-success-spinner"
                />
                <h1 className="mt-5 text-2xl font-bold text-foreground" data-testid="billing-success-title">
                  {t('billingSuccess.activatingTitle')}
                </h1>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  {t('billingSuccess.activatingBody')}
                </p>
              </>
            )}

            {sessionId && (
              <p className="mt-8 max-w-full truncate text-[10px] text-muted-foreground/60">
                {t('billingSuccess.reference')} {sessionId}
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </DashboardLayout>
  );
}
