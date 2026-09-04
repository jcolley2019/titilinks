// TL.HANDLE.1 — unit test for the handle rules (src/lib/handle-rules.ts).
//
// The repo has no unit-test runner; pure checks are standalone .mjs scripts run
// via `npx tsx` (see link-label.test.mjs). Wired into `npm run guard`.
// Run: `npx tsx scripts/handle-rules.test.mjs`.
//
// The point of this file is that ONE list and ONE regex feed three consumers:
// the onboarding client, the `pages_handle_rules` / `profiles_username_rules`
// CHECK constraints, and the /s/:slug validator. If they drift, a handle the UI
// accepts comes back as a bare 23514 from Postgres.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HANDLE_PATTERN,
  RESERVED_HANDLES,
  RESERVED_HANDLE_LIST,
  RESERVED_SQL_ARRAY,
  isReservedHandle,
  validateHandle,
} from '../src/lib/handle-rules';
import { RESERVED_SLUGS } from '../src/lib/reserved-slugs';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

// ── the six ruled cases from the TL.HANDLE.1 brief ───────────────────────────
{
  // 1. A route/authority word is reserved, not merely taken.
  assert.equal(validateHandle('admin'), 'reserved', '"admin" is reserved');

  // 2. Joey's real handle keeps working — the floor must not evict prod rows.
  assert.equal(validateHandle('joeyc'), null, '"joeyc" is a legal handle');

  // 3. Two chars is under the 3-char floor.
  assert.equal(validateHandle('ab'), 'format', '"ab" is too short');

  // 4. A leading hyphen is a format failure, not a reservation.
  assert.equal(validateHandle('-abc'), 'format', '"-abc" leads with a hyphen');

  // 5. The one real customer handle in prod.
  assert.equal(validateHandle('mecivietnam'), null, '"mecivietnam" is a legal handle');

  // 6. 31 chars is one over the ceiling.
  assert.equal(validateHandle('a'.repeat(31)), 'format', '31 chars is over the 30 ceiling');
  ok('six ruled cases: admin/joeyc/ab/-abc/mecivietnam/31-chars');
}

// ── casing: the lowercased path, stated explicitly ───────────────────────────
{
  // RULED: validateHandle trims and LOWERCASES before both checks, so 'Titi'
  // takes the lowercased path and comes back 'reserved' — NOT 'format'. The
  // entry field lowercases as you type and the DB stores lowercase, so an
  // uppercase candidate is a casing artefact of the input, never a distinct
  // handle. Uppercase is therefore never a way to sneak past the reserved list.
  assert.equal(validateHandle('Titi'), 'reserved', '"Titi" lowercases to the reserved "titi"');
  assert.equal(validateHandle('ADMIN'), 'reserved', '"ADMIN" lowercases to the reserved "admin"');
  assert.equal(validateHandle('JoeyC'), null, '"JoeyC" lowercases to the legal "joeyc"');
  assert.equal(validateHandle('  joeyc  '), null, 'surrounding whitespace is trimmed');
  assert.equal(isReservedHandle(' TiTi '), true, 'isReservedHandle normalises too');

  // The raw pattern is deliberately case-SENSITIVE — it mirrors the SQL CHECK,
  // which sees the stored value with no normalisation step in front of it.
  assert.equal(HANDLE_PATTERN.test('Titi'), false, 'the raw pattern rejects uppercase');
  assert.equal(HANDLE_PATTERN.test('titi'), true, 'the raw pattern accepts the lowercase form');
  ok('casing: validateHandle lowercases first (Titi → reserved); the raw pattern does not');
}

// ── the pattern boundaries ───────────────────────────────────────────────────
{
  assert.equal(HANDLE_PATTERN.test('abc'), true, '3 chars is the floor');
  assert.equal(HANDLE_PATTERN.test('ab'), false, '2 chars is under it');
  assert.equal(HANDLE_PATTERN.test('a'.repeat(30)), true, '30 chars is the ceiling');
  assert.equal(HANDLE_PATTERN.test('a'.repeat(31)), false, '31 chars is over it');
  assert.equal(HANDLE_PATTERN.test('a-b'), true, 'an interior hyphen is fine');
  assert.equal(HANDLE_PATTERN.test('a--b'), true, 'doubled interior hyphens are fine');
  assert.equal(HANDLE_PATTERN.test('-ab'), false, 'no leading hyphen');
  assert.equal(HANDLE_PATTERN.test('ab-'), false, 'no trailing hyphen');
  assert.equal(HANDLE_PATTERN.test('---'), false, 'all hyphens fails both edges');
  assert.equal(HANDLE_PATTERN.test('a_b'), false, 'underscore is not allowed');
  assert.equal(HANDLE_PATTERN.test('a.b'), false, 'dot is not allowed');
  assert.equal(HANDLE_PATTERN.test('a b'), false, 'space is not allowed');
  assert.equal(HANDLE_PATTERN.test('café'), false, 'non-ASCII is not allowed');
  assert.equal(HANDLE_PATTERN.test(''), false, 'empty fails');
  assert.equal(HANDLE_PATTERN.test('123'), true, 'digits-only is a legal shape');
  ok('pattern boundaries: 3–30, edges, separators, non-ASCII');
}

// ── format outranks reserved ─────────────────────────────────────────────────
{
  // 'l', 's' and 'u' are reserved AND under the length floor. The brief pins
  // format first, so they must report 'format' — a user typing one char should
  // be told "too short", not "reserved".
  assert.equal(validateHandle('l'), 'format', 'reserved-but-too-short reports format');
  assert.equal(validateHandle('s'), 'format', 'reserved-but-too-short reports format');
  assert.equal(validateHandle('go'), 'format', '"go" is reserved but fails length first');
  assert.equal(validateHandle('-admin-'), 'format', 'hyphen edges beat the reserved check');
  ok('format is evaluated before reserved');
}

