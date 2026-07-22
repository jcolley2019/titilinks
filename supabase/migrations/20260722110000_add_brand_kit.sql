-- SPRINT.BRAND — Brand Kit storage: uploaded fonts + brand config.
--
-- BRAND.1: custom font upload (PRO). Font FILES live in a public 'fonts'
-- storage bucket at {user_id}/{filename}; font METADATA (family name + public
-- URL) lives in profiles.brand_json.fonts[]. BRAND.2 adds brand colors and
-- heading/body font choices to the same brand_json.
--
-- profiles is owner-only RLS (PIXELS.1), so the PUBLIC page cannot read
-- brand_json directly — get_public_brand_fonts mirrors the
-- get_public_tracking_pixels security-definer pattern and exposes ONLY the
-- fonts array (family + url), never the rest of the brand kit.
--
-- HOW TO APPLY: run this in the Supabase web SQL editor against the production
-- project (ref ohmvlypcbrfkuudcuqub). This repo file is a MIRROR of what is run
-- by hand — do NOT `supabase db push` / `supabase link` (config.toml line 1
-- points at an orphan project). The UI degrades gracefully until this runs:
-- uploads error with a friendly toast, public pages simply skip font
-- registration.

-- 1) Brand kit home on the profile.
alter table public.profiles add column if not exists brand_json jsonb;

-- 2) Public 'fonts' bucket — owner writes under their own {user_id}/ folder,
--    anyone can read (font files must be fetchable by public page visitors).
insert into storage.buckets (id, name, public)
values ('fonts', 'fonts', true)
on conflict (id) do nothing;

create policy "Public read fonts"
  on storage.objects for select
  using (bucket_id = 'fonts');

create policy "Owners can upload fonts"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'fonts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Owners can update own fonts"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'fonts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'fonts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Owners can delete own fonts"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'fonts' and (storage.foldername(name))[1] = auth.uid()::text);

-- 3) Public read of the fonts array only (family + url), by page handle —
--    the public page registers @font-face rules from this.
create or replace function public.get_public_brand_fonts(page_handle text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.brand_json->'fonts', '[]'::jsonb)
  from public.pages pg
  join public.profiles p on p.id = pg.user_id
  where pg.handle = lower(page_handle)
  limit 1;
$$;

grant execute on function public.get_public_brand_fonts(text) to anon, authenticated;
