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