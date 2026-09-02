-- TL.COMP.1 — comp licenses: comped_until column, comp_grants ledger, and the
-- two admin functions that are the ONLY sanctioned way to hand out or take
-- back a complimentary Pro plan.
--
-- APPLY BY HAND in the Supabase web SQL editor against the PROD project
-- (ref ohmvlypcbrfkuudcuqub). This repo file is a MIRROR of what is run —
-- do NOT `supabase db push` (config.toml points at an orphan project).
--
-- Why this exists (TL.COMP.0 recon, 2026-08-31): every paid account in prod
-- today is hand-granted — plan flipped in the SQL editor with no record of
-- who, when, why, or for how long. The reconciler (reconcile-billing) skips
-- them by `stripe_customer_id is not null`, so they are invisible to every
-- audit. This brick gives a comp a term, a ledger row and a single door.
--
-- Rulings carried from TL.COMP.0, all standing:
--   * comped_until: 'infinity' = permanent; the default term is one year.
--   * comp_grants: RLS on, ZERO policies (no client can read or write it),
--     plain FK to profiles (no cascade — a ledger row outlives nothing by
--     accident), rows are never deleted, reason is NOT NULL and non-blank.
--   * admin_grant_comp accepts plan 'pro' ONLY.
--   * admin_revoke_comp derives the post-revoke plan from the Stripe mirror
--     (subscription_status) — a comped account that ALSO pays keeps Pro.
--   * Both are SECURITY DEFINER owned by postgres, SET search_path = public,
--     REVOKE ALL FROM PUBLIC, and receive NO grants — callable only by
--     postgres, i.e. only from the SQL editor. There is no admin UI.
--   * NOTHING EXPIRES A COMP AUTOMATICALLY. comped_until is a recorded term,
--     not a timer. Revoking is a deliberate call to admin_revoke_comp.
--
-- Interaction with the existing guards: guard_billing_columns and
-- guard_entitlement_columns both bypass when current_user = 'postgres'. A
-- SECURITY DEFINER function owned by postgres runs its body AS postgres, so
-- the plan write below passes both guards — which is the whole point of
-- routing comps through a definer function instead of relaxing the guards.
-- The plan column's WITH CHECK pins in the profiles UPDATE policy are not in
-- play either: profiles has relforcerowsecurity = false, and postgres owns it.

-- ---------------------------------------------------------------------------
-- 1. The term
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists comped_until timestamptz;

comment on column public.profiles.comped_until is
  'TL.COMP.1. Non-null = this plan was comped, not bought. ''infinity'' = permanent. Recorded term only: NOTHING expires it automatically — revoke via admin_revoke_comp. Written only by the admin_*_comp functions.';

-- ---------------------------------------------------------------------------
-- 2. The ledger
-- ---------------------------------------------------------------------------
create table if not exists public.comp_grants (
  id uuid primary key default gen_random_uuid(),
  -- Plain FK: no ON DELETE clause. Deleting a profile with ledger rows fails,
  -- and that is the intended behaviour — the audit trail is not collateral.
  user_id uuid not null references public.profiles(id),
  handle text not null,                          -- as resolved at the time
  action text not null check (action in ('grant', 'revoke')),
  -- Before/after pairs: a bad derivation (or a bad reason) is reversible by
  -- hand from the row alone, without reconstructing history from Stripe.
  plan_before text not null,                     -- the plan the row found
  comped_until_before timestamptz,               -- null when it was not comped
  plan_after text not null,                      -- the plan the row left behind
  comped_until_after timestamptz,                -- null after a revoke
  reason text not null check (btrim(reason) <> ''),
  actor text not null default current_user,      -- the SQL-editor session role
  created_at timestamptz not null default now()
);

create index if not exists idx_comp_grants_user_created
  on public.comp_grants(user_id, created_at desc);

-- RLS on with zero policies = deny-all for anon and authenticated. Only the
-- definer functions below (running as postgres, the table owner) write it, and
-- only the SQL editor reads it. Never add a policy here.
alter table public.comp_grants enable row level security;

comment on table public.comp_grants is
  'TL.COMP.1 comp ledger. Append-only: one row per grant/revoke, written only by admin_grant_comp / admin_revoke_comp. RLS on, zero policies by design. Never delete rows.';

-- ---------------------------------------------------------------------------
-- 3. Grant
-- ---------------------------------------------------------------------------
-- Usage (SQL editor, as postgres):
--   select * from public.admin_grant_comp('handle', 'reason');                      -- pro, 1 year
--   select * from public.admin_grant_comp('handle', 'reason', 'pro', 'infinity');   -- permanent
--
-- Re-granting an already-comped account is allowed and simply records a new
-- term; every call is one ledger row. NOTHING EXPIRES THE COMP WHEN p_until
-- PASSES — see the column comment. This function never touches the Stripe
-- mirror columns (stripe_customer_id, subscription_status,
-- subscription_period_end); those stay the webhook's.
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
-- DEFINER is required here (unlike the guard triggers): the body must run as
-- postgres so guard_billing_columns lets the plan write through.
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_current_plan text;
  v_current_until timestamptz;
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

  select p.plan, p.comped_until into v_current_plan, v_current_until
  from public.profiles p where p.id = v_user_id;
  -- A comp is a step UP. Never silently downgrade a Business account to Pro.
  if v_current_plan = 'business' then
    raise exception 'admin_grant_comp: % is on ''business''; comping it to ''pro'' would be a downgrade', quote_literal(p_handle);
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

