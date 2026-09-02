-- TL.COMP.1c / TL.COMP.5b — RECORD of the live `profiles` UPDATE policy.
--
-- ⚠️ DO NOT RUN THIS FILE. ⚠️
--
-- Every other migration in this directory is a mirror of DDL that was applied
-- by hand and is meant to be re-runnable. This one is a RECORD. It exists
-- because the hardened `WITH CHECK` below is live in prod
-- (ref ohmvlypcbrfkuudcuqub) and was never mirrored anywhere in the repo — the
-- only other recorded version of this policy is
-- 20260111040649_7b135b54-cfb3-49ff-bd02-a80e016b80f7.sql:141-143, which is
-- `USING (auth.uid() = id)` with NO `WITH CHECK` at all. The repo was
-- therefore under-recording prod by an entire enforcement layer.
--
-- Captured read-only from pg_policy via `pg_get_expr(polwithcheck, polrelid)`.
-- Reproduced VERBATIM. It is written down so the repo stops lying by omission,
-- not so anyone can apply it — the policy is created by the January migration
-- and was ALTERED in place by hand; pasting a CREATE POLICY over it fails on
-- the duplicate name.
--
-- ---------------------------------------------------------------------------
-- FIX RECORD — 2026-09-01 — TL.COMP.5b — the `show_badge` pin removed
-- ---------------------------------------------------------------------------
-- First capture (TL.COMP.1c, 2026-09-01 morning) recorded SEVEN pinned
-- columns. Six are billing/referral columns that SHOULD be immutable to their
-- owner; that pin is correct defence-in-depth beside guard_billing_columns
-- (20260729120100_add_webhook_events.sql:49) and guard_referred_by.
--
-- The seventh, `show_badge`, was a DEFECT: it is a column the owner is
-- SUPPOSED to be able to change. PROMO.TOGGLE.1 sells the badge toggle to
-- paid tiers, and guard_entitlement_columns (20260729120300_ent_srv.sql:155-159)
-- deliberately PERMITS a paid plan to set it false. The policy refused it
-- first, for everyone, so the client write at src/pages/Settings.tsx:70
--
--     supabase.from('profiles').update({ show_badge: next }).eq('id', user.id)
--
-- came back 403 / 42501 for every user and the paid badge toggle never
-- persisted. PROVEN (not suspected) by the TL.COMP.5a probe on desktop and
-- mobile, 2026-09-01 — the earlier note that it could not be reproduced from
-- the SQL editor stands (that session runs as the table owner, and profiles
-- has relforcerowsecurity = false, so the owner bypasses RLS).
--
-- FIXED 2026-09-01 by TL.COMP.5b Step 2, run by hand in the Supabase web SQL
-- editor: a gated `ALTER POLICY ... WITH CHECK (...)` restating the six
-- legitimate pins and dropping the `show_badge` clause. The gate was a dry
-- run in a rolled-back transaction that asserted the new expression carried
-- `show_badge` = false and exactly 6 `IS DISTINCT FROM` clauses before the
-- live statement was committed. Post-commit capture (below) matches.
--
-- The guard_entitlement_columns trigger is now the SOLE gate on show_badge,
-- which is the intended design: free tier is forced true, paid tiers choose.
-- Spec tests/30-promo-toggle.spec.ts ("Pro can turn the badge off and the
-- choice survives a reload") is un-fixme'd as of this record and exercises
-- the real PATCH against the battery account.
-- ---------------------------------------------------------------------------

-- The live policy, as prod holds it after TL.COMP.5b. Whitespace reflowed for
-- reading; the expression is otherwise identical to the captured pg_get_expr
-- output quoted at the bottom of this file. No `TO` clause:
-- pg_policy.polroles = {0} (PUBLIC), polpermissive = true, polcmd = 'w'.
create policy "Users can update their own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (
    (auth.uid() = id)
    -- Each clause pins one column to the value the row already holds: the
    -- sub-select reads the pre-UPDATE value under the statement's snapshot, so
    -- `NOT (col IS DISTINCT FROM <stored col>)` admits only a no-op write.
    and (not (plan is distinct from (
      select p.plan from profiles p where (p.id = profiles.id))))
    and (not (stripe_customer_id is distinct from (
      select p.stripe_customer_id from profiles p where (p.id = profiles.id))))
    and (not (subscription_status is distinct from (
      select p.subscription_status from profiles p where (p.id = profiles.id))))
    and (not (subscription_period_end is distinct from (
      select p.subscription_period_end from profiles p where (p.id = profiles.id))))
    and (not (referred_by is distinct from (
      select p.referred_by from profiles p where (p.id = profiles.id))))
    and (not (referral_code is distinct from (
      select p.referral_code from profiles p where (p.id = profiles.id))))
    -- No show_badge clause. Removed by TL.COMP.5b — see the fix record above.
  );

-- ---------------------------------------------------------------------------
-- Verification — how to confirm this file still matches prod
-- ---------------------------------------------------------------------------
-- Read-only. Safe to run any time; changes nothing.
--
--   select pg_get_expr(polwithcheck, polrelid)
--   from pg_policy
--   where polrelid = 'public.profiles'::regclass
--     and polname  = 'Users can update their own profile';
--
-- As captured 2026-09-01 after the TL.COMP.5b commit, that returns EXACTLY
-- (newlines as rendered by pg_get_expr; this is the byte-comparison reference
-- for the DDL above):
--
-- ((auth.uid() = id) AND (NOT (plan IS DISTINCT FROM ( SELECT p.plan
--    FROM profiles p
--   WHERE (p.id = profiles.id)))) AND (NOT (stripe_customer_id IS DISTINCT FROM ( SELECT p.stripe_customer_id
--    FROM profiles p
--   WHERE (p.id = profiles.id)))) AND (NOT (subscription_status IS DISTINCT FROM ( SELECT p.subscription_status
--    FROM profiles p
--   WHERE (p.id = profiles.id)))) AND (NOT (subscription_period_end IS DISTINCT FROM ( SELECT p.subscription_period_end
--    FROM profiles p
--   WHERE (p.id = profiles.id)))) AND (NOT (referred_by IS DISTINCT FROM ( SELECT p.referred_by
--    FROM profiles p
--   WHERE (p.id = profiles.id)))) AND (NOT (referral_code IS DISTINCT FROM ( SELECT p.referral_code
--    FROM profiles p
--   WHERE (p.id = profiles.id)))))
--
-- The companion SELECT policy is unchanged from the January migration and is
-- not restated here:
--   "Users can view their own profile" — FOR SELECT USING (auth.uid() = id)
