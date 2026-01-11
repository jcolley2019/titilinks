-- ADV-1: Extend block_type enum with new advanced block types
-- Adding new values to existing enum

ALTER TYPE public.block_type ADD VALUE IF NOT EXISTS 'hero_card';
ALTER TYPE public.block_type ADD VALUE IF NOT EXISTS 'social_icon_row';
ALTER TYPE public.block_type ADD VALUE IF NOT EXISTS 'email_subscribe';
ALTER TYPE public.block_type ADD VALUE IF NOT EXISTS 'content_section';
ALTER TYPE public.block_type ADD VALUE IF NOT EXISTS 'product_catalog';