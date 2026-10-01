// TL.PLAN.ENFORCE.2 — unit checks for src/lib/plan-gate.ts, the visitor-side
// plan gate. Runner: tsx (same as scripts/animations.test.mjs); wired into
// `npm run guard`. Pure-function assertions — no DB, no React, no network.
//   npx tsx scripts/plan-gate.test.mjs

import assert from 'node:assert/strict';
import {
  gateBlocksForVisitor,
  gateFontForVisitor,
  gateThemeForVisitor,
  isAnimationLocked,
  isFontLocked,
  lockedBlockFeature,
  visiblePageCount,
} from '../src/lib/plan-gate';
import { ENTITLEMENTS, PLAN_ORDER } from '../src/lib/entitlements';
import { stripSampleItems } from '../src/lib/placeholder-item';
import { getThemeWithDefaults } from '../src/lib/theme-defaults';

let passed = 0;
const ok = (m) => { passed++; console.log('ok - ' + m); };

// ── 1. gateFontForVisitor (customFonts) ─────────────────────────────────────
assert.equal(gateFontForVisitor('free', 'custom:Brand Sans'), 'inter');
assert.equal(gateFontForVisitor(null, 'custom:Brand Sans'), 'inter', 'null plan is free');
assert.equal(gateFontForVisitor('pro', 'custom:Brand Sans'), 'custom:Brand Sans');
assert.equal(gateFontForVisitor('business', 'custom:Brand Sans'), 'custom:Brand Sans');
ok('custom: keys fall back to inter on free, pass through on pro/business');

for (const key of ['playfair', 'inter', 'modern', '', undefined, null]) {
  assert.equal(gateFontForVisitor('free', key), key, `non-custom ${String(key)} unchanged`);
}
ok('catalog / unknown / empty / absent keys pass through on free');

// ── 2. visiblePageCount (maxPages) ──────────────────────────────────────────
assert.equal(visiblePageCount('free', 2), 1);
assert.equal(visiblePageCount('free', 1), 1);
assert.equal(visiblePageCount(undefined, 2), 1);
assert.equal(visiblePageCount('pro', 2), 2);
assert.equal(visiblePageCount('pro', 1), 1, 'never more pages than exist');
assert.equal(visiblePageCount('business', 2), 2);
ok('visiblePageCount = min(pages, maxPages)');

// ── 3. gateBlocksForVisitor ─────────────────────────────────────────────────
const item = (id, extra = {}) => ({
  id, url: `https://fixture.titilinks.test/${id}`, label: id, image_url: null, style_json: null, ...extra,
});
const fixture = () => [
  { id: 'b-cta', type: 'primary_cta', order_index: 0,
    title: JSON.stringify({ style: { animation: 'pulse', shape: 'pill' } }), items: [item('cta')] },
  { id: 'b-links', type: 'links', order_index: 1, title: 'Links',
    items: [
      item('l1', { style_json: { animation: 'glow' } }),
      item('l2', { style_json: { animation: 'shake', border_width: 2 } }),
      item('l3', { style_json: { animation: 'none' } }),
      item('l4'),
    ] },
  { id: 'b-email', type: 'email_subscribe', order_index: 2, title: 'Email', items: [item('e', { url: '#' })] },
  { id: 'b-car', type: 'carousel', order_index: 3,
    title: JSON.stringify({ section_title: 'Picks', autoScroll: false }), items: [item('c1'), item('c2')] },
  { id: 'b-bio', type: 'bio', order_index: 4, title: 'not json', items: [item('bio', { url: '' })] },
];

{
  const blocks = fixture();
  assert.equal(gateBlocksForVisitor('pro', blocks), blocks, 'pro: same array back');
  assert.equal(gateBlocksForVisitor('business', blocks), blocks, 'business: same array back');
}
ok('a plan with every gated feature returns its input untouched');

{
  const blocks = fixture();
  const snapshot = JSON.stringify(blocks);
  const out = gateBlocksForVisitor('free', blocks);
  assert.equal(JSON.stringify(blocks), snapshot, 'input is never mutated');

  assert.deepEqual(out.map((b) => b.id), ['b-cta', 'b-links', 'b-car', 'b-bio'], 'email dropped, order kept');
  ok('free: email_subscribe dropped, the rest keep their order');

  const car = out.find((b) => b.id === 'b-car');
  const carIn = blocks.find((b) => b.id === 'b-car');
  assert.equal(car.type, 'links', 'carousel renders through the links path');
  assert.equal(car.order_index, carIn.order_index);
  assert.equal(car.title, carIn.title, 'title (carousel settings) kept');
  assert.deepEqual(car.items, carIn.items, 'items kept');
  ok('free: carousel → links, only the type changes');

  const cta = out.find((b) => b.id === 'b-cta');
  assert.deepEqual(JSON.parse(cta.title), { style: { shape: 'pill' } }, 'CTA title .style.animation stripped');
  const links = out.find((b) => b.id === 'b-links');
  assert.equal(links.items[0].style_json, null, 'animation-only style_json → null (LinksEditor save rule)');
  assert.deepEqual(links.items[1].style_json, { border_width: 2 }, 'other appearance keys survive');
  assert.deepEqual(links.items[2].style_json, { animation: 'none' }, "'none' is free and kept");
  assert.equal(links.items[3], blocks[1].items[3], 'animation-free item is the same object');
  assert.equal(links.title, 'Links', 'non-JSON title untouched');
  assert.equal(out.find((b) => b.id === 'b-bio').title, 'not json');
  ok('free: paintable animations stripped from style_json and title .style at render (saved rows untouched)');
}

