-- RE-RUNNABLE — TL.EDGE.2 — plan_allows gains 'aiTools' (Pro/Business).
--
-- Mirror of what Joey pasted on 2026-09-06 in the Supabase web SQL editor
-- (prod ref ohmvlypcbrfkuudcuqub). Idempotent: CREATE OR REPLACE of the one
-- function; body identical to 20260729120300_ent_srv.sql (#31) plus the
-- `when 'aiTools'` row. Supersedes #31's plan_allows body.
--
-- Why: AUDIT_rev6 #10 / §2.5 — the AI edge functions checked auth and a daily
-- quota but not the plan, while src/lib/entitlements.ts said the AI tools are
-- Pro-only. suggest-links and ai-enhance now call planAllows() (edge
-- functions/_shared/plan.ts, fail-closed) → this function, with 'aiTools'.
-- generate-bio / suggest-onboarding-content / ai-crop had zero callers and
-- were deleted from the project in the same change.
--
-- ⚠️ MIRROR REQUIREMENT: this body duplicates src/lib/entitlements.ts
-- (`aiTools`). scripts/billing.test.mjs parses this file and #31 and fails the
-- guard battery if the flags drift.

create or replace function public.plan_allows(p_plan text, p_feature text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case p_feature
    -- Boolean flags from ENTITLEMENTS that the server can meaningfully police.
    when 'customFonts' then coalesce(p_plan, 'free') in ('pro', 'business')
    when 'emailSubscribe' then coalesce(p_plan, 'free') in ('pro', 'business')
    when 'removeBranding' then coalesce(p_plan, 'free') in ('pro', 'business')
    -- Defined for the deferred pixels gate documented at the bottom of this file.
    when 'trackingPixels' then coalesce(p_plan, 'free') in ('pro', 'business')
    -- TL.EDGE.2: AI link suggestions + AI photo enhance (suggest-links, ai-enhance).
    when 'aiTools' then coalesce(p_plan, 'free') in ('pro', 'business')
    else false
  end;
$$;

-- Verify (read-only): expect false, true, true.
-- select public.plan_allows('free','aiTools'), public.plan_allows('pro','aiTools'), public.plan_allows('business','aiTools');
