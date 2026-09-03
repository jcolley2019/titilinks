// TL.POLISH.1b — unit test for the logo-like hero detector
// (src/lib/logo-detect.ts).
//
// The repo has no unit-test runner; pure checks are standalone .mjs scripts run
// via `npx tsx` (see hero-luminance.test.mjs). Wired into `npm run guard`.
// Run: `npx tsx scripts/logo-detect.test.mjs`.
//
// analyzeImageForLogo needs a browser (Image + canvas) and is covered by the
// Playwright spec (tests/03) against /mecivietnam, /joeyc and the battery
// page; only the pure maths + the 2-of-3 rule are tested here.

import assert from 'node:assert/strict';
import {
  distinctColorCount,
  borderFlatShare,
  aspectNearSquare,
  classifyLogo,
  logoSignals,
  LOGO_MAX_COLORS,
  LOGO_MIN_BORDER_FLAT,
} from '../src/lib/logo-detect';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

// ── synthetic buffers ────────────────────────────────────────────────────────
const S = 32;
const buf = (w, h, px) => {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = px(x, y);
    const i = (y * w + x) * 4;
    out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
  }
  return out;
};
// Deterministic LCG so "random noise" is the same noise on every run.
const lcg = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const isBorder = (x, y) => x === 0 || y === 0 || x === S - 1 || y === S - 1;

// A: flat white field, red wordmark in the middle — two colours, flat border.
const flatTwoColour = buf(S, S, (x, y) => (x > 8 && x < 24 && y > 12 && y < 20 ? [230, 20, 20] : [240, 240, 240]));
// B: random noise everywhere.
const noiseRng = lcg(7);
const noise = buf(S, S, () => [noiseRng() * 255, noiseRng() * 255, noiseRng() * 255]);
// C: flat border ring, ~200 distinct colours inside (a smooth gradient).
const flatBorderManyColours = buf(S, S, (x, y) => (isBorder(x, y) ? [0, 0, 0] : [x * 8, y * 8, ((x * 7 + y * 3) % 16) * 16]));
// D: FEW colours (8, well under the 96 cap) cycling everywhere — border
// included, so no single border colour dominates. (A pure two-colour checker
// is inherently borderline: with two colours the top border share can never
// drop below 0.5, the inclusive threshold.)
const PALETTE = [[255, 255, 255], [0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255]];
const twoColourNoisyBorder = buf(S, S, (x, y) => PALETTE[(x + y) % PALETTE.length]);

// ── 1. signal maths on known buffers ─────────────────────────────────────────
{
  assert.equal(distinctColorCount(flatTwoColour), 2, 'two-colour buffer has 2 colours');
  assert.equal(borderFlatShare(flatTwoColour, S, S), 1, 'flat border is 1.0');
  assert.ok(distinctColorCount(noise) > LOGO_MAX_COLORS, `noise has many colours (${distinctColorCount(noise)})`);
  assert.ok(borderFlatShare(noise, S, S) < LOGO_MIN_BORDER_FLAT, `noise border is not flat (${borderFlatShare(noise, S, S)})`);
  const cCols = distinctColorCount(flatBorderManyColours);
  assert.ok(cCols > LOGO_MAX_COLORS, `gradient interior has > 96 colours (${cCols})`);
  assert.equal(borderFlatShare(flatBorderManyColours, S, S), 1, 'black ring is a flat border');
  assert.equal(distinctColorCount(twoColourNoisyBorder), 8, 'cycling buffer has 8 colours');
  const dFlat = borderFlatShare(twoColourNoisyBorder, S, S);
  // 124 ring pixels, 16 of the top colour → 0.129; well under the 0.5 threshold.
  assert.ok(dFlat < 0.2 && dFlat < LOGO_MIN_BORDER_FLAT, `cycling border ≈ 1/8 flat, under threshold (${dFlat})`);
  // Two-colour checker: exactly 0.5 — ON the inclusive threshold, by design.
  const checker = buf(S, S, (x, y) => ((x + y) % 2 === 0 ? [255, 255, 255] : [0, 0, 0]));
  assert.equal(borderFlatShare(checker, S, S), 0.5, 'two-colour checker border is exactly 0.5');
  // Quantisation: 4 bits/channel folds JPEG ringing into one colour.
  const ringing = buf(4, 4, (x) => [240 + (x % 4), 240, 240]);
  assert.equal(distinctColorCount(ringing), 1, '±3 ringing is one colour at 4 bits');
  assert.equal(distinctColorCount(ringing, 8), 4, 'and four colours at 8 bits');
  assert.equal(distinctColorCount(new Uint8ClampedArray(0)), 0, 'empty buffer has 0 colours');
  assert.equal(borderFlatShare(new Uint8ClampedArray(0), 0, 0), 0, 'empty buffer border share is 0, not NaN');
  ok('signal maths: colour count, border flat share, quantisation, empties');
}

