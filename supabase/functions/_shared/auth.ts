// Shared auth for the BILL edge functions: resolve the caller from the
// Authorization header, and build a service-role client for privileged writes.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AuthedUser {
  id: string;
  email: string | null;
}

/**
 * Resolve the calling user from the request's `Authorization: Bearer <jwt>`.
 *
 * Returns null for a missing/invalid/expired token — callers must treat that as
 * a 401 and do no work. Uses the ANON key with the caller's JWT forwarded, so
 * the token is validated by Supabase rather than trusted after a local decode.
 */
export async function getAuthedUser(req: Request): Promise<AuthedUser | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;

  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * Service-role client — bypasses RLS. Only for writes the user is not allowed
 * to make themselves (billing columns, referral grants, cross-account reads).
 * Never construct one from a request-supplied value.
 */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}
