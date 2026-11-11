-- RE-RUNNABLE — EMAIL.INFRA.1 — outbound email plumbing: email_prefs / email_queue / email_events / email_sequence, the profiles-insert enqueue trigger, and email_queue_due (service_role only).
--
-- Nothing here sends mail. The `send-email` edge function drains email_queue
-- through email_queue_due(); the schedule that calls it lives in the next file
-- (20261104120100_email_infra1_cron.sql). Run this file first.
--
-- Existing accounts are untouched: no prefs row and no queue row is created for
-- anyone who signed up before this ran. A prefs row is minted lazily the first
-- time a queue row for that user comes due.

-- ── email_prefs ─────────────────────────────────────────────────────────────
create table if not exists public.email_prefs (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  marketing_opt_out boolean not null default false,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  bounced_at        timestamptz,
  complained_at     timestamptz,
  updated_at        timestamptz not null default now()
);

alter table public.email_prefs enable row level security;

-- Owner SELECT only. No INSERT/UPDATE/DELETE policy: every write is the service
-- role (edge functions) or a SECURITY DEFINER function below.
drop policy if exists "Users can view their own email prefs" on public.email_prefs;
create policy "Users can view their own email prefs"
  on public.email_prefs for select
  to authenticated
  using (auth.uid() = user_id);

-- ── email_queue ─────────────────────────────────────────────────────────────
create table if not exists public.email_queue (
  id           bigserial primary key,
  user_id      uuid references auth.users(id) on delete cascade,
  template_key text not null,
  lang         text check (lang in ('en', 'es')),
  stream       text check (stream in ('mail', 'news')),
  send_after   timestamptz not null default now(),
  sent_at      timestamptz,
  status       text not null default 'pending'
               check (status in ('pending', 'sent', 'skipped', 'failed')),
  attempts     int not null default 0,
  last_error   text,
  resend_id    text,
  unique (user_id, template_key)
);

create index if not exists email_queue_status_send_after_idx
  on public.email_queue (status, send_after);
create index if not exists email_queue_resend_id_idx
  on public.email_queue (resend_id);

alter table public.email_queue enable row level security;   -- no policies: service role only

-- ── email_events ────────────────────────────────────────────────────────────
create table if not exists public.email_events (
  id           bigserial primary key,
  user_id      uuid references auth.users(id) on delete cascade,
  resend_id    text,
  type         text not null,
  template_key text,
  payload      jsonb,
  created_at   timestamptz not null default now()
);

-- The webhook's idempotency key: a redelivered event is the same (resend_id, type).
create unique index if not exists email_events_resend_id_type_uidx
  on public.email_events (resend_id, type);

alter table public.email_events enable row level security;  -- no policies: service role only

-- ── email_sequence ──────────────────────────────────────────────────────────
-- `gate` is a free-text name resolved by email_gate_passes() below, so DRIP.1
-- adds 'no_links_yet' / 'still_free' with a create-or-replace of that function
-- and new rows here — no schema change.
create table if not exists public.email_sequence (
  template_key text primary key,
  day_offset   int not null default 0,
  stream       text not null check (stream in ('mail', 'news')),
  gate         text not null default 'always',
  enabled      boolean not null default true
);

alter table public.email_sequence enable row level security; -- no policies: service role only

insert into public.email_sequence (template_key, day_offset, stream, gate)
values ('welcome', 0, 'news', 'always')
on conflict (template_key) do nothing;

-- ── Grants ──────────────────────────────────────────────────────────────────
revoke all on public.email_queue, public.email_events, public.email_sequence from anon, authenticated;
revoke all on public.email_prefs from anon, authenticated;
grant select on public.email_prefs to authenticated;        -- RLS narrows it to the owner's row
revoke all on sequence public.email_queue_id_seq, public.email_events_id_seq from anon, authenticated;

grant all on public.email_prefs, public.email_queue, public.email_events, public.email_sequence to service_role;
grant usage, select on sequence public.email_queue_id_seq, public.email_events_id_seq to service_role;

