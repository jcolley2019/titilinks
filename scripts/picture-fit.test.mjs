// IMG.FIT.1 — unit test for the shared picture fitter (src/lib/picture-fit.ts).
//
// The repo has no unit-test runner; pure checks are standalone .mjs scripts run
// via `npx tsx` (see gallery-framing.test.mjs). Wired into `npm run guard`
// right after gallery-framing.test.mjs.
// Run: `npx tsx scripts/picture-fit.test.mjs`.
//
// The fitter is the gallery's method (a stored rectangle over the untouched
// original) generalised to any box shape: the window a creator framed in one
// box is re-shaped for the box it actually paints into (a link card becomes a
// pair half, a Small with no partner renders as a Large). The null path matters
// most: a row with none of the keys must resolve to plain cover, because that
// is what keeps every existing link card byte-identical.

import assert from 'node:assert/strict';
import {
  resolvePictureFit,
  adaptCrop,
  writePictureFit,
  pictureFitSeed,
  pictureFitSourceAspect,
} from '../src/lib/picture-fit';
import { resolveGalleryCrop, resolveGalleryMediaStyle } from '../src/lib/gallery-framing';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };
const near = (a, b, msg, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${msg} (got ${a}, want ${b})`);

const COVER = { mode: 'cover' };
const LARGE = 16 / 10;
const PAIR = 4 / 3;
const WIDE_SMALL = 16 / 7;

// ── 1. no keys → cover ───────────────────────────────────────────────────────
{
  for (const sj of [null, undefined, {}, 'crop', 42, [], [{ x: 0, y: 0, w: 50, h: 50 }]]) {
    assert.deepEqual(resolvePictureFit(sj, LARGE), COVER, `${JSON.stringify(sj)} → cover`);
  }
  // style_json already carries other per-item keys; none of them is a picture key.
  assert.deepEqual(
    resolvePictureFit({ animation: 'pulse', icon_source: 'none', border_color: '#fff', bg_gradient: { from: '#000', to: '#fff' } }, LARGE),
    COVER,
    'unrelated keys → cover',
  );
  ok('no picture keys → cover (the card keeps today\'s element)');
}

// ── 2. junk in every key → cover, never NaN ──────────────────────────────────
{
  const good = { x: 10, y: 20, w: 50, h: 31.25 };
  const junkCrops = [
    null, 'x', 7, [], {}, { x: 0, y: 0, w: 50 }, { x: '0', y: 0, w: 50, h: 50 },
    { x: NaN, y: 0, w: 50, h: 50 }, { x: 0, y: 0, w: Infinity, h: 50 },
    { x: 0, y: 0, w: 0, h: 50 }, { x: 0, y: 0, w: 50, h: -5 },
  ];
  for (const crop of junkCrops) {
    assert.deepEqual(resolvePictureFit({ crop, crop_aspect: LARGE }, LARGE), COVER, `junk crop ${JSON.stringify(crop)} → cover`);
  }
  const junkAspects = [undefined, null, '1.6', NaN, 0, -1.6, Infinity, {}, [], true];
  for (const crop_aspect of junkAspects) {
    assert.deepEqual(resolvePictureFit({ crop: good, crop_aspect }, LARGE), COVER, `crop_aspect ${String(crop_aspect)} → cover`);
  }
  // A usable crop painted into a box of unknown shape cannot be re-shaped.
  for (const box of [undefined, null, NaN, 0, -1, Infinity, '1.6']) {
    assert.deepEqual(resolvePictureFit({ crop: good, crop_aspect: LARGE }, box), COVER, `box ${String(box)} → cover`);
  }
  // `fit` is a closed vocabulary: only 'contain' means fit.
  for (const fit of ['cover', 'fill', 'CONTAIN', true, 1, null, {}, '']) {
    assert.deepEqual(resolvePictureFit({ fit }, LARGE), COVER, `fit ${JSON.stringify(fit)} alone → cover`);
  }
  // Whatever is stored, a crop result is all finite numbers.
  const rnd = ((seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)(7);
  for (let i = 0; i < 400; i++) {
    const pick = () => [rnd() * 300 - 100, NaN, Infinity, -Infinity, 0, 'a', null][Math.floor(rnd() * 7)];
    const sj = { crop: { x: pick(), y: pick(), w: pick(), h: pick() }, crop_aspect: pick(), fit: rnd() < 0.2 ? 'contain' : pick(), fit_bg: pick() };
    const r = resolvePictureFit(sj, [LARGE, PAIR, 1, WIDE_SMALL][i % 4]);
    assert.ok(['cover', 'crop', 'fit'].includes(r.mode), 'a known mode');
    if (r.mode === 'crop') {
      for (const k of ['left', 'top', 'width', 'height']) {
        assert.ok(Number.isFinite(parseFloat(r.style[k])), `finite ${k} (got ${r.style[k]})`);
      }
      assert.ok(Number.isFinite(r.zoom) && r.zoom >= 1 && r.zoom <= 4, `zoom in [1, 4] (got ${r.zoom})`);
    }
    if (r.mode === 'fit') assert.ok(r.bg === null || /^#[0-9a-fA-F]{6}$/.test(r.bg), `bg is null or #rrggbb (got ${r.bg})`);
  }
  ok('junk in every key → cover, never NaN (400 random rows)');
}

