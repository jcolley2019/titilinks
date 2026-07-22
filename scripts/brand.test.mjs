// BRAND.2 — unit test for the brand mapping + snapshot-guarded apply
// (src/lib/brand.ts). Same convention as tpl-apply.test.mjs: standalone node
// script run with `npx tsx`, injectable deps, fake client + capture, recorded
// event log — no network, no DB. Run:
//   npx tsx scripts/brand.test.mjs

import assert from 'node:assert/strict';
import {
  brandToThemePatch,
  mergeBrandPatch,
  parseBrandJson,
  applyBrandToPage,
} from '../src/lib/brand';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

// ── fake supabase client + capture ───────────────────────────────────────────

function makeHarness(overrides = {}) {
  const state = {
    page: overrides.page ?? { theme_json: {} },
    captureThrows: overrides.captureThrows ?? false,
    writtenTheme: undefined,
  };
  const events = [];

  const capture = async (pageId, name, kind) => {
    events.push({ kind: 'capture', pageId, name, snapKind: kind });
    if (state.captureThrows) throw new Error('capture failed');
    return { id: 'snap-1' };
  };

  const client = {
    from(table) {
      assert.equal(table, 'pages', 'the apply only touches pages');
      return {
        select() {
          return {
            eq() {
              return {
                async single() {
                  events.push({ kind: 'pages.select' });
                  return { data: state.page, error: null };
                },
              };
            },
          };
        },
        update(payload) {
          return {
            async eq() {
              events.push({ kind: 'pages.update' });
              state.writtenTheme = payload.theme_json;
              return { error: null };
            },
          };
        },
      };
    },
  };

  return { client, capture, events, state };
}

// ── brandToThemePatch — pure mapping ─────────────────────────────────────────

{
  const patch = brandToThemePatch({
    colors: { primary: '#C9A55C', accent: '#ff2266', background: '#0e0c09' },
    heading_font: 'custom:Brand Sans',
    body_font: 'lora',
  });
  assert.equal(patch.buttons.fill_color, '#C9A55C');
  // Designed pair via contrastTextFor: gold sits below the 0.5 luminance
  // threshold, so it pairs with white.
  assert.equal(patch.buttons.text_color, '#ffffff');
  assert.equal(patch.buttons.border_color, '#ff2266');
  assert.equal(patch.buttons.border_enabled, true);
  assert.deepEqual(patch.background, { type: 'solid', solid_color: '#0e0c09' });
  // Single page-font model: heading wins when both are set.
  assert.deepEqual(patch.typography, { font: 'custom:Brand Sans' });
  ok('full kit maps every modeled field, with the designed text pair');
}

{
  const patch = brandToThemePatch({ colors: { accent: '#ff2266' } });
  assert.deepEqual(patch.buttons, { border_color: '#ff2266', border_enabled: true });
  assert.equal(patch.background, undefined);
  assert.equal(patch.typography, undefined);
  ok('partial kit maps ONLY the present fields');
}

{
  const patch = brandToThemePatch({ body_font: 'space' });
  assert.deepEqual(patch.typography, { font: 'space' });
  assert.equal(patch.buttons, undefined);
  ok('body font maps to the page font when it is the only font set');
}

{
  assert.deepEqual(brandToThemePatch({}), {});
  assert.deepEqual(brandToThemePatch({ colors: {} }), {});
  ok('empty kit is a no-op patch');
}

{
  // The pair flips with the fill's luminance.
  assert.equal(brandToThemePatch({ colors: { primary: '#111111' } }).buttons.text_color, '#ffffff');
  assert.equal(brandToThemePatch({ colors: { primary: '#f5e9d0' } }).buttons.text_color, '#0e0c09');
  ok('the derived text pair follows the fill luminance both ways');
}

// ── mergeBrandPatch — unmapped fields survive ────────────────────────────────

