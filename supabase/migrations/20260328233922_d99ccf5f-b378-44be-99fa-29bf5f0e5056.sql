-- DO-NOT-RUN — TL.MIG.1 (2026-09-02) — the dropped public INSERT policy on page_subscribers.
--
-- ⚠️ DO NOT RUN THIS FILE. ⚠️
--
-- (a) PROD TODAY: public.page_subscribers has NO INSERT policy. The only write
--     path is the subscribe_to_page SECURITY DEFINER RPC
--     (20260729120300_ent_srv.sql), which validates the email, gates on the
--     page owner's plan (emailSubscribe entitlement) and answers a refusal
--     identically to a missing page. docs/AUDIT_rev6.md §1.2 #18.
--
-- (b) THE HAZARD: the single statement in this file. CREATE POLICY "Public can
--     subscribe to pages" … FOR INSERT TO public WITH CHECK (EXISTS (SELECT 1
--     FROM pages WHERE id = page_id)) REOPENS direct anonymous INSERT into
--     page_subscribers for any page id, bypassing the email regex and the
--     ENT.SRV plan gate — and the table has no unique index in prod (§1.3.8),
--     so nothing would even dedupe the rows.
--
-- (c) RETIRED BY: dropped by hand in prod. No migration or commit records the
--     date; the ENT.SRV note (2026-07-29) already treats the RPC as the only
--     write path, and the 2026-09-01 audit confirms the policy is absent.
--
CREATE POLICY "Public can subscribe to pages"
ON public.page_subscribers
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pages WHERE id = page_id
  )
);