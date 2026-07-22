-- PRICE.TRUTH.1 — public read of the page owner's plan tier.
--
-- profiles is owner-only RLS (PIXELS.1), so the PUBLIC page cannot read the
-- page owner's `profiles.plan` directly. get_public_page_plan mirrors the
-- get_public_tracking_pixels / get_public_brand_fonts security-definer
-- pattern: it exposes ONLY the plan string for a given page id, never any
-- other profile column.
--
-- Used to gate the "Made with TitiLinks" public footer chip (removeBranding)
-- and the email-subscribe block's public rendering (emailSubscribe) by the
-- PAGE OWNER's plan, not the viewer's. Callers MUST default to 'free' if this
-- lookup fails for any reason (function missing pre-migration, network error,
-- no row) — fail toward the free tier's constraints (badge shows, gated
-- blocks stay hidden), never toward silently granting paid behavior.
--
-- HOW TO APPLY: run this in the Supabase web SQL editor against the
-- production project (ref ohmvlypcbrfkuudcuqub). This repo file is a MIRROR
-- of what is run by hand — do NOT `supabase db push` / `supabase link`
-- (config.toml line 1 points at an orphan project).

create or replace function public.get_public_page_plan(p_page_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.plan, 'free')
  from public.pages pg
  join public.profiles p on p.id = pg.user_id
  where pg.id = p_page_id
  limit 1;
$$;

grant execute on function public.get_public_page_plan(uuid) to anon, authenticated;
