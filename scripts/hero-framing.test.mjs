// FIX.MEDIA.1 — unit test for the hero framing resolver (src/lib/hero-framing.ts).
//
// The repo has no unit-test runner; pure checks are standalone .mjs scripts run
// via `npx tsx` (see tpl-presets.test.mjs). Wired into `npm run guard`.
// Run: `npx tsx scripts/hero-framing.test.mjs`.
//
// This resolver IS the definition of hero framing — the live page, the Video
// Profile panel preview and the Edit Photo dialog all paint from it. Every
// clause of the ratified contract (cover / reveal / zoom / pan / fit) is
// asserted here so a regression fails the guard before it reaches a surface.

import assert from 'node:assert/strict';
import {
  resolveHeroFraming,
  resolveHeroGeometry,
  resolveHeroMediaStyle,
  heroFramingAttr,
  HERO_FRAMING_DEFAULTS,
  HERO_SCALE_MIN,
  HERO_SCALE_MAX,
} from '../src/lib/hero-framing';
import { canonicalHeroAspect, canonicalFullBleedAspect } from '../src/lib/device-presets';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };
const near = (a, b, msg, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${msg} (got ${a}, want ${b})`);

// Container: portrait (tall). Media: landscape (wide). The interesting case —
// a wide clip in a phone-shaped hero, which is most real uploads.
const TALL = 0.5;   // container aspect (w/h)
const WIDE = 1.5;   // media aspect (w/h)
const NARROW = 0.25; // media taller than the container

// ── 1. framing defaults + clamping ───────────────────────────────────────────
{
  assert.deepEqual(resolveHeroFraming(), HERO_FRAMING_DEFAULTS, 'absent framing → defaults');
  assert.deepEqual(resolveHeroFraming(null), HERO_FRAMING_DEFAULTS, 'null framing → defaults');
  assert.deepEqual(resolveHeroFraming({}), HERO_FRAMING_DEFAULTS, 'empty framing → defaults');
  // Legacy rows carry a partial object; each missing field falls back alone.
  assert.deepEqual(
    resolveHeroFraming({ posY: 25 }),
    { scale: 1, posX: 50, posY: 25, fit: 'fill' },
    'partial framing keeps the stored field and defaults the rest',
  );
  // Out-of-range values are clamped, never trusted.
  assert.equal(resolveHeroFraming({ scale: 99 }).scale, HERO_SCALE_MAX, 'scale clamped high');
  assert.equal(resolveHeroFraming({ scale: 0.01 }).scale, HERO_SCALE_MIN, 'scale clamped low');
  assert.equal(resolveHeroFraming({ posX: -40 }).posX, 0, 'posX clamped low');
  assert.equal(resolveHeroFraming({ posY: 900 }).posY, 100, 'posY clamped high');
  // Garbage from a hand-edited theme_json must not produce NaN geometry.
  assert.deepEqual(
    resolveHeroFraming({ scale: NaN, posX: 'left', posY: undefined, fit: 'weird' }),
    HERO_FRAMING_DEFAULTS,
    'non-numeric / unknown values fall back to defaults',
  );
  assert.equal(resolveHeroFraming({ fit: 'fit' }).fit, 'fit', 'fit is honoured');
  ok('framing defaults + clamping');
}

// ── 2. scale 1 COVERS — no gap on either axis ────────────────────────────────
{
  const g = resolveHeroGeometry(WIDE, TALL, { scale: 1 });
  near(g.heightPct, 100, 'wide media in a tall container pins height');
  near(g.widthPct, 300, 'and overflows width by mediaAspect/containerAspect');
  // The defining property of cover: neither axis leaves a gap.
  assert.ok(g.widthPct >= 100 - 1e-9 && g.heightPct >= 100 - 1e-9, 'cover leaves no gap');
  // Centred at pos 50 — the overflow is split evenly.
  near(g.leftPct, -100, 'centred horizontally (half the 200% overflow)');
  near(g.topPct, 0, 'no vertical overflow to split');

  // The mirror case: media taller than the container pins WIDTH instead.
  const h = resolveHeroGeometry(NARROW, TALL, { scale: 1 });
  near(h.widthPct, 100, 'tall media pins width');
  near(h.heightPct, 200, 'and overflows height');
  assert.ok(h.widthPct >= 100 - 1e-9 && h.heightPct >= 100 - 1e-9, 'cover leaves no gap');

  // Aspect match is the identity case — this is what makes a canonical-aspect
  // crop WYSIWYG (CROP.3a-C rule 2).
  const i = resolveHeroGeometry(TALL, TALL, { scale: 1 });
  assert.deepEqual(
    { w: i.widthPct, h: i.heightPct, l: i.leftPct, t: i.topPct },
    { w: 100, h: 100, l: 0, t: 0 },
    'matching aspect at scale 1 is an exact identity',
  );
  ok('scale 1 covers');
}

// ── 3. scale < 1 REVEALS edges (backdrop shows) ──────────────────────────────
{
  const cover = resolveHeroGeometry(WIDE, TALL, { scale: 1 });
  const small = resolveHeroGeometry(WIDE, TALL, { scale: 0.5 });
  near(small.widthPct, 150, 'shrunk width');
  near(small.heightPct, 50, 'shrunk height');
  // More of the clip is visible on the overflowing axis...
  assert.ok(small.widthPct < cover.widthPct, 'less horizontal overflow → more of the clip shows');
  // ...and the short axis now leaves a gap, which is the brand-dark edge.
  assert.ok(small.heightPct < 100, 'scale < 1 reveals a backdrop edge');
  // A revealed axis is centred, so the edges are symmetric.
  near(small.topPct, 25, 'revealed axis is centred (edges split evenly)');
  ok('scale < 1 reveals edges');
}

// ── 4. scale > 1 ZOOMS in ────────────────────────────────────────────────────
{
  const cover = resolveHeroGeometry(WIDE, TALL, { scale: 1 });
  const zoom = resolveHeroGeometry(WIDE, TALL, { scale: 2 });
  near(zoom.widthPct, 600, 'zoomed width');
  near(zoom.heightPct, 200, 'zoomed height');
  assert.ok(zoom.widthPct > cover.widthPct && zoom.heightPct > cover.heightPct, 'both axes grow');
  // Zooming never opens a gap.
  assert.ok(zoom.widthPct >= 100 && zoom.heightPct >= 100, 'zoom still covers');
  ok('scale > 1 zooms');
}

// ── 5. posX / posY PAN consistently, and self-clamp ──────────────────────────
{
  // Horizontal overflow exists (width 300%), so posX has real travel.
  const left = resolveHeroGeometry(WIDE, TALL, { posX: 0 });
  const mid = resolveHeroGeometry(WIDE, TALL, { posX: 50 });
  const right = resolveHeroGeometry(WIDE, TALL, { posX: 100 });
  near(left.leftPct, 0, 'posX 0 pins the media flush left');
  near(mid.leftPct, -100, 'posX 50 centres');
  near(right.leftPct, 100 - right.widthPct, 'posX 100 pins flush right');
  // Monotonic: dragging the slider one way only ever moves the media one way.
  assert.ok(left.leftPct > mid.leftPct && mid.leftPct > right.leftPct, 'pan is monotonic');

  // The vertical axis has NO overflow here — panning it must be inert, not
  // push the media off its own frame. This is what object-position does, and
  // what the Top/Bottom slider's "no travel" state is derived from.
  const top = resolveHeroGeometry(WIDE, TALL, { posY: 0 });
  const bottom = resolveHeroGeometry(WIDE, TALL, { posY: 100 });
  near(top.topPct, 0, 'no vertical overflow → posY 0 still centres');
  near(bottom.topPct, 0, 'no vertical overflow → posY 100 still centres');

  // On a tall clip the roles swap and posY is the axis with travel.
  const vTop = resolveHeroGeometry(NARROW, TALL, { posY: 0 });
  const vBot = resolveHeroGeometry(NARROW, TALL, { posY: 100 });
  near(vTop.topPct, 0, 'posY 0 pins flush top');
  near(vBot.topPct, 100 - vBot.heightPct, 'posY 100 pins flush bottom');

  // Pan composes with zoom: zooming a previously-inert axis gives it travel.
  const zoomed = resolveHeroGeometry(WIDE, TALL, { scale: 2, posY: 0 });
  assert.ok(zoomed.heightPct > 100, 'zoom creates vertical overflow');
  near(zoomed.topPct, 0, 'and posY 0 now pins flush top');
  ok('pan is consistent and self-clamping');
}

// ── 6. fit LETTERBOXES ───────────────────────────────────────────────────────
{
  const g = resolveHeroGeometry(WIDE, TALL, { fit: 'fit' });
  near(g.widthPct, 100, 'fit pins the overflowing axis instead');
  near(g.heightPct, (TALL / WIDE) * 100, 'and letterboxes the other');
  // The defining property of contain: the whole frame is visible, nothing crops.
  assert.ok(g.widthPct <= 100 + 1e-9 && g.heightPct <= 100 + 1e-9, 'fit crops nothing');
  near(g.leftPct, 0, 'centred horizontally');
  near(g.topPct, (100 - g.heightPct) / 2, 'letterbox bars are even');
  // Panning a letterboxed axis is inert — there is nothing hidden to pan to.
  const panned = resolveHeroGeometry(WIDE, TALL, { fit: 'fit', posY: 0, posX: 100 });
  assert.deepEqual(panned, g, 'fit ignores pan (no overflow on either axis)');
  ok('fit letterboxes');
}

// ── 7. unknown media aspect → no geometry, but a usable style ────────────────
{
  assert.equal(resolveHeroGeometry(null, TALL, {}), null, 'null media aspect → null');
  assert.equal(resolveHeroGeometry(0, TALL, {}), null, 'zero media aspect → null');
  assert.equal(resolveHeroGeometry(WIDE, null, {}), null, 'null container aspect → null');
  assert.equal(resolveHeroGeometry(WIDE, -3, {}), null, 'negative container aspect → null');

  // Before decode the style must still cover — a hero may never flash blank.
  const pending = resolveHeroMediaStyle({ mediaAspect: null, containerAspect: TALL, framing: { posY: 25 } });
  assert.equal(pending.objectFit, 'cover', 'fallback covers');
  assert.equal(pending.objectPosition, '50% 25%', 'fallback honours pan via object-position');
  assert.equal(pending.width, '100%', 'fallback fills the container');
  const pendingFit = resolveHeroMediaStyle({ mediaAspect: null, containerAspect: TALL, framing: { fit: 'fit' } });
  assert.equal(pendingFit.objectFit, 'contain', 'fallback honours fit');
  // A zoomed page must not flash unzoomed while the aspect is still unknown.
  const pendingZoom = resolveHeroMediaStyle({ mediaAspect: null, containerAspect: TALL, framing: { scale: 2 } });
  assert.equal(pendingZoom.transform, 'scale(2)', 'fallback still zooms');
  ok('unknown aspect falls back to a covering style');
}

// ── 8. resolved style describes the resolved rectangle ───────────────────────
{
  const style = resolveHeroMediaStyle({ mediaAspect: WIDE, containerAspect: TALL, framing: { posX: 0 } });
  const geo = resolveHeroGeometry(WIDE, TALL, { posX: 0 });
  assert.equal(style.position, 'absolute', 'positioned inside the container box');
  assert.equal(style.width, `${geo.widthPct}%`, 'width mirrors the geometry');
  assert.equal(style.height, `${geo.heightPct}%`, 'height mirrors the geometry');
  assert.equal(style.left, `${geo.leftPct}%`, 'left mirrors the geometry');
  assert.equal(style.top, `${geo.topPct}%`, 'top mirrors the geometry');
  // The rectangle already IS the cover box; re-fitting inside it would double-
  // letterbox, so the media must stretch to exactly fill what we computed.
  assert.equal(style.objectFit, 'fill', 'media fills the resolved rectangle exactly');
  assert.equal(style.maxWidth, 'none', 'no inherited max-width may shrink it');
  ok('resolved style describes the resolved rectangle');
}

// ── 9. data-hero-framing is a stable preview==live fingerprint ───────────────
{
  const input = { mediaAspect: WIDE, containerAspect: canonicalHeroAspect(), framing: { scale: 1.5, posX: 20, posY: 80 } };
  const attr = heroFramingAttr(input);
  // Same inputs → same string, whichever surface computed it. This is the
  // equality a Playwright test asserts between preview and live.
  assert.equal(attr, heroFramingAttr({ ...input }), 'deterministic');
  assert.ok(attr.startsWith('1.50;20;80;fill;'), `carries the resolved framing (got ${attr})`);
  // A different container aspect MUST produce a different fingerprint —
  // otherwise a preview framed at the wrong shape could pass as equal.
  assert.notEqual(
    attr,
    heroFramingAttr({ ...input, containerAspect: canonicalFullBleedAspect() }),
    'container aspect is part of the fingerprint',
  );
  // Defaults render as the canonical centred string.
  assert.ok(
    heroFramingAttr({ mediaAspect: TALL, containerAspect: TALL, framing: null })
      === '1.00;50;50;fill;100.0,100.0,0.0,0.0',
    'identity case fingerprints as an exact fill',
  );
  assert.ok(
    heroFramingAttr({ mediaAspect: null, containerAspect: TALL, framing: null }).endsWith(';pending'),
    'undecoded media is marked pending, not silently equal',
  );
  ok('data-hero-framing fingerprint');
}

// ── 10. the real container aspects both page styles render at ────────────────
{
  // Guards the contract end-to-end at the shapes the app actually uses.
  for (const [name, aspect] of [['hero', canonicalHeroAspect()], ['full_bleed', canonicalFullBleedAspect()]]) {
    assert.ok(aspect > 0 && aspect < 1, `${name} container is portrait`);
    const g = resolveHeroGeometry(WIDE, aspect, { scale: 1 });
    assert.ok(g.widthPct >= 100 && g.heightPct >= 100 - 1e-9, `${name}: a wide clip still covers`);
    // A 9:16 upload — what the panel tells users to shoot — into either style.
    const nine16 = resolveHeroGeometry(9 / 16, aspect, { scale: 1 });
    assert.ok(nine16.widthPct >= 100 - 1e-9 && nine16.heightPct >= 100 - 1e-9, `${name}: a 9:16 clip covers`);
  }
  ok('both live container aspects cover');
}

console.log(`\n${passed} hero-framing checks passed`);