// ── 3. same aspect → exactly the gallery resolver ────────────────────────────
{
  const crops = [
    { x: 0, y: 18.75, w: 100, h: 62.5 },     // suggested cover on a square, numerically
    { x: 20, y: 30, w: 50, h: 31.25 },
    { x: 50, y: 68.75, w: 50, h: 31.25 },    // flush with the far corner
    { x: -10, y: 0, w: 120, h: 75 },         // pre-floor legacy letterbox: clamped
  ];
  for (const crop of crops) {
    const r = resolvePictureFit({ crop, crop_aspect: LARGE }, LARGE);
    assert.equal(r.mode, 'crop');
    assert.deepEqual(r.style, resolveGalleryMediaStyle({ crop }), `same aspect → resolveGalleryMediaStyle for ${JSON.stringify(crop)}`);
    near(r.zoom, Math.min(4, 100 / resolveGalleryCrop({ crop }).w), 'zoom = 100 / w');
    // Within 0.5% is the same shape: no re-shaping happens.
    const r2 = resolvePictureFit({ crop, crop_aspect: LARGE }, LARGE * 1.004);
    assert.deepEqual(r2.style, r.style, 'a 0.4% box difference is the same shape');
  }
  const c = { x: 20, y: 30, w: 50, h: 31.25 };
  assert.equal(adaptCrop(c, LARGE, LARGE), c, 'adaptCrop to the same aspect returns the same object');
  assert.equal(adaptCrop(c, LARGE, LARGE * 0.996), c, 'within 0.5% returns the same object');
  assert.notEqual(adaptCrop(c, LARGE, LARGE * 1.01), c, '1% apart is re-shaped');
  ok('same aspect → identical to resolveGalleryMediaStyle; adaptCrop returns the same object');
}

