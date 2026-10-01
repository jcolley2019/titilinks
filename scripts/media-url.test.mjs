// MEDIA.PHOTO.1 — unit checks for src/lib/media-url.ts, the URL builder that
// serves creator images as right-sized Supabase Storage renditions. Runner: tsx
// (same as scripts/plan-gate.test.mjs); wired into `npm run guard`.
// Pure-function assertions — no DB, no React, no network.
//   npx tsx scripts/media-url.test.mjs

import assert from 'node:assert/strict';
import {
  DEFAULT_MAX_WIDTH,
  MAX_TRANSFORM_PX,
  isSupabasePublicUrl,
  coverOverflow,
  isTransformable,
  scaleBox,
  sizesFor,
  srcSetFor,
  transformUrl,
} from '../src/lib/media-url';

let passed = 0;
const ok = (m) => { passed++; console.log('ok - ' + m); };

const ORIGIN = 'https://proj.supabase.co';
const O = { origin: ORIGIN };
const obj = (p) => `${ORIGIN}/storage/v1/object/public/${p}`;
const rend = (p) => `${ORIGIN}/storage/v1/render/image/public/${p}`;
const HERO = obj('avatars/u1/hero.webp');

// ── 1. isSupabasePublicUrl ──────────────────────────────────────────────────
assert.equal(isSupabasePublicUrl(HERO, ORIGIN), true);
assert.equal(isSupabasePublicUrl(HERO, ORIGIN + '/'), true, 'trailing slash on the origin is ignored');
assert.equal(isSupabasePublicUrl('https://other.supabase.co/storage/v1/object/public/a/b.png', ORIGIN), false, 'another project');
assert.equal(isSupabasePublicUrl(`${ORIGIN}.evil.com/storage/v1/object/public/a/b.png`, ORIGIN), false, 'origin must end at the slash');
assert.equal(isSupabasePublicUrl(`${ORIGIN}/storage/v1/object/sign/a/b.png`, ORIGIN), false, 'signed URLs are not public objects');
assert.equal(isSupabasePublicUrl(`${ORIGIN}/storage/v1/object/public/`, ORIGIN), false, 'no object path');
assert.equal(isSupabasePublicUrl(rend('avatars/u1/hero.webp'), ORIGIN), false, 'a rendition is not a master');
assert.equal(isSupabasePublicUrl('https://img.youtube.com/vi/x/maxresdefault.jpg', ORIGIN), false);
assert.equal(isSupabasePublicUrl('data:image/png;base64,AAAA', ORIGIN), false);
assert.equal(isSupabasePublicUrl('blob:https://x/1', ORIGIN), false);
for (const bad of ['', null, undefined]) assert.equal(isSupabasePublicUrl(bad, ORIGIN), false);
assert.equal(isSupabasePublicUrl(HERO, ''), false, 'no configured origin → nothing is ours');
ok('isSupabasePublicUrl: only <origin>/storage/v1/object/public/… is ours');

// ── 2. transformUrl: the rewrite ────────────────────────────────────────────
assert.equal(
  transformUrl(HERO, { width: 480, ...O }),
  rend('avatars/u1/hero.webp') + '?width=480&resize=contain&quality=80',
  'width only → explicit contain (the endpoint default would keep the source height)',
);
assert.equal(
  transformUrl(HERO, { width: 300, height: 150, ...O }),
  rend('avatars/u1/hero.webp') + '?width=300&height=150&resize=cover&quality=80',
  'width + height → cover',
);
assert.equal(
  transformUrl(HERO, { width: 300, height: 150, resize: 'contain', quality: 60, ...O }),
  rend('avatars/u1/hero.webp') + '?width=300&height=150&resize=contain&quality=60',
  'explicit resize and quality win',
);
assert.match(transformUrl(HERO, { width: 100, ...O }), /quality=80$/, 'default quality is 80');
assert.match(transformUrl(HERO, { width: 100, quality: 500, ...O }), /quality=100$/, 'quality is clamped');
assert.match(transformUrl(HERO, { width: 99.6, ...O }), /width=100&/, 'width is rounded to whole px');
assert.equal(
  transformUrl(obj('products/u1/a.png?v=3'), { width: 200, ...O }),
  rend('products/u1/a.png?v=3') + '&width=200&resize=contain&quality=80',
  'an existing query string is kept and extended',
);
assert.ok(!/format=/.test(transformUrl(HERO, { width: 200, ...O })), 'format is never forced — Accept negotiates it');
ok('transformUrl rewrites /object/public/ → /render/image/public/ with width/height/resize/quality');

