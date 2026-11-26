// HERO.FIT.1 — unit test for the hero window converter (src/lib/hero-window.ts).
//
// The repo has no unit-test runner; pure checks are standalone .mjs scripts run
// via `npx tsx` (see hero-framing.test.mjs). Wired into `npm run guard` right
// after hero-framing.test.mjs.
// Run: `npx tsx scripts/hero-window.test.mjs`.
//
// The converter turns a framed WINDOW (percent of the source, the picture
// fitter's contract) into the { scale, posX, posY } the hero resolver already
// paints. It is only correct if the resolver, fed its output, shows exactly that
// window — so every check below goes through the REAL resolveHeroGeometry, never
// through a re-derivation of it.

import assert from 'node:assert/strict';
import {
  windowToHeroFraming,
  heroFramingToWindow,
  resolveHeroWindowFraming,
  HERO_WINDOW_MAX_ZOOM,
} from '../src/lib/hero-window';
import {
  resolveHeroGeometry,
  resolveHeroFraming,
  HERO_FRAMING_DEFAULTS,
  HERO_SCALE_MAX,
} from '../src/lib/hero-framing';
import { writePictureFit } from '../src/lib/picture-fit';
import { HERO_DEFAULTS } from '../src/lib/surface';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };
const near = (a, b, msg, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${msg} (got ${a}, want ${b})`);
const nearWin = (a, b, msg, eps) => {
  for (const k of ['x', 'y', 'w', 'h']) near(a[k], b[k], `${msg} · ${k}`, eps);
};

const MEDIA = [0.5, 0.667, 1, 1.5, 2];
const BOXES = [0.46, 0.7, 0.809, 1.0, 1.143];
// Loose (cover) → tight (the cap).
const ZOOMS = [1, 1.35, 2, HERO_SCALE_MAX];
// Where the window sits in its travel: the four corners, the centre, two others.
const SPOTS = [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5], [0.2, 0.8], [0.73, 0.31]];
const EPS = 1e-6;

/**
 * A window of the box's shape inside a photo of aspect M: the cover window
 * (the largest of that shape) shrunk by `zoom`, placed at fraction fx/fy of its
 * travel. In pixels it is (w·M) × h, which must equal the box's aspect C.
 */
function windowAt(M, C, zoom, fx, fy) {
  const wide = M >= C;
  const coverW = wide ? (100 * C) / M : 100;
  const coverH = wide ? 100 : (100 * M) / C;
  const w = coverW / zoom;
  const h = coverH / zoom;
  return { x: fx * (100 - w), y: fy * (100 - h), w, h };
}

/** The part of the picture the box shows, read off the resolver's rectangle. */
function shownWindow(geo) {
  return {
    x: (-geo.leftPct / geo.widthPct) * 100,
    y: (-geo.topPct / geo.heightPct) * 100,
    w: (100 / geo.widthPct) * 100,
    h: (100 / geo.heightPct) * 100,
  };
}

const insidePhoto = (s, msg) => {
  assert.ok(s.x >= -EPS && s.y >= -EPS, `${msg}: no gap at the top-left (${JSON.stringify(s)})`);
  assert.ok(s.x + s.w <= 100 + EPS && s.y + s.h <= 100 + EPS, `${msg}: no gap at the bottom-right (${JSON.stringify(s)})`);
};

const contains = (outer, inner, msg) => {
  assert.ok(
    outer.x <= inner.x + EPS && outer.y <= inner.y + EPS
      && outer.x + outer.w >= inner.x + inner.w - EPS
      && outer.y + outer.h >= inner.y + inner.h - EPS,
    `${msg}: shown ${JSON.stringify(outer)} does not contain framed ${JSON.stringify(inner)}`,
  );
};

/** What the hero shows for stored window JSON in a box of aspect C. */
const shownFor = (json, M, C) => {
  const fr = resolveHeroWindowFraming(json, M, C);
  assert.ok(fr, `M ${M} C ${C}: a stored window resolves`);
  return { fr, shown: shownWindow(resolveHeroGeometry(M, C, fr)) };
};

// ── 1. against the real resolver: the box shows exactly the window ───────────
{
  let n = 0;
  for (const M of MEDIA) for (const C of BOXES) for (const z of ZOOMS) for (const [fx, fy] of SPOTS) {
    const win = windowAt(M, C, z, fx, fy);
    const tag = `M ${M} C ${C} zoom ${z} at ${fx},${fy}`;
    near((win.w * M) / win.h, C, `${tag}: the test window has the box's shape`);
    const fr = windowToHeroFraming(win, M, C);
    assert.ok(fr, `${tag}: converts`);
    near(fr.scale, z, `${tag}: scale is the zoom`);
    // The resolver must take the numbers as they are — any clamp on the way in
    // would mean it paints something other than what was converted.
    const asResolved = resolveHeroFraming(fr);
    assert.equal(asResolved.scale, fr.scale, `${tag}: scale is in the resolver's range`);
    assert.equal(asResolved.posX, fr.posX, `${tag}: posX is in the resolver's range`);
    assert.equal(asResolved.posY, fr.posY, `${tag}: posY is in the resolver's range`);
    const geo = resolveHeroGeometry(M, C, fr);
    nearWin(shownWindow(geo), win, `${tag}: the box shows the window`, EPS);
    n++;
  }
  ok(`against the real resolver: ${n} windows paint exactly (1e-6)`);
}