// ── 4. adaptCrop: re-shape, never stretch, never drop ────────────────────────
{
  const EPS = 1e-6;
  const SOURCES = [
    { name: 'square', S: 1 },
    { name: '9:16', S: 9 / 16 },
    { name: '3:1', S: 3 },
  ];
  const TARGETS = [
    { name: '4:3', T: PAIR },
    { name: '1:1', T: 1 },
    { name: '16:7', T: WIDE_SMALL },
  ];
  // Windows framed in a 16:10 box: in percentages w / h = A / S. Each is given
  // as (w, cx, cy) and must lie inside the photo.
  const framed = (S, w, cx, cy) => {
    const h = (w * S) / LARGE;
    // A requested centre the window cannot reach is pulled in until it fits.
    const x = Math.min(Math.max(cx - w / 2, 0), 100 - w);
    const y = Math.min(Math.max(cy - h / 2, 0), 100 - h);
    return { x, y, w, h };
  };
  let cases = 0;
  let contained = 0;
  let slid = 0;
  for (const { name: sn, S } of SOURCES) {
    // The largest 16:10 window on this source (cover at zoom 1).
    const maxW = Math.min(100, (100 * LARGE) / S);
    const windows = [];
    for (const k of [1, 0.75, 0.5, 0.3]) {
      const w = maxW * k;
      const h = (w * S) / LARGE;
      // centred, hard against the top-left, hard against the bottom-right
      windows.push(framed(S, w, 50, 50));
      windows.push(framed(S, w, w / 2, h / 2));
      windows.push(framed(S, w, 100 - w / 2, 100 - h / 2));
      windows.push(framed(S, w, 30, 70));
    }
    for (const o of windows) {
      // Precondition: the original is a legal 16:10 window on this source.
      assert.ok(o.x >= -EPS && o.y >= -EPS && o.x + o.w <= 100 + EPS && o.y + o.h <= 100 + EPS, `${sn}: fixture inside`);
      near((o.w / o.h) * S, LARGE, `${sn}: fixture is 16:10 in pixels`, EPS);
      for (const { name: tn, T } of TARGETS) {
        cases++;
        const r = adaptCrop(o, LARGE, T);
        const tag = `${sn} ${JSON.stringify(o)} → ${tn}`;
        // inside the photo
        assert.ok(r.x >= -EPS && r.y >= -EPS, `${tag}: x/y >= 0 (got ${r.x}, ${r.y})`);
        assert.ok(r.x + r.w <= 100 + EPS && r.y + r.h <= 100 + EPS, `${tag}: far edges <= 100`);
        // never stretched: the pixel aspect IS the target
        near((r.w / r.h) * S, T, `${tag}: pixel aspect`, EPS);
        // contains the original whenever a window of the new shape that does fits
        const h2 = Math.max(o.h, (o.w * S) / T);
        const w2 = (T * h2) / S;
        if (h2 <= 100 + EPS && w2 <= 100 + EPS) {
          contained++;
          assert.ok(r.x <= o.x + EPS && r.y <= o.y + EPS, `${tag}: contains the original (near edges)`);
          assert.ok(r.x + r.w >= o.x + o.w - EPS && r.y + r.h >= o.y + o.h - EPS, `${tag}: contains the original (far edges)`);
          near(r.h, h2, `${tag}: the SMALLEST containing window`, EPS);
        }
        // the centre holds on any axis no edge forced
        const ocx = o.x + o.w / 2;
        const ocy = o.y + o.h / 2;
        const freeX = r.x > EPS && r.x + r.w < 100 - EPS;
        const freeY = r.y > EPS && r.y + r.h < 100 - EPS;
        if (freeX) near(r.x + r.w / 2, ocx, `${tag}: centre x holds`, EPS);
        if (freeY) near(r.y + r.h / 2, ocy, `${tag}: centre y holds`, EPS);
        if (!freeX || !freeY) slid++;
        // and the result is already inside the fill floor (the clamp leaves it be)
        const again = resolveGalleryCrop({ crop: r });
        for (const k of ['x', 'y', 'w', 'h']) near(again[k], r[k], `${tag}: already legal (${k})`, EPS);
      }
    }
  }
  assert.ok(contained > 20 && slid > 5, `the matrix exercises both containment and slides (${contained} contained, ${slid} slid)`);
  ok(`adaptCrop 16:10 → 4:3 / 1:1 / 16:7 on square, 9:16, 3:1 sources (${cases} cases)`);
}

// ── 5. a crop painted into another shape covers that box ─────────────────────
{
  const crop = { x: 20, y: 30, w: 50, h: 31.25 }; // 16:10 on a square source
  for (const box of [PAIR, 1, WIDE_SMALL]) {
    const r = resolvePictureFit({ crop, crop_aspect: LARGE }, box);
    assert.equal(r.mode, 'crop', `${box}: crop mode`);
    const adapted = adaptCrop(crop, LARGE, box);
    assert.deepEqual(r.style, resolveGalleryMediaStyle({ crop: adapted }), `${box}: the style of the adapted window`);
    const L = parseFloat(r.style.left); const T = parseFloat(r.style.top);
    const W = parseFloat(r.style.width); const H = parseFloat(r.style.height);
    assert.ok(L <= 1e-9 && T <= 1e-9 && L + W >= 100 - 1e-9 && T + H >= 100 - 1e-9, `${box}: the photo covers the box`);
    // The painted rectangle has the photo's own aspect (square here) in a box of `box`.
    near((W * box) / H, 1, `${box}: painted aspect = the photo's`, 1e-9);
  }
  ok('a 16:10 crop painted into 4:3 / 1:1 / 16:7 covers the box with the photo\'s own aspect');
}

