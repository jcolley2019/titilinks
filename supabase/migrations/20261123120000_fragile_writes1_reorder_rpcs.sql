-- RE-RUNNABLE — FRAGILE.WRITES.1 — reorder_blocks + reorder_block_items: a whole new order in one all-or-nothing write.
create or replace function public.reorder_blocks(p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_n int;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;
  update public.blocks b
     set order_index = (x.ord - 1)::int
    from unnest(p_ids) with ordinality as x(id, ord)
   where b.id = x.id;
  get diagnostics v_n = row_count;
  if v_n <> cardinality(p_ids) then
    raise exception 'reorder_blocks: % of % rows updated', v_n, cardinality(p_ids);
  end if;
end;
$$;

create or replace function public.reorder_block_items(p_block_id uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_n int;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;
  update public.block_items i
     set order_index = (x.ord - 1)::int
    from unnest(p_ids) with ordinality as x(id, ord)
   where i.id = x.id
     and i.block_id = p_block_id;
  get diagnostics v_n = row_count;
  if v_n <> cardinality(p_ids) then
    raise exception 'reorder_block_items: % of % rows updated', v_n, cardinality(p_ids);
  end if;
end;
$$;

revoke all on function public.reorder_blocks(uuid[]) from public, anon;
grant execute on function public.reorder_blocks(uuid[]) to authenticated;
revoke all on function public.reorder_block_items(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_block_items(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
