-- SNAP.1 — Profile Snapshots: named restore points + auto-snapshot safety net.
--
-- One row per snapshot. `payload` holds a v1 blob of the page THEME + block
-- layout/content (see src/lib/snapshots.ts SnapshotPayloadV1). Page identity
-- (display_name, handle, bio, avatar_*, goal_*) is intentionally NOT captured.
--
-- kind:
--   'manual' — user-created named restore points, quota-limited per plan
--   'auto'   — pre-destructive-action safety net, quota-exempt, ring-buffered
--              to the newest 3 per page in application code.
--
-- Snapshots are immutable: there is no UPDATE policy (create / read / delete
-- only). RLS is owner-only across the board.
--
-- NOTE: this table was applied by hand in the Supabase SQL editor against the
-- production project (ref ohmvlypcbrfkuudcuqub). This file mirrors that SQL for
-- the repo record — do NOT `supabase db push` it.
CREATE TABLE IF NOT EXISTS public.profile_snapshots (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  page_id    UUID NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual', 'auto')),
  payload    JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Newest-first listing per page is the hot path.
CREATE INDEX IF NOT EXISTS profile_snapshots_page_created_idx
  ON public.profile_snapshots (page_id, created_at DESC);

-- Ring-buffer prune queries filter by (page_id, kind).
CREATE INDEX IF NOT EXISTS profile_snapshots_page_kind_idx
  ON public.profile_snapshots (page_id, kind);

ALTER TABLE public.profile_snapshots ENABLE ROW LEVEL SECURITY;

-- Owner-only: a user sees / creates / deletes only their own snapshots.
CREATE POLICY "Users can view their own snapshots"
ON public.profile_snapshots
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own snapshots"
ON public.profile_snapshots
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own snapshots"
ON public.profile_snapshots
FOR DELETE
USING (auth.uid() = user_id);
