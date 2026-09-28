-- TL.HANDLE.2 — change_handle: the creator renames their own page handle.
--
-- APPLY BY HAND in the Supabase web SQL editor against the PROD project
-- (ref ohmvlypcbrfkuudcuqub). This repo file is a MIRROR of what is run —
-- do NOT `supabase db push` (config.toml points at an orphan project).
--
-- Why a function: the handle lives in two columns — pages.handle (the public
-- URL, UNIQUE) and profiles.username — and they must move together or not at
-- all. One call, one transaction.
--
-- What it does NOT do: re-implement the format / reserved-word rules. The
-- pages_handle_rules and profiles_username_rules CHECK constraints
-- (20260904130000_handle1_reserved_and_format.sql) already enforce them; a
-- check_violation surfaces as 'handle_invalid'.
--
-- Old links stop working on rename (v1 ruling). No redirect row is written.
--
-- Errors the client maps (ProfileDashboard handleHubSave):
--   not_signed_in   — no auth.uid()
--   no_page         — the caller has no pages row
--   handle_taken    — unique_violation on either column
--   handle_invalid  — check_violation (format or reserved word)
--
-- SECURITY DEFINER, owned by postgres, search_path pinned: the body writes
-- only rows WHERE user_id / id = auth.uid(), so the caller can move nothing but
-- their own handle. Running as postgres also passes the profiles guard
-- triggers (they bypass current_user = 'postgres'), none of which pin
-- username anyway.
create or replace function public.change_handle(p_handle text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_handle text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;

  v_handle := lower(trim(p_handle));

  begin
    update public.pages set handle = v_handle where user_id = v_uid;
    if not found then
      raise exception 'no_page';
    end if;

    update public.profiles set username = v_handle where id = v_uid;
  exception
    when unique_violation then
      raise exception 'handle_taken';
    when check_violation then
      raise exception 'handle_invalid';
  end;

  return v_handle;
end;
$$;

revoke all on function public.change_handle(text) from public, anon;
grant execute on function public.change_handle(text) to authenticated;