// ── 2. aspect band 0.8..1.25 inclusive ───────────────────────────────────────
{
  assert.equal(aspectNearSquare(140, 140), true, 'square');
  assert.equal(aspectNearSquare(100, 125), true, '0.8 edge');
  assert.equal(aspectNearSquare(125, 100), true, '1.25 edge');
  assert.equal(aspectNearSquare(3, 4), false, '3:4 is 0.75 — out');
  assert.equal(aspectNearSquare(1320, 1722), false, 'joeyc 0.767 — out');
  assert.equal(aspectNearSquare(0, 100), false, 'zero width is not square');
  ok('aspect band 0.8..1.25 inclusive, degenerate sizes false');
}

// ── 3. the four ruled cases (2 of 3) ─────────────────────────────────────────
{
  const A = logoSignals(flatTwoColour, S, S, 512, 512);
  assert.equal(classifyLogo(A), true, 'A: two-colour + flat border + square → logo (3/3)');
  const B = logoSignals(noise, S, S, 512, 512);
  assert.equal(classifyLogo(B), false, 'B: noise square → photo (1/3, aspect only)');
  const C = logoSignals(flatBorderManyColours, S, S, 300, 400);
  assert.equal(classifyLogo(C), false, 'C: flat border + 200 colours + 3:4 → photo (1/3)');
  const D = logoSignals(twoColourNoisyBorder, S, S, 300, 400);
  assert.equal(classifyLogo(D), false, 'D: few colours + noisy border + 3:4 → photo (1/3, colours only)');
  // E: a WIDE logo — two colours, flat border, 3:4 — is still a logo on 2/3.
  const E = logoSignals(flatTwoColour, S, S, 300, 400);
  assert.equal(classifyLogo(E), true, 'E: two-colour + flat border + 3:4 → logo (2/3)');
  ok('ruled cases: A logo, B/C/D photo, E wide logo');
}

// ── 4. the inverted / mis-tuned rules FAIL on the same buffers ───────────────
{
  // "any 1 of 3" — aspect alone would carry it: the noise square becomes a logo.
  const anyOne = (s) => s.colors <= LOGO_MAX_COLORS || s.borderFlat >= LOGO_MIN_BORDER_FLAT || s.nearSquare;
  assert.equal(anyOne(logoSignals(noise, S, S, 512, 512)), true, '1-of-3 calls the noise square a logo');
  // "all 3 of 3" — the wide logo is lost.
  const allThree = (s) => s.colors <= LOGO_MAX_COLORS && s.borderFlat >= LOGO_MIN_BORDER_FLAT && s.nearSquare;
  assert.equal(allThree(logoSignals(flatTwoColour, S, S, 300, 400)), false, '3-of-3 loses the wide logo');
  // Inverted thresholds (colours >= 96, border <= 0.5) — the photos become logos.
  const inverted = (s) => [s.colors >= LOGO_MAX_COLORS, s.borderFlat <= LOGO_MIN_BORDER_FLAT, s.nearSquare].filter(Boolean).length >= 2;
  assert.equal(inverted(logoSignals(noise, S, S, 512, 512)), true, 'inverted rule calls noise a logo');
  assert.equal(inverted(logoSignals(flatTwoColour, S, S, 512, 512)), false, 'inverted rule calls the logo a photo');
  ok('inverted / 1-of-3 / 3-of-3 rules all misclassify — 2-of-3 is load-bearing');
}

// ── 5. recon 1b.0 signals pinned (2026-09-02, prod heroes) ───────────────────
{
  assert.equal(classifyLogo({ colors: 64, borderFlat: 0.645, nearSquare: true }), true, 'mecivietnam → logo');
  assert.equal(classifyLogo({ colors: 197, borderFlat: 0.21, nearSquare: false }), false, 'joeyc → photo');
  assert.equal(classifyLogo({ colors: 199, borderFlat: 0.105, nearSquare: true }), false, 'battery → photo');
  // Threshold edges are inclusive on the logo side.
  assert.equal(classifyLogo({ colors: 96, borderFlat: 0.5, nearSquare: false }), true, '96 colours + 0.5 border is still a logo');
  assert.equal(classifyLogo({ colors: 97, borderFlat: 0.499, nearSquare: true }), false, 'just over both is a photo');
  ok('recon signals pinned; threshold edges inclusive');
}

console.log(`\nAll ${passed} logo-detect checks passed.`);
