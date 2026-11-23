import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizePlan, type Plan } from '@/lib/entitlements';
import { retryRead } from '@/lib/retry-read';

export interface PublicPageBranding {
  /** The page owner's plan tier. */
  plan: Plan;
  /** Whether the owner wants the "Made with TitiLinks" badge shown. Only
   *  meaningful on paid tiers — free is always branded regardless (PROMO.TOGGLE.1). */
  show_badge: boolean;
  /** The owner's referral code, so the public badge can credit them
   *  (`/?ref=<code>` instead of the generic `/?ref=badge`) — BILL.B3. Null until
   *  the referrals migration has run, or on any lookup failure; callers must fall
   *  back to the generic link rather than emitting `/?ref=null`. */
  referral_code: string | null;
}

const FAIL_OPEN: PublicPageBranding = { plan: 'free', show_badge: true, referral_code: null };

/** FRAGILE.PUB.1: the lookup gets one retry, and the whole thing — both tries —
 *  gives up at this deadline so the page always paints. */
export const BRANDING_DEADLINE_MS = 4000;
const BRANDING_ATTEMPTS = 2;

/** FRAGILE.PUB.1: last CONFIRMED answer per handle, this browser session only.
 *  Written only from a successful lookup — an error or a timeout is never stored. */
export const BRANDING_CACHE_PREFIX = 'tl.publicBranding.';

function readCached(handle: string | undefined): PublicPageBranding | null {
  if (!handle) return null;
  try {
    const raw = window.sessionStorage.getItem(BRANDING_CACHE_PREFIX + handle.toLowerCase());
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PublicPageBranding>;
    return {
      plan: normalizePlan(v.plan),
      show_badge: v.show_badge !== false,
      referral_code: typeof v.referral_code === 'string' ? v.referral_code : null,
    };
  } catch {
    return null;
  }
}

function writeCached(handle: string | undefined, branding: PublicPageBranding) {
  if (!handle) return;
  try {
    window.sessionStorage.setItem(BRANDING_CACHE_PREFIX + handle.toLowerCase(), JSON.stringify(branding));
  } catch {
    // Private mode / blocked storage: the cache is a convenience, not a contract.
  }
}

type BrandingRow = { plan?: unknown; show_badge?: boolean | null; referral_code?: unknown };

export interface BrandingResult {
  branding: PublicPageBranding;
  /** True only for an answer the lookup actually returned. */
  confirmed: boolean;
}

/** FRAGILE.PUB.1a: a confirmed answer is reused by every reader of the same
 *  page for this long instead of asked again — long enough to cover one page
 *  view (the page's own gate, then the email block mounting under it). */
const CONFIRMED_FRESH_MS = 60_000;
const confirmedByPage = new Map<string, { branding: PublicPageBranding; at: number }>();
const inFlightByPage = new Map<string, Promise<BrandingResult>>();
/** The public page registers its handle, so readers that only know the page id
 *  (the email-subscribe block) reach the same per-handle session cache. */
const handleByPage = new Map<string, string>();

/** A fresh confirmed answer for this page, if one is in memory. */
export function freshPublicBranding(pageId: string | undefined): PublicPageBranding | null {
  if (!pageId) return null;
  const hit = confirmedByPage.get(pageId);
  return hit && Date.now() - hit.at < CONFIRMED_FRESH_MS ? hit.branding : null;
}

/** A fresh confirmed answer, else the last confirmed answer this session for
 *  the page's registered handle — a starting value while a lookup runs, never
 *  an answer in its own right. */
export function lastKnownPublicBranding(pageId: string | undefined): PublicPageBranding | null {
  if (!pageId) return null;
  return freshPublicBranding(pageId) ?? readCached(handleByPage.get(pageId));
}

