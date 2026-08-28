// TL.BLOCK.1 — unit test for the default-block seeder (src/lib/default-blocks.ts).
//
// Same convention as tpl-apply.test.mjs: a standalone node script run with
// `npx tsx`, which resolves the .ts source directly. The engine takes an
// injectable client and its production default is a lazy dynamic import, so
// importing it here never evaluates the real supabase client.
//
// The headline case is CONCURRENCY: two overlapping fetchBlocks for one mode
// must produce exactly ONE set of defaults. The fake client models the real
// failure — its `select` resolves on a later microtask than the caller's, so an
// unguarded implementation genuinely interleaves (read A, read B, insert A,
// insert B) and would double-insert. This test fails against the old inline
// Editor.tsx implementation and passes against the guarded one.
//
// Run: npx tsx scripts/default-blocks.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ensureDefaultBlocks,
  dedupeSingletonBlocks,
  collapsePageSingletonBlocks,
  DEFAULT_BLOCK_TYPES,
  MANY_PER_MODE_TYPES,
  PAGE_SINGLETON_TYPES,
  isSingletonBlockType,
  __resetInFlightForTests,
} from '../src/lib/default-blocks';
import { BLOCK_PRESETS } from '../src/lib/block-presets';
import { TPL_PRESETS } from '../src/lib/tpl-presets';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

const MODE = 'mode-1';

// ── fake supabase client ─────────────────────────────────────────────────────
// Holds a real row set, enforces the partial unique index the migration adds,
// and records every operation in order.

function makeClient(opts = {}) {
  const rows = (opts.rows ?? []).map((r, i) => ({ id: `pre-${i}`, ...r }));
  const events = [];
  let nextId = 0;
  const state = {
    rows,
    events,
    // `readDelay` inserts extra microtasks between the read landing and its
    // resolution, which is what lets two callers interleave.
    readDelay: opts.readDelay ?? 2,
    selectError: opts.selectError ?? null,
    /** When true the fake enforces the DB index (post-migration behaviour). */
    enforceIndex: opts.enforceIndex ?? true,
  };

  async function resolveOp(b) {
    if (b._table !== 'blocks') throw new Error(`fake client: unhandled table ${b._table}`);

    if (b._op === 'select') {
      for (let i = 0; i < state.readDelay; i++) await Promise.resolve();
      events.push({ kind: 'select', mode: b._filters.mode_id });
      if (state.selectError) return { data: null, error: state.selectError };
      return { data: state.rows.filter((r) => r.mode_id === b._filters.mode_id), error: null };
    }

    if (b._op === 'insert') {
      const payload = Array.isArray(b._payload) ? b._payload : [b._payload];
      events.push({ kind: 'insert', types: payload.map((r) => r.type) });
      if (state.enforceIndex) {
        for (const r of payload) {
          if (r.type === 'text') continue;
          const clash = state.rows.some((e) => e.mode_id === r.mode_id && e.type === r.type);
          if (clash) {
            // Postgres rejects the WHOLE statement — no partial insert.
            events.push({ kind: 'unique_violation', type: r.type });
            return {
              data: null,
              error: {
                code: '23505',
                message:
                  'duplicate key value violates unique constraint "blocks_mode_type_singleton_uidx"',
              },
            };
          }
        }
      }
      for (const r of payload) state.rows.push({ id: `new-${nextId++}`, ...r });
      return { data: null, error: null };
    }

    throw new Error(`fake client: unhandled op ${b._op}`);
  }

  function makeBuilder(table) {
    return {
      _table: table, _op: null, _payload: undefined, _filters: {},
      select() { if (!this._op) this._op = 'select'; return this; },
      insert(r) { this._op = 'insert'; this._payload = r; return this; },
      eq(col, val) { this._filters[col] = val; return this; },
      then(res, rej) { return Promise.resolve().then(() => resolveOp(this)).then(res, rej); },
    };
  }

  return { client: { from: (t) => makeBuilder(t) }, state };
}

