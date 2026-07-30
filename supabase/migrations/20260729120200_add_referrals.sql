-- BILL.B3 — referral codes, attribution capture, and the pending-grant ledger.
--
-- APPLY BY HAND in the Supabase web SQL editor against the PROD project
-- (ref ohmvlypcbrfkuudcuqub). This repo file is a MIRROR of what was run —
-- do NOT `supabase db push` (config.toml points at an orphan project).
--
-- RUN ORDER: migration 3 of 4. Run AFTER 20260729120100_add_webhook_events.sql
-- (profiles.referred_by comes from migration 1, the service-role guard from 2).
--
-- The reward RULES (30-day retention hold, annual cap of 12, coupon id) live in
-- supabase/functions/_shared/referrals.ts with their ToS Section 8 references.
-- This file provides the STORAGE and the anti-abuse invariants that must hold
-- regardless of which code path writes them.

-- ---------------------------------------------------------------------------
-- referral_code — every profile gets one, at INSERT time
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists referral_code text;

-- Alphabet excludes look-alikes (0/o, 1/l/i): these codes get read off phone
-- screens and typed by hand. 31^8 ≈ 8.5e11, so collisions are vanishing — but
-- the generator loops on the unique index rather than trusting that.
create or replace function public.generate_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  candidate text;
  i integer;
begin
  loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where referral_code = candidate);
  end loop;
  return candidate;
end;
$$;

-- Backfill before the unique index, so existing accounts get codes too.
update public.profiles
  set referral_code = public.generate_referral_code()
  where referral_code is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_referral_code_key') then
    alter table public.profiles
      add constraint profiles_referral_code_key unique (referral_code);
  end if;
end $$;

-- New rows get a code automatically. A BEFORE INSERT trigger rather than a
-- column DEFAULT because the generator needs to see the table to avoid
-- collisions, and defaults cannot be relied on to run before the unique check
-- in every insert path (handle_new_user, seeds, admin inserts).
create or replace function public.set_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.referral_code is null then
    new.referral_code := public.generate_referral_code();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_referral_code on public.profiles;
create trigger trg_set_referral_code
  before insert on public.profiles
  for each row execute function public.set_referral_code();

comment on column public.profiles.referral_code is
  'BILL.B3 — the owner''s share code, used as /?ref=<code>. Auto-generated at insert; unique. ''badge'' is reserved (generic badge link) and can never be a real code (5 chars vs 8).';

-- ---------------------------------------------------------------------------
-- referred_by is WRITE-ONCE, and only claim_referral may set it
-- ---------------------------------------------------------------------------
-- Attribution decides who gets paid, so it must not be editable after the fact.
-- Two separate rules:
--   • never CHANGE a non-null value (nobody, including the service role, has a
--     legitimate reason to re-point an existing referral)
--   • only set it from claim_referral (SECURITY DEFINER → current_user becomes
--     the function owner) or the service role — a direct PATCH from a client JWT
--     is rejected, which is what enforces the fresh-signup window
create or replace function public.guard_referred_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.referred_by is not distinct from old.referred_by then
    return new;
  end if;

  if old.referred_by is not null then
    raise exception 'referred_by is write-once and cannot be reassigned';
  end if;

  -- Inside claim_referral (SECURITY DEFINER) current_user is the function owner;
  -- a PostgREST request runs as 'authenticated' or 'anon'.
  if coalesce(auth.role(), '') = 'service_role'
     or current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  raise exception 'referred_by must be claimed via claim_referral()';
end;
$$;

drop trigger if exists trg_guard_referred_by on public.profiles;
create trigger trg_guard_referred_by
  before update on public.profiles
  for each row execute function public.guard_referred_by();

