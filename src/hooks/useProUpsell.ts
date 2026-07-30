// UPGRADE.1 — one actionable Pro upsell toast, used by every gate in the app.
//
// Before this hook a locked feature raised a bare `toast(title, { description })`
// that told the creator what they were missing and then left them to find the
// pricing page on their own. Every one of those toasts now carries a "See Pro"
// action that lands on /dashboard/upgrade, so the pitch is always one tap away.
//
// Callers keep their own copy (the toast still says what THIS feature does);
// only the action is shared. Sonner is the toast surface for editor/dashboard
// gates — Settings uses the shadcn toaster and links directly instead.

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';

/** The in-app upgrade surface. Import this rather than retyping the path. */
export const UPGRADE_PATH = '/dashboard/upgrade';

/**
 * Returns `showUpsell(title, description?)` — a Pro upsell toast whose action
 * button routes to the upgrade page. Client-side navigation (not a hard load),
 * so an editor draft in progress survives the trip.
 */
export function useProUpsell() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return useCallback(
    (title: string, description?: string) =>
      toast(title, {
        description,
        action: {
          label: t('upsell.seePro'),
          onClick: () => navigate(UPGRADE_PATH),
        },
      }),
    [navigate, t],
  );
}
