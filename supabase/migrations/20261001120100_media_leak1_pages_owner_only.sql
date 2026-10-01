-- RE-RUNNABLE — MEDIA.LEAK.1 step 3 — SELECT on public.pages becomes owner-only; visitors read public.pages_public. Run only after the pages_public code is live on www.titilinks.com.

do $$
declare
  v_ok boolean;
begin
  select (v.relowner = t.relowner or r.rolsuper or r.rolbypassrls) and not t.relforcerowsecurity
    into v_ok
    from pg_class v
    join pg_roles r on r.oid = v.relowner
    cross join pg_class t
   where v.oid = 'public.pages_public'::regclass
     and t.oid = 'public.pages'::regclass;
  if not coalesce(v_ok, false) then
    raise exception 'MEDIA.LEAK.1: pages_public would be filtered by pages RLS, so every public page would go blank. Nothing changed.';
  end if;
end $$;

drop policy if exists "Public can view pages by handle" on public.pages;

drop policy if exists "Users can view their own pages" on public.pages;
create policy "Users can view their own pages"
  on public.pages for select
  using (auth.uid() = user_id);

do $$
declare
  v_other text;
begin
  select string_agg(policyname, ', ')
    into v_other
    from pg_policies
   where schemaname = 'public'
     and tablename = 'pages'
     and cmd in ('SELECT', 'ALL')
     and policyname <> 'Users can view their own pages';
  if v_other is not null then
    raise exception 'MEDIA.LEAK.1: other SELECT policies on public.pages still apply (%). Nothing changed.', v_other;
  end if;
end $$;
