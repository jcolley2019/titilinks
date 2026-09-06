// Shared per-user daily quota for the gated utility functions (TL.EDGE.1).
//
// Same mechanism as generate-bio: one `ai_usage_events` row per successful
// call, a count of the caller's rows in the last 24h before doing work. The
// count runs with the service client because the table's RLS is owner-read
// only. A count FAILURE is non-blocking (the request proceeds), mirroring
// generate-bio, so a Postgres hiccup degrades to "no quota" rather than an
// outage.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const DAILY_LIMITS = { unfurl: 300, "youtube-feed": 100 } as const;

/** True when `userId` has already used `limit` calls of `fn` in the last 24h. */
export async function overDailyQuota(
  svc: SupabaseClient,
  userId: string,
  fn: string,
  limit: number,
): Promise<boolean> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await svc
    .from("ai_usage_events")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("fn", fn)
    .gte("created_at", oneDayAgo);
  if (error) {
    console.error(`[${fn}] quota count failed:`, error);
    return false; // Non-blocking: allow the request (mirror generate-bio).
  }
  return count !== null && count >= limit;
}

/** Record one successful call of `fn` by `userId`. Logs, never throws. */
export async function recordUsage(
  svc: SupabaseClient,
  userId: string,
  fn: string,
): Promise<void> {
  const { error } = await svc
    .from("ai_usage_events")
    .insert({ user_id: userId, fn });
  if (error) console.error(`[${fn}] usage insert failed:`, error);
}
