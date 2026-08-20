// TL.GAL.3a — unit test for the gallery framing resolver (src/lib/gallery-framing.ts).
//
// The repo has no unit-test runner; pure checks are standalone .mjs scripts run
// via `npx tsx` (see hero-framing.test.mjs). Wired into `npm run guard`.
// Run: `npx tsx scripts/gallery-framing.test.mjs`.
//
// This resolver IS the definition of gallery framing — every gallery tile that
// paints a cropped photo resolves its CSS here, exactly as hero media resolves
// through resolveHeroMediaStyle. The null path matters as much as the maths:
// no row carries a crop today, so "null → the caller's untouched object-cover"
// is what keeps TL.GAL.3a behaviour-identical by construction.

import assert from 'node:assert/strict';
import {
  resolveGalleryCrop,
  resolveGalleryGeometry,
  resolveGalleryMediaStyle,
  GALLERY_MIN_ZOOM,
} from '../src/lib/gallery-framing';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };
const near = (a, b, msg, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${msg} (got ${a}, want ${b})`);

const style = (crop) => resolveGalleryMediaStyle({ crop });
const geo = (crop) => resolveGalleryGeometry({ crop });

// ── 1. no crop → null, so the caller keeps its object-cover ──────────────────
{
  // Every shape a real block_items row can hold before the crop UI exists.
  assert.equal(resolveGalleryMediaStyle(null), null, 'null style_json → null');
  assert.equal(resolveGalleryMediaStyle(undefined), null, 'absent style_json → null');
  assert.equal(resolveGalleryMediaStyle({}), null, 'empty style_json → null');
  assert.equal(resolveGalleryMediaStyle('{"crop":{}}'), null, 'a JSON string is not a crop');
  assert.equal(resolveGalleryMediaStyle([{ x: 0, y: 0, w: 50, h: 50 }]), null, 'an array is not a crop');
  // style_json already carries OTHER per-item keys (ANIM.1 animation, borders).
  // Their presence must never be mistaken for a crop.
  assert.equal(
    resolveGalleryMediaStyle({ animation: 'pulse', border_color: '#fff' }),
    null,
    'unrelated style_json keys → null',
  );
  ok('no crop → null (caller keeps object-cover)');
}

// ── 2. malformed crops → null, never NaN geometry ────────────────────────────
{
  // A NaN percentage would paint `width: NaN%` and blank the tile. The column
  // is free-form JSON, so a hand-edited or legacy row can hold anything.
  assert.equal(style({ x: 0, y: 0, w: 75 }), null, 'missing h → null');
  assert.equal(style({ y: 0, w: 75, h: 100 }), null, 'missing x → null');
  assert.equal(style({ x: '0', y: 0, w: 75, h: 100 }), null, 'string x → null');
  assert.equal(style({ x: 0, y: 0, w: '75', h: 100 }), null, 'string w → null');
  assert.equal(style({ x: NaN, y: 0, w: 75, h: 100 }), null, 'NaN x → null');
  assert.equal(style({ x: 0, y: 0, w: Infinity, h: 100 }), null, 'infinite w → null');
  assert.equal(style({ x: 0, y: 0, w: null, h: 100 }), null, 'null w → null');
  // Zero/negative windows divide by zero or mirror the image.
  assert.equal(style({ x: 0, y: 0, w: 0, h: 100 }), null, 'zero w → null');
  assert.equal(style({ x: 0, y: 0, w: 75, h: 0 }), null, 'zero h → null');
  assert.equal(style({ x: 0, y: 0, w: -75, h: 100 }), null, 'negative w → null');
  assert.equal(style({ x: 0, y: 0, w: 75, h: -100 }), null, 'negative h → null');
  assert.equal(resolveGalleryMediaStyle({ crop: null }), null, 'null crop → null');
  assert.equal(resolveGalleryMediaStyle({ crop: 'full' }), null, 'non-object crop → null');
  ok('malformed crops → null, never NaN geometry');
}

// ── 3. the auto-cover case: a 4:3 photo squared into a 1:1 tile ──────────────
{
  // react-easy-crop's croppedArea for a landscape 4:3 image at zoom 1, centred:
  // the window spans the full height and three quarters of the width, inset an
  // eighth from the left. This is what the cropper hands back untouched, and
  // the numbers below are the pinned contract.
  const g = geo({ x: 12.5, y: 0, w: 75, h: 100 });
  near(g.widthPct, 400 / 3, 'image is blown up to 133.33% of the tile');
  near(g.heightPct, 100, 'the window spans the full height, so height is 1:1');
  near(g.leftPct, -50 / 3, 'and slid left by 16.67% to bring the window to the corner');
  near(g.topPct, 0, 'no vertical slide');

  // Rounded, so a screenshot diff can be read by eye: 133.33 / 100 / -16.67 / 0.
  assert.equal(g.widthPct.toFixed(2), '133.33', 'width 133.33%');
  assert.equal(g.leftPct.toFixed(2), '-16.67', 'left -16.67%');

  // The defining property of a crop-to-cover: the image covers the tile on both
  // axes (>= 100%) and its overhang is exactly what the window excluded.
  assert.ok(g.widthPct >= 100 && g.heightPct >= 100, 'a cover crop leaves no gap');
  near(g.leftPct, -(g.widthPct - 100) / 2, 'a centred window centres the overhang');

  const s = style({ x: 12.5, y: 0, w: 75, h: 100 });
  assert.equal(s.width, `${g.widthPct}%`, 'style width mirrors the geometry');
  assert.equal(s.height, `${g.heightPct}%`, 'style height mirrors the geometry');
  assert.equal(s.left, `${g.leftPct}%`, 'style left mirrors the geometry');
  assert.equal(s.top, `${g.topPct}%`, 'style top mirrors the geometry');
  ok('auto-cover: 4:3 photo squared into a 1:1 tile');
}

// ── 4. TL.GAL.3b.1: a legacy letterbox row clamps to the nearest fill crop ───
{
  // The withdrawn rule let a user zoom out past the image edges, storing a
  // window LARGER than the photo (w/h > 100) with its corner off it (x/y < 0).
  // Those rows still exist. They must never paint a floating photo again, so
  // they are pulled back to the closest window that fills the tile.
  //
  // This one is 1.5x the image wide and 2x tall — which is the fully zoomed-out
  // letterbox of a 4:3 landscape (150·W == 200·H ⇒ W/H == 4/3). Shrinking it by
  // ONE factor (0.5) keeps it square in pixels and lands it exactly on that
  // photo's auto-cover window — the pinned numbers from section 3.
  assert.deepEqual(
    resolveGalleryCrop({ crop: { x: -25, y: -50, w: 150, h: 200 } }),
    { x: 12.5, y: 0, w: 75, h: 100 },
    'the 4:3 letterbox clamps onto its own auto-cover window',
  );
  const g = geo({ x: -25, y: -50, w: 150, h: 200 });
  near(g.widthPct, 400 / 3, 'so it paints the section-3 geometry');
  near(g.heightPct, 100, 'full height');
  near(g.leftPct, -50 / 3, 'slid left, not inset right');
  near(g.topPct, 0, 'no vertical slide');

  // Independent per-axis clamping would have given { w: 100, h: 100 } — square
  // in PERCENTAGES, which for a 4:3 photo is a rectangle the tile then
  // stretches. One shared factor is what keeps the pixels square.
  assert.notDeepEqual(
    resolveGalleryCrop({ crop: { x: -25, y: -50, w: 150, h: 200 } }),
    { x: 0, y: 0, w: 100, h: 100 },
    'the axes are NOT clamped independently (that would skew the window)',
  );

  // The centre survives wherever the edges allow it. Zoomed out only a little,
  // off-centre: the window shrinks about its own middle and stays put.
  assert.deepEqual(
    resolveGalleryCrop({ crop: { x: -10, y: 10, w: 120, h: 60 } }),
    { x: 0, y: 15, w: 100, h: 50 },
    'a mild zoom-out keeps its centre where the edges allow (y 40 stays 40)',
  );
  // An in-bounds window that merely overhangs the right edge slides back flush.
  assert.deepEqual(
    resolveGalleryCrop({ crop: { x: 80, y: 0, w: 50, h: 50 } }),
    { x: 50, y: 0, w: 50, h: 50 },
    'an overhanging window slides flush to the edge, keeping its size',
  );
  ok('legacy letterbox rows clamp to the nearest fill crop');
}

// ── 4b. the fill floor holds for EVERY input the resolver accepts ────────────
{
  // The whole of TL.GAL.3b.1 in one property: whatever comes out of the
  // resolver covers the tile. No gap on any edge, so no tile background can
  // ever show through a gallery photo.
  const inputs = [
    { x: 12.5, y: 0, w: 75, h: 100 },        // auto-cover, 4:3
    { x: 0, y: 21.875, w: 100, h: 56.25 },   // auto-cover, 9:16
    { x: -25, y: -50, w: 150, h: 200 },      // legacy letterbox
    { x: -400, y: -400, w: 900, h: 900 },    // absurd legacy letterbox
    { x: 99, y: 99, w: 99, h: 99 },          // wildly overhanging
    { x: -1e-9, y: 100, w: 100, h: 1e-6 },   // degenerate slivers
    { x: 0, y: 0, w: 100, h: 100 },          // the identity
    { x: 33, y: 66, w: 1, h: 1 },            // max zoom, off-centre
  ];
  for (const c of inputs) {
    const label = JSON.stringify(c);
    const out = resolveGalleryCrop({ crop: c });
    assert.ok(out, `${label} still resolves`);
    // The four inequalities that ARE the contract (a hair of float slack).
    const eps = 1e-9;
    assert.ok(out.x >= -eps && out.y >= -eps, `${label} → corner inside the photo`);
    assert.ok(out.w <= 100 + eps && out.h <= 100 + eps, `${label} → window no bigger than the photo`);
    assert.ok(out.x + out.w <= 100 + eps, `${label} → right edge inside the photo`);
    assert.ok(out.y + out.h <= 100 + eps, `${label} → bottom edge inside the photo`);
    // Equivalently, on the painting side: the image covers the tile.
    const g = geo(c);
    assert.ok(g.widthPct >= 100 - eps, `${label} → image spans the tile's width`);
    assert.ok(g.heightPct >= 100 - eps, `${label} → and its height`);
    assert.ok(g.leftPct <= eps && g.topPct <= eps, `${label} → no gap at the top-left`);
    assert.ok(g.leftPct + g.widthPct >= 100 - eps, `${label} → none at the right`);
    assert.ok(g.topPct + g.heightPct >= 100 - eps, `${label} → none at the bottom`);
  }
  ok('every resolved crop fills the tile — no background can show');
}

