-- Add ecommerce fields to block_items
ALTER TABLE public.block_items 
ADD COLUMN IF NOT EXISTS price numeric(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS compare_at_price numeric(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS cta_label text DEFAULT NULL;