const seeded = (rows) => rows.filter((r) => r.mode_id === MODE).map((r) => r.type).sort();
const DEFAULT_TYPES = DEFAULT_BLOCK_TYPES.map((d) => d.type);
const counts = (rows) => {
  const m = new Map();
  for (const r of rows) m.set(r.type, (m.get(r.type) ?? 0) + 1);
  return m;
};

// ── 1. THE RACE: two concurrent fetchBlocks → exactly one set of defaults ────
{
  __resetInFlightForTests();
  // A realistic starting point: onboarding seeded social_links only, so the
  // other four defaults are genuinely missing — the exact shape of the 8
  // batches-of-4 seen in the field.
  const { client, state } = makeClient({
    rows: [{ mode_id: MODE, type: 'social_links' }],
  });

  const [a, b] = await Promise.all([
    ensureDefaultBlocks(MODE, { client }),
    ensureDefaultBlocks(MODE, { client }),
  ]);

  const inserts = state.events.filter((e) => e.kind === 'insert');
  assert.equal(inserts.length, 1, `expected ONE insert, got ${inserts.length}`);
  assert.equal(state.rows.length, 5, `expected 5 blocks, got ${state.rows.length}`);
  for (const [type, n] of counts(state.rows)) {
    assert.equal(n, 1, `type ${type} was created ${n} times`);
  }
  assert.deepEqual(seeded(state.rows), [...DEFAULT_TYPES].sort());
  // Both callers learn the truth, so BOTH re-read and render the full set.
  assert.equal(a, true, 'winner reports created');
  assert.equal(b, true, 'loser joined the winner and reports created');
  ok('two concurrent seeds produce exactly one set of defaults');
}

// ── 2. Five concurrent callers (mode switch + refresh + panel close storm) ───
{
  __resetInFlightForTests();
  const { client, state } = makeClient({ rows: [{ mode_id: MODE, type: 'social_links' }] });
  const results = await Promise.all(
    Array.from({ length: 5 }, () => ensureDefaultBlocks(MODE, { client })),
  );
  assert.equal(state.events.filter((e) => e.kind === 'insert').length, 1);
  assert.equal(state.rows.length, 5);
  assert.deepEqual(results, [true, true, true, true, true]);
  ok('five concurrent seeds still produce exactly one set of defaults');
}

// ── 3. Concurrent seeds on DIFFERENT modes are not blocked by each other ────
{
  __resetInFlightForTests();
  const { client, state } = makeClient({
    rows: [
      { mode_id: 'page1', type: 'social_links' },
      { mode_id: 'page2', type: 'social_links' },
    ],
  });
  await Promise.all([
    ensureDefaultBlocks('page1', { client }),
    ensureDefaultBlocks('page2', { client }),
  ]);
  assert.equal(state.rows.filter((r) => r.mode_id === 'page1').length, 5);
  assert.equal(state.rows.filter((r) => r.mode_id === 'page2').length, 5);
  ok('the lock is per-mode — two pages seed independently');
}

// ── 4. Idempotent: a complete mode is never touched ─────────────────────────
{
  __resetInFlightForTests();
  const { client, state } = makeClient({
    rows: DEFAULT_TYPES.map((type) => ({ mode_id: MODE, type })),
  });
  const created = await ensureDefaultBlocks(MODE, { client });
  assert.equal(created, false, 'nothing to create');
  assert.equal(state.events.filter((e) => e.kind === 'insert').length, 0);
  assert.equal(state.rows.length, DEFAULT_TYPES.length);
  ok('a complete mode is left alone (no insert, returns false)');
}

// ── 5. Sequential calls do not accumulate ───────────────────────────────────
{
  __resetInFlightForTests();
  const { client, state } = makeClient({ rows: [{ mode_id: MODE, type: 'social_links' }] });
  await ensureDefaultBlocks(MODE, { client });
  await ensureDefaultBlocks(MODE, { client });
  await ensureDefaultBlocks(MODE, { client });
  assert.equal(state.rows.length, 5, 'three sequential seeds still leave 5 blocks');
  ok('sequential seeds are idempotent');
}

