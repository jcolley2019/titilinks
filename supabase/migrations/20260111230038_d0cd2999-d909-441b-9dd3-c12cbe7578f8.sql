-- DO-NOT-RUN — TL.MIG.1 (2026-09-02) — the removed Canva integration (3 of 5).
--
-- ⚠️ DO NOT RUN THIS FILE. ⚠️
--
-- (a) PROD TODAY: public.pending_canva_auth and
--     public.cleanup_expired_canva_auth() do NOT exist.
--     docs/AUDIT_rev6.md §1.2 #15.
--
-- (b) THE HAZARD: CREATE TABLE public.pending_canva_auth — RESURRECTS the PKCE
--     state table (code_verifier stored server-side) with RLS enabled and NO
--     policies, and CREATE FUNCTION public.cleanup_expired_canva_auth() adds a
--     SECURITY DEFINER function with no caller left anywhere in the repo.
--
-- (c) RETIRED BY: TL.CANVA.RM.1 (2026-08-11, commits 1d600c6 + 25dad98).
--     Record only.
--
-- Create pending_canva_auth table to store PKCE state server-side
CREATE TABLE public.pending_canva_auth (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  state TEXT NOT NULL UNIQUE,
  code_verifier TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '10 minutes')
);

-- Enable RLS
ALTER TABLE public.pending_canva_auth ENABLE ROW LEVEL SECURITY;

-- Only service role can access (edge functions use service role)
-- No user policies needed since this is server-side only

-- Create index for fast state lookup
CREATE INDEX idx_pending_canva_auth_state ON public.pending_canva_auth(state);

-- Auto-cleanup expired entries (optional trigger)
CREATE OR REPLACE FUNCTION public.cleanup_expired_canva_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.pending_canva_auth WHERE expires_at < now();
  RETURN NEW;
END;
$$;