// ANIM.1 — unit checks for the link-animation catalog and the apply-path reset.
// Runner: tsx (same as scripts/tpl-*.test.mjs); wired into `npm run guard`.
// Pure-data + pure-function assertions — no DB, no React, no supabase client.

import assert from 'node:assert/strict';
import {
  ANIMATIONS,
  ANIMATION_IDS,
  animationClass,
  isAnimationId,
  resolveAnimation,
} from '../src/lib/animations';
import {
  PER_ITEM_APPEARANCE_KEYS,
  PRESERVED_THEME_KEYS,
  resetItemAppearanceStyleJson,
  stripPreservedThemeKeys,
} from '../src/lib/tpl-apply';

let passed = 0;
const ok = (m) => { passed++; console.log('ok - ' + m); };

// ── 1. Catalog integrity ───────────────────────────────────────────────────
assert.equal(ANIMATIONS.length, 6, 'exactly six options');
ok('catalog has six options');

const ids = ANIMATIONS.map((a) => a.id);
assert.deepEqual(ids, ['none', 'pulse', 'shimmer', 'bounce', 'glow', 'shake'], 'ids in order');
ok('ids are none/pulse/shimmer/bounce/glow/shake in order');

assert.equal(ids[0], 'none', 'none is first (the always-free default)');
ok('none is the first option');

assert.deepEqual([...ANIMATION_IDS], ids, 'ANIMATION_IDS mirrors the catalog');
ok('ANIMATION_IDS mirrors the catalog order');

for (const opt of ANIMATIONS) {
  assert.equal(typeof opt.labelKey, 'string', `${opt.id} has a label key`);
  assert.ok(opt.labelKey.startsWith('linksEditor.animation'), `${opt.id} label key namespaced`);
}
ok('every option carries a namespaced i18n label key');

// label keys are unique
assert.equal(new Set(ANIMATIONS.map((a) => a.labelKey)).size, 6, 'label keys unique');
ok('label keys are unique');

// ── 2. Class contract ───────────────────────────────────────────────────────
assert.equal(animationClass('none'), '', "none → no class");
assert.equal(animationClass('pulse'), 'lb-anim-pulse', 'pulse → lb-anim-pulse');
assert.equal(animationClass('shimmer'), 'lb-anim-shimmer', 'shimmer → lb-anim-shimmer');
assert.equal(animationClass('shake'), 'lb-anim-shake', 'shake → lb-anim-shake');
ok('animationClass maps real ids to lb-anim-<id>');

assert.equal(animationClass('bogus'), '', 'unknown id → no class');
assert.equal(animationClass(undefined), '', 'undefined → no class');
assert.equal(animationClass(null), '', 'null → no class');
assert.equal(animationClass(42), '', 'non-string → no class');
ok('animationClass rejects unknown / non-string values');

assert.equal(isAnimationId('pulse'), true);
assert.equal(isAnimationId('none'), false, "none is not a paintable effect");
assert.equal(isAnimationId('nope'), false);
ok('isAnimationId narrows to non-default effects only');

// ── 3. Apply-path reset now includes `animation` ────────────────────────────
assert.ok(PER_ITEM_APPEARANCE_KEYS.includes('animation'), 'reset list includes animation');
ok('PER_ITEM_APPEARANCE_KEYS includes animation');

// the pre-existing appearance keys must remain in the reset list (regression)
for (const k of ['border_color', 'border_width', 'bg_gradient']) {
  assert.ok(PER_ITEM_APPEARANCE_KEYS.includes(k), `reset list keeps ${k}`);
}
ok('reset list still owns border_color / border_width / bg_gradient');

// a Styles/Layout apply strips animation alongside colors, keeping content keys
{
  const { next, hadAppearance } = resetItemAppearanceStyleJson({
    animation: 'pulse',
    border_color: '#ff6600',
    bg_gradient: { from: '#000', to: '#fff' },
    icon_source: 'avatar', // content key — must survive
  });
  assert.equal(hadAppearance, true, 'appearance detected');
  assert.equal(next.animation, undefined, 'animation stripped');
  assert.equal(next.border_color, undefined, 'border_color stripped');
  assert.equal(next.bg_gradient, undefined, 'bg_gradient stripped');
  assert.equal(next.icon_source, 'avatar', 'content key preserved');
}
ok('resetItemAppearanceStyleJson strips animation but preserves content keys');

// animation-only style_json collapses to null once cleared
{
  const { next, hadAppearance } = resetItemAppearanceStyleJson({ animation: 'glow' });
  assert.equal(hadAppearance, true, 'animation counts as appearance');
  assert.equal(next, null, 'nothing left → null');
}
ok('an animation-only override resets to null');

// clean / non-object inputs are no-ops
for (const empty of [null, undefined, {}, [], 'x', 5]) {
  const { next, hadAppearance } = resetItemAppearanceStyleJson(empty);
  assert.equal(hadAppearance, false, 'no appearance on clean input');
  assert.equal(next, null, 'clean input → null');
}
ok('clean or non-object style_json is a no-op');

// ── 4. ANIM.2 resolveAnimation — inherit / override / none matrix ───────────
// Per-item wins when it says anything valid; absent/junk inherits the page;
// an explicit item 'none' is deliberate stillness that beats a page value.
assert.equal(resolveAnimation(undefined, undefined), 'none', 'nothing set → none');
assert.equal(resolveAnimation(null, null), 'none', 'nulls → none');
ok('no page value + no item value → none');

assert.equal(resolveAnimation('glow', undefined), 'glow', 'item absent inherits page');
assert.equal(resolveAnimation('glow', null), 'glow', 'item null inherits page');
ok('an unset item inherits the page-level effect');

assert.equal(resolveAnimation(undefined, 'pulse'), 'pulse', 'item effect with no page');
assert.equal(resolveAnimation('glow', 'pulse'), 'pulse', 'item effect beats page');
ok('a per-item effect overrides the page-level effect');

assert.equal(resolveAnimation('glow', 'none'), 'none', "item 'none' beats page");
assert.equal(resolveAnimation(undefined, 'none'), 'none', "item 'none' with no page");
ok("an explicit per-item 'none' holds the button still against a page value");

assert.equal(resolveAnimation('none', undefined), 'none', "page 'none' → none");
assert.equal(resolveAnimation('bogus', undefined), 'none', 'junk page value → none');
assert.equal(resolveAnimation(42, undefined), 'none', 'non-string page value → none');
assert.equal(resolveAnimation('glow', 'bogus'), 'glow', 'junk item value inherits page');
assert.equal(resolveAnimation('glow', 42), 'glow', 'non-string item value inherits page');
ok('junk on either side degrades safely (item → inherit, page → none)');

// ── 5. ANIM.2 template interaction ──────────────────────────────────────────
// Page-level animation is TEMPLATE-STYLABLE: it must NOT be preserved across a
// preset apply — presets may set (or clear, via wholesale buttons replace) it.
assert.ok(!PRESERVED_THEME_KEYS.includes('animation'), 'animation not a preserved key');
{
  const stripped = stripPreservedThemeKeys({
    pageStyle: 'hero',
    buttons: { shape: 'pill', animation: 'pulse' },
  });
  assert.equal(stripped.pageStyle, undefined, 'pageStyle stripped (control)');
  assert.equal(stripped.buttons.animation, 'pulse', 'incoming buttons.animation survives');
}
ok('page-level animation is template-stylable (survives stripPreservedThemeKeys)');
// Per-item values keep being reset by applies (TPL.5): covered by section 3
// above — PER_ITEM_APPEARANCE_KEYS includes `animation` and the reset strips it.

console.log('\nAll ' + passed + ' checks passed.');