// ── the reserved set is a superset of the slug set ───────────────────────────
{
  for (const slug of RESERVED_SLUGS) {
    assert.ok(RESERVED_HANDLES.has(slug),
      `reserved slug "${slug}" must also be a reserved handle`);
  }
  // The brand/system words the brief named, none of which were slugs.
  for (const w of ['titi', 'titilink', 'titiactriz', 'official', 'staff', 'team',
                   'mod', 'moderator', 'security', 'legal', 'press', 'status',
                   'null', 'undefined']) {
    assert.equal(isReservedHandle(w), true, `"${w}" is reserved`);
  }
  assert.ok(RESERVED_HANDLES.size > RESERVED_SLUGS.size,
    'the handle set is strictly larger than the slug set');
  assert.equal(RESERVED_HANDLE_LIST.length, RESERVED_HANDLES.size,
    'the exported list has no duplicates');
  assert.deepEqual([...RESERVED_HANDLE_LIST], [...RESERVED_HANDLE_LIST].sort(),
    'the exported list is sorted, so the generated SQL is stable');
  ok(`reserved set: ${RESERVED_HANDLES.size} words, superset of the ${RESERVED_SLUGS.size} slug words`);
}

// ── every prod row still passes (STEP 0b SELECT, 2026-09-04) ─────────────────
{
  // If any of these ever fails, the CHECK constraint in handle1.sql cannot be
  // added — the ALTER would reject the existing table.
  for (const h of ['joeyc', 'joey2019pwtestbattery', 'mecivietnam', 'joey2019pwtest']) {
    assert.equal(validateHandle(h), null, `live value "${h}" survives the floor`);
  }
  ok('all four live pages.handle / profiles.username values survive the floor');
}

// ── the SQL literal and the shipped SQL agree with the module ────────────────
{
  // RESERVED_SQL_ARRAY is what the constraints embed. Every word must be
  // literal-safe (no quote to escape) and every word must be present.
  assert.ok(RESERVED_SQL_ARRAY.startsWith('array[') && RESERVED_SQL_ARRAY.endsWith(']'),
    'the SQL literal is a Postgres array constructor');
  for (const w of RESERVED_HANDLE_LIST) {
    assert.ok(/^[a-z0-9-]+$/.test(w), `"${w}" is SQL-literal safe`);
    assert.ok(RESERVED_SQL_ARRAY.includes(`'${w}'`), `"${w}" is in the SQL literal`);
  }

  // The shipped migration must carry the SAME regex and the SAME words. This is
  // the anti-drift check: edit the module without regenerating the SQL and the
  // guard fails here rather than in production with a bare 23514.
  const sql = readFileSync(
    new URL('../supabase/migrations/20260904130000_handle1_reserved_and_format.sql', import.meta.url),
    'utf8');
  assert.ok(sql.includes(HANDLE_PATTERN.source),
    'the migration embeds the module regex verbatim');
  for (const w of RESERVED_HANDLE_LIST) {
    assert.ok(sql.includes(`'${w}'`), `the migration lists "${w}"`);
  }
  // …and nothing the module does not know about.
  const inSql = [...sql.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1])
    .filter((w) => !w.includes('_') && w !== 'text');
  for (const w of inSql) {
    if (RESERVED_HANDLES.has(w)) continue;
    assert.fail(`the migration lists "${w}", which is not in RESERVED_HANDLES`);
  }
  assert.equal(sql.split('\n')[0].startsWith('-- RE-RUNNABLE'), true,
    'the migration declares its class on line 1 (MIG-HEADERS)');
  ok('the shipped migration carries the same regex and exactly the same 54 words');
}

// ── falsification: an inverted / loosened rule lets the defect back in ───────
{
  // Inverted: reserved-first instead of format-first. The one-char route words
  // then report "reserved" to a user who has simply not finished typing.
  const inverted = (h) => {
    const v = h.trim().toLowerCase();
    if (RESERVED_HANDLES.has(v)) return 'reserved';
    return HANDLE_PATTERN.test(v) ? null : 'format';
  };
  assert.equal(inverted('l'), 'reserved', 'inverted rule calls a 1-char stub "reserved"');
  assert.equal(validateHandle('l'), 'format', 'the shipped rule says "format"');

  // Loosened: drop the edge anchors and '-admin-' becomes claimable, which the
  // pages_handle_rules CHECK would then reject server-side with no message.
  const loose = /^[a-z0-9-]{3,30}$/;
  assert.equal(loose.test('-admin-'), true, 'without edge anchors "-admin-" passes');
  assert.equal(HANDLE_PATTERN.test('-admin-'), false, 'the shipped pattern rejects it');
  assert.equal(loose.test('---'), true, 'without edge anchors "---" is a handle');

  // Dropped: uniqueness only — the AUDIT_rev6 #5 defect, verbatim.
  const uniquenessOnly = (h) => (h.trim().length >= 3 ? null : 'format');
  assert.equal(uniquenessOnly('admin'), null, 'the pre-HANDLE.1 check accepts "admin"');
  assert.equal(validateHandle('admin'), 'reserved', 'the shipped rule refuses it');
  assert.equal(uniquenessOnly('titilinks'), null, 'the pre-HANDLE.1 check accepts "titilinks"');
  assert.equal(validateHandle('titilinks'), 'reserved', 'the shipped rule refuses it');
  ok('inverted, loosened and absent rules each reproduce the defect');
}

console.log(`\nAll ${passed} handle-rules checks passed.`);
