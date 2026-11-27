// PHOTO.POLISH.1 — unit test for the hero's Auto enhance glue (src/lib/hero-enhance.ts).
//
// The repo has no unit-test runner; pure checks are standalone .mjs scripts run
// via `npx tsx` (see auto-enhance.test.mjs). Wired into `npm run guard` right
// after auto-enhance.test.mjs.
// Run: `npx tsx scripts/hero-enhance.test.mjs`.
//
// The module reads and writes one stored key and does two things to a canvas.
// The canvas here is a plain object over an RGBA array (getImageData /
// putImageData only), so everything runs with no browser.

import assert from 'node:assert/strict';
import {
  readHeroEnhance,
  writeHeroEnhance,
  sameHeroEnhance,
  analyzeForEnhance,
  enhanceCanvas,
  downsampleRgba,
  ENHANCE_ANALYSIS_PX,
} from '../src/lib/hero-enhance';
import {
  analyzePhoto,
  applyEnhance,
  sanitizeParams,
  isIdentity,
  IDENTITY_PARAMS,
  GAMMA_MAX,
} from '../src/lib/auto-enhance';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };
const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// ── a canvas with no browser ─────────────────────────────────────────────────
function fakeCanvas(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b] = paint(x, y);
    const i = (y * width + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  const reads = [];
  const ctx = {
    getImageData(x, y, w, h) {
      reads.push({ x, y, w, h });
      const out = new Uint8ClampedArray(w * h * 4);
      for (let row = 0; row < h; row++) {
        const from = ((y + row) * width + x) * 4;
        out.set(data.subarray(from, from + w * 4), row * w * 4);
      }
      return { data: out, width: w, height: h };
    },
    putImageData(img, x, y) {
      for (let row = 0; row < img.height; row++) {
        data.set(img.data.subarray(row * img.width * 4, (row + 1) * img.width * 4), ((y + row) * width + x) * 4);
      }
    },
  };
  return { width, height, data, reads, getContext: (kind) => (kind === '2d' ? ctx : null) };
}

// A dim, photo-like mid-grey area: soft gradients and per-pixel grain, so no
// stage of the analysis short-circuits (a flat fill would be "a graphic").
let seed = 12345;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const AREA_W = 300, AREA_H = 400;
const areaPixels = [];
for (let y = 0; y < AREA_H; y++) for (let x = 0; x < AREA_W; x++) {
  const base = 40 + 50 * (x / AREA_W) + 30 * Math.sin((y / AREA_H) * Math.PI);
  const n = (rand() - 0.5) * 16;
  areaPixels.push([base + n + 6, base + n, base + n - 8]);
}
const areaAt = (x, y) => areaPixels[y * AREA_W + x];

