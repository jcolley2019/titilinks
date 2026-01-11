-- Add sticky CTA toggle per mode
ALTER TABLE public.modes 
ADD COLUMN sticky_cta_enabled BOOLEAN NOT NULL DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN public.modes.sticky_cta_enabled IS 'When enabled, shows a sticky bottom CTA bar after scrolling past the primary CTA block';