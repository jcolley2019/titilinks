-- TL.EVNT Stage 0 (1 of 2) — add the events block type to the block_type enum.
--
-- Kept in its OWN migration file, matching 20260407120000_add_bio_block_type.sql:
-- ALTER TYPE ... ADD VALUE cannot be used by a statement in the same transaction
-- that adds it, so the enum add must land and commit before anything inserts a
-- row of that type.
--
-- Appends to the end of the enum (no BEFORE/AFTER), which is how every prior
-- value was added. Note there is no reverse: Postgres cannot drop an enum value.
ALTER TYPE public.block_type ADD VALUE IF NOT EXISTS 'events';