// ── 1. read / write / junk ───────────────────────────────────────────────────
{
  const params = analyzePhoto(fakeCanvas(AREA_W, AREA_H, areaAt).data, AREA_W, AREA_H);
  assert.ok(!isIdentity(params), 'control: the dim area is something to enhance');

  const slot = { fit: 'fill', posY: 40, window: { crop: { x: 1, y: 2, w: 3, h: 4 }, crop_aspect: 0.8 } };
  const written = writeHeroEnhance(slot, { strength: 0.5, params });
  assert.deepEqual(Object.keys(written).sort(), ['enhance', 'fit', 'posY', 'window'], 'the key is added beside the others');
  assert.deepEqual(slot, { fit: 'fill', posY: 40, window: { crop: { x: 1, y: 2, w: 3, h: 4 }, crop_aspect: 0.8 } }, 'the input is not mutated');
  assert.equal(written.fit, 'fill');
  assert.deepEqual(written.window, slot.window, 'every other key is kept');
  const back = readHeroEnhance(written);
  assert.equal(back.strength, 0.5);
  assert.deepEqual(back.params, params, 'params round-trip');
  assert.ok(sameHeroEnhance(back, { strength: 0.5, params }), 'sameHeroEnhance: the value read is the value written');
  assert.ok(!sameHeroEnhance(back, { strength: 0.6, params }), 'sameHeroEnhance: another strength differs');
  assert.ok(!sameHeroEnhance(back, null) && sameHeroEnhance(null, undefined), 'sameHeroEnhance: off equals only off');
  // JSON round-trip (what the row does).
  assert.deepEqual(readHeroEnhance(JSON.parse(JSON.stringify(written))), back, 'survives JSON');

  // Removing.
  const removed = writeHeroEnhance(written, null);
  assert.deepEqual(Object.keys(removed).sort(), ['fit', 'posY', 'window'], 'null removes the key and nothing else');
  assert.equal(readHeroEnhance(removed), null);
  assert.ok('enhance' in written, 'removing does not mutate its input');
  assert.deepEqual(writeHeroEnhance(undefined, null), {}, 'no slot, nothing to write: an empty slot');
  assert.deepEqual(Object.keys(writeHeroEnhance(null, { strength: 1, params })), ['enhance'], 'no slot: the key alone');

  // Strength: above 0 up to 1.
  assert.equal(readHeroEnhance(writeHeroEnhance({}, { strength: 1, params })).strength, 1);
  assert.equal(readHeroEnhance(writeHeroEnhance({}, { strength: 7, params })).strength, 1, 'a strength over 1 is 1');
  for (const bad of [0, -0.5, NaN, Infinity, '0.5', null, undefined]) {
    assert.equal('enhance' in writeHeroEnhance({ fit: 'fill' }, { strength: bad, params }), false, `strength ${String(bad)} writes nothing`);
    assert.equal(readHeroEnhance({ enhance: { strength: bad, params } }), null, `stored strength ${String(bad)} reads as off`);
  }
  assert.equal(readHeroEnhance({ enhance: { strength: 4, params } }).strength, 1, 'a stored strength over 1 reads as 1');

  // Junk slots and junk values read as off.
  for (const bad of [null, undefined, 'x', 7, [], {}, { enhance: null }, { enhance: 'on' }, { enhance: [] }, { enhance: {} },
    { enhance: { strength: 0.5 } }, { enhance: { strength: 0.5, params: 'p' } }, { enhance: { strength: 0.5, params: [] } }]) {
    assert.equal(readHeroEnhance(bad), null, `${JSON.stringify(bad)} reads as off`);
  }
  assert.equal('enhance' in writeHeroEnhance({}, { strength: 0.5 }), false, 'a value with no params writes nothing');
  assert.equal('enhance' in writeHeroEnhance({}, 'on'), false, 'a junk value writes nothing');

  // Params come back inside every cap, whatever was stored.
  const wild = readHeroEnhance({ enhance: { strength: 0.5, params: { gamma: 99, sharpen: 'lots', vibrance: -3, blackPoint: NaN } } });
  assert.deepEqual(wild.params, sanitizeParams({ gamma: 99 }), 'stored junk params are clamped / dropped to identity');
  assert.equal(wild.params.gamma, GAMMA_MAX);
  assert.deepEqual(writeHeroEnhance({}, { strength: 0.5, params: { gamma: 99 } }).enhance.params, sanitizeParams({ gamma: 99 }), 'written params are clamped too');
  ok('read / write: round-trip, removal, strength above 0 up to 1, junk reads as off, params inside the caps');
}

// ── 2. the analysis ignores the margin ───────────────────────────────────────
{
  const alone = fakeCanvas(AREA_W, AREA_H, areaAt);
  const wantAlone = analyzeForEnhance(alone, null);
  assert.ok(!isIdentity(wantAlone), 'control: the area alone asks for an enhancement');

  // The same area inside a black margin: 180 px left and right, 120 above, 200 below.
  const MX = 180, MY = 120;
  const W = AREA_W + 2 * MX, H = AREA_H + MY + 200;
  const framed = { x: MX, y: MY, width: AREA_W, height: AREA_H };
  const inMargin = fakeCanvas(W, H, (x, y) =>
    x >= MX && x < MX + AREA_W && y >= MY && y < MY + AREA_H ? areaAt(x - MX, y - MY) : [0, 0, 0]);
  const got = analyzeForEnhance(inMargin, framed);
  assert.deepEqual(got, wantAlone, 'the framed area inside a black margin gives the params of the area alone');
  assert.deepEqual(inMargin.reads, [{ x: MX, y: MY, w: AREA_W, h: AREA_H }], 'only the framed rectangle was read');

  // Control: reading the margin too gives other numbers — so the rectangle matters.
  const whole = analyzeForEnhance(inMargin, null);
  assert.notDeepEqual(whole, wantAlone, 'control: the whole canvas (margin included) analyses differently');
  assert.deepEqual(analyzeForEnhance(inMargin), whole, 'no rectangle = the whole picture');

  // The analysis reads a downsample of about 256 px on the long side.
  const small = downsampleRgba(alone.data, AREA_W, AREA_H);
  assert.equal(Math.max(small.width, small.height), ENHANCE_ANALYSIS_PX, 'long side 256');
  assert.equal(small.width, Math.round((AREA_W * ENHANCE_ANALYSIS_PX) / AREA_H), 'aspect kept');
  assert.deepEqual(wantAlone, analyzePhoto(small.data, small.width, small.height), 'analyzeForEnhance == analyzePhoto on that downsample');
  const tiny = new Uint8ClampedArray(4 * 4 * 4).fill(9);
  assert.equal(downsampleRgba(tiny, 4, 4).data, tiny, 'a picture inside the bound is never upscaled');
  // A box average: a 2×2 block of 0 / 255 comes back mid-grey.
  const checker = new Uint8ClampedArray(600 * 600 * 4);
  for (let p = 0; p < 600 * 600; p++) { const v = ((p % 600) + Math.floor(p / 600)) % 2 ? 255 : 0; checker.set([v, v, v, 255], p * 4); }
  const avg = downsampleRgba(checker, 600, 600, 300);
  assert.ok(avg.data.every((v, i) => (i % 4 === 3 ? v === 255 : v === 128)), 'box average, not point sampling');

  // A rectangle that hangs off the canvas is clamped; an unusable one means the whole picture.
  const hang = fakeCanvas(W, H, (x, y) => (x >= MX && x < MX + AREA_W && y >= MY && y < MY + AREA_H ? areaAt(x - MX, y - MY) : [0, 0, 0]));
  analyzeForEnhance(hang, { x: W - 50, y: H - 40, width: 500, height: 500 });
  assert.deepEqual(hang.reads, [{ x: W - 50, y: H - 40, w: 50, h: 40 }], 'an overhanging rectangle is clamped to the canvas');
  for (const bad of [{ x: 0, y: 0, width: 0, height: 10 }, { x: NaN, y: 0, width: 5, height: 5 }, { x: W + 9, y: 0, width: 5, height: 5 }]) {
    assert.deepEqual(analyzeForEnhance(inMargin, bad), whole, `rectangle ${JSON.stringify(bad)} → the whole picture`);
  }
  assert.deepEqual(analyzeForEnhance({ width: 0, height: 0, getContext: () => null }, null), { ...IDENTITY_PARAMS }, 'no pixels → identity');
  ok('analysis: the framed area only (margin ignored), a 256 px box-averaged downsample, junk rectangles → the whole picture');
}

