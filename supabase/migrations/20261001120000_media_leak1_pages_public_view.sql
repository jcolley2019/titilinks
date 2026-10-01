-- RE-RUNNABLE — MEDIA.LEAK.1 step 1 — public.pages_public: the visitor-safe read of pages (no avatar_original_url, no theme_json.avatar_original_url_page2).

create or replace view public.pages_public as
select
  id,
  user_id,
  handle,
  display_name,
  bio,
  avatar_url,
  theme_json - 'avatar_original_url_page2' as theme_json,
  goal_primary_offer_item_id,
  goal_secondary_item_id,
  created_at,
  updated_at
from public.pages;

revoke all on public.pages_public from public, anon, authenticated, service_role;
grant select on public.pages_public to anon, authenticated, service_role;

notify pgrst, 'reload schema';