// ── 6. SANITY CHECK: an empty read never seeds ──────────────────────────────
// This is the mid-replace window. applyPreset / applyTplPreset / restoreSnapshot
// all delete every block before re-inserting; a fetch landing in that gap used
// to seed a full default set on top of the composition about to arrive.
{
  __resetInFlightForTests();
  const { client, state } = makeClient({ rows: [] });
  const created = await ensureDefaultBlocks(MODE, { client });
  assert.equal(created, false);
  assert.equal(state.events.filter((e) => e.kind === 'insert').length, 0, 'no blind insert');
  assert.equal(state.rows.length, 0);
  ok('an empty read is treated as suspicious — nothing is inserted');
}

// ── 7. A failed read never seeds ────────────────────────────────────────────
{
  __resetInFlightForTests();
  const { client, state } = makeClient({
    rows: [{ mode_id: MODE, type: 'social_links' }],
    selectError: { code: 'PGRST301', message: 'JWT expired' },
  });
  const created = await ensureDefaultBlocks(MODE, { client });
  assert.equal(created, false);
  assert.equal(state.events.filter((e) => e.kind === 'insert').length, 0);
  ok('a failed read is never a licence to seed');
}

// ── 8. CROSS-TAB race: the index fires, and the gap is still filled ─────────
// The in-flight map is per-document, so a second TAB is not serialized by it —
// only by the DB. Model that: our read sees one missing default, then the other
// tab lands its own rows before our insert. The index rejects the whole
// statement with 23505; the engine must absorb it, re-read, and create what the
// other tab did NOT cover.
{
  __resetInFlightForTests();
  const { client, state } = makeClient({ rows: [{ mode_id: MODE, type: 'social_links' }] });

  // Wrap the builder so that between our read and our first insert, "the other
  // tab" commits three of the four missing defaults. gallery is left for us.
  const originalFrom = client.from.bind(client);
  let fired = false;
  client.from = (table) => {
    const b = originalFrom(table);
    const originalThen = b.then.bind(b);
    b.then = (res, rej) => {
      if (!fired && b._op === 'insert') {
        fired = true;
        for (const type of ['primary_cta', 'product_cards', 'links']) {
          state.rows.push({ id: `tabB-${type}`, mode_id: MODE, type });
        }
      }
      return originalThen(res, rej);
    };
    return b;
  };

  const created = await ensureDefaultBlocks(MODE, { client });
  assert.equal(created, true, 'reports created so the caller re-reads');
  assert.ok(
    state.events.some((e) => e.kind === 'unique_violation'),
    'the index rejected the racing insert',
  );
  for (const [type, n] of counts(state.rows)) {
    assert.equal(n, 1, `type ${type} exists ${n} times after the cross-tab race`);
  }
  assert.deepEqual(seeded(state.rows), [...DEFAULT_TYPES].sort(), 'every default exists exactly once');
  ok('a unique-violation from another tab is absorbed, and the gap is still filled');
}

// ── 9. The index predicate matches the code's many-per-mode set ─────────────
{
  assert.deepEqual([...MANY_PER_MODE_TYPES], ['text'],
    "MANY_PER_MODE_TYPES changed — the migration's `WHERE type <> 'text'` must change with it");
  assert.equal(isSingletonBlockType('gallery'), true);
  assert.equal(isSingletonBlockType('text'), false);

  // The migration mirror must carry the SAME predicate. Nothing else enforces
  // this pair: widen the set without widening the index and the second row is
  // rejected in prod with 23505; narrow the index without narrowing the set and
  // duplicates come back.
  const sql = readFileSync('supabase/migrations/20260819120000_blocks_singleton_type.sql', 'utf8');
  const predicate = sql.match(/where\s+type\s*<>\s*'([a-z_]+)'/i);
  assert.ok(predicate, 'the migration has a partial-index predicate');
  assert.deepEqual([predicate[1]], [...MANY_PER_MODE_TYPES],
    'the migration predicate and MANY_PER_MODE_TYPES name different types');
  assert.match(sql, /on\s+public\.blocks\s*\(mode_id,\s*type\)/i,
    'the index is on (mode_id, type)');
  ok("MANY_PER_MODE_TYPES is exactly {text}, and the migration predicate matches");
}

