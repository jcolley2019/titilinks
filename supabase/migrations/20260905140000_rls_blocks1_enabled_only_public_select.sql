-- RE-RUNNABLE — TL.RLS.BLOCKS.1 — public SELECT on blocks / block_items limited to enabled blocks; owners see their own.
--
-- Mirror of what Joey pasted on 2026-09-05 (rehearsed by the architect in a
-- rolled-back transaction, then applied with commit;). Idempotent: every
-- policy is drop-if-exists + create.
--
-- Why: the January init (#1) created `blocks."Public can view enabled blocks"`
-- as USING (true) and `block_items."Public can view block items"` as USING
-- (true), so disabled blocks and their items were world-readable through
-- PostgREST — PublicProfile.tsx filtered is_enabled client-side only
-- (AUDIT_rev6 §2 #6, the blocks/block_items finding). Now the public policy
-- admits enabled blocks only, items follow their block, and a separate owner
-- policy keeps the editor's full read. Write policies are untouched.
--
-- #1 is already DO-NOT-RUN; its two public SELECT stanzas are superseded here.
-- Re-verified as role anon after commit: 22 of 28 blocks, 46 of 51 items,
-- 0 disabled visible.
--
-- Proof: tests/57-rls-blocks1-disabled-invisible.spec.ts (owner disables a
-- battery block → anon REST returns [] for it and its items, owner still
-- reads it; re-enabled → anon sees it again).

-- ---------------------------------------------------------------------------
-- blocks: the public sees ENABLED blocks; owners see all of theirs.
-- ---------------------------------------------------------------------------
drop policy if exists "Public can view enabled blocks" on public.blocks;
create policy "Public can view enabled blocks"
  on public.blocks for select
  using (is_enabled);

drop policy if exists "Owners can view their own blocks" on public.blocks;
create policy "Owners can view their own blocks"
  on public.blocks for select
  using (auth.uid() = public.get_mode_owner(mode_id));

-- ---------------------------------------------------------------------------
-- block_items: the public sees items whose block is enabled; owners see all
-- of theirs. The sub-select runs under the caller's blocks policy, so an
-- anonymous caller can only match enabled blocks.
-- ---------------------------------------------------------------------------
drop policy if exists "Public can view block items" on public.block_items;
create policy "Public can view items of enabled blocks"
  on public.block_items for select
  using (exists (select 1 from public.blocks b where b.id = block_id and b.is_enabled));

drop policy if exists "Owners can view their own items" on public.block_items;
create policy "Owners can view their own items"
  on public.block_items for select
  using (auth.uid() = public.get_block_owner(block_id));

-- Verification (expected: 2 / 2 / 'is_enabled'):
-- select
--   (select count(*) from pg_policy where polrelid='public.blocks'::regclass and polcmd='r') as blocks_select_policies,
--   (select count(*) from pg_policy where polrelid='public.block_items'::regclass and polcmd='r') as items_select_policies,
--   (select pg_get_expr(polqual, polrelid) from pg_policy where polrelid='public.blocks'::regclass and polname='Public can view enabled blocks') as blocks_public_using;
