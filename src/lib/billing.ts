// BILL.B1 — client-side billing entry points: start a Stripe Checkout session,
// open the Customer Portal, and carry a "they clicked Upgrade before signing up"
// intent across the auth hop.
//
// Nothing here decides what anyone pays. The price ids below are a mirror of the
// authoritative allowlist in `supabase/functions/_shared/billing.ts`; the edge
// function re-validates whatever this file sends and 400s on anything unknown.

import { supabase } from '@/integrations/supabase/client';

export type BillingInterval = 'month' | 'year';

/** Stripe SANDBOX price ids, keyed by billing interval. */
export const PRO_PRICE_IDS: Record<BillingInterval, string> = {
  month: 'price_1Tw3jiGnt7Tsx25PQEBDG0SY', // pro_monthly_founding — $9/mo
  year: 'price_1Tw447Gnt7Tsx25PVouXzkmj', // pro_yearly_founding — $84/yr ($7/mo)
};

/** Stripe lookup keys, for logs and support conversations. */
export const PRO_LOOKUP_KEYS: Record<BillingInterval, string> = {
  month: 'pro_monthly_founding',
  year: 'pro_yearly_founding',
};

/**
 * A checkout the visitor asked for before they had an account.
 *
 * Signup redirects through /login and then on to /onboarding or the editor, so
 * the intent has to survive a full page load — hence localStorage rather than
 * router state. Consumed exactly once (see `consumePendingCheckout`) so a stale
 * key can never silently bounce someone into Stripe on a later visit.
 */
export const PENDING_CHECKOUT_KEY = 'titilinks-pending-checkout';

/** How long a stashed checkout intent stays valid. */
const PENDING_CHECKOUT_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface PendingCheckout {
  interval: BillingInterval;
  at: number;
}

export function stashPendingCheckout(interval: BillingInterval): void {
  try {
    const payload: PendingCheckout = { interval, at: Date.now() };
    localStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(payload));
  } catch {
    /* storage disabled — the visitor just lands on the dashboard instead */
  }
}

/**
 * Read and CLEAR a stashed checkout intent. Returns null when absent, malformed,
 * or older than the TTL. Clearing on read (including on the invalid paths) is
 * what keeps this one-shot.
 */
export function consumePendingCheckout(): BillingInterval | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PENDING_CHECKOUT_KEY);
    if (raw !== null) localStorage.removeItem(PENDING_CHECKOUT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingCheckout;
    if (parsed.interval !== 'month' && parsed.interval !== 'year') return null;
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > PENDING_CHECKOUT_TTL_MS) return null;
    return parsed.interval;
  } catch {
    return null;
  }
}

export interface CheckoutResult {
  error: string | null;
  /** HTTP status when the edge function answered with one; 0 otherwise. */
  status: number;
}

/**
 * Invoke a billing edge function and return its `url`, or a USEFUL error.
 *
 * `supabase.functions.invoke` flattens every non-2xx into the same opaque
 * "Edge Function returned a non-2xx status code" message and hides the JSON body
 * on `error.context` (the raw Response). Callers here need both the real reason
 * and the status — a 409 from create-portal-session ("paid plan, no Stripe
 * customer") has to be told apart from a genuine failure — so unwrap it.
 */
async function invokeForUrl(
  name: string,
  body?: Record<string, unknown>,
): Promise<{ url: string | null } & CheckoutResult> {
  const { data, error } = await supabase.functions.invoke(name, body ? { body } : {});

  if (error) {
    const context = (error as { context?: Response }).context;
    let message = error.message;
    let status = 0;

    if (context && typeof context.status === 'number') {
      status = context.status;
      try {
        const payload = (await context.clone().json()) as { error?: string };
        if (payload?.error) message = payload.error;
      } catch {
        /* non-JSON body — keep the client's generic message */
      }
    }

    return { url: null, error: message, status };
  }

  const url = (data as { url?: string | null } | null)?.url ?? null;
  return { url, error: url ? null : 'No redirect URL returned', status: 200 };
}

/**
 * Create a Stripe Checkout session for the signed-in user and hand the browser
 * over to Stripe. On success this navigates away and never returns.
 */
export async function startCheckout(interval: BillingInterval): Promise<CheckoutResult> {
  const { url, error, status } = await invokeForUrl('create-checkout-session', {
    priceId: PRO_PRICE_IDS[interval],
  });

  if (!url) return { error, status };

  window.location.assign(url);
  return { error: null, status };
}

/** Open the Stripe Customer Portal for the signed-in user. */
export async function openBillingPortal(): Promise<CheckoutResult> {
  const { url, error, status } = await invokeForUrl('create-portal-session');

  if (!url) return { error, status };

  window.location.assign(url);
  return { error: null, status };
}
