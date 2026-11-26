// IMG.ENH.1 — unit test for the auto enhance library (src/lib/auto-enhance.ts).
//
// The repo has no unit-test runner; pure checks are standalone .mjs scripts run
// via `npx tsx` (see picture-fit.test.mjs). Wired into `npm run guard` right
// after picture-fit.test.mjs.
// Run: `npx tsx scripts/auto-enhance.test.mjs`.
//
// Everything here runs on a synthetic scene (grey ramps, a hue sweep, sixteen
// colour patches) built in this file, so the expected answer is known exactly:
// damage the scene, enhance the damage, and the result must land closer to the
// scene than the damage did. The do-no-harm half matters as much: the scene
// itself, and a flat graphic, must come back (almost or exactly) untouched.

import assert from 'node:assert/strict';
import {
  analyzePhoto,
  applyEnhance,
  scaleParams,
  sanitizeParams,
  toneCurve,
  isIdentity,
  IDENTITY_PARAMS,
  LEVELS_MAX_BLACK,
  LEVELS_MIN_WHITE,
  GAMMA_MIN,
  GAMMA_MAX,
  SHADOWS_MAX,
  HIGHLIGHTS_MAX,
  WB_MAX_SHIFT,
  VIBRANCE_MAX,
  SHARPEN_MAX,
} from '../src/lib/auto-enhance';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

// ── the synthetic scene ──────────────────────────────────────────────────────
const W = 240;
const H = 180;

function hsvToRgb(hDeg, s, v) {
  const c = v * s;
  const hp = (hDeg % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const PATCHES = [
  [224, 172, 140], [198, 134, 100], [141, 85, 60], [110, 160, 220],
  [70, 120, 50], [200, 40, 40], [230, 200, 60], [120, 70, 160],
  [40, 150, 150], [230, 130, 40], [120, 130, 145], [190, 180, 160],
  [30, 32, 36], [232, 232, 228], [230, 140, 170], [30, 45, 100],
];

/** Grey ramp, hue sweep, 16 patches, a 2-D grey ramp. Every value in 6..249. */
function makeScene() {
  const px = new Uint8ClampedArray(W * H * 4);
  const put = (x, y, [r, g, b]) => {
    const i = (y * W + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (y < 45) {
        const v = 6 + (243 * x) / (W - 1);
        put(x, y, [v, v, v]);
      } else if (y < 90) {
        put(x, y, hsvToRgb((360 * x) / W, 0.5, 0.35 + (0.5 * (y - 45)) / 44));
      } else if (y < 134) {
        const col = Math.floor(x / 30);
        const row = Math.floor((y - 90) / 22);
        put(x, y, PATCHES[row * 8 + col]);
      } else {
        const v = 20 + 105 * (x / (W - 1)) + 105 * ((y - 134) / (H - 135));
        put(x, y, [v, v * 0.99 + 1, v * 0.98 + 2]);
      }
    }
  }
  return px;
}

/** Per-channel damage, alpha untouched. */
function damage(src, fn) {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const [r, g, b] = fn(src[i], src[i + 1], src[i + 2]);
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = src[i + 3];
  }
  return out;
}

const DAMAGES = {
  underexposed: (r, g, b) => [r * 0.5, g * 0.5, b * 0.5],
  washedOut: (r, g, b) => [76.5 + r * 0.4, 76.5 + g * 0.4, 76.5 + b * 0.4],
  colourCast: (r, g, b) => [r * 1.15, g, b * 0.85],
  darkFlat: (r, g, b) => [15 + r * 0.4, 15 + g * 0.4, 15 + b * 0.4],
};

// ── measures ─────────────────────────────────────────────────────────────────
const luma = (a, i) => 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2];

/** Mean absolute luminance error, 0..255. */
function lumErr(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 4) s += Math.abs(luma(a, i) - luma(b, i));
  return s / (a.length / 4);
}

/** Mean channel-ratio error: |r/(r+g+b) − r0/(r0+g0+b0)| summed over r,g,b. */
function ratioErr(a, b) {
  let s = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    const sa = a[i] + a[i + 1] + a[i + 2];
    const sb = b[i] + b[i + 1] + b[i + 2];
    if (sa < 30 || sb < 30) continue;
    for (let c = 0; c < 3; c++) s += Math.abs(a[i + c] / sa - b[i + c] / sb);
    n++;
  }
  return s / n;
}

/** Mean absolute difference per channel (R, G, B), 0..255. */
function chanErr(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 4) {
    s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  }
  return s / ((a.length / 4) * 3);
}

/** Share of pixels with any channel at exactly 0 or 255. */
function clipShare(a) {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] === 0 || a[i] === 255 || a[i + 1] === 0 || a[i + 1] === 255 || a[i + 2] === 0 || a[i + 2] === 255) n++;
  }
  return n / (a.length / 4);
}

