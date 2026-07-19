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

console.log(`\nAll ${passed} tpl-presets checks passed.`);
