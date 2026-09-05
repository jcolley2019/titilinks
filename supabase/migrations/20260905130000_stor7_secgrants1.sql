-- RE-RUNNABLE — TL.STOR.7 + TL.SEC.GRANTS.1 — fonts bucket MIME lock; referral-function grants; no client TRUNCATE/REFERENCES/TRIGGER; custom_short_links URL-scheme CHECK.
--
-- Mirror of what Joey pasted on 2026-09-05 (rehearsed by the architect in a
-- rolled-back transaction, then applied with commit;). Closes AUDIT_rev6
-- §1.3.10 and §1.3.11 and the fonts line of §1.1. Every statement is
-- idempotent: the UPDATE restates the full list, REVOKE of an absent grant is
-- a no-op, ALTER DEFAULT PRIVILEGES is a set, the CHECK is guarded by a
-- pg_constraint lookup.

-- ---------------------------------------------------------------------------
-- 1. fonts bucket: font MIME types only (was NULL = anything). The list is
--    generated from FONT_TYPES in src/lib/user-fonts.ts — nine unique values;
--    scripts/user-fonts.test.mjs fails the guard if the two drift.
-- ---------------------------------------------------------------------------
update storage.buckets
set allowed_mime_types = array[
  'font/ttf', 'application/x-font-ttf', 'application/font-sfnt',
  'font/otf', 'application/x-font-opentype',
  'font/woff', 'application/font-woff',
  'font/woff2', 'application/font-woff2'
]
where id = 'fonts';

-- ---------------------------------------------------------------------------
-- 2. Referral functions: callers are the set_referral_code trigger
--    (SECURITY DEFINER, runs as postgres), the edge functions (service_role),
--    and the signed-in client (claim_referral only). Nobody else.
-- ---------------------------------------------------------------------------
revoke execute on function public.generate_referral_code() from public, anon, authenticated;
revoke execute on function public.referral_earned_in_window(uuid) from public, anon, authenticated;
revoke execute on function public.claim_referral(text) from public, anon;
-- service_role keeps EXECUTE on all three; authenticated keeps claim_referral.

-- ---------------------------------------------------------------------------
-- 3. TRUNCATE / REFERENCES / TRIGGER are not client verbs. RLS does not gate
--    TRUNCATE. Revoke on every current table and stop the default grant so
--    future tables do not get them back.
-- ---------------------------------------------------------------------------
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. custom_short_links.target_url must be http(s). One row today; it passes.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'custom_short_links_target_url_scheme') then
    alter table public.custom_short_links
      add constraint custom_short_links_target_url_scheme
      check (target_url ~* '^https?://');
  end if;
end $$;

-- Verification (expected row: 9 / 0 / 0 / 1 / 3 / 0 / 128 / true):
-- select
--   (select cardinality(allowed_mime_types) from storage.buckets where id='fonts') as font_mimes,                                                                                                          -- 9
--   (select count(*) from information_schema.role_routine_grants where specific_schema='public' and routine_name in ('generate_referral_code','referral_earned_in_window') and grantee in ('PUBLIC','anon','authenticated')) as refgen_client_grants,  -- 0
--   (select count(*) from information_schema.role_routine_grants where specific_schema='public' and routine_name='claim_referral' and grantee in ('PUBLIC','anon')) as claim_anon_grants,                   -- 0
--   (select count(*) from information_schema.role_routine_grants where specific_schema='public' and routine_name='claim_referral' and grantee='authenticated') as claim_authenticated,                       -- 1
--   (select count(*) from information_schema.role_routine_grants where specific_schema='public' and routine_name in ('generate_referral_code','referral_earned_in_window','claim_referral') and grantee='service_role') as service_role_grants,  -- 3
--   (select count(*) from information_schema.role_table_grants where table_schema='public' and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER') and grantee in ('anon','authenticated')) as dangerous_privs,  -- 0
--   (select count(*) from information_schema.role_table_grants where table_schema='public' and privilege_type in ('SELECT','INSERT','UPDATE','DELETE') and grantee in ('anon','authenticated')) as crud_privs,      -- 128
--   (select convalidated from pg_constraint where conname='custom_short_links_target_url_scheme') as csl_check;                                                                                             -- true