/**
 * FRAGILE.PUB.1 / 1a — the ONE owner-plan lookup for a public page, shared by
 * usePublicPageBranding (badge + every Pro gate) and usePublicPagePlan (the
 * email-subscribe gate). Both used to read the same profiles.plan through two
 * RPCs; now there is one request per page view.
 *
 * A failed lookup is not an answer. It is retried once, and both tries
 * together are cut off at BRANDING_DEADLINE_MS so a stalled lookup can never
 * hold the page on its skeleton. With no answer it resolves to the last
 * confirmed answer for the handle from this browser session, and only when
 * there is none to Free. Only a confirmed answer is ever stored.
 */
export function loadPublicBranding(pageId: string, handle?: string): Promise<BrandingResult> {
  if (handle) handleByPage.set(pageId, handle.toLowerCase());
  const fresh = freshPublicBranding(pageId);
  if (fresh) return Promise.resolve({ branding: fresh, confirmed: true });
  const pending = inFlightByPage.get(pageId);
  if (pending) return pending;

  const lookup = (async (): Promise<BrandingResult> => {
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), BRANDING_DEADLINE_MS);
    try {
      const { data, error } = await retryRead<unknown>(
        (signal) => supabase.rpc('get_public_page_branding', { p_page_id: pageId }).abortSignal(signal),
        { attempts: BRANDING_ATTEMPTS, backoffMs: 300, signal: deadline.signal },
      );
      // The RPC returns a table (array of rows); take the first.
      const row = (Array.isArray(data) ? data[0] : data) as BrandingRow | null | undefined;
      const knownHandle = handleByPage.get(pageId);
      if (error || !row) {
        // No answer — not the same as "the owner is on Free".
        return { branding: readCached(knownHandle) ?? FAIL_OPEN, confirmed: false };
      }
      const answer: PublicPageBranding = {
        plan: normalizePlan(row.plan as string | null | undefined),
        // Only an explicit false hides the badge; null/undefined ⇒ shown.
        show_badge: row.show_badge !== false,
        // Absent pre-migration (the RPC returned two columns then) — the badge
        // href falls back to the generic /?ref=badge link.
        referral_code: typeof row.referral_code === 'string' ? row.referral_code : null,
      };
      confirmedByPage.set(pageId, { branding: answer, at: Date.now() });
      writeCached(knownHandle, answer);
      return { branding: answer, confirmed: true };
    } finally {
      clearTimeout(timer);
      inFlightByPage.delete(pageId);
    }
  })();
  inFlightByPage.set(pageId, lookup);
  return lookup;
}

/**
 * Best-effort read of a PUBLIC page owner's branding state — plan tier plus the
 * optional-badge toggle — via the get_public_page_branding security-definer RPC
 * (profiles is owner-only RLS, so the public route can't read these columns
 * directly — PROMO.TOGGLE.1), through loadPublicBranding above.
 *
 * Defaults to { plan:'free', show_badge:true } while loading. Fail toward the
 * free tier's constraints — the badge SHOWS — never toward silently hiding a
 * paid-but-not-opted-out badge.
 *
 * TL.PLAN.ENFORCE.2: `loaded` is true once the answer (or the fallback) for
 * THIS pageId has landed. The public page gates every Pro feature on `plan`,
 * so it holds its skeleton until then — the placeholder 'free' above must never
 * paint as the owner's real tier.
 */
export function usePublicPageBranding(
  pageId: string | undefined,
  handle?: string,
): PublicPageBranding & { loaded: boolean } {
  const [branding, setBranding] = useState<PublicPageBranding>(FAIL_OPEN);
  const [loadedFor, setLoadedFor] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!pageId) {
      setBranding(FAIL_OPEN);
      return;
    }

    let cancelled = false;
    void loadPublicBranding(pageId, handle).then(({ branding: next }) => {
      if (cancelled) return;
      setBranding(next);
      setLoadedFor(pageId);
    });

    return () => {
      cancelled = true;
    };
  }, [pageId, handle]);

  return { ...branding, loaded: !!pageId && loadedFor === pageId };
}
