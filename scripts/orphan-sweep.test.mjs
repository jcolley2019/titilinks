// TL.STOR.6 — unit test for the orphan-storage sweep's pure helpers
// (scripts/sweep-orphan-storage.mjs). Wired into `npm run guard`.
// Run: `node scripts/orphan-sweep.test.mjs`.
//
// classifyFolders decides what --apply may delete, so a wrong answer here is
// data loss: a live user's folder must never land in `orphans`, and a folder
// that is not UUID-shaped must never land there either.

import assert from 'node:assert/strict';
import { classifyFolders, userSetProblem } from './sweep-orphan-storage.mjs';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

const LIVE = '3eb457d7-1111-4222-8333-444455556666';
const GONE = '9f0c2a1b-7777-4888-9999-aaaabbbbcccc';

{
  const r = classifyFolders([LIVE], new Set([LIVE]));
  assert.deepEqual(r, { orphans: [], live: [LIVE], unexpected: [] });
  ok('a live user id is live, never an orphan');
}
{
  const r = classifyFolders([GONE], new Set([LIVE]));
  assert.deepEqual(r, { orphans: [GONE], live: [], unexpected: [] });
  ok('a UUID with no live user is an orphan');
}
{
  const names = ['.emptyFolderPlaceholder', 'public', 'avatar.png', '3eb457d7', `${GONE}x`];
  const r = classifyFolders(names, new Set([LIVE]));
  assert.deepEqual(r, { orphans: [], live: [], unexpected: names });
  ok('a non-UUID name is unexpected, never an orphan');
}
{
  const r1 = classifyFolders([LIVE.toUpperCase()], new Set([LIVE]));
  assert.deepEqual(r1, { orphans: [], live: [LIVE.toUpperCase()], unexpected: [] });
  const r2 = classifyFolders([LIVE], new Set([LIVE.toUpperCase()]));
  assert.deepEqual(r2, { orphans: [], live: [LIVE], unexpected: [] });
  ok('UUIDs match case-insensitively in both directions');
}
{
  const r = classifyFolders([LIVE, GONE, 'misc'], new Set([LIVE]));
  assert.deepEqual(r, { orphans: [GONE], live: [LIVE], unexpected: ['misc'] });
  ok('a mixed listing splits three ways');
}

// ── the safety gate ─────────────────────────────────────────────────────────
{
  const full = new Set([
    '3eb457d7-0000-4000-8000-000000000001',
    'd3f1cfce-0000-4000-8000-000000000002',
    '87d14c9b-0000-4000-8000-000000000003',
    'c46470a0-0000-4000-8000-000000000004',
    'aaaaaaaa-0000-4000-8000-000000000005',
  ]);
  assert.equal(userSetProblem(full), null);
  assert.match(userSetProblem(new Set()), /missing known account/);
  const four = new Set([...full].slice(0, 4));
  assert.match(userSetProblem(four), /only 4 user/);
  const noBattery = new Set([...full].filter((id) => !id.startsWith('d3f1cfce')).concat('bbbbbbbb-0000-4000-8000-000000000006'));
  assert.match(userSetProblem(noBattery), /d3f1cfce/);
  ok('the gate passes the real shape and rejects empty, short and incomplete lists');
}

console.log(`orphan-sweep: ${passed} checks passed`);
