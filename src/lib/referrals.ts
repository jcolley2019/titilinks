// BILL.B3 — client side of the referral program.
//
// The client's ONLY job is to remember which code someone arrived on and offer it
// to the server once they have an account. It decides nothing: `claim_referral`
// validates the code, blocks self-referral, enforces write-once and enforces the
// fresh-signup window. The reward rules themselves (30-day retention hold,
// annual cap, coupon) live in supabase/functions/_shared/referrals.ts and run in
// the webhook — see ToS Section 8.
//
// Nothing here can earn anyone money: a grant is only ever written after a real
// paid invoice, so a fabricated code in localStorage buys nothing.

import { supabase } from '@/integrations/supabase/client';

/** Query parameter carrying a referral code: /?ref=<code>. */
export const REF_QUERY_PARAM = 'ref';

/**
 * Where a captured code waits until an account exists. Signup may involve an
 * email round trip and a fresh page load, so this outlives any router state.
 */
export const PENDING_REFERRAL_KEY = 'titilinks-pending-referral';

/**
 * Client-side TTL. Generous on purpose — someone can browse today and sign up
 * next week, and attribution should survive that. The tight window is the
 * server's: `claim_referral` refuses once the PROFILE is more than two hours
 * old, so a stale code can never be attached to an established account.
 */
const PENDING_REFERRAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Mirror of REFERRAL_CODE_ALPHABET / _LENGTH in
 * supabase/functions/_shared/referrals.ts and of the regex in the claim_referral
 * migration. Three copies exist because Postgres, Deno and the Vite bundle share
 * no runtime; the DB copy is the authority. Look-alike characters (0/o, 1/l/i)
 * are excluded because these codes get read off screens and typed by hand.
 */
const REFERRAL_CODE_PATTERN = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;

/**
 * `?ref=badge` is the GENERIC link on the public-page badge — it exists to
 * measure badge traffic, not to attribute a referral to anyone. Reserved, and
 * structurally impossible as a real code anyway (5 characters, not 8).
 */
export const RESERVED_REF_VALUES = ['badge'];

export function isValidReferralCode(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (RESERVED_REF_VALUES.includes(value)) return false;
  return REFERRAL_CODE_PATTERN.test(value);
}

interface PendingReferral {
  code: string;
  at: number;
}

/** Remember a code seen in the URL. Ignores reserved and malformed values. */
export function stashPendingReferral(code: string | null | undefined): boolean {
  if (!isValidReferralCode(code)) return false;
  try {
    // First code wins: if someone already arrived on a share link, a later
    // /?ref= must not overwrite the credit for the visit that brought them here.
    if (localStorage.getItem(PENDING_REFERRAL_KEY)) return false;
    const payload: PendingReferral = { code, at: Date.now() };
    localStorage.setItem(PENDING_REFERRAL_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false; /* storage disabled — the referral is simply lost */
  }
}

/** Read a stashed code WITHOUT clearing it (the claim clears it on success). */
export function peekPendingReferral(): string | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PENDING_REFERRAL_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingReferral;
    if (!isValidReferralCode(parsed.code)) return null;
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > PENDING_REFERRAL_TTL_MS) return null;
    return parsed.code;
  } catch {
    return null;
  }
}

export function clearPendingReferral(): void {
  try {
    localStorage.removeItem(PENDING_REFERRAL_KEY);
  } catch {
    /* storage disabled */
  }
}

/**
 * Offer any stashed code to `claim_referral`.
 *
 * Safe to call on every sign-in: the RPC is write-once, so an established
 * account is a silent no-op. The key is cleared on a definitive outcome —
 * accepted, or rejected by the server — and kept only on a transport error, so a
 * network blip does not lose attribution.
 */
export async function claimPendingReferral(): Promise<'claimed' | 'rejected' | 'none' | 'error'> {
  const code = peekPendingReferral();
  if (!code) {
    // Clear anything malformed/expired that peek refused.
    clearPendingReferral();
    return 'none';
  }

  try {
    const { data, error } = await supabase.rpc('claim_referral', { p_code: code });
    if (error) {
      console.warn('[referrals] claim failed:', error.message);
      return 'error';
    }
    clearPendingReferral();
    return data === true ? 'claimed' : 'rejected';
  } catch (err) {
    console.warn('[referrals] claim threw:', err);
    return 'error';
  }
}

/** The shareable link for a referral code. */
export function referralLinkFor(code: string, origin = window.location.origin): string {
  return `${origin}/?${REF_QUERY_PARAM}=${code}`;
}