// ── 3. transformUrl: pass-through ───────────────────────────────────────────
const passthrough = [
  'https://img.youtube.com/vi/abc/maxresdefault.jpg',
  'http://example.com/a.jpg',
  'data:image/png;base64,AAAA',
  'blob:https://x/1',
  obj('products/u1/anim.gif'),
  obj('products/u1/ANIM.GIF'),
  obj('products/u1/anim.gif?t=1'),
  obj('page-assets/u1/logo.svg'),
  obj('page-assets/u1/logo.SVG?v=2'),
  rend('avatars/u1/hero.webp') + '?width=10',
  '',
];
for (const u of passthrough) {
  assert.equal(transformUrl(u, { width: 400, ...O }), u, `unchanged: ${u}`);
  assert.equal(isTransformable(u, ORIGIN), false, `not transformable: ${u}`);
  assert.equal(srcSetFor(u, 400, O), undefined, `no srcset: ${u}`);
}
assert.equal(transformUrl(HERO, { width: 0, ...O }), HERO, 'a non-positive width is not a transform');
assert.equal(transformUrl(HERO, { width: NaN, ...O }), HERO);
// a .gif in a DIRECTORY name is not an animated file
assert.notEqual(transformUrl(obj('products/u1.gif/photo.png'), { width: 200, ...O }), obj('products/u1.gif/photo.png'));
ok('external, GIF, SVG, rendition and non-URL inputs come back as the same string');

// ── 4. never ask for more than the master ───────────────────────────────────
assert.match(transformUrl(HERO, { width: 5000, ...O }), /width=2048&/, 'unknown master → capped at 2048');
assert.equal(DEFAULT_MAX_WIDTH, 2048);
assert.match(transformUrl(HERO, { width: 5000, maxWidth: 1440, ...O }), /width=1440&/, 'known master → capped at it');
assert.match(transformUrl(HERO, { width: 900, maxWidth: 1440, ...O }), /width=900&/, 'under the master → untouched');
assert.match(transformUrl(HERO, { width: 5000, maxWidth: 9000, ...O }), new RegExp(`width=${MAX_TRANSFORM_PX}&`), 'never past the 2500 px endpoint limit');
assert.match(transformUrl(HERO, { width: 900, maxWidth: 0, ...O }), /width=900&/, 'a nonsense maxWidth falls back to the default cap');
// when width is clamped the height scales with it, so the box ratio survives
const clamped = transformUrl(HERO, { width: 2000, height: 1000, maxWidth: 1000, ...O });
assert.match(clamped, /width=1000&height=500&resize=cover/, 'height follows a clamped width');
ok('width is clamped to maxWidth (else 2048, never above 2500); height scales with it');

// ── 5. srcSetFor ────────────────────────────────────────────────────────────
const parse = (s) => s.split(', ').map((c) => {
  const m = c.match(/^(\S+) (\d+)w$/);
  assert.ok(m, `candidate "${c}" is "<url> <n>w"`);
  return { url: m[1], w: Number(m[2]) };
});
{
  const cands = parse(srcSetFor(HERO, 400, O));
  assert.deepEqual(cands.map((c) => c.w), [400, 800, 1200], 'default densities 1/2/3');
  for (const c of cands) {
    assert.ok(c.url.includes('/render/image/public/'), 'renditions');
    assert.equal(Number(new URL(c.url).searchParams.get('width')), c.w, 'descriptor == width param');
    assert.equal(new URL(c.url).searchParams.get('resize'), 'contain');
    assert.equal(new URL(c.url).searchParams.has('height'), false);
  }
  ok('srcSetFor: cssWidth × [1,2,3] with matching w descriptors');
}
{
  const cands = parse(srcSetFor(HERO, 400, { ...O, densities: [3, 1, 2] }));
  assert.deepEqual(cands.map((c) => c.w), [400, 800, 1200], 'ascending whatever the input order');
  assert.deepEqual(parse(srcSetFor(HERO, 48, { ...O, densities: [2, 3] })).map((c) => c.w), [96, 144], 'custom densities');
  assert.deepEqual(parse(srcSetFor(HERO, 100.4, O)).map((c) => c.w), [100, 201, 301], 'widths are whole px');
  ok('srcSetFor: densities are sorted and widths rounded');
}
{
  // master is 1440 px: 3 × 402 = 1206 fits; 3 × 600 = 1800 does not
  assert.deepEqual(parse(srcSetFor(HERO, 402, { ...O, maxWidth: 1440 })).map((c) => c.w), [402, 804, 1206]);
  const capped = parse(srcSetFor(HERO, 600, { ...O, maxWidth: 1440 }));
  assert.deepEqual(capped.map((c) => c.w), [600, 1200, 1440], 'the 3x candidate is capped at the master, not dropped');
  const tiny = parse(srcSetFor(HERO, 600, { ...O, maxWidth: 500 }));
  assert.deepEqual(tiny.map((c) => c.w), [500], 'a master smaller than 1x collapses to ONE candidate, no duplicates');
  for (const c of [...capped, ...tiny]) assert.ok(c.w <= 1440);
  ok('srcSetFor: no candidate exceeds maxWidth; clamped duplicates collapse');
}
{
  // cover box with a known aspect → server-side crop to exactly the box
  const cands = parse(srcSetFor(HERO, 300, { ...O, aspect: 1 }));
  for (const c of cands) {
    const q = new URL(c.url).searchParams;
    assert.equal(q.get('resize'), 'cover');
    assert.equal(Number(q.get('height')), c.w, 'square box → height == width');
  }
  const wide = parse(srcSetFor(HERO, 320, { ...O, aspect: 16 / 9 }));
  assert.deepEqual(wide.map((c) => Number(new URL(c.url).searchParams.get('height'))), [180, 360, 540]);
  const tall = parse(srcSetFor(HERO, 300, { ...O, aspect: 3 / 4 }));
  assert.deepEqual(tall.map((c) => Number(new URL(c.url).searchParams.get('height'))), [400, 800, 1200]);
  // a clamped candidate keeps the box ratio
  const cl = parse(srcSetFor(HERO, 300, { ...O, aspect: 1, maxWidth: 500 }));
  assert.deepEqual(cl.map((c) => c.w), [300, 500]);
  assert.equal(Number(new URL(cl[1].url).searchParams.get('height')), 500);
  ok('srcSetFor: aspect → height + resize=cover, ratio kept when clamped');
}
{
  assert.equal(srcSetFor(obj('products/u1/a,b.png'), 300, O), undefined, 'a comma would corrupt the list');
  assert.equal(srcSetFor(obj('products/u1/a b.png'), 300, O), undefined, 'so would whitespace');
  assert.equal(srcSetFor(HERO, 0, O), undefined);
  assert.equal(srcSetFor(HERO, -5, O), undefined);
  assert.equal(srcSetFor(null, 300, O), undefined);
  ok('srcSetFor: unusable inputs yield no srcset (plain <img>)');
}

