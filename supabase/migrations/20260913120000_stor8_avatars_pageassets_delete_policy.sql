-- TL.STOR.8 — the avatars and page-assets buckets' DELETE policies.
--
-- APPLY BY HAND in the Supabase web SQL editor against the PROD project
-- (ref ohmvlypcbrfkuudcuqub). This repo file is a MIRROR of DDL that was ALREADY
-- run there by hand by Joey on Sep 13, 2026 — do NOT `supabase db push` and do
-- NOT `supabase link` (config.toml line 1 points at an ORPHAN project). Both
-- policies are live and confirmed in pg_policies; this file records them so the
-- repo is not missing the grants that make avatar/page-asset cleanup do anything.
--
-- SUPERSEDES the note in 20260816120000_stor4_products_delete_policy.sql that
-- says "avatars and page-assets intentionally have NO delete policy. Nothing
-- deletes from either bucket yet". That was true on Aug 16; it is false as of
-- today. TL.STOR.8.1 wires removePublicObject('avatars', …) into
-- EditableProfileView's handlePhotoSave, so the page-1 hero save now really
-- deletes the object it supersedes, and it needs this policy to be anything
-- more than a silent no-op.
--
-- ALSO SUPERSEDES the dead 2026-01 DELETE stanzas for these two buckets:
--   - "Users can delete their own avatar" in
--     20260111042037_125c0bf8-3a9d-4610-bd35-83a774e6c361.sql, and
--   - "Users can delete their own files" (page-assets) in
--     20260111064041_cabfdddc-c369-469b-9751-f6a00a5ab006.sql.
-- Neither policy name exists in prod — repo and prod had drifted exactly as
-- they had for products. The drift is invisible from the code: a storage delete
-- with no policy behind it returns data:[] with error:null, so a cleanup built
-- on the fire-and-forget `.catch(() => {})` idiom looks wired, typechecks,
-- passes guard, and silently removes nothing. Verify storage deletes by
-- re-listing the object, never by the absence of an error. Treat those two
-- older DELETE stanzas as dead text; the policies below are what run.
--
-- The rest of both 2026-01 migrations is NOT superseded — their bucket rows and
-- their SELECT/INSERT/UPDATE policies are live.
--
-- NOT IDEMPOTENT, deliberately. Postgres has no CREATE POLICY IF NOT EXISTS, and
-- the re-runnable form (DROP POLICY IF EXISTS first) would drop a live policy to
-- re-add it unchanged. Run against prod today this file errors with "policy
-- already exists" — that error is the proof it is already there.

-- Verbatim from prod pg_policies, Sep 13 2026. The shape follows the newer
-- fonts/products convention (20260722110000_add_brand_kit.sql,
-- 20260816120000_stor4_products_delete_policy.sql) — explicit `to authenticated`,
-- foldername on the left — not the 2026-01 originals.
create policy "Owners can delete own avatars"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

create policy "Owners can delete own page assets"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'page-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Read back:
-- select policyname, cmd, roles from pg_policies where schemaname='storage' and tablename='objects' and cmd='DELETE' order by policyname;
-- expected 4 rows: avatars, fonts, page assets, product images.