const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const enhance = (px) => applyEnhance(px, W, H, analyzePhoto(px, W, H));

const SCENE = makeScene();

// ── 1. identity, strength 0, purity, determinism ─────────────────────────────
{
  assert.ok(isIdentity(IDENTITY_PARAMS), 'IDENTITY_PARAMS is identity');
  const out = applyEnhance(SCENE, W, H, IDENTITY_PARAMS);
  assert.notEqual(out, SCENE, 'a NEW array, never the input');
  assert.ok(sameBytes(out, SCENE), 'identity params → byte-identical output');

  for (const [name, fn] of Object.entries(DAMAGES)) {
    const dmg = damage(SCENE, fn);
    const full = analyzePhoto(dmg, W, H);
    assert.ok(!isIdentity(full), `${name}: the analysis finds something to do`);
    const zero = scaleParams(full, 0);
    assert.ok(isIdentity(zero), `${name}: strength 0 → identity params`);
    assert.ok(sameBytes(applyEnhance(dmg, W, H, zero), dmg), `${name}: strength 0 → byte-identical output`);

    const before = new Uint8ClampedArray(dmg);
    const a = applyEnhance(dmg, W, H, full);
    assert.ok(sameBytes(dmg, before), `${name}: the input array is never mutated`);
    const b = applyEnhance(dmg, W, H, full);
    assert.ok(sameBytes(a, b), `${name}: same input → same output`);
    assert.deepEqual(analyzePhoto(dmg, W, H), full, `${name}: same input → same params`);
  }

  // Strength is linear toward identity, and clamped to 0..1.
  const p = analyzePhoto(damage(SCENE, DAMAGES.darkFlat), W, H);
  const half = scaleParams(p, 0.5);
  for (const k of Object.keys(IDENTITY_PARAMS)) {
    const want = IDENTITY_PARAMS[k] + (p[k] - IDENTITY_PARAMS[k]) * 0.5;
    assert.ok(Math.abs(half[k] - want) < 1e-12, `strength 0.5 is halfway on ${k}`);
  }
  assert.deepEqual(scaleParams(p, 1), sanitizeParams(p), 'strength 1 = the params');
  assert.deepEqual(scaleParams(p, 7), sanitizeParams(p), 'strength above 1 clamps to 1');
  assert.ok(isIdentity(scaleParams(p, -3)), 'strength below 0 clamps to 0');
  assert.ok(isIdentity(scaleParams(p, NaN)), 'junk strength → 0');
  ok('identity and strength 0 are byte-identical; the input is never mutated; deterministic; strength is linear');
}

// ── 2. recovery ──────────────────────────────────────────────────────────────
const report = [];
{
  for (const [name, fn] of Object.entries(DAMAGES)) {
    const dmg = damage(SCENE, fn);
    const enh = enhance(dmg);
    const lb = lumErr(dmg, SCENE);
    const la = lumErr(enh, SCENE);
    const rb = ratioErr(dmg, SCENE);
    const ra = ratioErr(enh, SCENE);
    report.push({ name, lb, la, rb, ra });
    if (name === 'colourCast') {
      assert.ok(ra < rb, `${name}: channel-ratio error ${ra.toFixed(4)} < ${rb.toFixed(4)}`);
    } else {
      assert.ok(la < lb, `${name}: luminance error ${la.toFixed(2)} < ${lb.toFixed(2)}`);
    }
  }
  for (const r of report) {
    console.log(`   ${r.name.padEnd(13)} lum ${r.lb.toFixed(2).padStart(6)} → ${r.la.toFixed(2).padStart(6)}   ratio ${r.rb.toFixed(4)} → ${r.ra.toFixed(4)}`);
  }
  ok('each of four damages is enhanced closer to the undamaged scene');
}

// ── 3. do no harm ────────────────────────────────────────────────────────────
{
  const enh = enhance(SCENE);
  const e = chanErr(enh, SCENE);
  console.log(`   undamaged scene: mean |Δ| per channel ${e.toFixed(2)}/255`);
  assert.ok(e <= 3, `the undamaged scene moves at most 3/255 (got ${e.toFixed(2)})`);
  ok('the undamaged scene comes back almost untouched (≤ 3/255 mean per channel)');
}

// ── 4. flat graphic ──────────────────────────────────────────────────────────
{
  const make = (colours) => {
    const px = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - W / 2;
        const dy = y - H / 2;
        let c = colours[0];
        if (dx * dx + dy * dy < 60 * 60) c = colours[1];
        if (colours[2] && Math.abs(dy) < 8 && Math.abs(dx) < 50) c = colours[2];
        if (colours[3] && y > H - 20) c = colours[3];
        const i = (y * W + x) * 4;
        px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
      }
    }
    return px;
  };
  const sets = [
    [[255, 255, 255], [220, 30, 40]],
    [[255, 255, 255], [20, 60, 160], [250, 200, 0]],
    [[245, 240, 230], [30, 30, 30], [200, 60, 20], [90, 140, 90]],
    [[40, 40, 40], [120, 120, 120]], // dark and flat: still a graphic, still identity
  ];
  for (const colours of sets) {
    const g = make(colours);
    const p = analyzePhoto(g, W, H);
    assert.ok(isIdentity(p), `${colours.length}-colour graphic → identity params`);
    assert.ok(sameBytes(applyEnhance(g, W, H, p), g), `${colours.length}-colour graphic → identical output`);
  }
  ok('a flat graphic of 2-4 colours comes back identical');
}

