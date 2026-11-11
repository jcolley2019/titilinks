-- RE-RUNNABLE — EMAIL.DRIP.1 — the five-email onboarding sequence: profiles.language + set_my_language(), the still_free / no_links_yet gates, a page-must-be-live hold, and email_queue_due returning the send-time language, display name and page handle. Every sequence row is written DISABLED.
--
-- APPLIED 2026-11-11. Run after 20261104120000_email_infra1.sql (#52), and BEFORE either
-- of these ships: the frontend (its LanguageProvider reads profiles.language
-- and calls set_my_language) and the redeployed send-email (it reads
-- display_name / username from email_queue_due).
--
-- Nothing here turns mail on. All five rows below are written enabled = false,
-- and the #52 enqueue trigger only queues ENABLED rows, so no account, old or
-- new, gets a queue row until the rows are switched on. No backfill: that
-- trigger fires on profiles INSERT only, so accounts that exist when the
-- sequence is switched on never get it.
--
-- Re-running this file switches the sequence OFF again (the upsert below writes
-- enabled = false). That is the fail-safe direction; after go-live, re-enable
-- the rows if you ever re-run it.
--
-- Supersedes the #52 bodies of email_gate_passes (adds two gates) and
-- email_queue_due (new return columns). Re-running #52 after this file reverts
-- the gates (still_free / no_links_yet fail closed again) and fails at its
-- create-or-replace of email_queue_due ("cannot change return type"); re-run
-- this file after it.

-- ── 1. profiles.language ────────────────────────────────────────────────────
-- The UI language the creator last used while signed in. Null until the app
-- writes it. email_queue_due reads it at SEND time, not at queue time.
alter table public.profiles
  add column if not exists language text
  constraint profiles_language_check check (language in ('en', 'es'));

-- Writable by the owner as-is, so no policy change: the profiles UPDATE policy
-- WITH CHECK (#44) pins seven columns (plan, stripe_customer_id,
-- subscription_status, subscription_period_end, referred_by, referral_code,
-- comped_until) and language is not one of them; guard_billing_columns (#44),
-- guard_entitlement_columns (#31) and guard_referred_by (#30) each compare
-- named columns only. Verify block 1 re-checks the live policy text.
--
-- The client writes through this function, not a profiles PATCH. It is
-- SECURITY INVOKER: it runs as the caller, so that same RLS policy and those
-- same triggers apply. It adds no privilege; it exists so the write has its own
-- URL (rest/v1/rpc/set_my_language) that the Playwright write guard can refuse
-- on its own, apart from the profiles writes some specs open on purpose.
create or replace function public.set_my_language(p_language text)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.profiles
     set language = p_language
   where id = auth.uid()
     and p_language in ('en', 'es')
     and language is distinct from p_language;
$$;

revoke all on function public.set_my_language(text) from public, anon;
grant execute on function public.set_my_language(text) to authenticated;

-- ── 2. The "real destination" rule, in SQL ──────────────────────────────────
-- A transcription of isRealDestination() in supabase/functions/sitemap/rules.ts
-- (copied verbatim in src/lib/placeholder-item.ts): http(s) only; not
-- example.com or any subdomain of it; not a bare wa.me / api.whatsapp.com.
-- JS parses with new URL(); this reads the same parts with regexes:
--   - leading/trailing whitespace trimmed, '' and '#' rejected;
--   - a special scheme ignores any run of / or \ after the colon;
--   - host = authority minus userinfo (to the last @) and port, lowercased;
--   - pathname = everything before ? or #, \ read as /, empty read as '/'.
-- Known gaps, all on malformed input: JS drops tabs/newlines INSIDE a URL,
-- percent-decodes and punycodes hosts. Verify block 2 pins the common cases,
-- and scripts/email-infra.test.mjs checks each expected value against the JS.
create or replace function public.email_is_real_destination(p_url text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_url  text := regexp_replace(coalesce(p_url, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_m    text[];
  v_host text;
  v_path text;
begin
  if v_url = '' or v_url = '#' then
    return false;
  end if;
  v_m := regexp_match(v_url, '^https?:[/\\]*([^/?#\\]*)(.*)$', 'i');
  if v_m is null then
    return false;
  end if;
  v_host := lower(regexp_replace(regexp_replace(v_m[1], '^.*@', ''), ':[0-9]*$', ''));
  if v_host = '' or v_host ~ '[[:space:]<>^|]' then
    return false;
  end if;
  if v_host = 'example.com' or v_host like '%.example.com' then
    return false;
  end if;
  v_path := replace(substring(v_m[2] from '^[^?#]*'), E'\\', '/');
  if v_path = '' then
    v_path := '/';
  end if;
  if v_host in ('wa.me', 'api.whatsapp.com') and v_path = '/' then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.email_is_real_destination(text) from public, anon, authenticated;

-- ── 3. "Live page" — a sequence email waits for one ─────────────────────────
-- Every sequence email links the creator's page, and the page exists only once
-- onboarding finishes — but the welcome row is due the moment the profile row
-- is inserted, which is BEFORE onboarding. The sitemap's "live" signal is
-- reused: onboarding_complete, and a page with a handle.
create or replace function public.email_user_is_live(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.profiles pr
      join public.pages pg on pg.user_id = pr.id
     where pr.id = p_user_id
       and pr.onboarding_complete is true
       and coalesce(btrim(pg.handle), '') <> ''
  );
$$;

revoke all on function public.email_user_is_live(uuid) from public, anon, authenticated;

-- ── 4. Gates ────────────────────────────────────────────────────────────────
--   still_free    profiles.plan = 'free' (a comp sets plan = 'pro', so a comped
--                 account is not free).
--   no_links_yet  the sitemap's "has content" test (rules.ts isContentItem),
--                 negated: no unarchived item on an enabled block whose type is
--                 not social_links / social_icon_row / email_subscribe, and
--                 that has a real destination or an image. Seeded sample items
--                 (example.com, '#', url '' / image '') never count.
-- An unknown gate name still fails CLOSED.
create or replace function public.email_gate_passes(p_gate text, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  case p_gate
    when 'always' then
      return true;
    when 'still_free' then
      return exists (
        select 1 from public.profiles pr
         where pr.id = p_user_id and pr.plan = 'free'
      );
    when 'no_links_yet' then
      return not exists (
        select 1
          from public.pages pg
          join public.modes m        on m.page_id = pg.id
          join public.blocks b       on b.mode_id = m.id
          join public.block_items bi on bi.block_id = b.id
         where pg.user_id = p_user_id
           and b.is_enabled
           and bi.archived_at is null
           and b.type::text not in ('social_links', 'social_icon_row', 'email_subscribe')
           and (public.email_is_real_destination(bi.url)
                or coalesce(bi.image_url, '') !~ '^[[:space:]]*$')
      );
    else
      return false;
  end case;
end;
$$;

revoke all on function public.email_gate_passes(text, uuid) from public, anon, authenticated;

-- ── 5. The sequence — every row OFF ─────────────────────────────────────────
insert into public.email_sequence (template_key, day_offset, stream, gate, enabled)
values
  ('welcome',          0,  'news', 'always',       false),
  ('editor_tour',      2,  'news', 'always',       false),
  ('know_what_works',  5,  'news', 'always',       false),
  ('pro_showcase',     8,  'news', 'still_free',   false),
  ('empty_page_nudge', 14, 'news', 'no_links_yet', false)
on conflict (template_key) do update
  set day_offset = excluded.day_offset,
      stream     = excluded.stream,
      gate       = excluded.gate,
      enabled    = false;

-- ── 6. email_queue_due ──────────────────────────────────────────────────────
-- Same lease contract as #52, plus:
--   - lang is resolved NOW: coalesce(profiles.language, queue.lang, 'en');
--   - display_name: the page's display name, else the profile's (send-email
--     falls back to the handle, else no name at all);
--   - username: the page handle — the /<handle> URL every sequence email links;
--   - a sequence row whose user has no live page is neither leased nor skipped
--     while it is less than a day past due: it waits for onboarding to finish.
--     After that day it is skipped 'no_page'. The day is what keeps a creator
--     who finishes onboarding a week late from receiving every overdue email in
--     one burst.
-- The return type changed, so the old function is dropped first (#53's cron job
-- calls send-email over HTTP, never this function, so nothing else breaks).
drop function if exists public.email_queue_due(int);

create function public.email_queue_due(p_limit int default 50)
returns table (
  id                bigint,
  user_id           uuid,
  email             text,
  template_key      text,
  lang              text,
  stream            text,
  attempts          int,
  unsubscribe_token uuid,
  display_name      text,
  username          text
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
               when s.template_key is not null and not public.email_user_is_live(q2.user_id) then
                 case when q2.send_after < now() - interval '1 day' then 'no_page' end
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
       and (not exists (select 1 from public.email_sequence s where s.template_key = q.template_key)
            or public.email_user_is_live(q.user_id))
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
  select l.id, l.user_id, u.email::text, l.template_key,
         coalesce(pr.language, l.lang, 'en')::text,
         l.stream, l.attempts, p.unsubscribe_token,
         coalesce(nullif(btrim(pg.display_name), ''), nullif(btrim(pr.display_name), ''))::text,
         coalesce(nullif(btrim(pg.handle), ''), nullif(btrim(pr.username), ''))::text
    from leased l
    join auth.users u on u.id = l.user_id
    join public.email_prefs p on p.user_id = l.user_id
    left join public.profiles pr on pr.id = l.user_id
    left join lateral (
      select pg1.handle, pg1.display_name
        from public.pages pg1
       where pg1.user_id = l.user_id
       order by pg1.created_at, pg1.id
       limit 1
    ) pg on true;
end;
$$;

revoke all on function public.email_queue_due(int) from public, anon, authenticated;
grant execute on function public.email_queue_due(int) to service_role;

-- ── Verify (read-only; run after the paste) ─────────────────────────────────
-- Never call email_queue_due() by hand: it leases rows.
--
-- 1. Shape, switches and grants — one row:
-- select
--   (select count(*) from information_schema.columns
--     where table_schema = 'public' and table_name = 'profiles'
--       and column_name = 'language')                                          as language_col,   -- 1
--   (select count(*) from public.email_sequence)                              as sequence_rows,  -- 5
--   (select count(*) from public.email_sequence where enabled)                as enabled_rows,   -- 0
--   (select string_agg(template_key || ':' || day_offset || ':' || gate, ', ' order by day_offset)
--      from public.email_sequence)                                            as sequence,
--        -- welcome:0:always, editor_tour:2:always, know_what_works:5:always, pro_showcase:8:still_free, empty_page_nudge:14:no_links_yet
--   public.email_gate_passes('nope', gen_random_uuid())                        as unknown_gate,   -- false
--   (select pg_get_expr(polwithcheck, polrelid) !~* 'language'
--      from pg_policy where polrelid = 'public.profiles'::regclass
--       and polname = 'Users can update their own profile')                   as policy_leaves_language_writable, -- true
--   has_function_privilege('authenticated', 'public.set_my_language(text)', 'execute')          as authed_lang,   -- true
--   has_function_privilege('anon', 'public.set_my_language(text)', 'execute')                   as anon_lang,     -- false
--   has_function_privilege('anon', 'public.email_queue_due(int)', 'execute')                    as anon_exec,     -- false
--   has_function_privilege('authenticated', 'public.email_queue_due(int)', 'execute')           as authed_exec,   -- false
--   has_function_privilege('service_role', 'public.email_queue_due(int)', 'execute')            as service_exec,  -- true
--   has_function_privilege('authenticated', 'public.email_gate_passes(text, uuid)', 'execute')  as authed_gate,   -- false
--   has_function_privilege('authenticated', 'public.email_user_is_live(uuid)', 'execute')       as authed_live;   -- false
--
-- 2. The destination rule matches the sitemap's — expect 0 rows:
-- select c.url, c.expected, public.email_is_real_destination(c.url) as got
--   from (values
--     ('https://instagram.com/titi', true),
--     ('  https://www.tiktok.com/@titi  ', true),
--     ('http://shop.titi.com', true),
--     ('HTTPS://Example.com/x', false),
--     ('https://example.com', false),
--     ('https://sub.example.com/page', false),
--     ('https://user:pw@example.com:8080/x', false),
--     ('https://notexample.com', true),
--     ('https://wa.me', false),
--     ('https://wa.me/', false),
--     ('https://wa.me/?text=hi', false),
--     ('https://wa.me/5215512345678', true),
--     ('https://api.whatsapp.com/', false),
--     ('https://api.whatsapp.com/send?phone=521', true),
--     ('#', false),
--     ('', false),
--     ('   ', false),
--     ('mailto:hola@titi.com', false),
--     ('tel:+5215512345678', false),
--     ('instagram.com/titi', false),
--     ('https://', false),
--     ('https:///instagram.com/titi', true),
--     ('ftp://files.titi.com', false)
--   ) as c(url, expected)
--  where public.email_is_real_destination(c.url) is distinct from c.expected;
--
-- 3. Gates on the two test accounts (read-only):
-- select pr.username, pr.plan,
--        public.email_user_is_live(pr.id)                as live,          -- true, true
--        public.email_gate_passes('still_free', pr.id)   as still_free,    -- battery false (comped pro), free true
--        public.email_gate_passes('no_links_yet', pr.id) as no_links_yet   -- battery false (seeded links); free true while it holds only onboarding samples
--   from public.profiles pr
--  where pr.username in ('joey2019pwtestbattery', 'joey2019pwtestfree')
--  order by pr.username;
