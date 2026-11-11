-- RE-RUNNABLE — EMAIL.INFRA.1 — pg_cron + pg_net, and the 10-minute `email-queue-drain` job that POSTs to the send-email edge function.
--
-- Run AFTER 20261104120000_email_infra1.sql, after `send-email` is deployed, and
-- after BOTH vault secrets below exist. The check block refuses to schedule
-- anything otherwise, so a half-configured paste changes nothing but the two
-- extensions.
--
-- Store the two values once, in the SQL editor (never in a file):
--   select vault.create_secret('<same value as EMAIL_CRON_SECRET in supabase/.env>', 'email_cron_secret');
--   select vault.create_secret('<the project anon key — VITE_SUPABASE_PUBLISHABLE_KEY>', 'supabase_anon_key');
--
-- Why two: send-email is deployed with verify_jwt ON, so the gateway rejects any
-- request without `Authorization: Bearer <a project JWT>` before the function
-- runs (401 UNAUTHORIZED_NO_AUTH_HEADER). The anon key gets the request through
-- the gateway; x-email-cron-secret is what the function itself checks.
--
-- The job body reads both from vault.decrypted_secrets at RUN time, so rotating
-- either secret needs no reschedule and neither value is ever stored in cron.job.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
declare
  v_missing text;
begin
  select string_agg(n.name, ', ')
    into v_missing
    from (values ('email_cron_secret'), ('supabase_anon_key')) as n(name)
   where not exists (
     select 1 from vault.decrypted_secrets d
      where d.name = n.name and coalesce(d.decrypted_secret, '') <> ''
   );
  if v_missing is not null then
    raise exception 'EMAIL.INFRA.1: vault secret(s) missing: %. Nothing scheduled.', v_missing;
  end if;
end $$;

-- cron.schedule with an existing job name replaces that job's schedule and command.
select cron.schedule(
  'email-queue-drain',
  '*/10 * * * *',
  $cron$
  select net.http_post(
    url := 'https://ohmvlypcbrfkuudcuqub.supabase.co/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'x-email-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_cron_secret')
    ),
    body := '{"batch":50}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);

-- ── Verify (read-only; run after the paste) ─────────────────────────────────
-- select jobname, schedule, active from cron.job where jobname = 'email-queue-drain';   -- 1 row, active
-- After the first tick:
-- select status_code, left(content, 200), created from net._http_response order by created desc limit 3;
--
-- Stop the job:  select cron.unschedule('email-queue-drain');