// ── 5. pan and zoom behave monotonically ─────────────────────────────────────
{
  // Identity window: the whole image, exactly the tile.
  const id = geo({ x: 0, y: 0, w: 100, h: 100 });
  assert.deepEqual(
    { w: id.widthPct, h: id.heightPct, l: id.leftPct, t: id.topPct },
    { w: 100, h: 100, l: -0, t: -0 },
    'the full-image window is an exact identity',
  );
  // -0 must never reach CSS as "-0%".
  const idStyle = style({ x: 0, y: 0, w: 100, h: 100 });
  assert.equal(idStyle.left, '0%', 'negative zero serialises as 0%');
  assert.equal(idStyle.top, '0%', 'negative zero serialises as 0%');

  // Panning the window right slides the image LEFT, and only ever one way.
  const l = geo({ x: 0, y: 0, w: 50, h: 50 });
  const m = geo({ x: 25, y: 0, w: 50, h: 50 });
  const r = geo({ x: 50, y: 0, w: 50, h: 50 });
  assert.ok(l.leftPct > m.leftPct && m.leftPct > r.leftPct, 'pan is monotonic');
  near(l.leftPct, -0, 'window at the left edge pins the image flush left');
  near(r.leftPct, 100 - r.widthPct, 'window at the right edge pins it flush right');

  // A tighter window is a deeper zoom: strictly more magnification.
  const wide = geo({ x: 0, y: 0, w: 100, h: 100 });
  const tight = geo({ x: 0, y: 0, w: 40, h: 40 });
  assert.ok(tight.widthPct > wide.widthPct, 'a smaller window magnifies more');
  near(tight.widthPct, 250, 'a 40% window paints the image at 250%');
  ok('pan and zoom are monotonic');
}

