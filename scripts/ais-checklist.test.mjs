// AIS.0b — unit test for the guided checklist's reality layer
// (src/lib/ais-checklist.ts).
//
// The repo has no unit-test runner; pure checks are standalone .mjs scripts run
// via `npx tsx` (see ais-recommend.test.mjs). Wired into `npm run guard`.
// Run: `npx tsx scripts/ais-checklist.test.mjs`.

import assert from 'node:assert/strict';
import {
  isChecklistItemDone,
  isInformationalItem,
  routeForChecklistItem,
  whatsappHasNumber,
  CHECKLIST_ROUTES,
  EMPTY_REALITY,
} from '../src/lib/ais-checklist';
import { recommendPresets, WIZARD_GOALS } from '../src/lib/ais-recommend';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

const reality = (over = {}) => ({ ...EMPTY_REALITY, ...over });

// ── 1. an empty page checks nothing ──────────────────────────────────────────
{
  for (const id of Object.keys(CHECKLIST_ROUTES)) {
    assert.equal(isChecklistItemDone(id, EMPTY_REALITY), false, `${id} unchecked on an empty page`);
  }
  ok('every checklist item starts unchecked on an empty page');
}

// ── 2. wa.me number detection (the subtle one) ───────────────────────────────
{
  // The presets seed a BARE wa.me link — looks like WhatsApp, reaches nobody.
  assert.equal(whatsappHasNumber('https://wa.me/'), false, 'bare wa.me has no number');
  assert.equal(whatsappHasNumber('https://wa.me/?text=Hola'), false, 'bare wa.me + prefill has no number');
  assert.equal(whatsappHasNumber(''), false, 'empty string');
  assert.equal(whatsappHasNumber(null), false, 'null');
  assert.equal(whatsappHasNumber(undefined), false, 'undefined');
  assert.equal(whatsappHasNumber('https://example.com/573001234567'), false, 'not a WhatsApp link');

  assert.equal(whatsappHasNumber('https://wa.me/573001234567'), true, 'number present');
  assert.equal(
    whatsappHasNumber('https://wa.me/573001234567?text=Hola%20quiero%20reservar'),
    true,
    'number + prefill message',
  );
  ok('whatsappHasNumber reads the digits between wa.me/ and the query string');
}

// ── 3. each rule reads its own field, and only its own ───────────────────────
{
  assert.equal(isChecklistItemDone('socials', reality({ socialCount: 1 })), true, 'one social link is enough');
  assert.equal(isChecklistItemDone('socials', reality({ socialCount: 0 })), false, 'no social links');

  // Either half of "photo OR video" satisfies the row.
  assert.equal(isChecklistItemDone('profileMedia', reality({ avatarUrl: 'https://x/a.jpg' })), true, 'photo alone');
  assert.equal(isChecklistItemDone('profileMedia', reality({ heroVideoUrl: 'https://x/v.mp4' })), true, 'video alone');
  assert.equal(isChecklistItemDone('profileMedia', reality({ avatarUrl: '   ' })), false, 'whitespace is not a photo');

  assert.equal(
    isChecklistItemDone('whatsapp', reality({ whatsappUrl: 'https://wa.me/573001234567' })),
    true,
    'wa.me with a number',
  );
  assert.equal(
    isChecklistItemDone('whatsapp', reality({ whatsappUrl: 'https://wa.me/' })),
    false,
    'seeded-but-empty wa.me stays unchecked',
  );

  assert.equal(isChecklistItemDone('bookingCta', reality({ primaryCtaUrl: 'https://cal.com/me' })), true, 'cta url set');
  assert.equal(isChecklistItemDone('bookingCta', reality({ primaryCtaUrl: '' })), false, 'empty cta url');
  assert.equal(isChecklistItemDone('bookingCta', reality({ primaryCtaUrl: '  ' })), false, 'whitespace cta url');

  assert.equal(isChecklistItemDone('products', reality({ productCount: 2 })), true, 'products present');
  assert.equal(isChecklistItemDone('products', reality({ productCount: 0 })), false, 'no products');

  // A fully-populated page must not leak a check into an unrelated row.
  const full = reality({
    socialCount: 3,
    avatarUrl: 'https://x/a.jpg',
    heroVideoUrl: 'https://x/v.mp4',
    whatsappUrl: 'https://wa.me/573001234567',
    primaryCtaUrl: 'https://cal.com/me',
    productCount: 5,
  });
  assert.equal(isChecklistItemDone('payout', full), false, 'payout never checks — nothing to satisfy yet');
  assert.equal(isChecklistItemDone('unknown-id', full), false, 'unknown ids are never checked');
  ok('each rule reads only its own field');
}

// ── 4. routes: payout is inert, everything else is reachable ─────────────────
{
  assert.equal(isInformationalItem('payout'), true, 'payout is informational');
  assert.equal(routeForChecklistItem('payout').kind, 'none', 'payout routes nowhere');
  assert.equal(routeForChecklistItem('nope').kind, 'none', 'unknown ids are inert, not a throw');

  assert.deepEqual(routeForChecklistItem('socials'), {
    kind: 'block', blockType: 'social_links', titleKey: 'dashboard.managePlatforms',
  }, 'socials → the Social Links editor');
  assert.deepEqual(routeForChecklistItem('whatsapp'), {
    kind: 'block', blockType: 'links', titleKey: 'dashboard.featuredLinks',
  }, 'whatsapp → the links block (item id supplied at tap time)');
  assert.deepEqual(routeForChecklistItem('bookingCta'), {
    kind: 'block', blockType: 'primary_cta', titleKey: 'dashboard.primaryCta',
  }, 'bookingCta → the Primary CTA editor');
  assert.deepEqual(routeForChecklistItem('products'), {
    kind: 'block', blockType: 'product_cards', titleKey: 'dashboard.newMerch',
  }, 'products → the Product Cards editor');
  assert.equal(routeForChecklistItem('profileMedia').kind, 'videoProfile', 'profileMedia → the Video Profile menu');
  ok('every non-informational item routes somewhere real');
}

// ── 5. the two modules agree — no orphan ids in either direction ─────────────
{
  const emitted = new Set();
  for (const g of WIZARD_GOALS) {
    for (const item of recommendPresets({ persona: 'creator', goal: g.id }).checklist) emitted.add(item.id);
  }
  for (const id of emitted) {
    assert.ok(id in CHECKLIST_ROUTES, `mapper item "${id}" has a route`);
  }
  for (const id of Object.keys(CHECKLIST_ROUTES)) {
    assert.ok(emitted.has(id), `route "${id}" is reachable from the mapper`);
  }
  ok('mapper ids and checklist routes are in exact correspondence');
}

console.log(`\nAll ${passed} ais-checklist checks passed.`);
