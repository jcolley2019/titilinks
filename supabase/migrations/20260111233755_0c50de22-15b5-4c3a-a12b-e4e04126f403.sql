-- Add redirect_origin column to pending_canva_auth table
ALTER TABLE public.pending_canva_auth ADD COLUMN IF NOT EXISTS redirect_origin TEXT;