// ── 10. No shipped composition repeats a type (the index would reject it) ───
{
  for (const preset of BLOCK_PRESETS) {
    const types = preset.blocks.map((b) => b.type).filter(isSingletonBlockType);
    assert.equal(new Set(types).size, types.length, `BLOCK_PRESETS '${preset.key}' repeats a type`);
  }
  for (const preset of TPL_PRESETS) {
    const types = (preset.composition ?? []).map((b) => b.type).filter(isSingletonBlockType);
    assert.equal(new Set(types).size, types.length, `TPL preset '${preset.id}' repeats a type`);
  }
  ok('no shipped block composition repeats a singleton type');
}

// ── 11. Snapshot restore drops duplicate singleton blocks ───────────────────
// Restoring a snapshot taken BEFORE the index existed must not trip it: the
// restore deletes every block first, so a mid-loop 23505 would leave the page
// empty. The payload is filtered instead of trusted.
{
  const item = { label: 'x', url: '', order_index: 0 };
  const payload = [
    { type: 'gallery', title: 'Gallery', is_enabled: true, order_index: 0, items: [] },
    { type: 'gallery', title: 'Gallery', is_enabled: true, order_index: 4, items: [item, item] },
    { type: 'gallery', title: 'Gallery', is_enabled: true, order_index: 6, items: [] },
    { type: 'links', title: 'Links', is_enabled: true, order_index: 1, items: [item] },
    { type: 'text', title: '{"a":1}', is_enabled: true, order_index: 2, items: [] },
    { type: 'text', title: '{"b":2}', is_enabled: true, order_index: 3, items: [] },
  ];
  const out = dedupeSingletonBlocks(payload);
  const byType = counts(out);
  assert.equal(byType.get('gallery'), 1, 'one gallery survives');
  assert.equal(byType.get('links'), 1);
  assert.equal(byType.get('text'), 2, 'text blocks are many-per-mode and all survive');
  assert.equal(out.find((b) => b.type === 'gallery').items.length, 2,
    'the surviving gallery is the one with content, not the first one seen');
  assert.deepEqual(out.map((b) => b.order_index), [...out.map((b) => b.order_index)].sort((a, b) => a - b),
    'output stays ordered by order_index');
  ok('snapshot restore drops duplicate singleton blocks, keeping the populated one');
}

// ── 12. dedupe is a no-op on a clean payload ────────────────────────────────
{
  const clean = DEFAULT_TYPES.map((type, i) => ({
    type, title: type, is_enabled: true, order_index: i, items: [],
  }));
  const out = dedupeSingletonBlocks(clean);
  assert.equal(out.length, clean.length);
  assert.deepEqual(out.map((b) => b.type), clean.map((b) => b.type));
  ok('dedupe leaves a clean snapshot payload untouched, in order');
}

// ── 13. Events is a singleton per PAGE, and no seeder can mint a pair ───────
// TL.EVNT.SGL: the page holds ONE events block shared by both page styles.
// There is deliberately no DB floor for the page level (a trigger was ruled
// out), so the contract is: every page-singleton type is also a per-mode
// singleton, is never a default block, and appears in no shipped composition —
// leaving resolveBlockId (which creates page-wide, on the page1 mode) as the
// only way one is ever born.
{
  assert.deepEqual([...PAGE_SINGLETON_TYPES], ['events'],
    'PAGE_SINGLETON_TYPES changed — resolveBlockId, both composition replaces, the graft in Editor/PublicProfile, and BLOCK A of the TL.EVNT.SGL migration all assume exactly {events}');
  for (const type of PAGE_SINGLETON_TYPES) {
    assert.equal(isSingletonBlockType(type), true,
      `page-singleton '${type}' must also be singleton per mode (never in MANY_PER_MODE_TYPES)`);
  }
  assert.ok(!DEFAULT_BLOCK_TYPES.some((d) => PAGE_SINGLETON_TYPES.has(d.type)),
    'a page-singleton type in the default set would be seeded once PER MODE — the pair reborn');
  for (const preset of BLOCK_PRESETS) {
    assert.ok(!preset.blocks.some((b) => PAGE_SINGLETON_TYPES.has(b.type)),
      `BLOCK_PRESETS '${preset.key}' contains a page-singleton type — applyPreset/ensureSecondPage would mint a pair`);
  }
  for (const preset of TPL_PRESETS) {
    assert.ok(!(preset.composition ?? []).some((b) => PAGE_SINGLETON_TYPES.has(b.type)),
      `TPL preset '${preset.id}' contains a page-singleton type — a Layout apply would mint a pair`);
  }
  ok('events is a per-page singleton and no seeder or shipped composition can mint a pair');
}

