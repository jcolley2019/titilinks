-- BILL.B3 / ENT.SRV — server-side entitlement enforcement.
--
-- APPLY BY HAND in the Supabase web SQL editor against the PROD project
-- (ref ohmvlypcbrfkuudcuqub). This repo file is a MIRROR of what was run —
-- do NOT `supabase db push` (config.toml points at an orphan project).
--
-- RUN ORDER: migration 4 of 4. Run LAST.
--
-- Until now every entitlement was enforced in the browser only. The UI does not
-- change here — the client keeps its own checks, which is what produces good
-- upsells — but the server stops being optional. A crafted request with a valid
-- user JWT could previously create unlimited short links, unlimited snapshots,
-- upload custom fonts on the free tier and hide the badge without paying.
--
-- ⚠️ MIRROR REQUIREMENT: plan_limit() and plan_allows() below duplicate
-- src/lib/entitlements.ts. There is no shared runtime between Postgres and the
-- Vite bundle, so the two MUST be edited together. A test in
-- scripts/billing.test.mjs parses this file and fails the guard battery if the
-- numbers drift.

-- Postgres refuses to change a function's return type via create or replace (42P13), so drop the old signature first.
drop function if exists public.subscribe_to_page(uuid, text, text);

-- ---------------------------------------------------------------------------
-- The quota tables, in SQL
-- ---------------------------------------------------------------------------
create or replace function public.plan_limit(p_plan text, p_limit text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_limit
    -- ENTITLEMENTS.maxSnapshots — manual restore points per page
    when 'maxSnapshots' then
      case coalesce(p_plan, 'free')
        when 'business' then 20 when 'pro' then 5 else 1 end
    -- ENTITLEMENTS.maxShortLinks — custom /s/:slug destinations per account
    when 'maxShortLinks' then
      case coalesce(p_plan, 'free')
        when 'business' then 100 when 'pro' then 25 else 3 end
    -- ENTITLEMENTS.maxPages — enforcement deferred (see the report); the value
    -- is defined here so the quota table is complete and reviewable.
    when 'maxPages' then
      case coalesce(p_plan, 'free')
        when 'business' then 2 when 'pro' then 2 else 1 end
    else null
  end;
$$;

create or replace function public.plan_allows(p_plan text, p_feature text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case p_feature
    -- Boolean flags from ENTITLEMENTS that the server can meaningfully police.
    when 'customFonts' then coalesce(p_plan, 'free') in ('pro', 'business')
    when 'emailSubscribe' then coalesce(p_plan, 'free') in ('pro', 'business')
    when 'removeBranding' then coalesce(p_plan, 'free') in ('pro', 'business')
    -- Defined for the deferred pixels gate documented at the bottom of this file.
    when 'trackingPixels' then coalesce(p_plan, 'free') in ('pro', 'business')
    else false
  end;
$$;

/** The caller's own plan. STABLE + security definer so RLS policies can use it. */
create or replace function public.current_plan()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(plan, 'free') from public.profiles where id = auth.uid();
$$;

grant execute on function public.plan_limit(text, text) to authenticated, service_role;
grant execute on function public.plan_allows(text, text) to authenticated, service_role;
grant execute on function public.current_plan() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- maxShortLinks — custom_short_links INSERT quota
-- ---------------------------------------------------------------------------
-- Replaces the SHORT.1 owner-only insert policy with the same ownership test
-- PLUS the quota. The count excludes nothing: every row a user owns counts, which
-- matches what the ShortLinks UI displays.
drop policy if exists "Owners can create their own custom short links" on public.custom_short_links;

create policy "Owners can create their own custom short links"
  on public.custom_short_links
  for insert
  with check (
    auth.uid() = user_id
    and (
      select count(*) from public.custom_short_links existing
      where existing.user_id = auth.uid()
    ) < public.plan_limit(public.current_plan(), 'maxShortLinks')
  );

-- ---------------------------------------------------------------------------
-- maxSnapshots — manual restore points per page
-- ---------------------------------------------------------------------------
-- Only MANUAL snapshots are capped. The auto safety-net snapshots taken before
-- destructive actions (SNAP.1) are exempt and ring-buffered separately in
-- src/lib/snapshots.ts — capping them would mean a user at quota silently loses
-- the pre-template-apply restore point, which is the one that matters most.
drop policy if exists "Users can create their own snapshots" on public.profile_snapshots;

create policy "Users can create their own snapshots"
  on public.profile_snapshots
  for insert
  with check (
    auth.uid() = user_id
    and (
      kind <> 'manual'
      or (
        select count(*) from public.profile_snapshots existing
        where existing.user_id = auth.uid()
          and existing.page_id = profile_snapshots.page_id
          and existing.kind = 'manual'
      ) < public.plan_limit(public.current_plan(), 'maxSnapshots')
    )
  );

-- ---------------------------------------------------------------------------
-- customFonts + show_badge — profile-column entitlement guard
-- ---------------------------------------------------------------------------
-- Two free-tier escapes closed in one BEFORE UPDATE trigger:
--
--   • brand_json.fonts[] — BRAND.1's gate is on ADDING a font. Already-uploaded
--     fonts must keep rendering after a downgrade (never break a live page), so
--     this rejects only a write that GROWS the array on a plan without
--     customFonts. Shrinking, reordering and the BRAND.2 colour keys stay free.
--   • show_badge — the free tier's badge is the price of the free tier. Free may
--     not set it to false; paid may set it either way.
create or replace function public.guard_entitlement_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text := coalesce(new.plan, 'free');
  v_old_fonts integer;
  v_new_fonts integer;
begin
  -- Service-role writes (webhook, admin scripts) bypass: they are trusted.
  if coalesce(auth.role(), '') = 'service_role'
     or current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.show_badge is distinct from old.show_badge
     and new.show_badge = false
     and not public.plan_allows(v_plan, 'removeBranding') then
    raise exception 'Hiding the TitiLinks badge requires a paid plan';
  end if;

  if new.brand_json is distinct from old.brand_json
     and not public.plan_allows(v_plan, 'customFonts') then
    v_old_fonts := coalesce(jsonb_array_length(
      case when jsonb_typeof((old.brand_json)::jsonb -> 'fonts') = 'array'
           then (old.brand_json)::jsonb -> 'fonts' else '[]'::jsonb end), 0);
    v_new_fonts := coalesce(jsonb_array_length(
      case when jsonb_typeof((new.brand_json)::jsonb -> 'fonts') = 'array'
           then (new.brand_json)::jsonb -> 'fonts' else '[]'::jsonb end), 0);

    if v_new_fonts > v_old_fonts then
      raise exception 'Uploading custom fonts requires a paid plan';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_entitlement_columns on public.profiles;
create trigger trg_guard_entitlement_columns
  before update on public.profiles
  for each row execute function public.guard_entitlement_columns();

-- ---------------------------------------------------------------------------
-- emailSubscribe — the PUBLIC capture path
-- ---------------------------------------------------------------------------
-- EmailSubscribeBlock hides itself when the owner's plan lacks emailSubscribe,
-- but subscribe_to_page is a security-definer RPC granted to anon: anyone could
-- POST to it for a free-tier page and harvest into page_subscribers. The plan
-- check belongs here, at the write.
--
-- Preserves the original contract exactly — same JSON shape, same
-- duplicate-is-success behaviour (never leak whether an address is subscribed) —
-- and adds one gate. The refusal is deliberately indistinguishable from a
-- missing page: a visitor must not learn the owner's plan tier from an error.
create or replace function public.subscribe_to_page(
  p_page_id uuid,
  p_email text,
  p_name text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
begin
  if p_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
    return json_build_object('success', false, 'error', 'Invalid email format');
  end if;

  -- Resolve the page AND its owner's plan in one lookup.
  select coalesce(pr.plan, 'free') into v_plan
  from public.pages pg
  join public.profiles pr on pr.id = pg.user_id
  where pg.id = p_page_id;

  if v_plan is null then
    return json_build_object('success', false, 'error', 'Page not found');
  end if;

  -- ENT.SRV: the block is a paid feature. Same response as a missing page.
  if not public.plan_allows(v_plan, 'emailSubscribe') then
    return json_build_object('success', false, 'error', 'Page not found');
  end if;

  begin
    insert into public.page_subscribers (page_id, email, name)
    values (p_page_id, lower(trim(p_email)), nullif(trim(p_name), ''));

    return json_build_object('success', true);
  exception
    when unique_violation then
      -- Already subscribed — report success so nothing is leaked.
      return json_build_object('success', true);
    when others then
      return json_build_object('success', false, 'error', 'Failed to subscribe');
  end;
end;
$$;

grant execute on function public.subscribe_to_page(uuid, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- NOT enforced here, and why — read before assuming coverage
-- ---------------------------------------------------------------------------
-- trackingPixels: get_public_tracking_pixels(page_handle text) is the public
--   read path, and its body does NOT exist anywhere in this repo (PIXELS.1
--   created it directly in the SQL editor). Rewriting it from a guess would risk
--   breaking pixel injection on every live page, so it is deliberately untouched.
--   To gate it, add this to the EXISTING body's where-clause, in place:
--       and public.plan_allows(coalesce(p.plan, 'free'), 'trackingPixels')
--   `plan_allows` already knows the flag; only the one clause is missing.
--
-- maxPages: the quota is defined in plan_limit() above but not enforced, because
--   an INSERT policy on `pages` sits directly in the onboarding and page-2
--   creation paths and was outside this sprint's brief. The policy body is:
--       (select count(*) from public.pages where user_id = auth.uid())
--         < public.plan_limit(public.current_plan(), 'maxPages')
--   added to the existing owner insert policy's WITH CHECK.
--
-- analyticsAdvanced: NOT server-enforceable as designed, and a naive attempt
--   would break basic analytics. src/hooks/useAnalytics.ts reads the owner's own
--   `events` rows with select('*') and derives BOTH the free metrics (views,
--   clicks) and the Pro ones (per-page split, top destinations, referrer mix)
--   client-side from the same rows. Withholding those rows removes free
--   analytics too; RLS is row-level, so the Pro columns cannot be masked. The
--   user is also the data subject here, so a server floor protects no one else's
--   data — it would only stop them reading their own numbers. Real enforcement
--   means moving aggregation into a plan-aware security-definer RPC and
--   rewiring useAnalytics — a designed follow-up, not a policy tweak.
