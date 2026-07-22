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
 */
export function useEntitlements() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['plan', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', user.id)
        .single();

      if (error) {
        console.warn('[useEntitlements] query error:', error.message);
        return null;
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

  return {
    plan,
    entitlements,
    isLoading: !!user && isLoading,
    /** True if the current plan grants a boolean feature. */
    can: (feature: BooleanFeature) => canFeature(plan, feature),
    /** True if the current plan is at least `min` (free < pro < business). */
    atLeast: (min: Plan) => planAtLeast(plan, min),
  };
}