-- ---------------------------------------------------------------------------
-- claim_referral — the ONE way a client attaches attribution
-- ---------------------------------------------------------------------------
-- Called right after signup with the ?ref=<code> the visitor arrived on.
-- Returns true only when attribution was actually recorded, so the client can
-- stop retrying. Every rejection is silent-but-false: a caller must not be able
-- to enumerate valid codes by watching error messages.
--
-- Rule R3 is enforced three times over: the id inequality here, the
-- profiles_referred_by_not_self CHECK from migration 1, and the shared-customer
-- test at qualification time in _shared/referrals.ts.
create or replace function public.claim_referral(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_existing uuid;
  v_created timestamptz;
  v_referrer uuid;
begin
  if v_uid is null then return false; end if;
  if p_code is null or p_code = 'badge' then return false; end if;
  -- Shape check before a lookup: 8 chars from the restricted alphabet.
  if p_code !~ '^[abcdefghjkmnpqrstuvwxyz23456789]{8}$' then return false; end if;

  select referred_by, created_at into v_existing, v_created
    from public.profiles where id = v_uid;

  -- Write-once: a second claim is a no-op, not an error.
  if v_existing is not null then return false; end if;

  -- Fresh-signup window. Attribution belongs to the moment someone arrived on a
  -- share link; letting an established account claim a referrer months later
  -- turns the program into a self-serve discount.
  if v_created is null or v_created < now() - interval '2 hours' then return false; end if;

  select id into v_referrer
    from public.profiles
    where referral_code = p_code and id <> v_uid;

  if v_referrer is null then return false; end if;

  update public.profiles set referred_by = v_referrer where id = v_uid;
  return true;
end;
$$;

-- Functions grant EXECUTE to PUBLIC by default, which anon inherits. Revoke
-- from PUBLIC first, then grant narrowly — only a signed-in account can claim.
revoke execute on function public.claim_referral(text) from public;
grant execute on function public.claim_referral(text) to authenticated;

-- ---------------------------------------------------------------------------
-- pending_grants — the reward ledger (rules R1, R2, R4, R5)
-- ---------------------------------------------------------------------------
create table if not exists public.pending_grants (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid not null references public.profiles(id) on delete cascade,

  status text not null default 'pending' check (status in ('pending', 'granted', 'void')),
  -- Rule R5: over the annual cap the referral is still RECORDED (it counts
  -- toward the future cash program) but never granted. False = tracked only.
  grantable boolean not null default true,

  -- Rule R1: the first REAL paid invoice. Rule R2: that instant + 30 days.
  first_paid_at timestamptz not null,
  qualify_at timestamptz not null,

  granted_at timestamptz,
  voided_at timestamptz,
  void_reason text check (
    void_reason is null
    or void_reason in ('refund', 'chargeback', 'cancellation', 'self_referral', 'cap_exceeded')
  ),

  -- Stripe coupon/discount ids, so rule R4 clawback has something to revoke.
  referrer_coupon_id text,
  referred_coupon_id text,

  created_at timestamptz not null default now(),

  -- One reward per referred ACCOUNT, ever. This is the anti-abuse spine: no
  -- amount of resubscribing can earn a referrer a second month for the same
  -- person, and it makes the webhook's grant path idempotent for free.
  constraint pending_grants_one_per_referred unique (referred_id),
  constraint pending_grants_not_self check (referrer_id <> referred_id)
);

create index if not exists idx_pending_grants_referrer on public.pending_grants(referrer_id);
-- The release sweep's access path: pending rows whose hold has elapsed.
create index if not exists idx_pending_grants_due
  on public.pending_grants(qualify_at) where status = 'pending';

alter table public.pending_grants enable row level security;

-- A referrer may WATCH their own referrals (the settings page shows progress).
-- There is deliberately no insert/update/delete policy for any client: rewards
-- are written exclusively by the stripe-webhook function with the service role.
create policy "Referrers can view grants they earned"
  on public.pending_grants
  for select
  using (auth.uid() = referrer_id);

comment on table public.pending_grants is
  'BILL.B3 reward ledger. Rules R1-R5 live in supabase/functions/_shared/referrals.ts (ToS Section 8). Service-role writes only; referrers get SELECT on their own rows.';

-- ---------------------------------------------------------------------------
-- Rule R5 — earned months in the rolling window
-- ---------------------------------------------------------------------------
-- Counts only GRANTED rows: pending ones have not been earned yet, and voided
-- ones never were. Called by the webhook before creating a grant.
create or replace function public.referral_earned_in_window(p_referrer uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.pending_grants
  where referrer_id = p_referrer
    and status = 'granted'
    and granted_at >= now() - interval '365 days';
$$;

grant execute on function public.referral_earned_in_window(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Public badge attribution
-- ---------------------------------------------------------------------------
-- The public "Made with TitiLinks" badge on a PRO page links to
-- /?ref=<owner referral_code>. profiles is owner-only RLS, so the public route
-- reads it through this existing security-definer accessor — extended with one
-- column and nothing else. Replaces the PROMO.TOGGLE.1 definition in
-- 20260722150000_add_show_badge.sql; the (plan, show_badge) contract is
-- unchanged, so existing callers keep working.
--
-- ⚠️ DROP first: `create or replace` CANNOT change a function's return type
-- ("cannot change return type of existing function"), and adding referral_code
-- to the returns-table does exactly that. Between the drop and the create the
-- RPC is missing — usePublicPageBranding fails toward { free, badge shown },
-- which is the safe direction, and the window is one statement long.
drop function if exists public.get_public_page_branding(uuid);

create function public.get_public_page_branding(p_page_id uuid)
returns table(plan text, show_badge boolean, referral_code text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.plan, 'free'), coalesce(p.show_badge, true), p.referral_code
  from public.pages pg
  join public.profiles p on p.id = pg.user_id
  where pg.id = p_page_id
  limit 1;
$$;

grant execute on function public.get_public_page_branding(uuid) to anon, authenticated;
