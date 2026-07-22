import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizePlan, type Plan } from '@/lib/entitlements';

export interface PublicPageBranding {
  /** The page owner's plan tier. */
  plan: Plan;
  /** Whether the owner wants the "Made with TitiLinks" badge shown. Only
   *  meaningful on paid tiers — free is always branded regardless (PROMO.TOGGLE.1). */
  show_badge: boolean;
}

const FAIL_OPEN: PublicPageBranding = { plan: 'free', show_badge: true };

/**
 * Best-effort read of a PUBLIC page owner's branding state — plan tier plus the
 * optional-badge toggle — via the get_public_page_branding security-definer RPC
 * (profiles is owner-only RLS, so the public route can't read these columns
 * directly — PROMO.TOGGLE.1). Mirrors usePublicPagePlan, which stays in use for
 * the email-subscribe gate.
 *
 * Defaults to { plan:'free', show_badge:true } while loading and on any failure
 * (function missing pre-migration, network error, no row). Fail toward the free
 * tier's constraints — the badge SHOWS — never toward silently hiding a
 * paid-but-not-opted-out badge.
 */
export function usePublicPageBranding(pageId: string | undefined): PublicPageBranding {
  const [branding, setBranding] = useState<PublicPageBranding>(FAIL_OPEN);

  useEffect(() => {
    if (!pageId) {
      setBranding(FAIL_OPEN);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_public_page_branding', { p_page_id: pageId });
        if (cancelled) return;
        // The RPC returns a table (array of rows); take the first.
        const row = Array.isArray(data) ? data[0] : data;
        if (error || !row) {
          setBranding(FAIL_OPEN);
          return;
        }
        setBranding({
          plan: normalizePlan(row.plan),
          // Only an explicit false hides the badge; null/undefined ⇒ shown.
          show_badge: row.show_badge !== false,
        });
      } catch {
        if (!cancelled) setBranding(FAIL_OPEN);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pageId]);

  return branding;
}