-- ── Enqueue on signup ───────────────────────────────────────────────────────
-- Rides the existing signup path: auth.users INSERT → on_auth_user_created →
-- handle_new_user() → INSERT public.profiles → this trigger. No second trigger
-- on auth.users.
--
-- lang: profiles has no language column and signUp() sends no metadata, so
-- every row is queued 'en' (the brief's default) until a language is stored.
--
-- The inner block swallows every error on purpose: email plumbing must never
-- be the reason a signup fails.
create or replace function public.email_enqueue_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.email_prefs (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    insert into public.email_queue (user_id, template_key, lang, stream, send_after)
    select new.id, s.template_key, 'en', s.stream, now() + make_interval(days => s.day_offset)
      from public.email_sequence s
     where s.enabled
    on conflict (user_id, template_key) do nothing;
  exception when others then
    raise warning 'EMAIL.INFRA.1: enqueue failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.email_enqueue_on_profile() from public, anon, authenticated;

drop trigger if exists trg_email_enqueue_on_profile on public.profiles;
create trigger trg_email_enqueue_on_profile
  after insert on public.profiles
  for each row execute function public.email_enqueue_on_profile();

-- ── Gates ───────────────────────────────────────────────────────────────────
-- One CASE arm per gate name. An unknown name fails CLOSED (the row is skipped,
-- never sent), so a sequence row cannot go out before its gate exists.
create or replace function public.email_gate_passes(p_gate text, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  case p_gate
    when 'always' then return true;
    else return false;
  end case;
end;
$$;

revoke all on function public.email_gate_passes(text, uuid) from public, anon, authenticated;

-- ── email_queue_due ─────────────────────────────────────────────────────────
-- Returns up to p_limit pending rows whose send_after has passed, after:
--   1. minting a prefs row (and so an unsubscribe token) for any due user without one;
--   2. marking 'skipped' (reason in last_error) every due row that must not go:
--      no recipient, or — news only — opted out / bounced / complained, or its
--      sequence row is disabled, or its gate fails;
--   3. marking 'failed' any row that has used its 3 attempts.
-- Returned rows are LEASED: send_after moves 15 minutes out, so an overlapping
-- or crashed run cannot hand the same row out twice. send-email then marks the
-- row sent, or counts the attempt and leaves it pending for the next lease.
create or replace function public.email_queue_due(p_limit int default 50)
returns table (
  id                bigint,
  user_id           uuid,
  email             text,
  template_key      text,
  lang              text,
  stream            text,
  attempts          int,
  unsubscribe_token uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  insert into public.email_prefs (user_id)
  select distinct q.user_id
    from public.email_queue q
   where q.status = 'pending' and q.send_after <= now() and q.user_id is not null
  on conflict do nothing;

  update public.email_queue q
     set status = 'skipped', last_error = r.reason
    from (
      select q2.id,
             case
               when u.id is null or u.email is null then 'no_recipient'
               when q2.stream = 'news' and p.marketing_opt_out then 'opted_out'
               when q2.stream = 'news' and p.bounced_at is not null then 'bounced'
               when q2.stream = 'news' and p.complained_at is not null then 'complained'
               when s.template_key is not null and not s.enabled then 'sequence_disabled'
               when not public.email_gate_passes(coalesce(s.gate, 'always'), q2.user_id)
                 then 'gate:' || coalesce(s.gate, 'always')
             end as reason
        from public.email_queue q2
        left join auth.users u on u.id = q2.user_id
        left join public.email_prefs p on p.user_id = q2.user_id
        left join public.email_sequence s on s.template_key = q2.template_key
       where q2.status = 'pending' and q2.send_after <= now()
    ) r
   where q.id = r.id and r.reason is not null;

  update public.email_queue q
     set status = 'failed', last_error = coalesce(q.last_error, 'max attempts')
   where q.status = 'pending' and q.attempts >= 3;

  return query
  with due as (
    select q.id
      from public.email_queue q
     where q.status = 'pending' and q.send_after <= now()
     order by q.send_after, q.id
     limit v_limit
     for update skip locked
  ),
  leased as (
    update public.email_queue q
       set send_after = now() + interval '15 minutes'
      from due
     where q.id = due.id
    returning q.id, q.user_id, q.template_key, q.lang, q.stream, q.attempts
  )
  select l.id, l.user_id, u.email::text, l.template_key, l.lang, l.stream, l.attempts,
         p.unsubscribe_token
    from leased l
    join auth.users u on u.id = l.user_id
    join public.email_prefs p on p.user_id = l.user_id;
end;
$$;

revoke all on function public.email_queue_due(int) from public, anon, authenticated;
grant execute on function public.email_queue_due(int) to service_role;

-- ── Verify (read-only; run after the paste) ─────────────────────────────────
-- select
--   (select count(*) from pg_tables where schemaname = 'public'
--      and tablename in ('email_prefs','email_queue','email_events','email_sequence')
--      and rowsecurity)                                                        as rls_tables,      -- 4
--   (select count(*) from pg_policies where schemaname = 'public'
--      and tablename like 'email_%')                                           as policies,        -- 1
--   (select count(*) from public.email_sequence)                               as sequence_rows,   -- 1
--   (select count(*) from pg_trigger where tgname = 'trg_email_enqueue_on_profile') as triggers,   -- 1
--   has_function_privilege('anon', 'public.email_queue_due(int)', 'execute')          as anon_exec,    -- false
--   has_function_privilege('authenticated', 'public.email_queue_due(int)', 'execute') as authed_exec,  -- false
--   has_function_privilege('service_role', 'public.email_queue_due(int)', 'execute')  as service_exec, -- true
--   has_table_privilege('anon', 'public.email_queue', 'select')                as anon_queue_read;  -- false
