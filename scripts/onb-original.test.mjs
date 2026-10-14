// TL.ONB.PHOTO.1 — unit test for src/lib/onboarding-photo.ts: how the
// onboarding original is named in the avatars bucket.
// Same convention as brand.test.mjs: standalone node script, no DOM, no
// network. Run:
//   npx tsx scripts/onb-original.test.mjs
//
// MEDIA.PHOTO.2 retired planOriginal / ORIGINAL_KEEP_BYTES_MAX /
// ORIGINAL_MAX_EDGE: the original is now whatever src/lib/prepare-image.ts
// emits (the shared master), so the byte-cap assertions that lived here are
// gone with the policy. prepare-image's own bounds are pinned below without a
// DOM — fitMaster is pure geometry.

import assert from 'node:assert/strict';
import { originalObjectName } from '../src/lib/onboarding-photo';
import {
  fitMaster,
  INPUT_MAX_BYTES,
  MASTER_MAX_EDGE,
  MASTER_MAX_AREA,
  WEBP_QUALITY,
  JPEG_FALLBACK_QUALITY,
} from '../src/lib/prepare-image';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

const MB = 1024 * 1024;

// ── naming: identical to the editor's origFileName shape ───────────────────
assert.equal(
  originalObjectName('user-1', 'abc-123', 'IMG_0001.HEIC.jpeg'),
  'user-1/abc-123-original.jpeg'
);
ok('<userId>/<uuid>-original.<ext> — last extension wins');

assert.equal(originalObjectName('user-1', 'abc-123', 'photo'), 'user-1/abc-123-original.jpg');
ok('a name with no extension falls back to .jpg (as the editor does)');

assert.equal(originalObjectName('user-1', 'abc-123', 'IMG_0001.webp'), 'user-1/abc-123-original.webp');
ok('a prepared master keeps its .webp extension');

// ── MEDIA.PHOTO.2 master bounds (shared by every upload site) ──────────────
assert.equal(INPUT_MAX_BYTES, 40 * MB);
assert.equal(MASTER_MAX_EDGE, 4096);
assert.equal(MASTER_MAX_AREA, 16_000_000);
assert.equal(WEBP_QUALITY, 0.9);
assert.equal(JPEG_FALLBACK_QUALITY, 0.92);
ok('input gate 40 MB; master ≤ 4096 px long edge and ≤ 16 MP; WebP q0.9 / JPEG q0.92');

assert.deepEqual(fitMaster(4032, 3024), { width: 4032, height: 3024 });
ok('a 12 MP phone photo (4032×3024 = 12.2 MP) is kept at its own size');

assert.deepEqual(fitMaster(8000, 6000), { width: 4096, height: 3072 });
ok('48 MP 8000×6000 → 4096×3072 (long edge pinned, aspect kept, 12.6 MP)');

assert.deepEqual(fitMaster(3024, 4032), { width: 3024, height: 4032 });
ok('portrait within both bounds is untouched');

const square = fitMaster(4096, 4096);
assert.equal(square.width, square.height);
assert.ok(square.width < 4096, 'a 4096² square must shrink');
assert.ok(square.width * square.height <= MASTER_MAX_AREA);
ok(`4096×4096 (16.8 MP) → ${square.width}×${square.height} — under the iOS canvas ceiling`);

assert.deepEqual(fitMaster(400, 400), { width: 400, height: 400 });
ok('never upscales');

assert.deepEqual(fitMaster(10000, 2000, 2500), { width: 2500, height: 500 });
ok('a per-site maxEdge override is honoured');

console.log(`\nonb-original.test.mjs: ${passed} passed`);
