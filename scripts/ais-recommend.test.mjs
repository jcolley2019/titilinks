// AIS.0 — unit test for recommendPresets (src/lib/ais-recommend.ts).
//
// The repo has no unit-test runner; pure checks are standalone .mjs scripts run
// via `npx tsx` (see tpl-presets.test.mjs). Wired into `npm run guard`.
// Run: `npx tsx scripts/ais-recommend.test.mjs`.

import assert from 'node:assert/strict';
import {
  recommendPresets,
  WIZARD_PERSONAS,
  WIZARD_GOALS,
} from '../src/lib/ais-recommend';
import { TPL_PRESETS, TPL_CATEGORIES } from '../src/lib/tpl-presets';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

const PRESET_IDS = new Set(TPL_PRESETS.map((p) => p.id));
const CATEGORY_IDS = new Set(TPL_CATEGORIES.map((c) => c.id));

// ── 1. option catalogs are well-formed ───────────────────────────────────────
{
  assert.equal(WIZARD_PERSONAS.length, 8, 'eight personas (1 per category)');
  assert.equal(WIZARD_GOALS.length, 3, 'three goals');
  // Every persona id is a real TplCategory, 1:1 (no dupes, full coverage).
  const personaIds = WIZARD_PERSONAS.map((p) => p.id);
  assert.equal(new Set(personaIds).size, 8, 'persona ids are unique');
  for (const id of personaIds) assert.ok(CATEGORY_IDS.has(id), `persona ${id} is a TplCategory`);
  assert.equal(
    [...CATEGORY_IDS].every((c) => personaIds.includes(c)),
    true,
    'personas cover every TplCategory',
  );
  const goalIds = WIZARD_GOALS.map((g) => g.id);
  assert.deepEqual([...goalIds].sort(), ['get_messages', 'grow_audience', 'sell'], 'goal ids');
  ok('option catalogs are well-formed');
}

// ── 2. every Q1×Q2 combination → valid pair + non-empty checklist ─────────────
{
  let combos = 0;
  for (const persona of WIZARD_PERSONAS.map((p) => p.id)) {
    for (const goal of WIZARD_GOALS.map((g) => g.id)) {
      combos++;
      const rec = recommendPresets({ persona, goal });

      // top + alternate are real presets from the shelf.
      assert.ok(rec.top && PRESET_IDS.has(rec.top.id), `${persona}/${goal}: top is a real preset`);
      assert.ok(
        rec.alternate && PRESET_IDS.has(rec.alternate.id),
        `${persona}/${goal}: alternate is a real preset`,
      );

      // The invariant: top ≠ alternate for EVERY combination.
      assert.notEqual(
        rec.top.id,
        rec.alternate.id,
        `${persona}/${goal}: top (${rec.top.id}) !== alternate (${rec.alternate.id})`,
      );

      // Top pick is the persona's own category.
      assert.equal(rec.top.category, persona, `${persona}/${goal}: top pick matches persona`);

      // Checklist is non-empty and every item carries an id + labelKey.
      assert.ok(Array.isArray(rec.checklist) && rec.checklist.length > 0, `${persona}/${goal}: checklist non-empty`);
      for (const item of rec.checklist) {
        assert.ok(item.id && typeof item.id === 'string', `${persona}/${goal}: item has id`);
        assert.ok(
          item.labelKey && item.labelKey.startsWith('wizard.checklist.'),
          `${persona}/${goal}: item labelKey is a wizard.checklist.* key`,
        );
      }
    }
  }
  assert.equal(combos, 24, 'exercised all 8×3 combinations');
  ok('every Q1×Q2 combination returns a valid pair + non-empty checklist');
}

// ── 3. goal drives the checklist deterministically ────────────────────────────
{
  // Checklist depends ONLY on the goal (not the persona) — pick any persona.
  const persona = 'creator';
  const messages = recommendPresets({ persona, goal: 'get_messages' }).checklist.map((i) => i.labelKey);
  const sell = recommendPresets({ persona, goal: 'sell' }).checklist.map((i) => i.labelKey);
  const grow = recommendPresets({ persona, goal: 'grow_audience' }).checklist.map((i) => i.labelKey);

  assert.deepEqual(messages, ['wizard.checklist.whatsapp', 'wizard.checklist.bookingCta'], 'get_messages checklist');
  assert.deepEqual(sell, ['wizard.checklist.products', 'wizard.checklist.payout'], 'sell checklist');
  assert.deepEqual(grow, ['wizard.checklist.socials', 'wizard.checklist.profileMedia'], 'grow_audience checklist');

  // Same goal, different persona → same checklist.
  assert.deepEqual(
    recommendPresets({ persona: 'store', goal: 'sell' }).checklist.map((i) => i.labelKey),
    sell,
    'checklist is persona-independent',
  );
  ok('goal drives the checklist deterministically');
}

// ── 4. goal biases the alternate (with de-collided edge cases) ────────────────
{
  // sell → store composition, unless the persona already IS store.
  assert.equal(recommendPresets({ persona: 'creator', goal: 'sell' }).alternate.category, 'store', 'sell → tienda');
  assert.equal(
    recommendPresets({ persona: 'store', goal: 'sell' }).alternate.category,
    'local_business',
    'sell + store persona → local_business (no self-collision)',
  );

  // get_messages → booking composition, unless the persona already IS booking.
  assert.equal(
    recommendPresets({ persona: 'creator', goal: 'get_messages' }).alternate.category,
    'booking',
    'get_messages → reserva',
  );
  assert.equal(
    recommendPresets({ persona: 'booking', goal: 'get_messages' }).alternate.category,
    'local_business',
    'get_messages + booking persona → local_business (no self-collision)',
  );

  // grow_audience → media|music affinity; the two potential self-collisions flip.
  assert.equal(
    recommendPresets({ persona: 'music', goal: 'grow_audience' }).alternate.category,
    'media',
    'grow + music persona → media (top is música)',
  );
  assert.equal(
    recommendPresets({ persona: 'media', goal: 'grow_audience' }).alternate.category,
    'music',
    'grow + media persona → music (top is estudio)',
  );
  ok('goal biases the alternate with de-collided edge cases');
}

// ── 5. purity — recommendPresets never mutates the shelf ──────────────────────
{
  const before = JSON.stringify(TPL_PRESETS);
  for (const persona of WIZARD_PERSONAS.map((p) => p.id)) {
    for (const goal of WIZARD_GOALS.map((g) => g.id)) recommendPresets({ persona, goal });
  }
  assert.equal(JSON.stringify(TPL_PRESETS), before, 'TPL_PRESETS unchanged after 24 calls');
  ok('recommendPresets is pure (no shelf mutation)');
}

console.log(`\nAll ${passed} ais-recommend checks passed.`);
