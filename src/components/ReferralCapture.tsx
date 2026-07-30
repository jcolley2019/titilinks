// BILL.B3 — capture ?ref=<code> from wherever the visitor lands.
//
// Referral links point at the site root (/?ref=abcd2345), but the badge on a
// public page, a shared /templates URL or a direct /login link can all carry one.
// Rather than sprinkling the read across every entry page, this renders once
// inside the router and watches location on every navigation.
//
// Renders nothing. It only writes to localStorage; the code is offered to
// `claim_referral` at the auth boundary in Login.tsx.

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { REF_QUERY_PARAM, stashPendingReferral } from '@/lib/referrals';

export function ReferralCapture() {
  const location = useLocation();

  useEffect(() => {
    const code = new URLSearchParams(location.search).get(REF_QUERY_PARAM);
    if (!code) return;
    // Reserved ('badge') and malformed values are rejected inside; the first
    // valid code seen wins, so a later link cannot steal the credit.
    stashPendingReferral(code);
  }, [location.search]);

  return null;
}