// ── 6. the style shape the tile applies ──────────────────────────────────────
{
  const s = style({ x: 12.5, y: 0, w: 75, h: 100 });
  assert.equal(s.position, 'absolute', 'positioned inside the tile box');
  assert.equal(s.maxWidth, 'none', 'no inherited max-width may shrink it');
  // The rectangle already IS the crop box; re-fitting inside it would crop
  // twice. (The element keeps its object-cover class alongside — inert while
  // this property is set, a fallback if it ever is not.)
  assert.equal(s.objectFit, 'fill', 'image fills the resolved rectangle exactly');
  // Percent units throughout: the tile is the only reference frame, so the same
  // crop resolves identically in the narrow filmstrip, the grid and the full
  // carousel without anyone measuring anything.
  for (const k of ['left', 'top', 'width', 'height']) {
    assert.ok(String(s[k]).endsWith('%'), `${k} is a percentage of the tile`);
    assert.ok(!String(s[k]).includes('NaN'), `${k} is never NaN`);
  }
  ok('style shape is tile-relative and complete');
}

// ── 7. GALLERY_MIN_ZOOM is the single floor, and the floor is COVER-FIT ──────
{
  // INVARIANT: this constant must feed BOTH the Cropper's `minZoom` and the
  // zoom slider's `min` in PhotoCropSheet. Two independent floors drift, and
  // then the slider dials a zoom the cropper refuses (or the reverse) and the
  // stored crop stops matching what the user was shown.
  assert.equal(GALLERY_MIN_ZOOM, 1, 'the floor is 1');
  // TL.GAL.3b.1: 1 is cover-fit — react-easy-crop inscribes its crop area in
  // the media, so zoom 1 is the exact point where the photo fills the square.
  // Anything below it would shrink the photo inside the frame and show tile
  // background, which the fill floor forbids.
  assert.ok(GALLERY_MIN_ZOOM === 1, 'not below 1 — a zoomed-out photo would float in the tile');

  // What the floor looks like per photo shape. A 9:16 portrait WIDTH-fills:
  // the window spans the full width and 56.25% of the height, so the tile can
  // only pan it vertically.
  const tall = geo({ x: 0, y: 21.875, w: 100, h: 56.25 });
  near(tall.widthPct, 100, '9:16 at the floor: the image is exactly tile-wide');
  near(tall.heightPct, 1600 / 9, 'and overflows vertically (177.78%)');
  near(tall.leftPct, -0, 'nothing to pan horizontally');
  near(tall.topPct, -(tall.heightPct - 100) / 2, 'centred vertically, the overhang split evenly');
  // A 4:3 landscape HEIGHT-fills — the mirror image, pannable horizontally only.
  const wide = geo({ x: 12.5, y: 0, w: 75, h: 100 });
  near(wide.heightPct, 100, '4:3 at the floor: the image is exactly tile-tall');
  assert.ok(wide.widthPct > 100, 'and overflows horizontally');
  ok('GALLERY_MIN_ZOOM is the single floor, and the floor is cover-fit');
}

