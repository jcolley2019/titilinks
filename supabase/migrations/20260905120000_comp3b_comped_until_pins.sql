-- RE-RUNNABLE — TL.COMP.3b — comped_until pinned against client writes; admin_grant_comp warns on comp-over-Stripe.
--
-- Mirror of what Joey pasted on 2026-09-05 (rehearsed by the architect in a
-- rolled-back transaction, then applied with commit;). Idempotent: ALTER POLICY
-- restates the full WITH CHECK, both functions are CREATE OR REPLACE.
--
-- Why: TL.COMP.1 added profiles.comped_until, but the two client-write locks
-- (the profiles UPDATE policy WITH CHECK — record #39 — and the
-- guard_billing_columns trigger — #29) pinned only the Stripe columns. A JWT
-- bearer could PATCH its own comped_until through PostgREST and the reconciler
-- would honour it. This closes that door: comped_until is now the 7th policy
-- pin and the 5th trigger column. Only postgres (admin_grant_comp /
-- admin_revoke_comp, SECURITY DEFINER) and the service role can change it.
--
-- Supersedes: the guard_billing_columns body in #16 (4 columns) and the
-- admin_grant_comp body in #40 (no notice). Re-running either of those files
-- would silently REMOVE what this file adds — both carry a header saying so.
-- Record #39 (six pins) is superseded by the WITH CHECK below.
--
-- Proof: tests/56-comp3b-comped-until-floor.spec.ts (battery PATCH refused,
-- value unchanged; same-value PATCH still succeeds).

-- ---------------------------------------------------------------------------
-- 1. profiles UPDATE policy: 7th pin — comped_until
-- ---------------------------------------------------------------------------
alter policy "Users can update their own profile" on public.profiles
  with check (
    (auth.uid() = id)
    and (not (plan is distinct from (
      select p.plan from public.profiles p where p.id = profiles.id)))
    and (not (stripe_customer_id is distinct from (
      select p.stripe_customer_id from public.profiles p where p.id = profiles.id)))
    and (not (subscription_status is distinct from (
      select p.subscription_status from public.profiles p where p.id = profiles.id)))
    and (not (subscription_period_end is distinct from (
      select p.subscription_period_end from public.profiles p where p.id = profiles.id)))
    and (not (referred_by is distinct from (
      select p.referred_by from public.profiles p where p.id = profiles.id)))
    and (not (referral_code is distinct from (
      select p.referral_code from public.profiles p where p.id = profiles.id)))
    and (not (comped_until is distinct from (
      select p.comped_until from public.profiles p where p.id = profiles.id)))
  );

-- ---------------------------------------------------------------------------
-- 2. guard_billing_columns: 5th column — comped_until. SECURITY INVOKER,
--    deliberately (see 20260729120100_add_webhook_events.sql).
-- ---------------------------------------------------------------------------
create or replace function public.guard_billing_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or current_user = 'postgres' then
    return new;
  end if;

  if new.plan is distinct from old.plan then
    raise exception 'plan is set by Stripe billing events, not by the client';
  end if;
  if new.stripe_customer_id is distinct from old.stripe_customer_id then
    raise exception 'stripe_customer_id is set by Stripe billing events, not by the client';
  end if;
  if new.subscription_status is distinct from old.subscription_status then
    raise exception 'subscription_status is set by Stripe billing events, not by the client';
  end if;
  if new.subscription_period_end is distinct from old.subscription_period_end then
    raise exception 'subscription_period_end is set by Stripe billing events, not by the client';
  end if;
  if new.comped_until is distinct from old.comped_until then
    raise exception 'comped_until is set by admin_grant_comp / admin_revoke_comp, not by the client';
  end if;

  return new;
end;
$$;

comment on function public.guard_billing_columns is
  'BILL.B2 + TL.COMP.3b — rejects client writes to plan / stripe_customer_id / subscription_* / comped_until. Only the service role (stripe-webhook) and postgres (admin_*_comp) may change them.';

-- ---------------------------------------------------------------------------
-- 3. admin_grant_comp: warn when the account also has a Stripe customer.
--    Body otherwise identical to 20260901130000_comp_licenses.sql.
--    CREATE OR REPLACE keeps the existing owner and (zero) grants.
-- ---------------------------------------------------------------------------
create or replace function public.admin_grant_comp(
  p_handle text,
  p_reason text,
  p_plan text default 'pro',
  p_until timestamptz default now() + interval '1 year'
)
returns table (
  grant_id uuid,
  user_id uuid,
  handle text,
  plan text,
  comped_until timestamptz,
  subscription_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_current_plan text;
  v_current_until timestamptz;
  v_stripe_customer_id text;
  v_grant_id uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'admin_grant_comp: a reason is required (it goes in the ledger)';
  end if;
  if p_plan is distinct from 'pro' then
    raise exception 'admin_grant_comp: only ''pro'' can be comped (got %)', coalesce(p_plan, 'null');
  end if;
  if p_until is null or p_until <= now() then
    raise exception 'admin_grant_comp: p_until must be in the future or ''infinity'' (got %)', coalesce(p_until::text, 'null');
  end if;

  select pg.user_id into v_user_id
  from public.pages pg
  where pg.handle = btrim(p_handle)
  limit 1;
  if v_user_id is null then
    raise exception 'admin_grant_comp: no page with handle % ', quote_literal(p_handle);
  end if;

  select p.plan, p.comped_until, p.stripe_customer_id
  into v_current_plan, v_current_until, v_stripe_customer_id
  from public.profiles p where p.id = v_user_id;
  if v_current_plan = 'business' then
    raise exception 'admin_grant_comp: % is on ''business''; comping it to ''pro'' would be a downgrade', quote_literal(p_handle);
  end if;
  -- TL.COMP.3b: a comp on a paying account is legal (the comp outlives the
  -- subscription) but worth a loud note in the editor output.
  if v_stripe_customer_id is not null then
    raise notice 'admin_grant_comp: % has a Stripe customer (%); the comp will outlive any subscription — revoke with admin_revoke_comp when intended',
      quote_literal(p_handle), v_stripe_customer_id;
  end if;

  update public.profiles p
  set plan = p_plan,
      comped_until = p_until
  where p.id = v_user_id;

  insert into public.comp_grants
    (user_id, handle, action, plan_before, comped_until_before, plan_after, comped_until_after, reason)
  values
    (v_user_id, btrim(p_handle), 'grant', coalesce(v_current_plan, 'free'), v_current_until, p_plan, p_until, btrim(p_reason))
  returning id into v_grant_id;

  return query
    select v_grant_id, p.id, btrim(p_handle), p.plan, p.comped_until, p.subscription_status
    from public.profiles p
    where p.id = v_user_id;
end;
$$;

-- Re-lock (COMP-NO-GRANT): CREATE OR REPLACE keeps prod's zero grants, but a
-- fresh database would default-grant EXECUTE to anon/authenticated/service_role
-- on this definition. Same four revokes as #40; nothing is granted back.
revoke all on function public.admin_grant_comp(text, text, text, timestamptz) from public;
revoke all on function public.admin_grant_comp(text, text, text, timestamptz) from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verification — read-only, run any time. Expected: policy_pins 7, all true, 4.
-- ---------------------------------------------------------------------------
-- select
--   (select (length(pg_get_expr(polwithcheck, polrelid)) - length(replace(pg_get_expr(polwithcheck, polrelid), 'IS DISTINCT FROM', ''))) / length('IS DISTINCT FROM')
--      from pg_policy where polrelid='public.profiles'::regclass and polname='Users can update their own profile') as policy_pins,
--   (select pg_get_expr(polwithcheck, polrelid) like '%comped_until%'
--      from pg_policy where polrelid='public.profiles'::regclass and polname='Users can update their own profile') as policy_has_comped,
--   (select not prosecdef from pg_proc where proname='guard_billing_columns') as guard_is_invoker,
--   (select prosrc like '%new.comped_until is distinct from old.comped_until%' from pg_proc where proname='guard_billing_columns') as guard_has_comped,
--   (select prosecdef and pg_get_userbyid(proowner)='postgres' from pg_proc where proname='admin_grant_comp') as grant_definer_postgres,
--   (select prosrc like '%raise notice%' from pg_proc where proname='admin_grant_comp') as grant_has_notice,
--   (select count(*)=0 from information_schema.role_routine_grants where specific_schema='public' and routine_name in ('admin_grant_comp','admin_revoke_comp') and grantee<>'postgres') as grants_ok,
--   (select count(*) from pg_trigger where tgrelid='public.profiles'::regclass and not tgisinternal) as profile_triggers;
