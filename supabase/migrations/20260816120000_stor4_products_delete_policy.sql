-- TL.STOR.4 — the products bucket's DELETE policy.
--
-- APPLY BY HAND in the Supabase web SQL editor against the PROD project
-- (ref ohmvlypcbrfkuudcuqub). This repo file is a MIRROR of DDL that was ALREADY
-- run there by hand on Aug 16, 2026 — do NOT `supabase db push` (config.toml
-- points at an orphan project). The policy is live; this file records it so the
-- repo is not missing the one grant that makes storage cleanup do anything.
--
-- SUPERSEDES the DELETE policy in 20260111043832_b59a1833-….sql. That migration
-- declares "Users can delete their product images", but no policy by that name
-- exists in prod — repo and prod had drifted. The drift was invisible from the
-- code: a storage delete with no policy behind it returns data:[] with
-- error:null, so a client-side cleanup built on the fire-and-forget
-- `.catch(() => {})` idiom looks wired, typechecks, passes guard, and silently
-- removes nothing. Verify storage deletes by re-listing the object, never by the
-- absence of an error. Treat that older DELETE stanza as dead text; this is the
-- policy that runs.
--
-- The rest of 20260111043832 is NOT superseded. Its INSERT and SELECT policies
-- are live — proven Aug 16 by an authenticated upload succeeding and by list()
-- returning the uploaded row, both of which go through RLS. Its UPDATE policy
-- was never checked either way.
--
-- NOT IDEMPOTENT, deliberately. Postgres has no CREATE POLICY IF NOT EXISTS, and
-- the re-runnable form (DROP POLICY IF EXISTS first) would drop a live policy to
-- re-add it unchanged. Run against prod today this file errors with "policy
-- already exists" — that error is the proof it is already there.
--
-- avatars and page-assets intentionally have NO delete policy. Nothing deletes
-- from either bucket yet: removePublicObject is wired only to 'products'. When
-- something does start deleting from them, it needs its own policy first, or it
-- will no-op in exactly the silent way described above.

-- Verbatim from prod pg_policies, Aug 16 2026. Note the shape follows the newer
-- fonts convention (20260722110000_add_brand_kit.sql) — explicit
-- `to authenticated`, foldername on the left — not the 2026-01 originals.
create policy "Owners can delete own product images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'products' AND (storage.foldername(name))[1] = auth.uid()::text);
