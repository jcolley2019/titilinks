import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export function useOnboardingStatus() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['onboarding-status', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_complete')
        .eq('id', user.id)
        .single();

      if (error) {
        console.warn('[useOnboardingStatus] query error:', error.message);
        return null;
      }
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 3000),
  });

  return {
    onboardingComplete: data?.onboarding_complete ?? null,
    isLoading: !!user && isLoading,
  };
}
