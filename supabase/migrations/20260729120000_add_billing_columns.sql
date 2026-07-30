-- BILL.B1 — billing columns on profiles (Stripe checkout + portal + webhook).
--
-- APPLY BY HAND in the Supabase web SQL editor against the PROD project
-- (ref ohmvlypcbrfkuudcuqub). This repo file is a MIRROR of what was run —
-- do NOT `supabase db push` (config.toml points at an orphan project).
--
-- RUN ORDER: this is migration 1 of 4 in the BILL epic. Run it first —
-- 20260729120100_add_webhook_events.sql, 20260729120200_add_referrals.sql and
-- 20260729120300_ent_srv.sql all depend on the columns added here.

-- ---------------------------------------------------------------------------
-- Stripe identity + subscription mirror
-- ---------------------------------------------------------------------------
-- `stripe_customer_id` is written ONLY by the stripe-webhook edge function
-- (service role). Unique so one Stripe customer can never map to two profiles —
-- that constraint is also what makes the referral self-referral check in
-- 20260729120200_add_referrals.sql (rule R3) meaningful.
alter table public.profiles
  add column if not exists stripe_customer_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_stripe_customer_id_key'
  ) then
    alter table public.profiles
      add constraint profiles_stripe_customer_id_key unique (stripe_customer_id);
  end if;
end $$;

-- Mirror of the Stripe subscription state. `plan` stays the single value every
-- entitlement gate reads (src/lib/entitlements.ts); these two columns exist so
-- the UI can explain WHY (past_due banner, "renews on", cancel-at-period-end)
-- without a Stripe round trip. Stripe remains the source of truth — nothing
-- here is authoritative, it is a cache the webhook refreshes.
alter table public.profiles
  add column if not exists subscription_status text;

alter table public.profiles
  add column if not exists subscription_period_end timestamptz;

comment on column public.profiles.subscription_status is
  'Stripe subscription.status mirror (active/trialing/past_due/canceled/...). Written by the stripe-webhook edge function only.';
comment on column public.profiles.subscription_period_end is
  'Stripe current_period_end mirror. Written by the stripe-webhook edge function only.';

-- ---------------------------------------------------------------------------
-- Referral attribution — lands NOW because it is unbackfillable
-- ---------------------------------------------------------------------------
-- Who referred this account. Set once, at/near signup, and never again (the
-- immutability trigger ships in 20260729120200_add_referrals.sql alongside
-- referral_code and the pending_grants table). It is recorded here in B1 so
-- that every account created from this migration forward carries attribution —
-- there is no way to reconstruct "who referred whom" after the fact.
alter table public.profiles
  add column if not exists referred_by uuid references public.profiles(id) on delete set null;

-- Self-referral is impossible at the schema level (rule R3, first line of defence).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_referred_by_not_self'
  ) then
    alter table public.profiles
      add constraint profiles_referred_by_not_self check (referred_by is null or referred_by <> id);
  end if;
end $$;

create index if not exists idx_profiles_referred_by on public.profiles(referred_by);
create index if not exists idx_profiles_stripe_customer_id on public.profiles(stripe_customer_id);

comment on column public.profiles.referred_by is
  'Referring profile id. Write-once at signup; unbackfillable, which is why it lands in BILL.B1 before the reward engine exists.';
