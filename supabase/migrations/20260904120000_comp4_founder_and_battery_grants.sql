-- RECORD-ONLY — TL.COMP.4 — the founder and battery comps, as granted on prod 2026-09-03.
--
-- RAN ON PROD by Joey in the Supabase web SQL editor (ref ohmvlypcbrfkuudcuqub),
-- 2026-09-03 evening local / 2026-09-04 03:59:58 UTC (the `comp_grants.created_at`
-- both rows carry). This file is the RECORD of what was run.
--
-- WHY RECORD-ONLY, not RE-RUNNABLE: `admin_grant_comp` is append-only by design
-- — "every call is one ledger row" (20260901130000_comp_licenses.sql:86). Pasting
-- the two calls again would not change the profiles rows in any meaningful way
-- (they are already pro/infinity, and a re-grant simply records a new term), but
-- it WOULD add two more rows to `comp_grants`, and that ledger is documented
-- "Append-only ... Never delete rows" — so duplicates cannot be cleaned up
-- afterwards. Re-running is therefore wrong, but it is not destructive and it
-- reopens no closed write path, so this file carries no DO-NOT-RUN header and is
-- absent from the DO_NOT_RUN list in scripts/guard-invariants.mjs. Read it; do
-- not paste it. The assertion block at the foot IS safe to run — it only reads.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS RUN
-- ---------------------------------------------------------------------------
-- 1. joeyc's sandbox-era Stripe mirror was cleared. The account had a leftover
--    `subscription_status` / `subscription_period_end` from Stripe test-mode
--    work; `stripe_customer_id` was ALREADY null, so no live customer existed
--    and nothing was detached. This matters for revocation: admin_revoke_comp
--    derives the post-revoke plan from `subscription_status`
--    (20260901130000_comp_licenses.sql:21-22), so a stale sandbox status would
--    have made a future revoke silently leave the account on Pro as though it
--    were paying. Clearing it makes a revoke fall to `free`, which is the truth.
--
--    The exact statement text was not captured at the time; it was run as
--    postgres in the SQL editor, where guard_billing_columns bypasses. The
--    equivalent, by effect, is:
--
--      update public.profiles
--         set subscription_status    = null,
--             subscription_period_end = null
--       where id = '3eb457d7-8a07-4b2b-88e6-22222debfdc1';   -- joeyc
--
-- 2. The two grants, verbatim as run:
--
--      select * from public.admin_grant_comp(
--        'joeyc',
--        'founder — permanent',
--        'pro',
--        'infinity'
--      );
--
--      select * from public.admin_grant_comp(
--        'joey2019pwtestbattery',
--        'Playwright battery account — permanent',
--        'pro',
--        'infinity'
--      );
--
-- ---------------------------------------------------------------------------
-- RESULTING PROD STATE (verified read-only, 2026-09-03)
-- ---------------------------------------------------------------------------
--   profiles
--     3eb457d7-8a07-4b2b-88e6-22222debfdc1  joeyc
--       plan=pro  comped_until=infinity
--       stripe_customer_id=null  subscription_status=null  subscription_period_end=null
--     d3f1cfce-d15a-4f4a-ba5c-908e3e959e58  joey2019pwtestbattery
--       plan=pro  comped_until=infinity
--       stripe_customer_id=null  subscription_status=null  subscription_period_end=null
--
--   comp_grants — exactly 2 rows, both action='grant', actor='postgres',
--   plan_before='pro', comped_until_before=null, plan_after='pro',
--   comped_until_after='infinity', created_at 2026-09-04 03:59:58.63212+00:
--     085eb9a7-181b-48e1-99f6-512b525306d3  joeyc
--       reason 'founder — permanent'
--     5ff0c975-4b0d-4ca8-bca0-718d72f6f4c5  joey2019pwtestbattery
--       reason 'Playwright battery account — permanent'
--
-- Both accounts were ALREADY plan='pro' before the grant (plan_before='pro') —
-- they were hand-flipped in the era TL.COMP.0 describes. What changed is that
-- the Pro now has a recorded term, a reason and a ledger row instead of being
-- an unexplained column value. NOTHING EXPIRES A COMP AUTOMATICALLY; 'infinity'
-- is a recorded term, not a timer, and only admin_revoke_comp ends it.
--
-- Consequence for the reconciler: reconcile-billing skips comped accounts by
-- `stripe_customer_id is not null` — with that column null on both, neither
-- account is a Stripe subscription to reconcile, and neither will be reported
-- as drift for holding Pro without a subscription.
--
-- Prod now holds 3 accounts (TL.CLEAN.1): joeyc, joey2019pwtestbattery, and
-- mecivietnam — the last a real customer, NOT comped and not touched here.

-- ---------------------------------------------------------------------------
-- IDENTITY ASSERTION — read-only, safe to run any time.
-- Raises if prod has drifted from the state this file records.
-- ---------------------------------------------------------------------------
do $$
declare
  v_comped   int;
  v_grants   int;
  v_dirty    int;
begin
  select count(*) into v_comped
    from public.profiles
   where id in (
           '3eb457d7-8a07-4b2b-88e6-22222debfdc1',  -- joeyc
           'd3f1cfce-d15a-4f4a-ba5c-908e3e959e58'   -- joey2019pwtestbattery
         )
     and plan = 'pro'
     and comped_until = 'infinity'::timestamptz;

  select count(*) into v_grants
    from public.comp_grants
   where action = 'grant'
     and comped_until_after = 'infinity'::timestamptz
     and handle in ('joeyc', 'joey2019pwtestbattery');

  -- The Stripe mirror must stay empty on a comped account: a stale status
  -- would make admin_revoke_comp leave the account on Pro (see note 1 above).
  select count(*) into v_dirty
    from public.profiles
   where id in (
           '3eb457d7-8a07-4b2b-88e6-22222debfdc1',
           'd3f1cfce-d15a-4f4a-ba5c-908e3e959e58'
         )
     and (stripe_customer_id is not null
       or subscription_status is not null
       or subscription_period_end is not null);

  if v_comped <> 2 then
    raise exception 'TL.COMP.4: expected 2 pro/infinity comped profiles, found %', v_comped;
  end if;
  if v_grants < 2 then
    raise exception 'TL.COMP.4: expected at least 2 infinity grant rows in comp_grants, found %', v_grants;
  end if;
  if v_dirty <> 0 then
    raise exception 'TL.COMP.4: % comped profile(s) carry a non-null Stripe mirror column', v_dirty;
  end if;

  raise notice 'TL.COMP.4 OK — 2 comped profiles, % grant row(s), Stripe mirror clean', v_grants;
end $$;
