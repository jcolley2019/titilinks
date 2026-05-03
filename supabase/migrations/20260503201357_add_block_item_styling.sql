-- Add per-item styling columns to block_items.
-- All nullable, no defaults beyond NULL — readers fall back to block-level
-- (block.title JSON style.size) and then to hardcoded defaults.
--
-- Phase R1 of the Link.me parity rebuild. Initially read/written only by
-- LinksEditor; other editors stay unchanged in this phase.
--
-- Columns:
--   size         text — one of 'big' | 'medium' | 'small' | 'button' (free-text;
--                       readers cast and fall back on unknown values)
--   bg_color     text — per-item background color hex (overrides theme.buttons.fill_color)
--   title_color  text — per-item title color hex (overrides theme.buttons.text_color)
--   style_json   jsonb — catch-all for future per-item config (animations,
--                        gradient, link icon override, etc.)
ALTER TABLE public.block_items
  ADD COLUMN IF NOT EXISTS size         text,
  ADD COLUMN IF NOT EXISTS bg_color     text,
  ADD COLUMN IF NOT EXISTS title_color  text,
  ADD COLUMN IF NOT EXISTS style_json   jsonb;
