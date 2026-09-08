// TL.ONB.PHOTO.1 — unit test for src/lib/onboarding-photo.ts: what onboarding keeps
// of the picked photo, and how the original is named in the avatars bucket.
// Same convention as brand.test.mjs: standalone node script, no DOM, no
// network. Run:
//   npx tsx scripts/onb-original.test.mjs

import assert from 'node:assert/strict';
import {
  planOriginal,
  originalObjectName,
  ORIGINAL_KEEP_BYTES_MAX,
  ORIGINAL_MAX_EDGE,
  ORIGINAL_JPEG_QUALITY,
} from '../src/lib/onboarding-photo';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

const MB = 1024 * 1024;

// ── the cap itself ──────────────────────────────────────────────────────────
assert.equal(ORIGINAL_KEEP_BYTES_MAX, 8 * MB);
assert.equal(ORIGINAL_MAX_EDGE, 2400);
assert.equal(ORIGINAL_JPEG_QUALITY, 0.92);
ok('cap is 8 MB → 2400px long edge at q0.92');

// ── under the cap: bytes untouched, whatever the pixel size ────────────────
assert.deepEqual(planOriginal({ bytes: 3 * MB, width: 4032, height: 3024 }), { keepBytes: true });
ok('a 3 MB 4032×3024 phone photo is kept byte-for-byte');

assert.deepEqual(planOriginal({ bytes: 8 * MB, width: 6000, height: 4000 }), { keepBytes: true });
ok('exactly 8 MB is still kept (cap is inclusive)');

assert.deepEqual(planOriginal({ bytes: 200 * 1024, width: 400, height: 400 }), { keepBytes: true });
ok('a small file is kept — never upscaled, never re-encoded');

// ── over the cap: downscale to 2400 long edge, aspect preserved ────────────
const landscape = planOriginal({ bytes: 8 * MB + 1, width: 6000, height: 4000 });
assert.equal(landscape.keepBytes, false);
assert.equal(landscape.maxEdge, 2400);
assert.equal(landscape.quality, 0.92);
assert.equal(landscape.width, 2400);
assert.equal(landscape.height, 1600);
ok('8 MB + 1 byte, 6000×4000 → 2400×1600 (long edge pinned, aspect kept)');

const portrait = planOriginal({ bytes: 14 * MB, width: 3024, height: 4032 });
assert.equal(portrait.keepBytes, false);
assert.equal(portrait.width, 1800);
assert.equal(portrait.height, 2400);
ok('portrait 3024×4032 → 1800×2400 (height is the long edge)');

const smallButHeavy = planOriginal({ bytes: 12 * MB, width: 2000, height: 1500 });
assert.equal(smallButHeavy.keepBytes, false);
assert.equal(smallButHeavy.width, 2000);
assert.equal(smallButHeavy.height, 1500);
ok('a heavy file already under 2400px is re-encoded at its own size, not upscaled');

// ── naming: identical to the editor's origFileName shape ───────────────────
assert.equal(
  originalObjectName('user-1', 'abc-123', 'IMG_0001.HEIC.jpeg'),
  'user-1/abc-123-original.jpeg'
);
ok('<userId>/<uuid>-original.<ext> — last extension wins');

assert.equal(originalObjectName('user-1', 'abc-123', 'photo'), 'user-1/abc-123-original.jpg');
ok('a name with no extension falls back to .jpg (as the editor does)');

console.log(`\nonb-original.test.mjs: ${passed} passed`);