// ── 8. resolveGalleryCrop rejects nonsense, clamps the recoverable ───────────
{
  // In-bounds values are returned bit-for-bit: the common path never rounds.
  const inBounds = { x: 12.5, y: 0, w: 75, h: 100 };
  assert.deepEqual(
    resolveGalleryCrop({ crop: { ...inBounds } }),
    inBounds,
    'a crop inside the photo survives verbatim',
  );
  // Out-of-bounds values are CLAMPED, not rejected — see section 4. Rejecting
  // would drop a framing the user really did choose; clamping honours it as far
  // as the fill floor allows.
  assert.deepEqual(
    resolveGalleryCrop({ crop: { x: -25, y: -50, w: 150, h: 200 } }),
    { x: 12.5, y: 0, w: 75, h: 100 },
    'out-of-range percentages are clamped into the photo',
  );
  // Extra keys on the crop object are ignored, not rejected — a later stage may
  // stash the source zoom/aspect beside it.
  assert.deepEqual(
    resolveGalleryCrop({ crop: { x: 0, y: 0, w: 50, h: 50, zoom: 2 } }),
    { x: 0, y: 0, w: 50, h: 50 },
    'unknown crop keys are ignored, not fatal',
  );
  ok('crop validation rejects nonsense and clamps the rest');
}

// ── 10. the 4:5 events-poster window (TL.EVNT Stage 3a.3) ────────────────────
// The resolver is deliberately box-aspect-agnostic — pure percentages of
// whatever box the caller paints. The events card paints a 4:5 box
// (EVENT_POSTER_ASPECT), so these are the exact windows PhotoCropSheet stores
// from a 4:5 cropper for the common poster shapes.
{
  // A 9:16 story export in the 4:5 window at the cover floor: full width,
  // 70.3125% of the height, vertical pan only. y=0 is "keep the top" — the
  // very framing that rescues a poster whose bottom is dead space.
  const topAnchored = geo({ x: 0, y: 0, w: 100, h: 70.3125 });
  near(topAnchored.widthPct, 100, '9:16 in 4:5: image is exactly window-wide');
  near(topAnchored.heightPct, 100 / 0.703125, 'and overflows vertically (142.22%)');
  near(topAnchored.topPct, -0, 'y=0 keeps the top edge');
  near(topAnchored.leftPct, -0, 'no horizontal pan at full width');
  // Panned all the way down, the far edge lands exactly on the window's far
  // edge — the fill floor holds at the extreme.
  const bottomAnchored = geo({ x: 0, y: 29.6875, w: 100, h: 70.3125 });
  near(bottomAnchored.topPct + bottomAnchored.heightPct, 100, 'bottom-anchored: far edges coincide');
  // A square image in the 4:5 window height-fills and pans horizontally.
  const square = geo({ x: 10, y: 0, w: 80, h: 100 });
  near(square.heightPct, 100, 'square in 4:5: image is exactly window-tall');
  near(square.widthPct, 125, 'and overflows horizontally');
  near(square.leftPct, -12.5, 'panned by the stored x');
  ok('4:5 poster windows resolve exactly (box-aspect-agnostic percentages)');
}

console.log(`\n${passed} gallery-framing checks passed`);
