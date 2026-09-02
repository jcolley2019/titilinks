-- DO-NOT-RUN — TL.MIG.1 (2026-09-02) — the removed Canva integration (1 of 5).
--
-- ⚠️ DO NOT RUN THIS FILE. ⚠️
--
-- (a) PROD TODAY: public.canva_connections does NOT exist. No Canva code,
--     edge function or UI remains in the repo. docs/AUDIT_rev6.md §1.2 #13.
--
-- (b) THE HAZARD: CREATE TABLE public.canva_connections — RESURRECTS a table
--     holding third-party OAuth credentials in PLAINTEXT (access_token TEXT
--     NOT NULL, refresh_token TEXT) with owner RLS policies, plus a trigger
--     on update_updated_at_column(), which prod does not have (§1.3.1), so the
--     CREATE TRIGGER fails after the table is already created.
--
-- (c) RETIRED BY: TL.CANVA.RM.1 (2026-08-11, commits 1d600c6 code + 25dad98
--     tables). Record only. The Canva set is 20260111224757, 225219, 230038,
--     233755 and 20260328233337 — the other four only ALTER or add policies to
--     these tables and fail on their own, but in order they rebuild the set.
--
-- Create canva_connections table to store OAuth tokens
CREATE TABLE public.canva_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  scope TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.canva_connections ENABLE ROW LEVEL SECURITY;

-- Users can only view their own connection
CREATE POLICY "Users can view their own canva connection"
ON public.canva_connections
FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own connection
CREATE POLICY "Users can update their own canva connection"
ON public.canva_connections
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own connection
CREATE POLICY "Users can delete their own canva connection"
ON public.canva_connections
FOR DELETE
USING (auth.uid() = user_id);

-- Service role can insert/upsert (for edge function)
-- Note: Edge function using service role bypasses RLS

-- Trigger for updated_at
CREATE TRIGGER update_canva_connections_updated_at
BEFORE UPDATE ON public.canva_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();