// ── 2. the inverse ───────────────────────────────────────────────────────────
{
  let n = 0;
  for (const M of MEDIA) for (const C of BOXES) for (const z of ZOOMS) for (const [fx, fy] of SPOTS) {
    const win = windowAt(M, C, z, fx, fy);
    const back = heroFramingToWindow(windowToHeroFraming(win, M, C), M, C);
    nearWin(back, win, `M ${M} C ${C} zoom ${z} at ${fx},${fy}: window → framing → window`, 1e-9);
    n++;
  }
  // And from stored numbers (what seeds a cropper): the window it hands back,
  // converted again, paints the same rectangle the numbers paint today.
  for (const M of MEDIA) for (const C of BOXES) for (const scale of ZOOMS)
    for (const posX of [0, 25, 50, 80, 100]) for (const posY of [0, 25, 50, 80, 100]) {
      const f = { scale, posX, posY, fit: 'fill' };
      const win = heroFramingToWindow(f, M, C);
      insidePhoto(win, `M ${M} C ${C} ${JSON.stringify(f)}: seed window`);
      const again = windowToHeroFraming(win, M, C);
      const a = resolveHeroGeometry(M, C, f);
      const b = resolveHeroGeometry(M, C, again);
      for (const k of ['widthPct', 'heightPct', 'leftPct', 'topPct']) {
        near(b[k], a[k], `M ${M} C ${C} ${JSON.stringify(f)}: ${k} survives framing → window → framing`);
      }
      n++;
    }
  ok(`inverse: ${n} round trips`);
}

// ── 3. identities ────────────────────────────────────────────────────────────
{
  for (const M of MEDIA) for (const C of BOXES) {
    const cover = windowAt(M, C, 1, 0.5, 0.5);
    const fr = windowToHeroFraming(cover, M, C);
    near(fr.scale, 1, `M ${M} C ${C}: the centred cover window is scale 1`);
    near(fr.posX, 50, `M ${M} C ${C}: … posX 50`);
    near(fr.posY, 50, `M ${M} C ${C}: … posY 50`);
    nearWin(heroFramingToWindow(HERO_FRAMING_DEFAULTS, M, C), cover, `M ${M} C ${C}: default framing is the centred cover window`);

    // Today's stored hero default, { fit: 'fill', posY: 25 }.
    assert.deepEqual(HERO_DEFAULTS, { fit: 'fill', posY: 25 }, 'today\'s hero default is still fill / posY 25');
    const today = heroFramingToWindow(HERO_DEFAULTS, M, C);
    const back = windowToHeroFraming(today, M, C);
    near(back.scale, 1, `M ${M} C ${C}: today's default comes back at scale 1`);
    near(back.posX, 50, `M ${M} C ${C}: … posX 50`);
    // posY only means something on an axis with travel: a photo taller than the
    // box. Elsewhere the resolver centres it whatever it says, and so do we.
    near(back.posY, M < C ? 25 : 50, `M ${M} C ${C}: … posY ${M < C ? 25 : 50}`);
    const a = resolveHeroGeometry(M, C, HERO_DEFAULTS);
    const b = resolveHeroGeometry(M, C, back);
    for (const k of ['widthPct', 'heightPct', 'leftPct', 'topPct']) {
      near(b[k], a[k], `M ${M} C ${C}: today's default paints the same ${k}`);
    }
  }
  ok('identities: centred cover = {1, 50, 50}; today\'s default round-trips');
}

// ── 4. another box: framed at 0.809, painted at 1.0 and 0.7 ──────────────────
{
  const FRAMED = 0.809;
  let contained = 0;
  let covered = 0;
  for (const M of MEDIA) for (const z of ZOOMS) for (const [fx, fy] of SPOTS) {
    const framed = windowAt(M, FRAMED, z, fx, fy);
    const json = writePictureFit(null, { mode: 'crop', crop: framed, aspect: FRAMED });
    const tag = `M ${M} zoom ${z} at ${fx},${fy}`;

    // The box it was framed in shows it exactly.
    nearWin(shownFor(json, M, FRAMED).shown, framed, `${tag}: same box shows the framed window`, EPS);

    for (const C of [1.0, 0.7]) {
      const { fr, shown } = shownFor(json, M, C);
      insidePhoto(shown, `${tag} → box ${C}`);
      near((shown.w * M) / shown.h, C, `${tag} → box ${C}: the shown window has the new box's shape`);
      // The smallest window of the new shape around the framed one.
      const needH = Math.max(framed.h, (framed.w * M) / C);
      const needW = (needH * C) / M;
      if (needW <= 100 + EPS && needH <= 100 + EPS) {
        contains(shown, framed, `${tag} → box ${C}`);
        contained++;
      } else {
        near(fr.scale, 1, `${tag} → box ${C}: no room, so plain cover`);
        covered++;
      }
    }
  }
  assert.ok(contained > 0 && covered > 0, `both branches exercised (${contained} contained, ${covered} cover)`);
  ok(`another box: ${contained} windows contained, ${covered} fell back to cover, all inside the photo`);
}