// ── 6. fit beats crop; fit_bg is validated ───────────────────────────────────
{
  const crop = { x: 20, y: 30, w: 50, h: 31.25 };
  assert.deepEqual(resolvePictureFit({ fit: 'contain', crop, crop_aspect: LARGE }, LARGE), { mode: 'fit', bg: null }, 'fit wins over crop');
  assert.deepEqual(resolvePictureFit({ fit: 'contain' }, LARGE), { mode: 'fit', bg: null }, 'fit, no background');
  assert.deepEqual(resolvePictureFit({ fit: 'contain', fit_bg: '#FFFFFF' }, LARGE), { mode: 'fit', bg: '#FFFFFF' }, 'a valid colour kept as stored');
  assert.deepEqual(resolvePictureFit({ fit: 'contain', fit_bg: 'fff' }, LARGE), { mode: 'fit', bg: '#ffffff' }, 'short hex normalised');
  for (const fit_bg of ['red', 'rgba(0,0,0,1)', '#ff', 12, null, {}, '', 'transparent']) {
    assert.deepEqual(resolvePictureFit({ fit: 'contain', fit_bg }, LARGE), { mode: 'fit', bg: null }, `bad fit_bg ${JSON.stringify(fit_bg)} → null`);
  }
  // Fit ignores the box shape entirely.
  assert.deepEqual(resolvePictureFit({ fit: 'contain', fit_bg: '#000000' }, NaN), { mode: 'fit', bg: '#000000' }, 'fit needs no box aspect');
  ok('fit beats crop; a bad fit_bg resolves to null');
}

// ── 7. the writer ────────────────────────────────────────────────────────────
{
  const others = {
    animation: 'pulse',
    icon_source: 'avatar',
    icon_color: 'brand',
    icon_image: 'https://example.com/i.png',
    bg_gradient: { from: '#111111', to: '#222222' },
    border_width: 2,
    border_color: '#C9A55C',
  };
  const crop = { x: 20, y: 30, w: 50, h: 31.25 };
  const picture = { crop, crop_aspect: LARGE, fit: 'contain', fit_bg: '#ffffff' };

  // cover clears the picture keys and keeps everything else
  const input = { ...others, ...picture };
  const frozen = JSON.stringify(input);
  assert.deepEqual(writePictureFit(input, { mode: 'cover' }), others, 'cover keeps the other keys');
  assert.equal(JSON.stringify(input), frozen, 'the input is not mutated');
  assert.equal(writePictureFit(picture, { mode: 'cover' }), null, 'nothing left → null');
  assert.equal(writePictureFit(null, { mode: 'cover' }), null, 'null in, cover → null');
  assert.equal(writePictureFit(undefined, { mode: 'cover' }), null, 'undefined in, cover → null');
  assert.equal(writePictureFit('junk', { mode: 'cover' }), null, 'junk in, cover → null');

  // crop writes crop + crop_aspect, never fit
  const wc = writePictureFit({ ...others, fit: 'contain', fit_bg: '#000000' }, { mode: 'crop', crop, aspect: LARGE });
  assert.deepEqual(wc, { ...others, crop, crop_aspect: LARGE }, 'crop replaces fit');
  assert.equal(resolvePictureFit(wc, LARGE).mode, 'crop', 'and resolves as a crop');

  // fit writes fit (+ a valid bg), never crop
  const wf = writePictureFit({ ...others, crop, crop_aspect: LARGE }, { mode: 'fit', bg: '#FFFFFF' });
  assert.deepEqual(wf, { ...others, fit: 'contain', fit_bg: '#FFFFFF' }, 'fit replaces crop');
  assert.deepEqual(resolvePictureFit(wf, LARGE), { mode: 'fit', bg: '#FFFFFF' }, 'and resolves as fit');
  assert.deepEqual(writePictureFit(null, { mode: 'fit', bg: 'not a colour' }), { fit: 'contain' }, 'a bad bg is not stored');
  assert.deepEqual(writePictureFit(null, { mode: 'fit' }), { fit: 'contain' }, 'no bg → no fit_bg');
  assert.deepEqual(writePictureFit(null, { mode: 'fit', bg: null }), { fit: 'contain' }, 'null bg → no fit_bg');

  // an unusable crop choice stores no picture keys
  assert.equal(writePictureFit(null, { mode: 'crop', crop: { x: 0, y: 0, w: 0, h: 50 }, aspect: LARGE }), null, 'zero-width crop → nothing');
  assert.equal(writePictureFit(null, { mode: 'crop', crop, aspect: NaN }), null, 'no usable aspect → nothing');
  assert.deepEqual(writePictureFit({ animation: 'glow' }, { mode: 'crop', crop, aspect: 0 }), { animation: 'glow' }, 'bad aspect keeps the others');

  // never crop and fit together, whatever sequence of choices
  let sj = { ...others };
  const choices = [
    { mode: 'crop', crop, aspect: LARGE },
    { mode: 'fit', bg: '#000000' },
    { mode: 'crop', crop, aspect: PAIR },
    { mode: 'cover' },
    { mode: 'fit' },
    { mode: 'crop', crop, aspect: LARGE },
  ];
  for (const ch of choices) {
    sj = writePictureFit(sj, ch);
    const keys = Object.keys(sj || {});
    assert.ok(!(keys.includes('fit') && keys.includes('crop')), `never crop and fit together after ${ch.mode}`);
    for (const k of Object.keys(others)) assert.deepEqual(sj[k], others[k], `${k} survives ${ch.mode}`);
  }
  ok('the writer keeps other keys, returns null when empty, never leaves crop and fit together');
}

