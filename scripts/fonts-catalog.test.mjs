// TP.F3 — unit checks for the font catalog (src/lib/fonts.ts) against the
// faces it declares (src/lib/fonts.css). Runner: tsx (same as
// scripts/page-look.test.mjs); wired into `npm run guard`. No DB, no React,
// no network — the module, the stylesheet and node_modules on disk.
//   npx tsx scripts/fonts-catalog.test.mjs
//
// The families and weights below are written from the TP.F3 brief, not read
// from the module, so a wrong family string or a missing weight fails here.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { FONT_OPTIONS, resolveFontFamily } from '../src/lib/fonts';

let passed = 0;
const ok = (m) => { passed++; console.log('ok - ' + m); };

const CSS = readFileSync(new URL('../src/lib/fonts.css', import.meta.url), 'utf8');
const nodeModule = (path) => new URL(`../node_modules/${path}`, import.meta.url);

/** Every @font-face block, parsed. Subset comes from the file name. */
const FACES = [...CSS.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
  const prop = (name) => body.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
  const src = prop('src') ?? '';
  const url = src.match(/url\('([^']+)'\)/)?.[1] ?? '';
  const file = url.split('/').pop() ?? '';
  return {
    family: (prop('font-family') ?? '').replace(/^'|'$/g, ''),
    style: prop('font-style'),
    weight: prop('font-weight'),
    display: prop('font-display'),
    format: src.match(/format\('([^']+)'\)/)?.[1],
    range: prop('unicode-range'),
    url,
    file,
    subset: /-latin-ext-/.test(file) ? 'latin-ext' : /-latin-/.test(file) ? 'latin' : '?',
  };
});
const facesOf = (family) => FACES.filter((f) => f.family === family);
const SUBSETS = ['latin', 'latin-ext'];

// ── 1. The three new keys resolve to their families ─────────────────────────
const NEW_FONTS = [
  { value: 'dmsans', label: 'DM Sans', fontFamily: "'DM Sans', sans-serif" },
  { value: 'barlow', label: 'Barlow Condensed', fontFamily: "'Barlow Condensed', sans-serif" },
  { value: 'sourceserif', label: 'Source Serif 4', fontFamily: "'Source Serif 4', serif" },
];
for (const want of NEW_FONTS) {
  assert.equal(resolveFontFamily(want.value), want.fontFamily, `${want.value} resolves to ${want.fontFamily}`);
  assert.deepEqual(FONT_OPTIONS.find((o) => o.value === want.value), want, `${want.value}: catalog entry`);
}
const keys = FONT_OPTIONS.map((o) => o.value);
const at = keys.indexOf('space');
assert.deepEqual(keys.slice(at, at + 5), ['space', 'dmsans', 'barlow', 'sourceserif', 'serif'], 'listed after Space Grotesk, before Georgia');
ok('dmsans, barlow and sourceserif resolve to their families, listed between space and serif');

// ── 2. Every quoted web font in the catalog has an @font-face ───────────────
const webFamilies = FONT_OPTIONS
  .map((o) => o.fontFamily.split(',')[0].trim())
  .filter((first) => /^'.+'$/.test(first))
  .map((first) => first.slice(1, -1))
  .filter((family) => family !== 'Inter'); // the 'inter' key has never loaded a webfont
assert.ok(webFamilies.length > 0, 'the catalog has quoted web families');
for (const family of webFamilies) {
  assert.ok(facesOf(family).length > 0, `fonts.css declares an @font-face for '${family}'`);
}
ok(`every quoted catalog family except Inter has an @font-face (${webFamilies.length} families)`);

// ── 3. Barlow Condensed: exactly 300–700, normal, both subsets ──────────────
const barlow = facesOf('Barlow Condensed');
const BARLOW_WEIGHTS = ['300', '400', '500', '600', '700'];
assert.deepEqual(
  barlow.map((f) => `${f.subset} ${f.weight} ${f.style}`).sort(),
  SUBSETS.flatMap((s) => BARLOW_WEIGHTS.map((w) => `${s} ${w} normal`)).sort(),
  'Barlow Condensed = five weights × latin + latin-ext, normal only',
);
for (const f of barlow) {
  assert.equal(f.display, 'swap', `${f.file}: font-display swap`);
  assert.equal(f.format, 'woff2', `${f.file}: woff2`);
  assert.ok(f.url.startsWith('@fontsource/barlow-condensed/files/'), `${f.file}: from @fontsource/barlow-condensed`);
  assert.equal(f.file, `barlow-condensed-${f.subset}-${f.weight}-normal.woff2`, `${f.file}: the package's file for that weight`);
}
ok('Barlow Condensed has exactly weights 300, 400, 500, 600, 700 in latin and latin-ext (10 blocks)');

// ── 4. Source Serif 4: wght normal + italic, both subsets, never opsz ───────
const sourceSerif = facesOf('Source Serif 4');
assert.deepEqual(
  sourceSerif.map((f) => `${f.subset} ${f.style}`).sort(),
  SUBSETS.flatMap((s) => [`${s} normal`, `${s} italic`]).sort(),
  'Source Serif 4 = normal + italic × latin + latin-ext',
);
for (const f of sourceSerif) {
  assert.ok(!/opsz/.test(f.url), `${f.file}: not an opsz file`);
  assert.equal(f.file, `source-serif-4-${f.subset}-wght-${f.style}.woff2`, `${f.file}: the wght file`);
  assert.ok(f.url.startsWith('@fontsource-variable/source-serif-4/files/'), `${f.file}: from @fontsource-variable/source-serif-4`);
  assert.equal(f.display, 'swap', `${f.file}: font-display swap`);
}
assert.equal(FACES.filter((f) => /source-serif-4/.test(f.url) && /opsz/.test(f.url)).length, 0, 'no opsz file anywhere');
assert.equal(facesOf('Source Serif 4 Variable').length, 0, "registered as 'Source Serif 4', not the package's 'Source Serif 4 Variable'");
ok('Source Serif 4 has normal and italic in latin and latin-ext (wght files, no opsz)');

// ── 5. Every package url() in fonts.css is on disk ──────────────────────────
const urls = [...CSS.matchAll(/url\('([^']+)'\)/g)].map(([, u]) => u);
assert.equal(urls.length, FACES.length, 'one url() per @font-face');
for (const u of urls) {
  assert.ok(u.startsWith('@fontsource'), `${u}: a Fontsource package path`);
  assert.ok(existsSync(nodeModule(u)), `${u}: exists under node_modules`);
}
ok(`every url() in fonts.css exists under node_modules (${urls.length} files)`);

console.log('\nAll ' + passed + ' checks passed.');
