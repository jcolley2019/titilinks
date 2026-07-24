-- SHORT.1 — custom (user-chosen slug) link shortener.
--
-- APPLY BY HAND in the Supabase web SQL editor against the PROD project
-- (ref ohmvlypcbrfkuudcuqub). This repo file is a MIRROR of what was run —
-- do NOT `supabase db push` (config.toml points at an orphan project).
--
-- This is a NEW, separate table from the existing page/code-based `short_links`
-- (the /l/:code per-link shortener + `resolve_short_link(...)` resolver, which
-- stay untouched). Here each row is a standalone, user-owned custom slug that
-- redirects at /s/:slug.

create table public.custom_short_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,32}$'),
  target_url text not null,
  clicks integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_custom_short_links_user_id on public.custom_short_links(user_id);

-- Owners get full CRUD on their own rows. There is deliberately NO public
-- SELECT policy — anonymous visitors never read the table directly; the
-- redirect goes through the security-definer resolver below.
alter table public.custom_short_links enable row level security;

create policy "Owners can view their own custom short links"
  on public.custom_short_links
  for select
  using (auth.uid() = user_id);

create policy "Owners can create their own custom short links"
  on public.custom_short_links
  for insert
  with check (auth.uid() = user_id);

create policy "Owners can update their own custom short links"
  on public.custom_short_links
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Owners can delete their own custom short links"
  on public.custom_short_links
  for delete
  using (auth.uid() = user_id);

-- Public resolver: atomically increments the click counter and returns the
-- destination for a slug (null when the slug does not exist). SECURITY DEFINER
-- so it bypasses RLS for anonymous /s/:slug visitors; search_path pinned.
create or replace function public.resolve_short_link_by_slug(p_slug text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target text;
begin
  update public.custom_short_links
    set clicks = clicks + 1
    where slug = p_slug
    returning target_url into v_target;
  return v_target; -- null if no row matched
end;
$$;

grant execute on function public.resolve_short_link_by_slug(text) to anon;
grant execute on function public.resolve_short_link_by_slug(text) to authenticated;