// ── 3. enhanceCanvas ─────────────────────────────────────────────────────────
{
  const source = fakeCanvas(AREA_W, AREA_H, areaAt);
  const before = new Uint8ClampedArray(source.data);
  const params = analyzeForEnhance(source, null);

  // Strength 0 changes no pixel (and does not even read the canvas).
  const zero = fakeCanvas(AREA_W, AREA_H, areaAt);
  enhanceCanvas(zero, params, 0);
  assert.ok(sameBytes(zero.data, before), 'strength 0 changes no pixel');
  assert.equal(zero.reads.length, 0, 'strength 0 does no work');

  // Strength 1 equals applyEnhance with the params as given.
  const full = fakeCanvas(AREA_W, AREA_H, areaAt);
  enhanceCanvas(full, params, 1);
  const want = applyEnhance(before, AREA_W, AREA_H, params);
  assert.ok(sameBytes(full.data, want), 'strength 1 equals applyEnhance with the params as given');
  assert.ok(!sameBytes(full.data, before), 'control: strength 1 changed the picture');
  let lumBefore = 0, lumAfter = 0;
  for (let i = 0; i < before.length; i += 4) { lumBefore += before[i + 1]; lumAfter += full.data[i + 1]; }
  assert.ok(lumAfter > lumBefore * 1.1, 'the dim picture came out brighter');

  // A strength between is between, and repeatable from the SAME source.
  const half = fakeCanvas(AREA_W, AREA_H, areaAt);
  enhanceCanvas(half, params, 0.5);
  let lumHalf = 0;
  for (let i = 0; i < before.length; i += 4) lumHalf += half.data[i + 1];
  assert.ok(lumHalf > lumBefore && lumHalf < lumAfter, 'strength 0.5 sits between off and full');
  const halfAgain = fakeCanvas(AREA_W, AREA_H, areaAt);
  enhanceCanvas(halfAgain, params, 0.5);
  assert.ok(sameBytes(half.data, halfAgain.data), 'the same source, params and strength bake the same bytes');

  // Identity params, junk params and a canvas with no context are all no-ops.
  for (const p of [IDENTITY_PARAMS, null, undefined, {}, { gamma: 'x' }]) {
    const c = fakeCanvas(AREA_W, AREA_H, areaAt);
    enhanceCanvas(c, p, 1);
    assert.ok(sameBytes(c.data, before), `params ${JSON.stringify(p)} change no pixel`);
  }
  enhanceCanvas({ width: 10, height: 10, getContext: () => null }, params, 1);
  // Alpha is kept.
  assert.ok(full.data.every((v, i) => i % 4 !== 3 || v === 255), 'alpha is kept');
  ok('enhanceCanvas: strength 0 changes no pixel, strength 1 == applyEnhance, in place, repeatable');
}

console.log(`\n${passed} hero-enhance checks passed`);
