import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizePlan, type Plan } from '@/lib/entitlements';

/**
 * Best-effort read of a PUBLIC page's owner's plan tier, via the
 * get_public_page_plan security-definer RPC (profiles is owner-only RLS, so
 * the public route can't read profiles.plan directly — PRICE.TRUTH.1).
 *
 * Defaults to 'free' while loading and on any failure (function missing
 * pre-migration, network error, no row) — fail toward the free tier's
 * constraints, never toward silently granting paid behavior.
 */
export function usePublicPagePlan(pageId: string | undefined): Plan {
  const [plan, setPlan] = useState<Plan>('free');

  useEffect(() => {
    if (!pageId) {
      setPlan('free');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_public_page_plan', { p_page_id: pageId });
        if (cancelled) return;
        setPlan(error || !data ? 'free' : normalizePlan(data));
      } catch {
        if (!cancelled) setPlan('free');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pageId]);

  return plan;
}