{
  const existing = {
    background: { type: 'gradient', gradient_css: 'linear-gradient(x)', solid_color: '#123456', overlay_opacity: 0.4 },
    buttons: { shape: 'pill', fill_color: '#111111', text_color: '#ffffff', animation: 'pulse' },
    typography: { font: 'lora', text_color: '#eeeeee' },
    headerConfig: { iconSize: 'large', spacing: { nameHandle: 4 } },
    avatar_url_page2: 'https://x/avatar2.jpg',
    pages: { enabled: true },
  };
  const merged = mergeBrandPatch(existing, brandToThemePatch({
    colors: { primary: '#C9A55C', background: '#0e0c09' },
  }));
  // Mapped values landed…
  assert.equal(merged.buttons.fill_color, '#C9A55C');
  assert.equal(merged.background.solid_color, '#0e0c09');
  assert.equal(merged.background.type, 'solid');
  // …and everything unmapped is byte-identical.
  assert.equal(merged.buttons.shape, 'pill');
  assert.equal(merged.buttons.animation, 'pulse');
  assert.equal(merged.background.overlay_opacity, 0.4);
  assert.deepEqual(merged.typography, existing.typography);
  assert.deepEqual(merged.headerConfig, existing.headerConfig);
  assert.equal(merged.avatar_url_page2, existing.avatar_url_page2);
  assert.deepEqual(merged.pages, existing.pages);
  ok('merge leaves every unmapped theme field untouched (two-page keys included)');
}

// ── parseBrandJson — tolerant ────────────────────────────────────────────────

{
  assert.deepEqual(parseBrandJson(null), {});
  assert.deepEqual(parseBrandJson('junk'), {});
  assert.deepEqual(parseBrandJson({ colors: { primary: '', accent: '#f00' }, fonts: 'nope' }), {
    colors: { accent: '#f00' },
  });
  const kit = parseBrandJson({
    colors: { primary: '#C9A55C' },
    heading_font: 'custom:X',
    fonts: [{ family: 'X', url: 'https://x/f.woff2' }, { family: '', url: 'bad' }],
  });
  assert.deepEqual(kit.fonts, [{ family: 'X', url: 'https://x/f.woff2' }]);
  assert.equal(kit.heading_font, 'custom:X');
  ok('parseBrandJson drops malformed values, keeps valid ones');
}

// ── applyBrandToPage — snapshot-guarded ordering ─────────────────────────────

await (async () => {
  const h = makeHarness({
    page: { theme_json: { buttons: { shape: 'pill' }, headerConfig: { iconSize: 'large' } } },
  });
  const applied = await applyBrandToPage(
    { pageId: 'p1', brand: { colors: { primary: '#C9A55C' } }, autoSnapshotName: 'Antes de aplicar la marca' },
    { client: h.client, capture: h.capture },
  );
  assert.equal(applied, true);
  assert.deepEqual(h.events.map((e) => e.kind), ['capture', 'pages.select', 'pages.update']);
  assert.equal(h.events[0].snapKind, 'auto');
  assert.equal(h.events[0].name, 'Antes de aplicar la marca');
  assert.equal(h.state.writtenTheme.buttons.fill_color, '#C9A55C');
  assert.equal(h.state.writtenTheme.buttons.shape, 'pill');
  assert.equal(h.state.writtenTheme.headerConfig.iconSize, 'large');
  ok('apply order: auto capture → read → merged write');
})();

await (async () => {
  const h = makeHarness({ captureThrows: true });
  await assert.rejects(
    () => applyBrandToPage(
      { pageId: 'p1', brand: { colors: { primary: '#C9A55C' } } },
      { client: h.client, capture: h.capture },
    ),
    /capture failed/,
  );
  assert.deepEqual(h.events.map((e) => e.kind), ['capture']);
  assert.equal(h.state.writtenTheme, undefined);
  ok('capture failure aborts — nothing read, nothing written');
})();

await (async () => {
  const h = makeHarness();
  const applied = await applyBrandToPage(
    { pageId: 'p1', brand: {} },
    { client: h.client, capture: h.capture },
  );
  assert.equal(applied, false);
  assert.deepEqual(h.events, []);
  ok('empty kit: no capture, no reads, no writes');
})();

console.log(`\nAll ${passed} brand checks passed.`);