// ── 8. the sheet seed ────────────────────────────────────────────────────────
{
  assert.deepEqual(pictureFitSeed(null, LARGE), { mode: 'fill', crop: null, bg: null }, 'nothing → fill, suggested framing');
  assert.deepEqual(pictureFitSeed({ fit: 'contain', fit_bg: '#000000' }, LARGE), { mode: 'fit', crop: null, bg: '#000000' }, 'fit seeds fit');
  const crop = { x: 20, y: 30, w: 50, h: 31.25 };
  assert.deepEqual(pictureFitSeed({ crop, crop_aspect: LARGE }, LARGE), { mode: 'fill', crop, bg: null }, 'same box → the stored window');
  assert.deepEqual(pictureFitSeed({ crop, crop_aspect: LARGE }, PAIR), { mode: 'fill', crop: adaptCrop(crop, LARGE, PAIR), bg: null }, 'another box → the adapted window');
  assert.deepEqual(pictureFitSeed({ crop }, LARGE), { mode: 'fill', crop: null, bg: null }, 'a crop with no crop_aspect seeds nothing (it renders cover)');
  ok('the sheet seed mirrors the render: fit, an adapted window, or the suggested framing');
}

// ── 9. HERO.FIT.2: the source picture's aspect, from a stored crop ───────────
{
  // A 16:10 window that is 50% × 31.25% of the picture → the picture is square.
  near(pictureFitSourceAspect({ crop: { x: 20, y: 30, w: 50, h: 31.25 }, crop_aspect: LARGE }), 1, 'a 16:10 window, 50 × 31.25 → a square source');
  // Any window cut from a picture of aspect S in a frame of aspect A.
  let n = 0;
  for (const S of [0.5, 0.667, 1, 1.109, 1.5, 2]) for (const A of [0.46, 0.809, 1, LARGE]) for (const w of [20, 55, 100]) {
    const h = (w * S) / A;
    if (h > 100) continue;
    n++;
    near(pictureFitSourceAspect({ crop: { x: 0, y: 0, w, h }, crop_aspect: A }), S, `S ${S} A ${A} w ${w}`, 1e-9);
  }
  assert.ok(n > 30, 'the sweep ran');
  // What the writer produces reads back.
  const stored = writePictureFit(null, { mode: 'crop', crop: { x: 10, y: 5, w: 80, h: 90 }, aspect: 0.809 });
  near(pictureFitSourceAspect(stored), (0.809 * 90) / 80, 'a written window reads back');
  // No usable crop → null.
  for (const junk of [
    null, undefined, {}, 'crop', 42, [], { crop: { x: 0, y: 0, w: 50, h: 50 } }, { crop_aspect: 1 },
    { crop: { x: 0, y: 0, w: 0, h: 50 }, crop_aspect: 1 }, { crop: { x: 0, y: 0, w: 50, h: 50 }, crop_aspect: 0 },
    { crop: { x: 0, y: 0, w: 50, h: 50 }, crop_aspect: NaN },
    { fit: 'contain', crop: { x: 0, y: 0, w: 50, h: 50 }, crop_aspect: 1 },
    writePictureFit(null, { mode: 'fit' }), writePictureFit(null, { mode: 'cover' }),
  ]) assert.equal(pictureFitSourceAspect(junk), null, `${JSON.stringify(junk)} → null`);
  ok('pictureFitSourceAspect: crop_aspect · h / w, null without a usable crop');
}

console.log(`\nAll ${passed} picture-fit checks passed.`);
