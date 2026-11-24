// FRAGILE.COLOR.1 — unit test for normalizeHexColor (src/lib/hex-color.ts) and
// the read repair in getThemeWithDefaults (src/lib/theme-defaults.ts). Same
// convention as the other scripts/*.test.mjs: standalone, run with
//   npx tsx scripts/hex-color.test.mjs

import assert from 'node:assert/strict';
import { normalizeHexColor } from '../src/lib/hex-color';
import { getThemeWithDefaults } from '../src/lib/theme-defaults';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

// ── accepts ──────────────────────────────────────────────────────────────────
const ACCEPT = [
  // valid six-digit: returned unchanged, case kept
  ['#FFC0CB', '#FFC0CB'],
  ['#ffc0cb', '#ffc0cb'],
  ['#0e0C09', '#0e0C09'],
  ['  #ABCDEF  ', '#ABCDEF'],
  // bare six-digit → '#' added, lowercase
  ['FFC0CB', '#ffc0cb'],
  ['ffc0cb', '#ffc0cb'],
  // three-digit, with and without '#'
  ['#FAB', '#ffaabb'],
  ['fab', '#ffaabb'],
  // four-digit → alpha dropped
  ['#FAB8', '#ffaabb'],
  ['fab0', '#ffaabb'],
  // eight-digit → alpha dropped
  ['#ffffff80', '#ffffff'],
  ['FFC0CB00', '#ffc0cb'],
];
for (const [input, want] of ACCEPT) {
  assert.equal(normalizeHexColor(input), want, `normalizeHexColor(${JSON.stringify(input)})`);
}
ok(`accepts ${ACCEPT.length} hex forms (six-digit case kept, others lowercase)`);

// ── rejects ──────────────────────────────────────────────────────────────────
const REJECT = [
  '#ff', 'ff', '#', '', '   ', '#fffff', '#fffffff', '#fffffffff',
  'rgba(0,0,0,.5)', 'rgb(255, 0, 0)', 'red', 'transparent',
  'linear-gradient(135deg, #ff0000, #0000ff)', '#ggg', '#12345g',
  undefined, null, 0, 0xffffff, {}, [], true,
];
for (const input of REJECT) {
  assert.equal(normalizeHexColor(input), null, `normalizeHexColor(${String(JSON.stringify(input))}) → null`);
}
ok(`rejects ${REJECT.length} non-hex inputs`);

// ── read repair ──────────────────────────────────────────────────────────────
{
  const t = getThemeWithDefaults({ background: { type: 'solid', solid_color: 'FFC0CB' }, typography: { text_color: '#ffffff80' } });
  assert.equal(t.background.solid_color, '#ffc0cb');
  assert.equal(t.typography.text_color, '#ffffff');
  ok('mistyped stored colours are repaired on read');
}
{
  const t = getThemeWithDefaults({ background: { type: 'solid', solid_color: '#FFC0CB' }, typography: { text_color: '#AbCdEf' } });
  assert.equal(t.background.solid_color, '#FFC0CB');
  assert.equal(t.typography.text_color, '#AbCdEf');
  ok('valid six-digit colours come out byte-identical');
}
{
  const grad = 'linear-gradient(135deg, #1a1a2e, #16213e)';
  const t = getThemeWithDefaults({ background: { type: 'solid', solid_color: grad }, typography: { text_color: 'rgba(0,0,0,.5)' } });
  assert.equal(t.background.solid_color, grad);
  assert.equal(t.typography.text_color, 'rgba(0,0,0,.5)');
  ok('values that do not normalise are left exactly as stored');
}
{
  const t = getThemeWithDefaults({});
  const d = getThemeWithDefaults(null);
  assert.deepEqual(t.background, d.background);
  assert.deepEqual(t.typography, d.typography);
  ok('defaults unchanged');
}

console.log(`\n${passed} hex-color checks passed.`);
