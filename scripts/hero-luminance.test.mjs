// TL.POLISH.1a — unit test for the hero name-scrim luminance helper
// (src/lib/hero-luminance.ts).
//
// The repo has no unit-test runner; pure checks are standalone .mjs scripts run
// via `npx tsx` (see gallery-framing.test.mjs). Wired into `npm run guard`.
// Run: `npx tsx scripts/hero-luminance.test.mjs`.
//
// sampleHeroBand needs a browser (Image + canvas) and is covered by the
// Playwright spec against /mecivietnam; only the pure maths is tested here.

import assert from 'node:assert/strict';
import { meanLuminance, needsNameScrim, nameBandRect, windowSourceRect } from '../src/lib/hero-luminance';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };
const near = (a, b, msg, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `${msg} (got ${a}, want ${b})`);

const solid = (r, g, b, px = 16) => {
  const out = new Uint8ClampedArray(px * 4);
  for (let i = 0; i < px; i++) { out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255; }
  return out;
};

// ── 1. all-white → lum ≈ 1 → scrim ON ────────────────────────────────────────
{
  const lum = meanLuminance(solid(255, 255, 255));
  near(lum, 1, 'white luminance');
  assert.equal(needsNameScrim(lum), true, 'white needs a scrim');
  ok('all-white → lum≈1 → scrim true');
}

// ── 2. all-black → lum ≈ 0 → scrim OFF ───────────────────────────────────────
{
  const lum = meanLuminance(solid(0, 0, 0));
  near(lum, 0, 'black luminance');
  assert.equal(needsNameScrim(lum), false, 'black keeps the default');
  ok('all-black → lum≈0 → scrim false');
}

// ── 3. 50% grey → ≈0.5 → below the 0.55 default → OFF ────────────────────────
{
  const lum = meanLuminance(solid(128, 128, 128));
  near(lum, 128 / 255, 'mid-grey luminance');
  assert.equal(needsNameScrim(lum), false, 'mid grey stays under the default threshold');
  ok('50% grey → ~0.5 → scrim false');
}

// ── 4. threshold edge: strictly greater than, and the threshold is a parameter ─
{
  assert.equal(needsNameScrim(0.55), false, 'exactly at threshold is not light');
  assert.equal(needsNameScrim(0.5500001), true, 'just over threshold is light');
  assert.equal(needsNameScrim(0.5, 0.4), true, 'custom threshold lowers the bar');
  assert.equal(needsNameScrim(0.5, 0.6), false, 'custom threshold raises the bar');
  ok('threshold edge: > not >=, parameter honoured');
}

// ── 5. mixed pixels average per pixel; empty input is 0 (never NaN) ──────────
{
  const half = new Uint8ClampedArray([...solid(255, 255, 255, 1), ...solid(0, 0, 0, 1)]);
  near(meanLuminance(half), 0.5, 'one white + one black pixel');
  assert.equal(meanLuminance(new Uint8ClampedArray(0)), 0, 'empty buffer is 0');
  ok('mixed pixels average; empty buffer is 0, not NaN');
}

// ── 6. the name band of a sample: bottom 35%, middle 60%, whole pixels ───────
{
  // The 32 px sample of a 402 × 497 hero is 32 × 40 — the arithmetic
  // sampleHeroBand has always used, now in one place.
  assert.deepEqual(nameBandRect(32, 40), { x: 6, y: 26, width: 19, height: 14 }, '32 × 40');
  assert.deepEqual(nameBandRect(32, 32), { x: 6, y: 20, width: 19, height: 12 }, '32 × 32');
  assert.deepEqual(nameBandRect(32, 70), { x: 6, y: 45, width: 19, height: 25 }, '32 × 70 (full-screen)');
  // Never empty, never outside the sample.
  for (const [w, h] of [[32, 1], [32, 2], [1, 1], [32, 18], [32, 200]]) {
    const b = nameBandRect(w, h);
    assert.ok(b.width >= 1 && b.height >= 1, `${w}×${h}: never empty`);
    assert.ok(b.x >= 0 && b.y >= 0 && b.y + b.height <= h && b.x < w, `${w}×${h}: inside the sample`);
  }
  ok('nameBandRect: bottom 35% × middle 60%, the arithmetic unchanged');
}

// ── 7. HERO.FIT.2: the part of the picture a window covers ───────────────────
{
  // No window → null: the caller samples the whole picture, as before.
  for (const none of [null, undefined]) assert.equal(windowSourceRect(1000, 2000, none), null, `${none} → null`);
  // A window in percent → source pixels.
  assert.deepEqual(windowSourceRect(1000, 2000, { x: 10, y: 25, w: 50, h: 50 }), { x: 100, y: 500, width: 500, height: 1000 }, 'percent → pixels');
  assert.deepEqual(windowSourceRect(1895, 1709, { x: 0, y: 0, w: 100, h: 100 }), { x: 0, y: 0, width: 1895, height: 1709 }, 'the whole picture');
  // Clamped inside the picture.
  assert.deepEqual(windowSourceRect(1000, 1000, { x: -10, y: 80, w: 50, h: 40 }), { x: 0, y: 800, width: 400, height: 200 }, 'an overhang is clamped');
  // The band of a window is the band of that part: a window over the bottom
  // half samples only the bottom half's own bottom 35%.
  const part = windowSourceRect(320, 800, { x: 0, y: 50, w: 100, h: 50 });
  assert.deepEqual(part, { x: 0, y: 400, width: 320, height: 400 }, 'the bottom half');
  const band = nameBandRect(32, Math.round((part.height / part.width) * 32));
  assert.deepEqual(band, { x: 6, y: 26, width: 19, height: 14 }, 'its band, in the 32 × 40 sample of that half');
  // Junk → null.
  for (const junk of [
    {}, { x: 0, y: 0, w: 0, h: 50 }, { x: 0, y: 0, w: 50, h: -1 }, { x: NaN, y: 0, w: 50, h: 50 },
    { x: 0, y: 0, w: '50', h: 50 }, { x: 200, y: 0, w: 50, h: 50 },
  ]) assert.equal(windowSourceRect(1000, 1000, junk), null, `${JSON.stringify(junk)} → null`);
  assert.equal(windowSourceRect(0, 1000, { x: 0, y: 0, w: 50, h: 50 }), null, 'no picture → null');
  ok('windowSourceRect: percent → clamped source pixels, null on junk');
}

console.log(`\nAll ${passed} hero-luminance checks passed.`);
