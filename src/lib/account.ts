// BILL.B4 / DELETE.1 — client entry point for permanent account deletion.
//
// Thin on purpose. The edge function re-verifies the typed handle, cancels Stripe
// before touching any data, and performs the cascade; nothing here is a safeguard
// the server relies on.

import { supabase } from '@/integrations/supabase/client';

export interface DeleteAccountResult {
  deleted: boolean;
  /** Non-fatal leftovers (e.g. a storage object that could not be removed). */
  warnings: string[];
  error: string | null;
}

/**
 * Delete the signed-in account for good.
 *
 * `confirmHandle` is what the user typed. It is sent so the SERVER can check it
 * too — a client-only gate is not a safeguard for something irreversible.
 */
export async function deleteAccount(confirmHandle: string): Promise<DeleteAccountResult> {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: { confirmHandle },
  });

  if (error) {
    // supabase-js flattens non-2xx into one opaque message and hides the JSON
    // body on `error.context` — unwrap it so the user sees the real reason
    // (a Stripe cancellation failure, say, which is actionable).
    const context = (error as { context?: Response }).context;
    let message = error.message;
    if (context && typeof context.status === 'number') {
      try {
        const payload = (await context.clone().json()) as { error?: string };
        if (payload?.error) message = payload.error;
      } catch {
        /* non-JSON body — keep the generic message */
      }
    }
    return { deleted: false, warnings: [], error: message };
  }

  const payload = (data ?? {}) as { deleted?: boolean; warnings?: string[] };
  return {
    deleted: payload.deleted === true,
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    error: payload.deleted === true ? null : 'Account was not deleted',
  };
}