// ── 5. clipping ──────────────────────────────────────────────────────────────
{
  const cases = [['undamaged', SCENE], ...Object.entries(DAMAGES).map(([n, fn]) => [n, damage(SCENE, fn)])];
  for (const [name, px] of cases) {
    const before = clipShare(px);
    const after = clipShare(enhance(px));
    console.log(`   ${name.padEnd(13)} clipped ${(before * 100).toFixed(2)}% → ${(after * 100).toFixed(2)}%`);
    assert.ok(after - before <= 0.01, `${name}: clipping rises ${((after - before) * 100).toFixed(2)} points (max 1)`);
  }
  ok('the share of pixels at 0 or 255 rises by at most 1 point in every case');
}

// ── 6. monotone tone curve; every param inside its cap ───────────────────────
{
  const spread = [];
  for (const blackPoint of [0, 0.1, LEVELS_MAX_BLACK])
    for (const whitePoint of [LEVELS_MIN_WHITE, 0.8, 1])
      for (const gamma of [GAMMA_MIN, 1, GAMMA_MAX])
        for (const shadows of [0, SHADOWS_MAX])
          for (const highlights of [0, HIGHLIGHTS_MAX])
            spread.push({ ...IDENTITY_PARAMS, blackPoint, whitePoint, gamma, shadows, highlights });
  // Out-of-cap and junk values are clamped first, so they are monotone too.
  spread.push({ ...IDENTITY_PARAMS, blackPoint: 0.9, whitePoint: 0.1, gamma: 9, shadows: 5, highlights: 5 });
  spread.push({ ...IDENTITY_PARAMS, blackPoint: NaN, whitePoint: -1, gamma: 0, shadows: -1, highlights: Infinity });
  for (const p of spread) {
    const lut = toneCurve(p);
    assert.equal(lut.length, 256);
    for (let i = 1; i < 256; i++) {
      assert.ok(lut[i] >= lut[i - 1], `curve dips at ${i} for ${JSON.stringify(p)}`);
    }
  }

  const inCaps = (p, label) => {
    assert.ok(p.blackPoint >= 0 && p.blackPoint <= LEVELS_MAX_BLACK, `${label}: blackPoint ${p.blackPoint}`);
    assert.ok(p.whitePoint >= LEVELS_MIN_WHITE && p.whitePoint <= 1, `${label}: whitePoint ${p.whitePoint}`);
    assert.ok(p.whitePoint - p.blackPoint >= 1 / 3 - 1e-12, `${label}: levels range`);
    assert.ok(p.gamma >= GAMMA_MIN && p.gamma <= GAMMA_MAX, `${label}: gamma ${p.gamma}`);
    assert.ok(p.shadows >= 0 && p.shadows <= SHADOWS_MAX, `${label}: shadows ${p.shadows}`);
    assert.ok(p.highlights >= 0 && p.highlights <= HIGHLIGHTS_MAX, `${label}: highlights ${p.highlights}`);
    for (const k of ['gainR', 'gainG', 'gainB']) {
      assert.ok(Math.abs(p[k] - 1) <= WB_MAX_SHIFT + 1e-12, `${label}: ${k} ${p[k]}`);
    }
    assert.ok(p.vibrance >= 0 && p.vibrance <= VIBRANCE_MAX, `${label}: vibrance ${p.vibrance}`);
    assert.ok(p.sharpen >= 0 && p.sharpen <= SHARPEN_MAX, `${label}: sharpen ${p.sharpen}`);
  };
  inCaps(analyzePhoto(SCENE, W, H), 'scene');
  for (const [name, fn] of Object.entries(DAMAGES)) inCaps(analyzePhoto(damage(SCENE, fn), W, H), name);
  inCaps(sanitizeParams({ blackPoint: 2, whitePoint: -2, gamma: 99, shadows: 9, highlights: 9, gainR: 5, gainG: 0, gainB: -1, vibrance: 3, sharpen: 3 }), 'over the caps');
  assert.ok(isIdentity(sanitizeParams({ blackPoint: NaN, gamma: 'x', gainR: null })), 'junk → identity');
  assert.ok(isIdentity(sanitizeParams(null)), 'null → identity');
  ok('the tone curve is monotone over all 256 levels at the caps; every param stays inside its cap');
}

console.log(`\n${passed} passed`);
