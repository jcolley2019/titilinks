// TPL.1 — unit test for resolveTplVariant (src/lib/tpl-presets.ts).
//
// The repo has no unit-test runner (Playwright covers e2e; the other pure
// checks are .mjs scripts run via tsx — see contrast-audit.mjs). This mirrors
// that convention: a standalone node script run with `npx tsx`, which resolves
// the .ts source directly. Run: `npx tsx scripts/tpl-presets.test.mjs`.
//
// SELF-FLAG: deliberately NOT wired into `npm run guard` — that would edit
// package.json, which is out of TPL.1's explicit staging scope. It runs as part
// of the verification gate instead.

import assert from 'node:assert/strict';
import { resolveTplVariant, TPL_PRESETS, TPL_CATEGORIES } from '../src/lib/tpl-presets';
import { CONTENT_MAP } from '../src/lib/content-i18n';
import { Constants } from '../src/integrations/supabase/types';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

// ── synthetic fixture (isolates the merge logic from the real data) ──────────
const BASE = {
  background: { type: 'solid', solid_color: '#0a0a0a', gradient_css: '', image_url: '', overlay_color: '#000000', overlay_opacity: 0, source: null },
  buttons: { shape: 'square', fill_color: '#ffffff', text_color: '#0a0a0a', border_enabled: false, border_color: '#ffffff', shadow_enabled: false, density: 'roomy' },
  typography: { font: 'serif', text_color: '#ffffff' },
  motion: { enabled: true },
};
const BASE_BLOCK_STYLES = { variant: 'filled', font_style: 'serif', letter_spacing: 0.05, background_opacity: 1 };

const preset = {
  id: 'fixture', name: 'Fixture', category: 'creator', description: 'tpl.desc.fixture',
  theme: BASE,
  blockStyles: BASE_BLOCK_STYLES,
  variants: {
    hero: { theme: { buttons: { ...BASE.buttons, shadow_enabled: true } } },
    full_bleed: {
      theme: { buttons: { ...BASE.buttons, variant: 'glass', outline_width: 0 } },
      blockStyles: { variant: 'glass' },
    },
  },
  composition: [],
};

// snapshot inputs to prove non-mutation later
const inputSnapshot = JSON.stringify({ theme: BASE, blockStyles: BASE_BLOCK_STYLES, variants: preset.variants });

// 1. base-only merge — an empty variant passes the base through untouched
const emptyVariants = { ...preset, variants: { hero: {}, full_bleed: {} } };
const baseOnly = resolveTplVariant(emptyVariants, 'hero');
assert.deepEqual(baseOnly.theme, BASE, 'base-only: theme equals base');
assert.deepEqual(baseOnly.blockStyles, BASE_BLOCK_STYLES, 'base-only: blockStyles equals base');
ok('base-only merge passes the base through untouched');

// 2. hero override wins; unspecified fields/sections inherit from base
const hero = resolveTplVariant(preset, 'hero');
assert.equal(hero.theme.buttons.shadow_enabled, true, 'hero: shadow override wins');
assert.equal(hero.theme.buttons.shape, 'square', 'hero: unchanged button fields inherit');
assert.equal(hero.theme.typography.font, 'serif', 'hero: untouched sections inherit');
assert.deepEqual(hero.blockStyles, BASE_BLOCK_STYLES, 'hero: blockStyles inherit (no override)');
ok('hero override wins and inherits the base');

// 3. full_bleed override wins and is independent of the hero variant
const fb = resolveTplVariant(preset, 'full_bleed');
assert.equal(fb.theme.buttons.variant, 'glass', 'full_bleed: theme override wins');
assert.equal(fb.blockStyles.variant, 'glass', 'full_bleed: blockStyles override wins');
assert.equal(fb.blockStyles.letter_spacing, 0.05, 'full_bleed: other blockStyles fields inherit');
assert.equal(fb.theme.buttons.shadow_enabled, false, 'full_bleed does NOT leak the hero override');
ok('full_bleed override wins, independent of the hero variant');