comment on function public.admin_grant_comp(text, text, text, timestamptz) is
  'TL.COMP.1. Comp a page owner to ''pro'' until p_until (default 1 year; ''infinity'' = permanent). Writes profiles.plan + comped_until and one comp_grants row. Nothing expires the comp automatically — revoke with admin_revoke_comp. SQL-editor only: no EXECUTE grants exist.';

-- ---------------------------------------------------------------------------
-- 4. Revoke
-- ---------------------------------------------------------------------------
-- Usage (SQL editor, as postgres):
--   select * from public.admin_revoke_comp('handle', 'reason');
--
-- The post-revoke plan is NOT hard-coded to 'free'. It is derived from the
-- Stripe mirror exactly as the webhook would derive it, so an account that was
-- comped AND later started paying keeps what it pays for.
create or replace function public.admin_revoke_comp(
  p_handle text,
  p_reason text
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
  v_comped_until timestamptz;
  v_status text;
  v_target_plan text;
  v_grant_id uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'admin_revoke_comp: a reason is required (it goes in the ledger)';
  end if;

  select pg.user_id into v_user_id
  from public.pages pg
  where pg.handle = btrim(p_handle)
  limit 1;
  if v_user_id is null then
    raise exception 'admin_revoke_comp: no page with handle %', quote_literal(p_handle);
  end if;

  select p.plan, p.comped_until, p.subscription_status
  into v_current_plan, v_comped_until, v_status
  from public.profiles p
  where p.id = v_user_id;
  if v_comped_until is null then
    raise exception 'admin_revoke_comp: % is not comped (comped_until is null) — nothing to revoke', quote_literal(p_handle);
  end if;

  -- ⚠️ MIRROR of planForSubscriptionStatus() in
  -- supabase/functions/_shared/plan-lifecycle.ts: the ACCESS_GRANTING_STATUSES
  -- list ('active', 'trialing', 'past_due') grants 'pro'; null and anything
  -- else is 'free'. scripts/billing.test.mjs parses this file and fails the
  -- guard battery if the two lists drift. Edit them together.
  v_target_plan := case
    when v_status in ('active', 'trialing', 'past_due') then 'pro'
    else 'free'
  end;

  update public.profiles p
  set plan = v_target_plan,
      comped_until = null
  where p.id = v_user_id;

  insert into public.comp_grants
    (user_id, handle, action, plan_before, comped_until_before, plan_after, comped_until_after, reason)
  values
    (v_user_id, btrim(p_handle), 'revoke', coalesce(v_current_plan, 'free'), v_comped_until, v_target_plan, null, btrim(p_reason))
  returning id into v_grant_id;

  return query
    select v_grant_id, p.id, btrim(p_handle), p.plan, p.comped_until, p.subscription_status
    from public.profiles p
    where p.id = v_user_id;
end;
$$;

comment on function public.admin_revoke_comp(text, text) is
  'TL.COMP.1. End a comp: clears comped_until and sets plan from the Stripe mirror (mirror of planForSubscriptionStatus). One comp_grants row. SQL-editor only: no EXECUTE grants exist.';

-- ---------------------------------------------------------------------------
-- 5. Lock the door
-- ---------------------------------------------------------------------------
-- Supabase's default privileges grant EXECUTE on every new public function to
-- anon, authenticated and service_role — not just PUBLIC — so revoking from
-- PUBLIC alone would leave a JWT-bearing client able to comp itself through
-- PostgREST. All four are revoked. Nothing is granted back: the owner
-- (postgres, the SQL-editor session) keeps its implicit right and is the only
-- caller. The COMP-NO-GRANT invariant in scripts/guard-invariants.mjs fails the
-- build if a `grant … on function admin_*_comp` ever appears in a migration,
-- or if these revoke lines go missing.
revoke all on function public.admin_grant_comp(text, text, text, timestamptz) from public;
revoke all on function public.admin_grant_comp(text, text, text, timestamptz) from anon, authenticated, service_role;
revoke all on function public.admin_revoke_comp(text, text) from public;
revoke all on function public.admin_revoke_comp(text, text) from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Verification — run after pasting; read-only
-- ---------------------------------------------------------------------------
-- Expected: one row.
--   definer_ok  = true   (both functions prosecdef)
--   owner_ok    = true   (both owned by postgres)
--   grants_ok   = true   (zero EXECUTE grants to anyone but the owner —
--                         role_routine_grants lists the owner's implicit row,
--                         so it is excluded by name)
--   rls_ok      = true   (comp_grants rowsecurity on, zero policies)
--   proacl      = the raw ACLs, each exactly {postgres=X/postgres}
select
  (select bool_and(p.prosecdef)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('admin_grant_comp', 'admin_revoke_comp'))
    as definer_ok,
  (select bool_and(pg_get_userbyid(p.proowner) = 'postgres')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('admin_grant_comp', 'admin_revoke_comp'))
    as owner_ok,
  (select count(*) = 0
     from information_schema.role_routine_grants g
    where g.specific_schema = 'public'
      and g.routine_name in ('admin_grant_comp', 'admin_revoke_comp')
      and g.grantee <> 'postgres')
    as grants_ok,
  (select c.relrowsecurity
        and (select count(*) from pg_policy where polrelid = c.oid) = 0
     from pg_class c
    where c.oid = 'public.comp_grants'::regclass)
    as rls_ok,
  (select jsonb_object_agg(p.proname, p.proacl::text)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('admin_grant_comp', 'admin_revoke_comp'))
    as proacl;
