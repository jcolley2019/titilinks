-- SNAP.2 — allow owners to RENAME their own manual snapshots.
--
-- profile_snapshots shipped immutable in SNAP.1 (SELECT / INSERT / DELETE only;
-- no UPDATE policy). A rename affordance needs a scoped UPDATE policy. It is
-- restricted to the row owner AND kind = 'manual' — the auto safety-net
-- snapshots stay immutable. The client (renameSnapshot in src/lib/snapshots.ts)
-- only ever sends the `name` column.
--
-- HOW TO APPLY: run this in the Supabase web SQL editor against the production
-- project (ref ohmvlypcbrfkuudcuqub). This repo file is a MIRROR of what was run
-- by hand — do NOT `supabase db push` / `supabase link` (config.toml line 1
-- points at an orphan project).

create policy "Users can rename own manual snapshots"
  on public.profile_snapshots
  for update
  to authenticated
  using (auth.uid() = user_id and kind = 'manual')
  with check (auth.uid() = user_id and kind = 'manual');
