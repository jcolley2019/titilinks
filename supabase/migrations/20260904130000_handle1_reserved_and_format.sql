-- RE-RUNNABLE — TL.HANDLE.1 — reserved-word + format floor on page handles.
--
-- Mirror of what Joey pastes from handle1.sql (that file is the dry-run form:
-- same statements wrapped in begin/rollback). This one is idempotent: each
-- constraint is added only when pg_constraint does not already carry it, so
-- re-pasting is a no-op rather than a "constraint already exists" error.
--
-- Client half: src/lib/handle-rules.ts (HANDLE_PATTERN + RESERVED_HANDLES).
-- The regex and the 54-word list here are generated from that module — if you
-- change one, regenerate the other or scripts/handle-rules.test.mjs is lying.
--
-- AUDIT_rev6 #5.

do $$
declare
  reserved text[] := array[
      'about', 'account', 'admin', 'analytics', 'api', 'app',
      'auth', 'billing', 'blog', 'contact', 'dashboard', 'docs',
      'editor', 'features', 'go', 'help', 'home', 'l',
      'legal', 'login', 'logout', 'mod', 'moderator', 'null',
      'official', 'onboarding', 'press', 'pricing', 'privacy', 'profile',
      'qr', 'root', 's', 'security', 'settings', 'setup',
      'short-links', 'signin', 'signup', 'staff', 'status', 'support',
      'team', 'templates', 'terms', 'titi', 'titiactriz', 'titilink',
      'titilinks', 'u', 'undefined', 'user', 'users', 'www'
    ]::text[];
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'pages_handle_rules'
       and conrelid = 'public.pages'::regclass
  ) then
    execute format('alter table public.pages add constraint pages_handle_rules check (handle ~ %L and handle <> all (%L::text[]))', '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$', reserved);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'profiles_username_rules'
       and conrelid = 'public.profiles'::regclass
  ) then
    execute format('alter table public.profiles add constraint profiles_username_rules check (username is null or (username ~ %L and username <> all (%L::text[])))', '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$', reserved);
  end if;
end $$;
