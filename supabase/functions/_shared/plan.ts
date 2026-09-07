// Shared plan gate for the Pro-only edge functions (TL.EDGE.2).
//
// The server-side twin of `useEntitlements().entitlements.<flag>`: read the
// caller's plan from `profiles` (service client — the row is owner-read only
// and the function is deciding ON BEHALF of the owner), then ask
// `public.plan_allows(p_plan, p_feature)`, the SQL mirror of
// src/lib/entitlements.ts (20260729120300_ent_srv.sql, aiTools added by
// 20260905150000). One source of truth for what a plan may do; this file only
// asks the question.
//
// FAIL CLOSED. This is a paywall: if the profile read or the RPC errors, the
// answer is "not allowed" and the caller returns 403. That is the OPPOSITE of
// quota.ts, where a count failure is non-blocking — a broken quota counter
// degrading to "no quota" costs at most a day's AI budget, whereas a broken
// plan check degrading to "everyone is Pro" hands the paid feature to every
// free account until someone notices. Better a Pro user sees one spurious
// upsell during a Postgres hiccup than the gate silently opens.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** True when `userId`'s plan grants `feature` per public.plan_allows. */
export async function planAllows(
  svc: SupabaseClient,
  userId: string,
  feature: string,
): Promise<boolean> {
  const { data: profile, error: profileError } = await svc
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) {
    console.error(`[plan] profile read failed for ${feature}:`, profileError);
    return false; // Fail closed — see header.
  }

  const { data, error } = await svc.rpc("plan_allows", {
    p_plan: profile?.plan ?? "free",
    p_feature: feature,
  });
  if (error) {
    console.error(`[plan] plan_allows(${feature}) failed:`, error);
    return false; // Fail closed — see header.
  }
  return data === true;
}
