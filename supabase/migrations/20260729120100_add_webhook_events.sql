-- BILL.B2 — webhook idempotency ledger + billing-column write lockdown.
--
-- APPLY BY HAND in the Supabase web SQL editor against the PROD project
-- (ref ohmvlypcbrfkuudcuqub). This repo file is a MIRROR of what was run —
-- do NOT `supabase db push` (config.toml points at an orphan project).
--
-- RUN ORDER: migration 2 of 4. Run AFTER 20260729120000_add_billing_columns.sql.

-- ---------------------------------------------------------------------------
-- Idempotency: one row per Stripe event id, ever
-- ---------------------------------------------------------------------------
-- Stripe guarantees AT-LEAST-once delivery: retries on any non-2xx, plus
-- genuine duplicates. Every handler here is therefore gated on inserting the
-- event id first — the primary key does the deduplication, so a replayed
-- checkout.session.completed cannot grant a second free month or double-write a
-- subscription state.
create table if not exists public.stripe_webhook_events (
  id text primary key,                       -- Stripe event.id (evt_...)
  type text not null,                        -- event.type, for forensics
  received_at timestamptz not null default now(),
  -- Null while in flight; set when the handler finished. A row with a null
  -- processed_at is a handler that crashed mid-flight — visible, not silent.
  processed_at timestamptz,
  error text
);

create index if not exists idx_stripe_webhook_events_received_at
  on public.stripe_webhook_events(received_at desc);

-- No client ever touches this table: the webhook writes it with the service
-- role (which bypasses RLS). RLS on with zero policies = deny-all for anon and
-- authenticated, which is exactly the intent.
alter table public.stripe_webhook_events enable row level security;

comment on table public.stripe_webhook_events is
  'BILL.B2 idempotency ledger. One row per Stripe event id; the primary key IS the dedupe. Service-role only.';

-- ---------------------------------------------------------------------------
-- Stripe is the source of truth: clients may not write billing columns
-- ---------------------------------------------------------------------------
-- The app has no client-side plan writes (censused in B2 — zero call sites), but
-- `profiles` has a broad owner-can-update-own-row policy, so nothing STOPPED a
-- crafted request from doing `update profiles set plan='pro'` with its own JWT.
-- Removing the code paths is not enforcement; this trigger is.
--
-- Service-role and superuser writes pass through (that is the webhook). Any
-- other role gets its billing-column changes rejected outright rather than
-- silently reverted, so an attempt is loud in the logs.
create or replace function public.guard_billing_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- current_setting('role') is 'none'/'authenticated'/'anon' for API traffic;
  -- the service role authenticates as 'service_role'. auth.role() mirrors the
  -- JWT claim and is the value PostgREST sets.
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

  return new;
end;
$$;

drop trigger if exists trg_guard_billing_columns on public.profiles;
create trigger trg_guard_billing_columns
  before update on public.profiles
  for each row execute function public.guard_billing_columns();

comment on function public.guard_billing_columns is
  'BILL.B2 — rejects client writes to plan / stripe_customer_id / subscription_*. Only the service role (stripe-webhook) may change them.';
