// TPL.2 — unit test for the preset apply engine (src/lib/tpl-apply.ts).
//
// Same convention as tpl-presets.test.mjs: a standalone node script run with
// `npx tsx`, which resolves the .ts source directly. Run:
//   npx tsx scripts/tpl-apply.test.mjs
//
// The engine takes an injectable deps object ({ client, capture }); the module's
// production defaults are lazy dynamic imports, so importing it here never
// evaluates the real supabase client (which reads import.meta.env / browser
// globals and would crash under tsx). Every test injects a fake client + fake
// capture and asserts against a recorded event log — no network, no DB.

import assert from 'node:assert/strict';
import { applyTplPreset } from '../src/lib/tpl-apply';
import { TPL_PRESETS } from '../src/lib/tpl-presets';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

const ACTRIZ = TPL_PRESETS.find((p) => p.id === 'actriz');
assert.ok(ACTRIZ, "'actriz' preset is available to the engine test");

// ── fake supabase client + capture ───────────────────────────────────────────
// A chainable, thenable query builder. Each awaited terminal resolves to
// { data, error } based on (table, op, filters) and appends to `events` in the
// exact order the engine executes — so ordering assertions are real.

function makeHarness(overrides = {}) {
  const state = {
    page: overrides.page ?? { theme_json: {} },
    pageErr: overrides.pageErr ?? null,
    existingBlocks: overrides.existingBlocks ?? [
      { id: 'sl', type: 'social_links' },
      { id: 'sir', type: 'social_icon_row' },
      { id: 'pc-old', type: 'primary_cta' },
      { id: 'lk-old', type: 'links' },
      { id: 'bio-old', type: 'bio' },
    ],
    captureThrows: overrides.captureThrows ?? false,
    // recorded outputs
    writtenTheme: undefined,
    deletedBlockIds: undefined,
    insertedBlocks: undefined,
    insertedItems: undefined,
    styleWrites: [],
  };
  const events = [];

  const capture = async (pageId, name, kind) => {
    events.push({ kind: 'capture', pageId, name, snapKind: kind });
    if (state.captureThrows) throw new Error('capture failed');
    return { id: 'snap-1' };
  };

  function resolveOp(b) {
    const t = b._table, op = b._op;
    if (t === 'pages' && op === 'select') {
      events.push({ kind: 'pages.select' });
      return { data: state.page, error: state.pageErr };
    }
    if (t === 'pages' && op === 'update') {
      events.push({ kind: 'pages.update' });
      state.writtenTheme = b._payload.theme_json;
      return { data: null, error: null };
    }
    if (t === 'blocks' && op === 'select') {
      events.push({ kind: 'blocks.select' });
      return { data: state.existingBlocks, error: null };
    }
    if (t === 'blocks' && op === 'delete') {
      const ids = b._filters.id ?? [];
      events.push({ kind: 'blocks.delete', ids });
      state.deletedBlockIds = ids;
      return { data: null, error: null };
    }
    if (t === 'blocks' && op === 'insert') {
      // Mint an id per row keyed off the order_index the engine assigned.
      const rows = (b._payload ?? []).map((r) => ({ ...r, id: `blk-${r.order_index}` }));
      events.push({ kind: 'blocks.insert', rows });
      state.insertedBlocks = rows;
      return { data: rows, error: null }; // insert().select() returns the rows
    }
    if (t === 'blocks' && op === 'update') {
      const id = b._filters.id;
      events.push({ kind: 'blocks.update', id });
      state.styleWrites.push({ id, title: b._payload.title });
      return { data: null, error: null };
    }
    if (t === 'block_items' && op === 'delete') {
      events.push({ kind: 'block_items.delete', ids: b._filters.block_id ?? [] });
      return { data: null, error: null };
    }
    if (t === 'block_items' && op === 'insert') {
      events.push({ kind: 'block_items.insert' });
      state.insertedItems = b._payload;
      return { data: null, error: null };
    }
    throw new Error(`fake client: unhandled ${t}.${op}`);
  }

  function makeBuilder(table) {
    return {
      _table: table, _op: null, _payload: undefined, _select: undefined, _filters: {},
      select(cols) { this._select = cols; if (!this._op) this._op = 'select'; return this; },
      insert(rows) { this._op = 'insert'; this._payload = rows; return this; },
      update(vals) { this._op = 'update'; this._payload = vals; return this; },
      delete() { this._op = 'delete'; return this; },
      eq(col, val) { this._filters[col] = val; return this; },
      in(col, vals) { this._filters[col] = vals; return this; },
      single() { this._single = true; return this; },
      then(res, rej) { return Promise.resolve().then(() => resolveOp(this)).then(res, rej); },
    };
  }

  const client = { from: (t) => makeBuilder(t) };
  return { client, capture, events, state };
}

const baseOpts = (extra = {}) => ({
  pageId: 'page-1',
  modeId: 'mode-1',
  pageStyle: 'hero',
  preset: ACTRIZ,
  ...extra,
});

// ── 1. order of operations ───────────────────────────────────────────────────
{
  const h = makeHarness();
  await applyTplPreset(baseOpts(), { client: h.client, capture: h.capture });
  const seq = h.events.map((e) => e.kind);
  const idx = (k) => seq.indexOf(k);
  assert.equal(idx('capture'), 0, 'capture is the very first op');
  assert.ok(idx('capture') < idx('pages.update'), 'capture before theme update');
  assert.ok(idx('pages.update') < idx('block_items.delete'), 'theme update before item deletes');
  assert.ok(idx('pages.update') < idx('blocks.delete'), 'theme update before block deletes');
  assert.ok(idx('blocks.delete') < idx('blocks.insert'), 'deletes before block inserts');
  assert.ok(idx('block_items.delete') < idx('blocks.insert'), 'item deletes before block inserts');
  assert.ok(idx('blocks.insert') < idx('block_items.insert'), 'block inserts before item inserts');
  ok('order: capture → theme → deletes → block inserts → item inserts');
}

