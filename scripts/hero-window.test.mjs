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
  heroDisplayRegion,
  heroFaceWindow,
  HERO_FACE_PRESETS,
  HERO_BOX_ASPECTS,
  HERO_WINDOW_MAX_ZOOM,
} from '../src/lib/hero-window';
import {
  resolveHeroGeometry,
  resolveHeroFraming,
  HERO_FRAMING_DEFAULTS,
  HERO_SCALE_MAX,
} from '../src/lib/hero-framing';
import { writePictureFit, pictureFitSeed } from '../src/lib/picture-fit';
import { HERO_DEFAULTS } from '../src/lib/surface';
import { DEVICE_PRESETS, canonicalHeroAspect, canonicalFullBleedAspect } from '../src/lib/device-presets';

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

// ── 7. HERO.FIT.2: the display region and the window stored over it ─────────
// Apply Crop bakes heroDisplayRegion's region and stores its window. Painted
// through the REAL resolver, that pair must show (a) exactly what was framed at
// the frame's own shape, and (b) for every box shape in range, exactly what
// painting the same window over the WHOLE original would — so a visitor loses
// nothing by never being sent the original.
{
  const SOURCES = [
    { width: 2000, height: 3000 }, // portrait
    { width: 2000, height: 2000 }, // square
    { width: 3000, height: 2000 }, // landscape
    { width: 1200, height: 1600 },
    { width: 4096, height: 2731 },
  ];
  const FRAMES = [
    { kind: 'hero', aspect: canonicalHeroAspect() },
    { kind: 'full_bleed', aspect: canonicalFullBleedAspect() },
  ];
  const CROP_ZOOMS = [1, 1.25, 1.5, 2, 3];
  // The centre, against each edge, the corners, two others.
  const PLACES = [[0.5, 0.5], [0, 0.5], [1, 0.5], [0.5, 0], [0.5, 1], [0, 0], [1, 1], [1, 0], [0, 1], [0.2, 0.8], [0.73, 0.31]];
  const steps = (lo, hi, n) => Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
  /** What react-easy-crop reports: the frame-shaped window at `zoom`, in whole source pixels. */
  const framedPixels = (src, aspect, zoom, fx, fy) => {
    const M = src.width / src.height;
    const cw = (M >= aspect ? src.height * aspect : src.width) / zoom;
    const ch = (M >= aspect ? src.height : src.width / aspect) / zoom;
    const width = Math.round(cw);
    const height = Math.round(ch);
    return { x: Math.round(fx * (src.width - width)), y: Math.round(fy * (src.height - height)), width, height };
  };
  /** A window in percent of a w × h picture, as source pixels (given the picture's origin). */
  const toPixels = (win, origin, w, h) => ({
    x0: origin.x + (win.x / 100) * w, x1: origin.x + ((win.x + win.w) / 100) * w,
    y0: origin.y + (win.y / 100) * h, y1: origin.y + ((win.y + win.h) / 100) * h,
  });

  let cases = 0;
  let boxes = 0;
  let worstAtFrame = 0;
  let worstVsOriginal = 0;
  let worstScale = 1;
  let uncapped = 0;
  for (const src of SOURCES) for (const frame of FRAMES) for (const zoom of CROP_ZOOMS) for (const [fx, fy] of PLACES) {
    const range = HERO_BOX_ASPECTS[frame.kind];
    const framed = framedPixels(src, frame.aspect, zoom, fx, fy);
    const tag = `${src.width}x${src.height} ${frame.kind} zoom ${zoom} at ${fx},${fy}`;
    const out = heroDisplayRegion(framed, src, range);
    assert.ok(out, `${tag}: resolves`);
    const { region, window: win } = out;
    cases++;

    // The region is whole pixels inside the source; the window is inside 0..100.
    for (const k of ['x', 'y', 'width', 'height']) assert.ok(Number.isInteger(region[k]), `${tag}: region.${k} is a whole pixel (${region[k]})`);
    assert.ok(region.x >= 0 && region.y >= 0 && region.width > 0 && region.height > 0, `${tag}: region is inside the source (top-left)`);
    assert.ok(region.x + region.width <= src.width && region.y + region.height <= src.height, `${tag}: region is inside the source (bottom-right)`);
    assert.ok(win.x >= 0 && win.y >= 0 && win.w > 0 && win.h > 0, `${tag}: window starts inside 0..100`);
    assert.ok(win.x + win.w <= 100 + 1e-9 && win.y + win.h <= 100 + 1e-9, `${tag}: window ends inside 0..100`);
    // …and it is the framed rectangle, in the region's own pixels.
    const back = toPixels(win, region, region.width, region.height);
    near(back.x0, framed.x, `${tag}: window left = framed left`, 1e-6);
    near(back.x1, framed.x + framed.width, `${tag}: window right = framed right`, 1e-6);
    near(back.y0, framed.y, `${tag}: window top = framed top`, 1e-6);
    near(back.y1, framed.y + framed.height, `${tag}: window bottom = framed bottom`, 1e-6);

    const fileAspect = region.width / region.height;
    const stored = writePictureFit(null, { mode: 'crop', crop: win, aspect: frame.aspect });
    const overOriginal = writePictureFit(null, {
      mode: 'crop',
      crop: {
        x: (100 * framed.x) / src.width, y: (100 * framed.y) / src.height,
        w: (100 * framed.width) / src.width, h: (100 * framed.height) / src.height,
      },
      aspect: frame.aspect,
    });
    assert.ok(stored && overOriginal, `${tag}: both windows are storable`);

    // (a) at the frame's shape the box shows what was framed, within 0.5%.
    {
      const { fr, shown } = shownFor(stored, fileAspect, frame.aspect);
      const px = toPixels(shown, region, region.width, region.height);
      const err = Math.max(
        Math.abs(px.x0 - framed.x) / framed.width, Math.abs(px.x1 - framed.x - framed.width) / framed.width,
        Math.abs(px.y0 - framed.y) / framed.height, Math.abs(px.y1 - framed.y - framed.height) / framed.height,
      );
      worstAtFrame = Math.max(worstAtFrame, err);
      assert.ok(err < 0.005, `${tag}: at the frame's shape shown == framed within 0.5% (off by ${(err * 100).toFixed(3)}%)`);
      worstScale = Math.max(worstScale, fr.scale);
    }

    // (b) every box shape in range.
    for (const box of [...steps(range[0], range[1], 13), frame.aspect]) {
      boxes++;
      const fromFile = shownFor(stored, fileAspect, box);
      // The reference: the REAL resolver painting the same framed window over
      // the WHOLE original. Past its 2.5 cap the resolver cannot paint a crop
      // that tight from the original (it would show more than was framed), so
      // there the reference is the window itself, re-shaped for this box —
      // which the display file does paint: one more thing it fixes.
      const fromOriginal = shownFor(overOriginal, src.width / src.height, box);
      const capped = fromOriginal.fr.scale >= HERO_SCALE_MAX - 1e-9;
      const ideal = capped ? pictureFitSeed(overOriginal, box).crop : fromOriginal.shown;
      assert.ok(ideal, `${tag} box ${box.toFixed(3)}: the whole-original window resolves`);
      if (!capped) uncapped++;
      worstScale = Math.max(worstScale, fromFile.fr.scale);
      assert.ok(fromFile.fr.scale < 1.1, `${tag} box ${box.toFixed(3)}: the resolver's scale stays under 1.1 (${fromFile.fr.scale})`);
      insidePhoto(fromFile.shown, `${tag} box ${box.toFixed(3)}`);
      const a = toPixels(fromFile.shown, region, region.width, region.height);
      const b = toPixels(ideal, { x: 0, y: 0 }, src.width, src.height);
      const err = Math.max(
        Math.abs(a.x0 - b.x0) / src.width, Math.abs(a.x1 - b.x1) / src.width,
        Math.abs(a.y0 - b.y0) / src.height, Math.abs(a.y1 - b.y1) / src.height,
      );
      worstVsOriginal = Math.max(worstVsOriginal, err);
      assert.ok(err < 0.002, `${tag} box ${box.toFixed(3)}: equals painting the whole original within 0.2% of the source (off by ${(err * 100).toFixed(3)}%)`);
      // The framed window stays whole whenever the whole original would keep it whole.
      const SLACK = 0.75; // source pixels: both sides are rounded to whole pixels
      const holds = (p) => p.x0 <= framed.x + SLACK && p.y0 <= framed.y + SLACK
        && p.x1 >= framed.x + framed.width - SLACK && p.y1 >= framed.y + framed.height - SLACK;
      const tight = (p) => p.x0 <= framed.x + 1e-6 && p.y0 <= framed.y + 1e-6
        && p.x1 >= framed.x + framed.width - 1e-6 && p.y1 >= framed.y + framed.height - 1e-6;
      if (tight(b)) assert.ok(holds(a), `${tag} box ${box.toFixed(3)}: framed is inside what is shown (${JSON.stringify(a)} vs ${JSON.stringify(framed)})`);
    }
  }
  ok(`display region: ${cases} crops, ${boxes} paints (${uncapped} against the resolver over the whole original, the rest past its cap); at the frame's shape off by <= ${(worstAtFrame * 100).toFixed(3)}%, vs the whole original <= ${(worstVsOriginal * 100).toFixed(3)}% of the source, scale <= ${worstScale.toFixed(4)}`);
  assert.ok(worstScale < 1.1, 'the resolver scale never reaches 1.1');

  // A framed rectangle a pixel past an edge is clamped into the source first.
  {
    const src = { width: 2000, height: 3000 };
    const out = heroDisplayRegion({ x: -1, y: 2400, width: 1334, height: 1649 }, src, HERO_BOX_ASPECTS.hero);
    assert.ok(out, 'an overhanging framed rectangle still resolves');
    assert.ok(out.region.x >= 0 && out.region.y + out.region.height <= 3000, 'its region is inside the source');
    assert.ok(out.window.x >= 0 && out.window.y + out.window.h <= 100 + 1e-9, 'its window is inside 0..100');
  }
  // No room at all (the source is the frame's shape, zoom 1): the region is the source.
  {
    const src = { width: 402, height: 497 };
    const out = heroDisplayRegion({ x: 0, y: 0, width: 402, height: 497 }, src, HERO_BOX_ASPECTS.hero);
    assert.deepEqual(out.region, { x: 0, y: 0, width: 402, height: 497 }, 'no margin to add: the whole source');
    assert.deepEqual(out.window, { x: 0, y: 0, w: 100, h: 100 }, 'and the window is all of it');
  }
  // Junk → null.
  const good = { x: 100, y: 100, width: 800, height: 989 };
  const src = { width: 2000, height: 3000 };
  assert.ok(heroDisplayRegion(good, src, HERO_BOX_ASPECTS.hero), 'control: a good crop resolves');
  for (const bad of [
    null, undefined, {}, { x: 0, y: 0, width: 0, height: 10 }, { x: 0, y: 0, width: 10, height: -1 },
    { x: NaN, y: 0, width: 10, height: 10 }, { x: 0, y: Infinity, width: 10, height: 10 },
    { x: 0, y: 0, width: '10', height: 10 }, { x: 5000, y: 0, width: 10, height: 10 },
  ]) assert.equal(heroDisplayRegion(bad, src, HERO_BOX_ASPECTS.hero), null, `framed ${JSON.stringify(bad)} → null`);
  for (const bad of [null, undefined, {}, { width: 0, height: 10 }, { width: 10, height: NaN }, { width: -5, height: 5 }]) {
    assert.equal(heroDisplayRegion(good, bad, HERO_BOX_ASPECTS.hero), null, `source ${JSON.stringify(bad)} → null`);
  }
  for (const bad of [null, undefined, [], [0, 1], [1, NaN], [0.78], 'range']) {
    assert.equal(heroDisplayRegion(good, src, bad), null, `range ${JSON.stringify(bad)} → null`);
  }
  ok('display region: overhang is clamped, no room degrades to the source, junk → null');
}

