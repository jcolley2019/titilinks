import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

/**
 * FRAGILE.ONB.1 (audit O1) — a failed read is an ERROR, never an answer.
 *
 * It used to return null on error, which (a) skipped the three retries below,
 * (b) was cached for five minutes, and (c) read as "not onboarded" — so one
 * dropped request sent a finished creator into the wizard. Now the error is
 * thrown so the query retries, and callers get an explicit `status`:
 *
 *   'loading'    — no answer yet (first read or its retries in flight)
 *   'complete'   — a successful read says onboarding is done
 *   'incomplete' — a successful read says it is not (the ONLY redirect trigger)
 *   'error'      — every retry failed; show Retry, never redirect
 *
 * A successful earlier answer wins over a later failed background refetch.
 */
export type OnboardingStatus = 'loading' | 'complete' | 'incomplete' | 'error';

export function useOnboardingStatus() {
  const { user } = useAuth();

  const { data, isError, isFetching, refetch } = useQuery({
    queryKey: ['onboarding-status', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_complete')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.warn('[useOnboardingStatus] query error:', error.message);
        throw error;
      }
      // No row at all is a successful read: there is no onboarded profile.
      return data ?? { onboarding_complete: false };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 3000),
  });

  let status: OnboardingStatus;
  if (data) status = data.onboarding_complete ? 'complete' : 'incomplete';
  else if (isError) status = 'error';
  else status = 'loading';

  return {
    status,
    onboardingComplete: status === 'complete' ? true : status === 'incomplete' ? false : null,
    isLoading: !!user && status === 'loading',
    isError: !!user && status === 'error',
    /** True while a Retry (or background refetch) of a failed read is in flight. */
    isRetrying: !!user && status === 'error' && isFetching,
    retry: () => { void refetch(); },
  };
}
