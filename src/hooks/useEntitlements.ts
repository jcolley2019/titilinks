import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  type Plan,
  type PlanEntitlements,
  type BooleanFeature,
  getEntitlements,
  normalizePlan,
  planAtLeast,
  can as canFeature,
} from '@/lib/entitlements';

/**
 * Current user's plan tier and entitlements.
 *
 * Reads `profiles.plan` (defaults to 'free' until billing is wired) and maps
 * it through the shared entitlements registry. Mirrors the query pattern in
 * `useOnboardingStatus` so caching/retries behave the same.
 *
 * Usage:
 *   const { entitlements, can, atLeast } = useEntitlements();
 *   if (entitlements.maxPages < 2) {  // show Pro upsell for 2nd page }
 *   if (can('analyticsAdvanced')) {  // render advanced analytics }
 *   if (atLeast('pro')) {  // ... }
 *
 * FRAGILE.SUB.1 (audit B1) — a failed read is an ERROR, never an answer.
 * It used to return null on error, which skipped the retries, was cached for
 * five minutes and read as Free — so one dropped request could show a paying
 * creator the Pro pitch. Now the error is thrown so the query retries, and
 * callers that must not guess (the Upgrade page) read `status`:
 *
 *   'loading' — no answer yet (first read or its retries in flight)
 *   'ready'   — a successful read; `plan` is the real plan
 *   'error'   — every retry failed; show Retry, never a checkout
 *
 * A successful earlier answer wins over a later failed background refetch.
 * Feature gates are unchanged: with no answer, `plan` still falls back to Free.
 */
export type EntitlementsStatus = 'loading' | 'ready' | 'error';

export function useEntitlements() {
  const { user } = useAuth();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['plan', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('plan, show_badge, referral_code')
        .eq('id', user.id)
        .single();

      if (error) {
        console.warn('[useEntitlements] query error:', error.message);
        throw error;
      }
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 3000),
  });

  const plan: Plan = normalizePlan(data?.plan);
  const entitlements: PlanEntitlements = getEntitlements(plan);

  let status: EntitlementsStatus;
  if (data) status = 'ready';
  else if (isError) status = 'error';
  else status = 'loading';

  return {
    plan,
    entitlements,
    /** Whether the owner wants the "Made with TitiLinks" badge shown on paid
     *  tiers (PROMO.TOGGLE.1). Defaults to true until loaded / on a null row —
     *  free tier ignores this and is always branded. */
    showBadge: (data as { show_badge?: boolean } | null)?.show_badge !== false,
    /** The owner's referral code (BILL.B3). Null until the referrals migration
     *  has run, or while the query is in flight — callers must render the share
     *  UI conditionally rather than building a link to `/?ref=null`. */
    referralCode: (data as { referral_code?: string | null } | null)?.referral_code ?? null,
    isLoading: !!user && isLoading,
    /** Whether `plan` is a real answer ('ready'), still pending, or failed. */
    status,
    /** Read the plan again (the Retry on a failed read). */
    refetch: () => { void refetch(); },
    /** True if the current plan grants a boolean feature. */
    can: (feature: BooleanFeature) => canFeature(plan, feature),
    /** True if the current plan is at least `min` (free < pro < business). */
    atLeast: (min: Plan) => planAtLeast(plan, min),
  };
}