// ── 8. HERO.FIT.2: every device preset's box is inside HERO_BOX_ASPECTS ──────
// The hero box is the page column (at most 640 px) by min(50% of the height +
// 60, 560); the full-screen layer is the column by the whole height.
{
  for (const p of DEVICE_PRESETS) {
    const w = Math.min(p.width, 640);
    const hero = w / Math.min(p.height * 0.5 + 60, 560);
    const full = w / p.height;
    assert.ok(hero >= HERO_BOX_ASPECTS.hero[0] && hero <= HERO_BOX_ASPECTS.hero[1], `${p.id}: hero box ${hero.toFixed(3)} is inside ${HERO_BOX_ASPECTS.hero}`);
    assert.ok(full >= HERO_BOX_ASPECTS.full_bleed[0] && full <= HERO_BOX_ASPECTS.full_bleed[1], `${p.id}: full-screen box ${full.toFixed(3)} is inside ${HERO_BOX_ASPECTS.full_bleed}`);
  }
  for (const [kind, aspect] of [['hero', canonicalHeroAspect()], ['full_bleed', canonicalFullBleedAspect()]]) {
    assert.ok(aspect > HERO_BOX_ASPECTS[kind][0] && aspect < HERO_BOX_ASPECTS[kind][1], `the ${kind} crop frame is inside its range`);
  }
  ok(`all ${DEVICE_PRESETS.length} device presets land inside HERO_BOX_ASPECTS, hero and full-screen`);
}

