-- TL.COMP.1c — RECORD of the live `profiles` UPDATE policy. NOT a proposal.
--
-- ⚠️⚠️ DO NOT RUN THIS FILE. ⚠️⚠️
--
-- Every other migration in this directory is a mirror of DDL that was applied
-- by hand and is meant to be re-runnable. This one is NOT. It exists because
-- the hardened `WITH CHECK` below is live in prod (ref ohmvlypcbrfkuudcuqub)
-- and was never mirrored anywhere in the repo — the only recorded version of
-- this policy is 20260111040649_7b135b54-cfb3-49ff-bd02-a80e016b80f7.sql:141-143,
-- which is `USING (auth.uid() = id)` with NO `WITH CHECK` at all. The repo was
-- therefore under-recording prod by an entire enforcement layer.
--
-- Captured read-only from pg_policy via `pg_get_expr(polwithcheck, polrelid)`
-- on 2026-09-01. Reproduced VERBATIM, including a defect (see below). It is
-- written down so the repo stops lying by omission, not so anyone can apply it.
--
-- ---------------------------------------------------------------------------
-- ⚠️ KNOWN DEFECT CARRIED BY THIS MIRROR — the `show_badge` pin
-- ---------------------------------------------------------------------------
-- Six of the seven pinned columns are billing/referral columns that SHOULD be
-- immutable to their owner; the pin is correct defence-in-depth beside
-- guard_billing_columns (20260729120100_add_webhook_events.sql:49) and
-- guard_referred_by.
--
-- The SEVENTH, `show_badge`, is different: it is a column the owner is SUPPOSED
-- to be able to change. PROMO.TOGGLE.1 sells the badge toggle to paid tiers, and
-- guard_entitlement_columns (20260729120300_ent_srv.sql:155-159) deliberately
-- PERMITS a paid plan to set it false. This policy refuses it first, for
-- everyone. The client write at src/pages/Settings.tsx:70
--
--     supabase.from('profiles').update({ show_badge: next }).eq('id', user.id)
--
-- is therefore believed to be rejected in production for every user, i.e. the
-- paid badge toggle does not work. SUSPECTED, not proven: it has not been
-- observed failing, and it CANNOT be reproduced from the Supabase SQL editor —
-- that session runs as `postgres`, which owns the table, and profiles has
-- relforcerowsecurity = false, so the owner bypasses RLS entirely. Confirming it
-- requires an authenticated client (the app, or the Playwright battery).
--
-- Nothing is fixed here. Removing the `show_badge` clause from this file would
-- produce a mirror that disagrees with prod — a file that lies about what it
-- mirrors is worse than a file that records something broken. The fix belongs in
-- its own brick, applied to prod first, and mirrored back afterwards.
--
-- RE-RUNNING THIS FILE RE-APPLIES THE DEFECT. If prod is ever repaired and
-- someone pastes this to "restore" the policy, the badge toggle breaks again.
-- ---------------------------------------------------------------------------

-- The live policy, as prod holds it. Whitespace reflowed for reading; the
-- expression is otherwise identical to the captured pg_get_expr output quoted
-- at the bottom of this file. No `TO` clause: pg_policy.polroles = {0} (PUBLIC),
-- polpermissive = true, polcmd = 'w' (UPDATE).
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
    -- ⚠️ THE DEFECT. See the header block. Kept because this is a mirror.
    and (not (show_badge is distinct from (
      select p.show_badge from profiles p where (p.id = profiles.id))))
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
-- As captured 2026-09-01, that returns EXACTLY (newlines as rendered by
-- pg_get_expr; this is the byte-comparison reference for the DDL above):
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
--   WHERE (p.id = profiles.id)))) AND (NOT (show_badge IS DISTINCT FROM ( SELECT p.show_badge
--    FROM profiles p
--   WHERE (p.id = profiles.id)))))
--
-- The companion SELECT policy is unchanged from the January migration and is
-- not restated here:
--   "Users can view their own profile" — FOR SELECT USING (auth.uid() = id)
