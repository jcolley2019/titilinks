-- DO-NOT-RUN — TL.MIG.1 (2026-09-02) — the removed Canva integration (5 of 5).
--
-- ⚠️ DO NOT RUN THIS FILE. ⚠️
--
-- (a) PROD TODAY: public.pending_canva_auth does NOT exist.
--     docs/AUDIT_rev6.md §1.2 #17.
--
-- (b) THE HAZARD: CREATE POLICY "Users can view their own pending auth" ON
--     public.pending_canva_auth. Alone it fails (no table). Run after
--     20260111230038 it opens the owner SELECT path on the resurrected PKCE
--     state table.
--
-- (c) RETIRED BY: TL.CANVA.RM.1 (2026-08-11, commits 1d600c6 + 25dad98).
--     Record only.
--
CREATE POLICY "Users can view their own pending auth"
ON public.pending_canva_auth
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);