// ── 5. the cap ───────────────────────────────────────────────────────────────
{
  assert.equal(HERO_WINDOW_MAX_ZOOM, HERO_SCALE_MAX, 'the cropper\'s max zoom IS the resolver\'s max scale');
  let n = 0;
  for (const M of MEDIA) for (const C of BOXES) for (const [fx, fy] of SPOTS) {
    const tight = windowAt(M, C, 4, fx, fy);
    const tag = `M ${M} C ${C} zoom 4 at ${fx},${fy}`;
    const fr = windowToHeroFraming(tight, M, C);
    assert.equal(fr.scale, HERO_SCALE_MAX, `${tag}: painted at the cap`);
    const shown = shownWindow(resolveHeroGeometry(M, C, fr));
    const capped = windowAt(M, C, HERO_SCALE_MAX, 0, 0);
    near(shown.w, capped.w, `${tag}: the cap's width`, EPS);
    near(shown.h, capped.h, `${tag}: the cap's height`, EPS);
    insidePhoto(shown, tag);
    contains(shown, tight, tag);
    // On the framed centre, unless that would hang off the photo; then slid
    // back by exactly the overhang, never more.
    const cx = tight.x + tight.w / 2;
    const cy = tight.y + tight.h / 2;
    const wantX = Math.min(Math.max(cx - shown.w / 2, 0), 100 - shown.w);
    const wantY = Math.min(Math.max(cy - shown.h / 2, 0), 100 - shown.h);
    near(shown.x, wantX, `${tag}: x on the framed centre, slid inside`, EPS);
    near(shown.y, wantY, `${tag}: y on the framed centre, slid inside`, EPS);
    n++;
  }
  // The centre spot never needs the slide: it lands exactly on the framed centre.
  const t = windowAt(1.5, 0.809, 4, 0.5, 0.5);
  const s = shownWindow(resolveHeroGeometry(1.5, 0.809, windowToHeroFraming(t, 1.5, 0.809)));
  near(s.x + s.w / 2, t.x + t.w / 2, 'centre spot: same x centre', EPS);
  near(s.y + s.h / 2, t.y + t.h / 2, 'centre spot: same y centre', EPS);
  // Never under 1, even for a window bigger than the photo.
  for (const M of MEDIA) for (const C of BOXES) {
    const fr = windowToHeroFraming({ x: -20, y: -20, w: 140, h: 140 }, M, C);
    assert.ok(fr && fr.scale >= 1, `M ${M} C ${C}: an oversized window still paints at scale >= 1`);
    insidePhoto(shownWindow(resolveHeroGeometry(M, C, fr)), `M ${M} C ${C}: oversized window`);
  }
  ok(`the cap: ${n} over-tight windows paint at ${HERO_SCALE_MAX}, on the framed centre, inside the photo`);
}

// ── 6. absent, junk, or unknown aspect → null ────────────────────────────────
{
  const good = writePictureFit(null, { mode: 'crop', crop: windowAt(1.5, 0.809, 1.5, 0.3, 0.6), aspect: 0.809 });
  assert.ok(resolveHeroWindowFraming(good, 1.5, 0.809), 'control: a good window resolves');
  for (const junk of [
    undefined, null, {}, 'crop', 42, [], true,
    { crop: 'x' }, { crop: [1, 2, 3, 4] },
    { crop: { x: 0, y: 0, w: 0, h: 50 } },
    { crop: { x: 0, y: 0, w: NaN, h: 50 } },
    { crop: { x: 0, y: 0, w: 50, h: 50 } }, // no frame aspect
    writePictureFit(null, { mode: 'fit' }), // a fit is not a window
    writePictureFit(null, { mode: 'cover' }),
  ]) {
    assert.equal(resolveHeroWindowFraming(junk, 1.5, 0.809), null, `${JSON.stringify(junk)} → null`);
  }
  for (const bad of [null, undefined, 0, -1, NaN, Infinity, '1.5']) {
    assert.equal(resolveHeroWindowFraming(good, bad, 0.809), null, `media aspect ${bad} → null`);
    assert.equal(resolveHeroWindowFraming(good, 1.5, bad), null, `box aspect ${bad} → null`);
    assert.equal(windowToHeroFraming({ x: 0, y: 0, w: 50, h: 50 }, bad, 0.809), null, `converter, media aspect ${bad} → null`);
    assert.equal(heroFramingToWindow(HERO_FRAMING_DEFAULTS, 1.5, bad), null, `inverse, box aspect ${bad} → null`);
  }
  assert.equal(windowToHeroFraming(null, 1.5, 0.809), null, 'no window → null');
  assert.equal(windowToHeroFraming({ x: 0, y: 0, w: -5, h: 50 }, 1.5, 0.809), null, 'negative window → null');
  ok('absent, junk, or unknown aspect → null');
}

console.log(`\n${passed} hero-window checks passed`);
