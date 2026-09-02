-- DO-NOT-RUN — TL.MIG.1 (2026-09-02) — the removed Canva integration (2 of 5).
--
-- ⚠️ DO NOT RUN THIS FILE. ⚠️
--
-- (a) PROD TODAY: public.canva_connections does NOT exist.
--     docs/AUDIT_rev6.md §1.2 #14.
--
-- (b) THE HAZARD: ALTER TABLE public.canva_connections … SET NOT NULL and
--     CREATE POLICY "Users can insert their own canva connection". Alone they
--     fail (no table). Run after 20260111224757 they complete the resurrected
--     plaintext OAuth-token table and open the owner INSERT path into it.
--
-- (c) RETIRED BY: TL.CANVA.RM.1 (2026-08-11, commits 1d600c6 + 25dad98).
--     Record only.
--
-- Make refresh_token and scope NOT NULL (with defaults for existing rows)
ALTER TABLE public.canva_connections 
ALTER COLUMN refresh_token SET NOT NULL;

ALTER TABLE public.canva_connections 
ALTER COLUMN scope SET NOT NULL;

-- Add INSERT policy for users to insert their own connection
CREATE POLICY "Users can insert their own canva connection"
ON public.canva_connections
FOR INSERT
WITH CHECK (auth.uid() = user_id);