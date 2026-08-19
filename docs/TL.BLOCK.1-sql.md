# TL.BLOCK.1 — SQL to run in the Supabase web editor

Project: **ohmvlypcbrfkuudcuqub** (prod). Run these in order, in the web SQL
editor. **Nothing here is run by the agent, the CLI, or MCP** — the agent only
reads state to keep this file honest.

---

## Current live state (captured 2026-08-19 via read-only MCP)

The seeding race has re-fired since this file was first drafted — the page is
**not** back to a clean 10 blocks. Here is exactly what the DB holds right now:

- The index `blocks_mode_type_singleton_uidx` **does not exist yet.**
- Duplicates exist on **one page only — `joeyc` / `page1`**:

  | block type | copies | copies with items | items in the keeper |
  |---|---|---|---|
  | `primary_cta` | 9 | 1 | 1 |
  | `links` | 9 | 1 | 3 |
  | `product_cards` | 9 | 0 | 0 |
  | `gallery` | 9 | 1 | 8 |

- Every other block type is already 1-per-mode everywhere. No other account has
  a single duplicate.
- **All four groups are auto-cleanable**: at most one copy in each holds content,
  so Step 2 deletes **exactly 32 empty rows and leaves 0 populated duplicates
  behind.** No group needs a hand decision.
- `text` — the one legitimately many-per-mode type — currently has 0 rows
  anywhere, but stays excluded from the index so TextBlocksPanel's "Add" keeps
  working.

So the expected path is: **Step 1 previews 32 rows → Step 2 deletes them →
Step 3 returns zero → Step 4 creates the index → Step 5 confirms it.**

---

## Step 1 — Preview the cleanup (dry run, changes nothing)

The exact rows Step 2 will delete: every duplicate copy of a non-`text` type
that has **no items**, keeping one survivor per group (the copy with the most
items, ties broken by oldest). **Expect 32 rows, all on `joeyc` / `page1`.**

```sql
with ranked as (
  select
    b.id,
    b.mode_id,
    b.type,
    (select count(*) from public.block_items bi where bi.block_id = b.id) as item_count,
    row_number() over (
      partition by b.mode_id, b.type
      order by (select count(*) from public.block_items bi where bi.block_id = b.id) desc,
               b.created_at asc
    ) as rn
  from public.blocks b
  where b.type <> 'text'
)
select r.id, p.handle, m.type as page, r.type as block_type, r.item_count
from ranked r
join public.modes m on m.id = r.mode_id
join public.pages p on p.id = m.page_id
where r.rn > 1 and r.item_count = 0
order by p.handle, r.type;
```

If any row in that list has `item_count > 0`, **stop and tell me** — it means the
ranking changed since capture. As of now every row shows `0`.

---

## Step 2 — Guarded DELETE (only empty duplicates, keeper always survives)

Same ranking, now deleting. It removes **only** copies with `rn > 1` **and**
zero items, so it never touches a block with content and never empties a group.

```sql
with ranked as (
  select
    b.id,
    (select count(*) from public.block_items bi where bi.block_id = b.id) as item_count,
    row_number() over (
      partition by b.mode_id, b.type
      order by (select count(*) from public.block_items bi where bi.block_id = b.id) desc,
               b.created_at asc
    ) as rn
  from public.blocks b
  where b.type <> 'text'
)
delete from public.blocks
where id in (select id from ranked where rn > 1 and item_count = 0);
```

**Expect `DELETE 32`.** (Want a safety net? Wrap it: run `begin;` before, then
this DELETE, then Step 3's query; if the count looks wrong, `rollback;`, else
`commit;`.)

---

## Step 3 — Preflight re-check (must return ZERO rows before Step 4)

`CREATE UNIQUE INDEX` fails outright if a single mode anywhere still holds two
non-`text` blocks of one type — and the error names only the first conflict.
This is the grouped view across **all** pages; it must come back empty.

```sql
select
  p.handle,
  m.type                                              as page,
  b.type                                              as block_type,
  count(*)                                            as copies,
  count(*) filter (where i.n > 0)                     as copies_with_items,
  array_agg(b.id order by i.n desc, b.created_at asc) as ids_best_first,
  array_agg(i.n  order by i.n desc, b.created_at asc) as item_counts
from public.blocks b
join public.modes m on m.id = b.mode_id
join public.pages p on p.id = m.page_id
left join lateral (
  select count(*)::int as n from public.block_items bi where bi.block_id = b.id
) i on true
where b.type <> 'text'
group by b.mode_id, p.handle, m.type, b.type
having count(*) > 1
order by copies desc, p.handle;
```

- **Zero rows → go to Step 4.**
- **Any rows left → send me the output.** A group surviving here has real content
  in two or more rows (a genuine merge decision); do not delete by hand.

---

## Step 4 — Create the partial unique index

```sql
create unique index if not exists blocks_mode_type_singleton_uidx
  on public.blocks (mode_id, type)
  where type <> 'text';
```

`text` is excluded because it is the one type a page may legitimately hold many
of (Text Blocks → Add). Verified against live data: no other type exceeds one
per mode anywhere. After this, a racing insert fails with `23505` instead of
minting a duplicate.

---

## Step 5 — Verify the index is live

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'blocks'
  and indexname = 'blocks_mode_type_singleton_uidx';
```

You should see one row, with `WHERE (type <> 'text'::block_type)` in `indexdef`.

---

## Notes

- The repo mirror of Step 4 is
  `supabase/migrations/20260819120000_blocks_singleton_type.sql`. It records the
  DDL only; nothing runs it (config.toml points at an orphan project — never
  `supabase db push`).
- The index predicate (`type <> 'text'`) is kept in lockstep with
  `MANY_PER_MODE_TYPES` in `src/lib/default-blocks.ts`. The guard test
  `scripts/default-blocks.test.mjs` fails if the two drift apart.
- Old snapshots taken while the duplicates existed still carry them in their
  payload. `restoreSnapshot` now runs the payload through `dedupeSingletonBlocks`
  before re-inserting, so restoring one cannot trip the new index mid-restore
  (which would have left the page with its blocks deleted).
- The app-side seeder (`ensureDefaultBlocks`) is now serialized per mode, refuses
  to seed off an empty/failed read, and treats a `23505` from a cross-tab race as
  "someone else already did it" — re-reads and fills only the gap. Once the index
  is live, the two layers together make this class of duplicate impossible.