// ── 9. HERO.FIT.3: the face window presets ───────────────────────────────────
// Headshot / Shoulders / Full Body seed the cropper with a window of the
// frame's shape around the detected face. Portrait, square and landscape
// sources; a face in the centre and against each edge; three face sizes (one
// small enough to hit the cropper's max zoom, one large enough to hit the
// cover window); all three presets; both frames.
{
  const MAX_ZOOM = 3;
  const SOURCES = [
    { width: 2000, height: 3000 }, // portrait
    { width: 2000, height: 2000 }, // square
    { width: 3000, height: 2000 }, // landscape
  ];
  const FRAMES = [canonicalHeroAspect(), canonicalFullBleedAspect()];
  // Where the face box sits in its travel: the centre, against each edge, and
  // two spots off the centre (so "exactly on the preset" is not only centred faces).
  const SPOTS_FACE = [[0.5, 0.5], [0, 0.5], [1, 0.5], [0.5, 0], [0.5, 1], [0.4, 0.4], [0.6, 0.45]];
  // The face's width as a fraction of the source's shorter side.
  const FACE_SIZES = [0.02, 0.08, 0.14, 0.3, 0.6];
  const TINY = 1e-9;

  assert.deepEqual(Object.keys(HERO_FACE_PRESETS), ['headshot', 'shoulders', 'fullbody'], 'three presets, in button order');
  for (const [name, p] of Object.entries(HERO_FACE_PRESETS)) {
    assert.ok(p.faceWidth > 0 && p.faceWidth < 1, `${name}: faceWidth is a fraction of the frame`);
    assert.ok(p.faceCentreY > 0 && p.faceCentreY < 0.5, `${name}: the face sits in the upper half`);
  }
  assert.ok(
    HERO_FACE_PRESETS.headshot.faceWidth > HERO_FACE_PRESETS.shoulders.faceWidth
      && HERO_FACE_PRESETS.shoulders.faceWidth > HERO_FACE_PRESETS.fullbody.faceWidth,
    'headshot is the tightest, full body the loosest',
  );

  let cases = 0;
  let exact = 0;
  let atMaxZoom = 0;
  let atCover = 0;
  let slid = 0;
  for (const src of SOURCES) for (const frame of FRAMES) for (const preset of Object.keys(HERO_FACE_PRESETS))
    for (const size of FACE_SIZES) for (const [fx, fy] of SPOTS_FACE) {
      const side = Math.min(src.width, src.height) * size;
      // A face box is a little taller than wide.
      const face = { x: fx * (src.width - side), y: fy * (src.height - side * 1.2), w: side, h: side * 1.2 };
      const tag = `${src.width}x${src.height} frame ${frame.toFixed(3)} ${preset} face ${size} at ${fx},${fy}`;
      const win = heroFaceWindow(face, src, frame, preset, MAX_ZOOM);
      assert.ok(win, `${tag}: resolves`);
      cases++;

      // In source pixels.
      const W = (win.w / 100) * src.width;
      const H = (win.h / 100) * src.height;
      const X = (win.x / 100) * src.width;
      const Y = (win.y / 100) * src.height;

      // The frame's shape, within 0.5%.
      assert.ok(Math.abs(W / H / frame - 1) < 0.005, `${tag}: the window has the frame's shape (${(W / H).toFixed(4)} vs ${frame.toFixed(4)})`);
      // Inside 0..100.
      assert.ok(win.x >= -TINY && win.y >= -TINY && win.w > 0 && win.h > 0, `${tag}: starts inside 0..100 (${JSON.stringify(win)})`);
      assert.ok(win.x + win.w <= 100 + TINY && win.y + win.h <= 100 + TINY, `${tag}: ends inside 0..100 (${JSON.stringify(win)})`);
      // Both size clamps: never tighter than the cropper's max zoom, never
      // larger than the cover window.
      const coverW = src.width / src.height >= frame ? src.height * frame : src.width;
      assert.ok(W <= coverW + 1e-6, `${tag}: no wider than the cover window (${W} vs ${coverW})`);
      assert.ok(W >= coverW / MAX_ZOOM - 1e-6, `${tag}: no tighter than max zoom (${W} vs ${coverW / MAX_ZOOM})`);

      const p = HERO_FACE_PRESETS[preset];
      const wanted = face.w / p.faceWidth;
      const sizeClamped = wanted > coverW + 1e-9 || wanted < coverW / MAX_ZOOM - 1e-9;
      if (wanted > coverW + 1e-9) atCover++;
      if (wanted < coverW / MAX_ZOOM - 1e-9) atMaxZoom++;
      const faceCX = face.x + face.w / 2;
      const faceCY = face.y + face.h / 2;
      const wantX = faceCX - W / 2;
      const wantY = faceCY - H * p.faceCentreY;
      const slidX = wantX < -1e-9 || wantX > src.width - W + 1e-9;
      const slidY = wantY < -1e-9 || wantY > src.height - H + 1e-9;
      if (slidX || slidY) slid++;
      // Where an axis did not slide the face is on its mark on that axis,
      // whatever the size clamp did.
      if (!slidX) near(X + W / 2, faceCX, `${tag}: centred on the face`, 1e-6);
      if (!slidY) near((faceCY - Y) / H, p.faceCentreY, `${tag}: the face centre sits at faceCentreY`, 1e-9);
      // Where nothing clamped or slid: exactly the preset.
      if (!sizeClamped && !slidX && !slidY) {
        near(face.w / W, p.faceWidth, `${tag}: the face is exactly faceWidth wide`, 1e-9);
        near((faceCY - Y) / H, p.faceCentreY, `${tag}: the face centre is exactly at faceCentreY`, 1e-9);
        near(X + W / 2, faceCX, `${tag}: the window is centred on the face`, 1e-6);
        exact++;
      }
      // A slide moves the window by the overhang, never further.
      if (slidX) near(X, wantX < 0 ? 0 : src.width - W, `${tag}: slid to the edge, x`, 1e-6);
      if (slidY) near(Y, wantY < 0 ? 0 : src.height - H, `${tag}: slid to the edge, y`, 1e-6);

      // What the cropper is seeded with resolves to the same window: it is
      // storable, and reading it back for the same frame leaves it untouched.
      const seeded = pictureFitSeed(writePictureFit(null, { mode: 'crop', crop: win, aspect: frame }), frame).crop;
      assert.ok(seeded, `${tag}: the window is a storable crop`);
      nearWin(seeded, win, `${tag}: the stored window reads back unchanged`, 1e-6);
    }
  assert.ok(exact > 0 && atMaxZoom > 0 && atCover > 0 && slid > 0,
    `every branch exercised (${exact} exact, ${atMaxZoom} at max zoom, ${atCover} at cover, ${slid} slid)`);
  ok(`face window: ${cases} windows of the frame's shape inside the source (${exact} exactly on the preset, ${atMaxZoom} held at max zoom, ${atCover} held at cover, ${slid} slid inside)`);

  // The default max zoom is the cropper's: 3.
  {
    const src = { width: 2000, height: 3000 };
    const tiny = { x: 990, y: 1490, w: 20, h: 20 };
    const frame = canonicalHeroAspect();
    nearWin(heroFaceWindow(tiny, src, frame, 'headshot'), heroFaceWindow(tiny, src, frame, 'headshot', 3), 'default max zoom is 3');
    near(heroFaceWindow(tiny, src, frame, 'headshot').w, 100 / 3, 'a tiny face is held at zoom 3');
    near(heroFaceWindow(tiny, src, frame, 'headshot', 1).w, 100, 'max zoom 1 is the cover window');
  }

  // Junk → null.
  const src = { width: 2000, height: 3000 };
  const face = { x: 800, y: 900, w: 400, h: 480 };
  const frame = canonicalHeroAspect();
  assert.ok(heroFaceWindow(face, src, frame, 'headshot'), 'control: a good face resolves');
  for (const bad of [
    null, undefined, {}, 'face', 42,
    { x: 0, y: 0, w: 0, h: 10 }, { x: 0, y: 0, w: 10, h: 0 }, { x: 0, y: 0, w: -10, h: 10 },
    { x: NaN, y: 0, w: 10, h: 10 }, { x: 0, y: Infinity, w: 10, h: 10 }, { x: 0, y: 0, w: '10', h: 10 },
  ]) assert.equal(heroFaceWindow(bad, src, frame, 'headshot'), null, `face ${JSON.stringify(bad)} → null`);
  for (const bad of [null, undefined, {}, { width: 0, height: 10 }, { width: 10, height: NaN }, { width: -5, height: 5 }, { width: '2000', height: 3000 }]) {
    assert.equal(heroFaceWindow(face, bad, frame, 'headshot'), null, `source ${JSON.stringify(bad)} → null`);
  }
  for (const bad of [null, undefined, 0, -1, NaN, Infinity, '0.8']) {
    assert.equal(heroFaceWindow(face, src, bad, 'headshot'), null, `frame aspect ${bad} → null`);
  }
  for (const bad of [null, undefined, '', 'portrait', 'toString', 'constructor', 7]) {
    assert.equal(heroFaceWindow(face, src, frame, bad), null, `preset ${String(bad)} → null`);
  }
  for (const bad of [0, 0.5, -3, NaN, Infinity, '3', null]) {
    assert.equal(heroFaceWindow(face, src, frame, 'headshot', bad), null, `max zoom ${bad} → null`);
  }
  ok('face window: default max zoom is 3; junk → null');
}

console.log(`\n${passed} hero-window checks passed`);
