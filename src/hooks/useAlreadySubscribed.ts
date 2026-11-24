import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';

/**
 * FRAGILE.SUB.1 — create-checkout-session answers 409 when the account already
 * has a live subscription. Every place that starts checkout (Upgrade page,
 * landing pricing grid, the post-signup resume in Login) hands its status here.
 *
 * Returns true when it handled the 409: an "already subscribed" toast (no
 * description — the server's English reason would just repeat it) and a fresh
 * read of the shared ['plan', user.id] query, so the Upgrade page turns into
 * its paid view. Any other status returns false and the caller carries on.
 */
export function useAlreadySubscribedHandler() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const userId = user?.id;

  return useCallback(
    (status: number): boolean => {
      if (status !== 409) return false;
      toast.error(t('upgrade.alreadySubscribed'));
      if (userId) void queryClient.invalidateQueries({ queryKey: ['plan', userId] });
      return true;
    },
    [userId, queryClient, t],
  );
}
