-- PROMO.TOGGLE.1 — optional "Made with TitiLinks" badge for paid tiers.
--
-- Free stays branded always (the badge is the free tier's cost). Pro/Business
-- get a user switch, DEFAULT ON: profiles.show_badge. New and legacy rows
-- default to true, so nobody's badge silently disappears on deploy.
--
-- profiles is owner-only RLS (PIXELS.1), so the PUBLIC page cannot read the
-- owner's show_badge/plan directly. get_public_page_branding mirrors the
-- get_public_page_plan / get_public_tracking_pixels / get_public_brand_fonts
-- security-definer pattern: it exposes ONLY (plan, show_badge) for a page id,
-- never any other profile column. get_public_page_plan STAYS as-is — the
-- email-subscribe block keeps gating through it.
--
-- Callers MUST fail toward the free tier's constraints (badge shows) if this
-- lookup fails for any reason (function missing pre-migration, network error,
-- no row) — never toward silently hiding a paid-but-not-opted-out badge.
--
-- HOW TO APPLY: run this in the Supabase web SQL editor against the
-- production project (ref ohmvlypcbrfkuudcuqub). This repo file is a MIRROR
-- of what is run by hand — do NOT `supabase db push` / `supabase link`
-- (config.toml line 1 points at an orphan project).

alter table public.profiles
  add column show_badge boolean not null default true;

create or replace function public.get_public_page_branding(p_page_id uuid)
returns table(plan text, show_badge boolean)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.plan, 'free'), coalesce(p.show_badge, true)
  from public.pages pg
  join public.profiles p on p.id = pg.user_id
  where pg.id = p_page_id
  limit 1;
$$;

grant execute on function public.get_public_page_branding(uuid) to anon, authenticated;
