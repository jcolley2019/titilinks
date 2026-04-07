-- Add bio block type to the block_type enum
ALTER TYPE public.block_type ADD VALUE IF NOT EXISTS 'bio';
