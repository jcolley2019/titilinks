-- Add avatar_original_url to pages table.
-- Stores the user's original full-size photo so they can re-crop later
-- with full flexibility instead of being limited to the already-cropped square.
ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS avatar_original_url TEXT;