// 4. no mutation of inputs; a fresh object graph is returned
assert.equal(
  JSON.stringify({ theme: BASE, blockStyles: BASE_BLOCK_STYLES, variants: preset.variants }),
  inputSnapshot,
  'inputs are byte-identical after resolving',
);
assert.notEqual(hero.theme, BASE, 'returns a new theme object');
assert.notEqual(hero.theme.buttons, BASE.buttons, 'returns a new buttons object');
ok('resolveTplVariant does not mutate its inputs');

// 5. the real 'actriz' reference preset resolves for both page styles
const actriz = TPL_PRESETS.find((p) => p.id === 'actriz');
assert.ok(actriz, "'actriz' preset is registered");
for (const style of ['hero', 'full_bleed']) {
  const r = resolveTplVariant(actriz, style);
  for (const section of ['background', 'buttons', 'typography', 'motion']) {
    assert.ok(r.theme[section] && typeof r.theme[section] === 'object', `actriz/${style}: theme.${section} present`);
  }
}
assert.equal(actriz.composition.length, 5, 'actriz has a 5-block composition');
assert.equal(actriz.composition[0].type, 'primary_cta', 'actriz opens with primary_cta');
assert.equal(TPL_CATEGORIES.length, 8, 'all 8 categories are registered');
ok('actriz reference preset resolves for hero and full_bleed');

// ── TPL.4: the full seven-preset shelf ───────────────────────────────────────

// 6. every registered preset resolves BOTH variants to a complete theme, and
//    resolving never mutates the preset (deep snapshot compare).
for (const p of TPL_PRESETS) {
  const before = JSON.stringify(p);
  for (const style of ['hero', 'full_bleed']) {
    const r = resolveTplVariant(p, style);
    for (const section of ['background', 'buttons', 'typography', 'motion']) {
      assert.ok(r.theme[section] && typeof r.theme[section] === 'object', `${p.id}/${style}: theme.${section} present`);
    }
    assert.ok(r.blockStyles && typeof r.blockStyles === 'object', `${p.id}/${style}: blockStyles present`);
  }
  assert.equal(JSON.stringify(p), before, `${p.id}: not mutated by resolveTplVariant`);
}
ok('every preset resolves both variants without mutation');

// 7. every composition block uses a REAL block_type enum value.
const VALID_BLOCK_TYPES = new Set(Constants.public.Enums.block_type);
for (const p of TPL_PRESETS) {
  for (const b of p.composition) {
    assert.ok(VALID_BLOCK_TYPES.has(b.type), `${p.id}: block type '${b.type}' is a valid block_type`);
  }
}
ok('every composition block type is a valid block_type enum value');

// 8. every seeded English-canonical string (block title + item label/subtitle/
//    cta_label) is registered in CONTENT_MAP — no unmapped/untranslated content.
//    (url = real deep link, image_url = asset; neither is translated content.)
const unmapped = [];
for (const p of TPL_PRESETS) {
  for (const b of p.composition) {
    if (!(b.title in CONTENT_MAP)) unmapped.push(`${p.id}:title:${b.title}`);
    for (const it of b.items ?? []) {
      for (const field of ['label', 'subtitle', 'cta_label']) {
        const v = it[field];
        if (v !== undefined && !(v in CONTENT_MAP)) unmapped.push(`${p.id}:${field}:${v}`);
      }
    }
  }
}
assert.deepEqual(unmapped, [], `all seeded strings registered in CONTENT_MAP (unmapped: ${unmapped.join(', ')})`);
ok('every seeded title/label/subtitle/cta is registered in CONTENT_MAP');

// 9. the shelf is the full set: 8 presets, unique ids, each a registered category.
assert.equal(TPL_PRESETS.length, 8, 'the Layouts shelf has 8 presets');
const ids = TPL_PRESETS.map((p) => p.id);
assert.equal(new Set(ids).size, ids.length, 'preset ids are unique');
const catIds = new Set(TPL_CATEGORIES.map((c) => c.id));
for (const p of TPL_PRESETS) assert.ok(catIds.has(p.category), `${p.id}: category '${p.category}' is registered`);
ok('8 presets registered with unique ids and valid categories');

console.log(`\nAll ${passed} tpl-presets checks passed.`);
