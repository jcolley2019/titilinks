// TL.PLAT.HIDE.1 — unit test for src/lib/platform-catalog.ts: the picker view
// of the catalog hides Bigo Live and the four ADULT (18+) platforms, while the
// catalog itself still carries all five so icons, URL builders, the 18+ gate
// and saved-row preset lookups keep working for existing links.
//
// Reversibility is the contract: PICKER_CATALOG is DERIVED from
// PLATFORM_CATALOG by a `hidden` flag, never a second list. Removing the flag
// from an entry is the whole "bring it back" procedure, and this test is what
// notices if someone forks the list instead.
//
// Same convention as onb-preview.test.mjs: standalone node script, no DOM, no
// network. Run:
//   npx tsx scripts/platform-catalog.test.mjs

import assert from 'node:assert/strict';
import { PLATFORM_CATALOG, PICKER_CATALOG } from '../src/lib/platform-catalog';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

const HIDDEN = ['Bigo Live', 'OnlyFans', 'Fansly', 'Privacy', 'FatalFans'];
const ADULT = 'ADULT (18+)';

const labels = (catalog) => catalog.flatMap((c) => c.platforms.map((p) => p.label));
const allLabels = labels(PLATFORM_CATALOG);
const pickerLabels = labels(PICKER_CATALOG);

// ── the picker view hides exactly the five ──────────────────────────────────
for (const h of HIDDEN) {
  assert.ok(!pickerLabels.includes(h), `${h} must not be in PICKER_CATALOG`);
}
ok('PICKER_CATALOG contains none of the five hidden platforms');

assert.ok(!PICKER_CATALOG.some((c) => c.label === ADULT), 'ADULT (18+) must be dropped once empty');
ok('PICKER_CATALOG has no ADULT (18+) category');

// Every other category survives with its full count.
for (const cat of PLATFORM_CATALOG) {
  if (cat.label === ADULT) continue;
  const picked = PICKER_CATALOG.find((c) => c.label === cat.label);
  assert.ok(picked, `${cat.label} must survive in PICKER_CATALOG`);
  const expected = cat.platforms.filter((p) => !HIDDEN.includes(p.label)).length;
  assert.equal(picked.platforms.length, expected, `${cat.label} count`);
  // Bigo is the only ENTERTAINMENT entry hidden; every other category is intact.
  if (cat.label !== 'ENTERTAINMENT') assert.equal(picked.platforms.length, cat.platforms.length, `${cat.label} untouched`);
}
ok('every other category is present with its full count (ENTERTAINMENT minus Bigo only)');

assert.equal(pickerLabels.length, allLabels.length - 5, 'visible = total - 5');
ok(`visible count ${pickerLabels.length} = total ${allLabels.length} - 5`);

// ── the catalog itself still carries them (reversibility) ───────────────────
for (const h of HIDDEN) {
  const entry = PLATFORM_CATALOG.flatMap((c) => c.platforms).find((p) => p.label === h);
  assert.ok(entry, `${h} must still be in PLATFORM_CATALOG`);
  assert.equal(entry.hidden, true, `${h} is hidden via the flag`);
  assert.ok(entry.placeholder, `${h} keeps its placeholder for existing rows`);
}
ok('PLATFORM_CATALOG still contains all five, each flagged hidden: true');

assert.ok(PLATFORM_CATALOG.some((c) => c.label === ADULT), 'ADULT (18+) still exists in PLATFORM_CATALOG (adult-gate derives from it)');
ok('ADULT (18+) category still exists in PLATFORM_CATALOG for the 18+ gate');

// Nothing else is hidden — the flag is scoped to exactly these five.
const hiddenNow = PLATFORM_CATALOG.flatMap((c) => c.platforms).filter((p) => p.hidden).map((p) => p.label);
assert.deepEqual([...hiddenNow].sort(), [...HIDDEN].sort());
ok('exactly the five carry the hidden flag');

// Order is preserved — PICKER_CATALOG is a filter, not a re-sort.
const pickerOrder = PICKER_CATALOG.map((c) => c.label);
const expectedOrder = PLATFORM_CATALOG.map((c) => c.label).filter((l) => l !== ADULT);
assert.deepEqual(pickerOrder, expectedOrder);
ok('category order preserved');

console.log(`\nplatform-catalog: ${passed} checks passed`);