// ── 6. sizesFor ─────────────────────────────────────────────────────────────
assert.equal(sizesFor({ px: 48 }), '48px');
assert.equal(sizesFor({ px: 48 }, 402), '48px', 'a fixed box ignores the stage');
assert.equal(sizesFor({ fullBleed: true }), '100vw');
assert.equal(sizesFor({ fullBleed: true }, 402), '(min-width: 768px) 402px, 100vw');
assert.equal(sizesFor({ fullBleed: true, scale: 1.8 }, 402), '(min-width: 768px) 724px, calc(100vw * 1.8)');
assert.equal(sizesFor({ column: 1 }), 'min(100vw, 640px)');
assert.equal(sizesFor({ column: 1, insetPx: 32 }, 402), '(min-width: 768px) 370px, calc((min(100vw, 640px) - 32px) * 1)');
assert.equal(sizesFor({ column: 0.5, insetPx: 40 }, 402), '(min-width: 768px) 181px, calc((min(100vw, 640px) - 40px) * 0.5)');
assert.equal(sizesFor({ column: 0.72, insetPx: 32 }, 820), '(min-width: 768px) 567px, calc((min(100vw, 640px) - 32px) * 0.72)', 'an iPad-preset stage changes the wide clause');
ok('sizesFor: px / full-bleed / column boxes, with and without the stage clause');

// ── 7. scaleBox: a zoomed crop paints k× wider than its tile ────────────────
assert.deepEqual(scaleBox({ px: 48 }, 2), { px: 96 });
assert.deepEqual(scaleBox({ fullBleed: true }, 1.5), { fullBleed: true, scale: 1.5 });
assert.deepEqual(scaleBox({ fullBleed: true, scale: 2 }, 1.5), { fullBleed: true, scale: 3 });
assert.deepEqual(scaleBox({ column: 0.5, insetPx: 40 }, 2), { column: 1, insetPx: 40 });
assert.equal(sizesFor(scaleBox({ column: 1, insetPx: 32 }, 2), 402), '(min-width: 768px) 740px, calc((min(100vw, 640px) - 32px) * 2)', 'inset is NOT scaled — only the box');
ok('scaleBox scales the box, never the gutters');

// ── 8. coverOverflow: how much wider than its box a cover image paints ─────
assert.equal(coverOverflow(0.8089, 0.8089), 1, 'canonical hero in the canonical box: no overflow');
assert.equal(coverOverflow(0.6, 0.8089), 1, 'narrower media is pinned by width');
assert.ok(Math.abs(coverOverflow(1, 0.8089) - 1.236) < 0.001, 'a square photo in a portrait box overflows 1.24x');
assert.equal(coverOverflow(16 / 9, 0.46), 3, 'capped at 3x');
assert.equal(coverOverflow(null, 0.8), 1, 'unknown media aspect → fallback');
assert.equal(coverOverflow(1, undefined, 1.8), 1.8, 'unknown box aspect → the caller fallback');
assert.equal(coverOverflow(NaN, 1, 2), 2);
ok('coverOverflow: max(1, media/box), capped, with a fallback while unmeasured');

console.log('\nAll ' + passed + ' checks passed.');
