import { useEffect, useState } from 'react';
import type { Plan } from '@/lib/entitlements';
import { lastKnownPublicBranding, loadPublicBranding } from '@/hooks/usePublicPageBranding';

/**
 * Best-effort read of a PUBLIC page's owner's plan tier (PRICE.TRUTH.1) — the
 * email-subscribe gate.
 *
 * FRAGILE.PUB.1a: this used to call its own get_public_page_plan RPC and fall
 * back to 'free' on any error. That RPC reads the same profiles.plan as
 * get_public_page_branding, so it now shares the public page's one lookup
 * (loadPublicBranding): retried once, given up at ~4 s, the last confirmed plan
 * for the handle from this browser session when there is no answer, and 'free'
 * only when nothing is known. A failure is never stored as an answer.
 *
 * 'free' while loading when nothing is known — fail toward the free tier's constraints, never toward
 * silently granting paid behaviour. It starts from the last known plan for the
 * page (lastKnownPublicBranding) when there is one, so a failed lookup does not
 * hide the form and then pop it back. When the page's own lookup already has a
 * fresh answer (the usual case: the public page holds its skeleton until it
 * does), that answer is the starting value and no second request is made.
 */
export function usePublicPagePlan(pageId: string | undefined): Plan {
  const [plan, setPlan] = useState<Plan>(() => lastKnownPublicBranding(pageId)?.plan ?? 'free');

  useEffect(() => {
    if (!pageId) {
      setPlan('free');
      return;
    }

    let cancelled = false;
    void loadPublicBranding(pageId).then(({ branding }) => {
      if (!cancelled) setPlan(branding.plan);
    });

    return () => {
      cancelled = true;
    };
  }, [pageId]);

  return plan;
}