// Order rule: gate FIRST, then samples. A carousel holding only samples, turned
// into links, is still a destination block and must vanish.
{
  const blocks = [
    { id: 'car', type: 'carousel', title: null,
      items: [{ url: 'https://example.com', image_url: null, style_json: null }] },
    { id: 'bio', type: 'bio', title: null, items: [] },
  ];
  const out = stripSampleItems(gateBlocksForVisitor('free', blocks));
  assert.deepEqual(out.map((b) => b.id), ['bio'], 'sample-only carousel-as-links dropped');
  ok('gate → strip samples → drop empty: a sample-only carousel still vanishes');
}

// Keyed on ENTITLEMENTS, not on plan names: every tier behaves as its flags say.
for (const plan of PLAN_ORDER) {
  const e = ENTITLEMENTS[plan];
  const out = gateBlocksForVisitor(plan, fixture());
  assert.equal(out.some((b) => b.type === 'email_subscribe'), e.emailSubscribe, `${plan}: email`);
  assert.equal(out.some((b) => b.type === 'carousel'), e.carousel, `${plan}: carousel`);
  const anim = out.find((b) => b.id === 'b-links').items[0].style_json?.animation === 'glow';
  assert.equal(anim, e.linkAnimations, `${plan}: animations`);
  assert.equal(visiblePageCount(plan, 2), e.maxPages, `${plan}: pages`);
  assert.equal(gateFontForVisitor(plan, 'custom:X') === 'custom:X', e.customFonts, `${plan}: fonts`);
}
ok('every tier follows its ENTITLEMENTS flags');

// ── 4. gateThemeForVisitor ──────────────────────────────────────────────────
{
  const theme = getThemeWithDefaults({
    typography: { font: 'custom:Brand Sans', text_color: '#fff' },
    buttons: { animation: 'pulse' },
  });
  assert.equal(gateThemeForVisitor('pro', theme), theme, 'pro: same theme back');
  const free = gateThemeForVisitor('free', theme);
  assert.equal(free.typography.font, 'inter');
  assert.equal(free.typography.text_color, '#fff', 'the rest of typography kept');
  assert.equal(free.buttons.animation, undefined, 'page-level animation stripped');
  assert.equal(free.buttons.fill_color, theme.buttons.fill_color, 'the rest of buttons kept');
  assert.equal(theme.typography.font, 'custom:Brand Sans', 'input not mutated');
  assert.equal(theme.buttons.animation, 'pulse', 'input not mutated');
  ok('free: theme font → inter, buttons.animation stripped, nothing else touched');

  const plain = getThemeWithDefaults({ typography: { font: 'playfair', text_color: '#fff' }, buttons: { animation: 'none' } });
  assert.equal(gateThemeForVisitor('free', plain), plain, "catalog font + 'none' animation: same theme back");
  ok('free: a theme with nothing gated comes back untouched');
}

// ── 5. Owner side (TL.PLAN.ENFORCE.3) — what the editor shows locked ───────
assert.equal(lockedBlockFeature('free', 'carousel'), 'carousel');
assert.equal(lockedBlockFeature('free', 'email_subscribe'), 'emailSubscribe');
assert.equal(lockedBlockFeature(null, 'carousel'), 'carousel', 'null plan is free');
for (const type of ['links', 'bio', 'primary_cta', 'gallery', 'text', 'events']) {
  assert.equal(lockedBlockFeature('free', type), null, `free: ${type} never locks`);
}
assert.equal(lockedBlockFeature('pro', 'carousel'), null);
assert.equal(lockedBlockFeature('business', 'email_subscribe'), null);
ok('lockedBlockFeature: carousel + email_subscribe lock on free only');

assert.equal(isFontLocked('free', 'custom:Brand Sans'), true);
assert.equal(isFontLocked('pro', 'custom:Brand Sans'), false);
for (const key of ['playfair', 'inter', '', undefined, null]) {
  assert.equal(isFontLocked('free', key), false, `free: ${String(key)} never locks`);
}
assert.equal(isAnimationLocked('free', 'pulse'), true);
assert.equal(isAnimationLocked('pro', 'pulse'), false);
for (const v of ['none', 'inherit', undefined, null, 'bogus']) {
  assert.equal(isAnimationLocked('free', v), false, `free: ${String(v)} never locks`);
}
ok('isFontLocked / isAnimationLocked: only custom: keys and paintable ids lock, on free only');

// The owner's lock and the visitor's gate are the SAME rule, per tier: an item
// is locked for the owner exactly when the visitor gets the Free render of it.
for (const plan of PLAN_ORDER) {
  const visitorBlocks = gateBlocksForVisitor(plan, fixture());
  const gotCarousel = visitorBlocks.some((b) => b.type === 'carousel');
  const gotEmail = visitorBlocks.some((b) => b.type === 'email_subscribe');
  assert.equal(lockedBlockFeature(plan, 'carousel') !== null, !gotCarousel, `${plan}: carousel`);
  assert.equal(lockedBlockFeature(plan, 'email_subscribe') !== null, !gotEmail, `${plan}: email`);
  assert.equal(isFontLocked(plan, 'custom:X'), gateFontForVisitor(plan, 'custom:X') !== 'custom:X', `${plan}: font`);
}
ok('owner lock == visitor gate on every tier');

console.log('\nAll ' + passed + ' checks passed.');
