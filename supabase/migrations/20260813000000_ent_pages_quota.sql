-- ENT.PAGES.1 — maxPages quota, enforced on the `pages` INSERT policy.
--
-- MIRROR of the ALTER POLICY applied live in the Supabase web SQL editor
-- against the production project (ref ohmvlypcbrfkuudcuqub) on Aug 13, 2026.
-- This repo file records what was run by hand — do NOT `supabase db push` /
-- `supabase link` (config.toml line 1 points at an orphan project).
--
-- Closes the one gap BILL.B3 / ENT.SRV left open. 20260729120300_ent_srv.sql
-- defined plan_limit(…, 'maxPages') — free 1, pro/business 2 — but deferred the
-- enforcement, because the policy sits in the onboarding write path and that was
-- outside the sprint's brief. It is now enforced, with the exact body that file
-- specified: the existing owner check AND a count of the caller's own pages.
--
-- NOTE the statement below is an ALTER, not a CREATE: it presupposes the base
-- owner policy "Users can create their own pages" already exists. Replaying this
-- mirror against a project that lacks that policy will fail — create it first.
--
-- No UI path can reach this quota. The only client insert into `pages` is the
-- first-page create in src/pages/OnboardingFlow.tsx (an existing page takes the
-- UPDATE branch above it), and the Pro "Second page" is a `modes` row of
-- type='page2' on the SAME page (ProfileDashboard.ensureSecondPage), not a second
-- `pages` row. This is a server floor against crafted requests, not a UI gate.
--
-- A new user's first page is never blocked: free's limit is 1 and a fresh account
-- has 0 pages, and the comparison is a strict `<`.
--
-- VERIFIED in prod by TL.ENT.PAGES.2 against the pro test account (limit 2):
-- inserting the 2nd page returns 201; the 3rd returns 42501 "new row violates
-- row-level security policy for table \"pages\"". UPDATE (the editor save path)
-- is unaffected.

alter policy "Users can create their own pages"
  on public.pages
  with check (
    (auth.uid() = user_id)
    and (
      (select count(*) from pages where user_id = auth.uid())
        < plan_limit(current_plan(), 'maxPages')
    )
  );
