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
import { meanLuminance, needsNameScrim } from '../src/lib/hero-luminance';

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

console.log(`\nAll ${passed} hero-luminance checks passed.`);