// ── 14. collapsePageSingletonBlocks keeps the populated copy, homed on page1 ─
{
  const item = { label: 'x', url: '', order_index: 0 };
  const modes = [
    { type: 'page1', sticky: true, blocks: [
      { type: 'links', title: 'Links', is_enabled: true, order_index: 0, items: [item] },
      { type: 'events', title: 'Events A', is_enabled: true, order_index: 3, items: [] },
    ] },
    { type: 'page2', sticky: false, blocks: [
      { type: 'events', title: 'Events B', is_enabled: true, order_index: 1, items: [item, item] },
      { type: 'gallery', title: 'Gallery', is_enabled: true, order_index: 2, items: [] },
    ] },
  ];
  const out = collapsePageSingletonBlocks(modes);
  const p1 = out.find((m) => m.type === 'page1');
  const p2 = out.find((m) => m.type === 'page2');
  assert.deepEqual(p1.blocks.map((b) => b.title), ['Links', 'Events B'],
    'the populated copy wins the pair and is re-homed onto page1, sorted by its own order_index');
  assert.deepEqual(p2.blocks.map((b) => b.title), ['Gallery'],
    'the loser is dropped from page2');
  assert.equal(p1.sticky, true, 'non-block mode fields pass through untouched');
  ok('a snapshot pair collapses to the populated copy, homed on page1');
}

// ── 15. collapse tiebreak → page1; lone off-home copy re-homes; clean no-op ─
{
  const bothEmpty = collapsePageSingletonBlocks([
    { type: 'page1', blocks: [{ type: 'events', title: 'P1', is_enabled: true, order_index: 5, items: [] }] },
    { type: 'page2', blocks: [{ type: 'events', title: 'P2', is_enabled: true, order_index: 1, items: [] }] },
  ]);
  assert.deepEqual(bothEmpty.find((m) => m.type === 'page1').blocks.map((b) => b.title), ['P1'],
    'an all-empty pair resolves to the page1 copy');
  assert.equal(bothEmpty.find((m) => m.type === 'page2').blocks.length, 0);

  const loneOffHome = collapsePageSingletonBlocks([
    { type: 'page1', blocks: [] },
    { type: 'page2', blocks: [{ type: 'events', title: 'Only', is_enabled: true, order_index: 2, items: [] }] },
  ]);
  assert.deepEqual(loneOffHome.find((m) => m.type === 'page1').blocks.map((b) => b.title), ['Only'],
    'a lone copy living off-home is re-homed onto page1');
  assert.equal(loneOffHome.find((m) => m.type === 'page2').blocks.length, 0);

  const clean = [
    { type: 'page1', blocks: [{ type: 'links', title: 'Links', is_enabled: true, order_index: 0, items: [] }] },
    { type: 'page2', blocks: [{ type: 'gallery', title: 'Gallery', is_enabled: true, order_index: 0, items: [] }] },
  ];
  assert.equal(collapsePageSingletonBlocks(clean), clean,
    'a payload with no page-singleton blocks passes through by reference');
  ok('collapse tiebreaks to page1, re-homes a lone off-home copy, and no-ops cleanly');
}

console.log(`\n${passed} default-block assertions passed.`);