// ── 2. capture failure aborts the whole apply ────────────────────────────────
{
  const h = makeHarness({ captureThrows: true });
  await assert.rejects(
    () => applyTplPreset(baseOpts(), { client: h.client, capture: h.capture }),
    /capture failed/,
    'capture failure propagates',
  );
  const dbEvents = h.events.filter((e) => e.kind !== 'capture');
  assert.equal(dbEvents.length, 0, 'no DB op runs after a failed capture');
  ok('capture failure → nothing else called, error propagates');
}

// ── 3. header social blocks are never in the delete set ──────────────────────
{
  const h = makeHarness();
  await applyTplPreset(baseOpts(), { client: h.client, capture: h.capture });
  assert.ok(!h.state.deletedBlockIds.includes('sl'), 'social_links preserved (not deleted)');
  assert.ok(!h.state.deletedBlockIds.includes('sir'), 'social_icon_row preserved (not deleted)');
  assert.ok(
    h.state.deletedBlockIds.includes('pc-old') && h.state.deletedBlockIds.includes('lk-old') && h.state.deletedBlockIds.includes('bio-old'),
    'removable content blocks are deleted',
  );
  ok('header social blocks never enter the delete set');
}

// ── 4. seeded items: linkage, order_index, English-canonical actriz labels ───
{
  const h = makeHarness();
  await applyTplPreset(baseOpts(), { client: h.client, capture: h.capture });
  const items = h.state.insertedItems;
  const byLabel = Object.fromEntries(items.map((it) => [it.label, it]));

  // composition order: 0=primary_cta, 1=links, 2=gallery, 3=video_feed, 4=bio
  assert.ok(byLabel['Book Me'], "'Book Me' seeded (English-canonical)");
  assert.equal(byLabel['Book Me'].block_id, 'blk-0', 'Book Me linked to the primary_cta block (order 0)');
  assert.equal(byLabel['Book Me'].order_index, 0, 'Book Me is the first item of its block');
  assert.equal(byLabel['Book Me'].cta_label, 'Contact', 'cta_label carried through to block_items');

  assert.ok(byLabel['WhatsApp'], "'WhatsApp' seeded (English-canonical)");
  assert.equal(byLabel['WhatsApp'].block_id, 'blk-1', 'WhatsApp linked to the links block (order 1)');
  assert.equal(byLabel['WhatsApp'].order_index, 2, 'WhatsApp is the third link');
  assert.equal(byLabel['WhatsApp'].url, 'https://wa.me/', 'WhatsApp url carried');
  assert.ok(byLabel['My Website'] && byLabel['Press Kit'], 'other actriz links seeded');

  // gallery / video_feed / bio (blk-2..4) declare no items → seed nothing.
  assert.ok(
    !items.some((it) => ['blk-2', 'blk-3', 'blk-4'].includes(it.block_id)),
    'blocks with no item seeds receive no block_items',
  );
  ok('seeded items carry correct linkage, order_index, and canonical labels');
}

// ── 5. hero vs full_bleed resolve different themes (real resolveTplVariant) ──
{
  const hHero = makeHarness();
  await applyTplPreset(baseOpts({ pageStyle: 'hero' }), { client: hHero.client, capture: hHero.capture });
  const hFb = makeHarness();
  await applyTplPreset(baseOpts({ pageStyle: 'full_bleed' }), { client: hFb.client, capture: hFb.capture });

  const heroButtons = hHero.state.writtenTheme.buttons;
  const fbButtons = hFb.state.writtenTheme.buttons;
  assert.notDeepEqual(heroButtons, fbButtons, 'hero and full_bleed write different button themes');
  assert.equal(heroButtons.shadow_enabled, true, 'hero variant: shadow_enabled override applied');
  assert.equal(fbButtons.variant, 'glass', 'full_bleed variant: glass surface pre-declared');
  ok('hero vs full_bleed produce different resolved themes through the engine');
}

// ── 6. theme merge preserves a structural key + never writes pageStyle ───────
{
  // Existing raw theme carries a structural key (pages.enabled) AND a pageStyle.
  // The engine must keep both: it merges the visual theme over existing and
  // never emits pageStyle — so a preset can't flip hero <-> full_bleed even when
  // the caller passes the OPPOSITE pageStyle.
  const h = makeHarness({ page: { theme_json: { pages: { enabled: true }, pageStyle: 'hero', extra: 7 } } });
  await applyTplPreset(baseOpts({ pageStyle: 'full_bleed' }), { client: h.client, capture: h.capture });
  const written = h.state.writtenTheme;
  assert.equal(written.pages.enabled, true, 'existing pages.enabled survives the merge');
  assert.equal(written.extra, 7, 'unrelated existing structural keys survive');
  assert.equal(written.pageStyle, 'hero', 'existing pageStyle preserved; engine never writes/flips it');
  assert.ok(written.buttons && written.background && written.typography, 'incoming visual theme applied over existing');
  ok('theme merge preserves structural keys and strips incoming pageStyle');
}

console.log(`\nAll ${passed} tpl-apply checks passed.`);
