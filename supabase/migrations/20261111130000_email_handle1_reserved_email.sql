-- RE-RUNNABLE — EMAIL.HANDLE.1 — restates pages_handle_rules + profiles_username_rules with 'email', 'goodbye', 'assets' and 'models' reserved.
--
-- Why: EMAIL.DRIP.2 serves static files under /email/ and reserved 'email' as a
-- first path segment (RESERVED_FIRST_SEGMENTS, src/lib/seo-profile-html.ts),
-- but the #43 CHECK constraints still let a creator claim the handle 'email'.
-- 'goodbye' (a route), 'assets' and 'models' (public/ and build folders) were
-- in that segment list and missing from the handle list the same way.
--
-- Client half: src/lib/handle-rules.ts (HANDLE_PATTERN + RESERVED_HANDLES).
-- The regex and the 58-word list here are generated from that module
-- (RESERVED_HANDLE_LIST, six per row) — if you change one, regenerate the other
-- or scripts/handle-rules.test.mjs fails. Supersedes the #43 constraint
-- definitions (54 words); re-running #43 afterwards is a no-op, because it only
-- adds a constraint that does not exist.
--
-- One DO block, so one statement and one transaction:
--   1. If any pages.handle or profiles.username already equals a reserved word,
--      raise before anything is touched. Nothing changes.
--   2. Drop and re-add both constraints with the full list (re-running re-applies
--      the same definitions). ADD CONSTRAINT validates every existing row.
--   3. Read both definitions back; if either does not carry exactly this list,
--      raise, and the whole block rolls back.

do $$
declare
  reserved text[] := array[
      'about', 'account', 'admin', 'analytics', 'api', 'app',
      'assets', 'auth', 'billing', 'blog', 'contact', 'dashboard',
      'docs', 'editor', 'email', 'features', 'go', 'goodbye',
      'help', 'home', 'l', 'legal', 'login', 'logout',
      'mod', 'models', 'moderator', 'null', 'official', 'onboarding',
      'press', 'pricing', 'privacy', 'profile', 'qr', 'root',
      's', 'security', 'settings', 'setup', 'short-links', 'signin',
      'signup', 'staff', 'status', 'support', 'team', 'templates',
      'terms', 'titi', 'titiactriz', 'titilink', 'titilinks', 'u',
      'undefined', 'user', 'users', 'www'
    ]::text[];
  v_pages text;
  v_profiles text;
  v_bad text;
begin
  -- 1. Fail closed before any change.
  select string_agg(distinct handle, ', ' order by handle)
    into v_pages
    from public.pages
   where handle = any (reserved);
  select string_agg(distinct username, ', ' order by username)
    into v_profiles
    from public.profiles
   where username = any (reserved);
  if v_pages is not null or v_profiles is not null then
    raise exception 'EMAIL.HANDLE.1: reserved words already in use (pages.handle: %; profiles.username: %). Nothing changed.',
      coalesce(v_pages, 'none'), coalesce(v_profiles, 'none');
  end if;

  -- 2. Restate both constraints.
  alter table public.pages drop constraint if exists pages_handle_rules;
  execute format('alter table public.pages add constraint pages_handle_rules check (handle ~ %L and handle <> all (%L::text[]))', '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$', reserved);

  alter table public.profiles drop constraint if exists profiles_username_rules;
  execute format('alter table public.profiles add constraint profiles_username_rules check (username is null or (username ~ %L and username <> all (%L::text[])))', '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$', reserved);

  -- 3. Read back: both constraints exist, are validated, and carry exactly this list.
  select string_agg(want.conname, ', ')
    into v_bad
    from (values ('pages_handle_rules', 'public.pages'::regclass),
                 ('profiles_username_rules', 'public.profiles'::regclass)) as want(conname, rel)
    left join pg_constraint c
      on c.conname = want.conname and c.conrelid = want.rel
   where c.oid is null
      or not c.convalidated
      or substring(pg_get_constraintdef(c.oid) from '''(\{[^'']*\})''::text\[\]')::text[] is distinct from reserved;
  if v_bad is not null then
    raise exception 'EMAIL.HANDLE.1: % did not come back with the 58-word list. Nothing changed.', v_bad;
  end if;
end $$;
