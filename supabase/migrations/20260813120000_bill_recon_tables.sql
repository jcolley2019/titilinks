-- BILL.RECON.3 — the reconciler's run log and its findings.
--
-- APPLY BY HAND in the Supabase web SQL editor against the PROD project
-- (ref ohmvlypcbrfkuudcuqub). This repo file is a MIRROR of DDL that was ALREADY
-- run there on Aug 13, 2026 — do NOT `supabase db push` (config.toml points at
-- an orphan project). The tables are live; this file records their shape so the
-- repo is not missing two of them.
--
-- Why these are their own tables: `stripe_webhook_events` cannot host drift
-- rows. Its primary key IS the Stripe event id — that is the dedupe — and it
-- carries no profile, direction, or expected/actual columns. See
-- 20260729120100_add_webhook_events.sql.

-- ---------------------------------------------------------------------------
-- One row per reconciliation run
-- ---------------------------------------------------------------------------
-- The row is opened before any Stripe call and closed by `finalize` on every
-- exit path, including the aborted ones. A run that died mid-flight is therefore
-- a row with a null finished_at — visible, not absent.
--
-- There is deliberately NO applied_count column. The number of findings an armed
-- run wrote back is returned in the JSON response only; the durable answer is a
-- count over billing_recon_findings.applied. A denormalised tally here would be
-- a second place for the same fact to go stale.
create table if not exists public.billing_recon_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,                     -- null = still running, or crashed mid-flight
  mode text not null,                          -- 'report' | 'apply' — what the run ACTUALLY did,
                                               -- not what it was armed for: a run that trips the
                                               -- apply cap is downgraded to 'report' here
  subscriptions_seen integer,                  -- Stripe-side count; enumeration is Stripe-driven
  profiles_checked integer,                    -- linked profiles joined onto that list
  findings_count integer,
  error text                                   -- abort reason / apply failures, truncated to 500 by the caller
);

-- ---------------------------------------------------------------------------
-- One row per observation, kept whether or not anything was done about it
-- ---------------------------------------------------------------------------
create table if not exists public.billing_recon_findings (
  id uuid primary key default gen_random_uuid(),
  -- Plain FK, no ON DELETE clause. Run rows are never deleted, so there is no
  -- cascade to define — and the absence of one means a findings row can never be
  -- silently orphaned by a stray delete on the parent.
  run_id uuid not null references public.billing_recon_runs(id),
  created_at timestamptz not null default now(),
  -- Also a plain FK with no ON DELETE. Null for unmatched_customer, where by
  -- definition no profile claims the Stripe customer. NOTE the consequence:
  -- deleting a profile that has findings will be REFUSED until they are cleared.
  profile_id uuid references public.profiles(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  kind text not null,                          -- plan_mismatch | status_mismatch | period_mismatch
                                               -- | unmatched_customer | business_skip
  -- For the three *_mismatch kinds `expected` IS the ProfileBillingPatch to
  -- write — exactly one column, the one that drifted. The two non-actionable
  -- kinds carry null so that no apply pass, now or later, can find anything to
  -- act on.
  expected jsonb,
  actual jsonb,
  applied boolean not null default false,      -- flipped only by an armed run that wrote the patch
  applied_at timestamptz
);

-- Every read of this table is "the findings for one run".
create index if not exists idx_recon_findings_run
  on public.billing_recon_findings(run_id);

-- No client ever touches either table: reconcile-billing writes them with the
-- service role, which bypasses RLS. RLS on with zero policies = deny-all for
-- anon and authenticated, which is exactly the intent.
alter table public.billing_recon_runs enable row level security;
alter table public.billing_recon_findings enable row level security;
