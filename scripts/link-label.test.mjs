// TL.POLISH.1d — unit test for the link-label rules (src/lib/link-label.ts).
//
// The repo has no unit-test runner; pure checks are standalone .mjs scripts run
// via `npx tsx` (see logo-detect.test.mjs). Wired into `npm run guard`.
// Run: `npx tsx scripts/link-label.test.mjs`.

import assert from 'node:assert/strict';
import { looksLikeUrl, displayLabel, labelFromUrl } from '../src/lib/link-label';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

// ── the six ruled cases ──────────────────────────────────────────────────────
{
  // 1. A human title is never touched.
  assert.equal(displayLabel('Pinterest', 'https://www.pinterest.com/pin/1/'), 'Pinterest',
    '"Pinterest" survives verbatim');

  // 2. The live defect: the label IS the URL → the hostname, no "www.".
  assert.equal(displayLabel('https://www.pinterest.com/pin/1/', 'https://www.pinterest.com/pin/1/'),
    'pinterest.com', 'a pasted pin URL reads as pinterest.com');

  // 3. Schemeless paste, trailing slash.
  assert.equal(displayLabel('mecivietnam.com/', 'https://mecivietnam.com/'), 'mecivietnam.com',
    'a bare domain reads as its hostname');

  // 4. Spaces mean prose, whatever else is in there.
  assert.equal(displayLabel('My Shop 2024', 'https://example.com'), 'My Shop 2024',
    '"My Shop 2024" survives verbatim');

  // 5. Empty label falls back to the URL's hostname (same rule as a URL label).
  assert.equal(displayLabel('', 'https://www.mecivietnam.com/collections/all'), 'mecivietnam.com',
    'an empty label falls back to the hostname');

  // 6. Garbage in both → the raw label back, never a throw and never blank.
  assert.equal(displayLabel('http://[', 'http://['), 'http://[',
    'unparseable label + unparseable url → raw label');
  ok('six ruled cases: title kept, URL/empty → hostname, garbage → raw');
}

// ── looksLikeUrl shape ───────────────────────────────────────────────────────
{
  assert.equal(looksLikeUrl('https://www.pinterest.com/pin/1084945366506614118/'), true, 'https URL');
  assert.equal(looksLikeUrl('http://mecivietnam.com'), true, 'http URL');
  assert.equal(looksLikeUrl('www.plurk.com/p/3io6k5imjb'), true, 'schemeless www path');
  assert.equal(looksLikeUrl('pinterest.com'), true, 'bare domain');
  assert.equal(looksLikeUrl('Pinterest'), false, 'a one-word name is not a URL');
  assert.equal(looksLikeUrl('My Shop 2024'), false, 'spaces are never a URL');
  assert.equal(looksLikeUrl('Read more at example.com today'), false, 'prose containing a domain');
  assert.equal(looksLikeUrl(''), false, 'empty');
  assert.equal(looksLikeUrl(null), false, 'null');
  assert.equal(looksLikeUrl(undefined), false, 'undefined');
  assert.equal(looksLikeUrl('mailto:hi@example.com'), false, 'mailto is not a web URL');
  assert.equal(looksLikeUrl('Node.js'), false, 'capitals read as a name, not an address');
  assert.equal(looksLikeUrl('v1.2'), false, 'a version number is not a domain');
  ok('looksLikeUrl: schemes, bare domains, prose, empties, mailto, near-misses');
}

// ── labelFromUrl moved here unchanged (FL.11 save fallback) ──────────────────
{
  assert.equal(labelFromUrl('https://www.pinterest.com/pin/1/'), 'pinterest.com', 'hostname, no www');
  assert.equal(labelFromUrl('mecivietnam.com'), 'mecivietnam.com', 'schemeless still resolves');
  assert.equal(labelFromUrl(''), 'Link', 'empty url → "Link", never blank');
  assert.equal(labelFromUrl('  '), 'Link', 'whitespace-only url → "Link"');
  assert.equal(labelFromUrl('http://['), 'http://[', 'unparseable → as typed');
  ok('labelFromUrl: unchanged contract after the move out of LinksEditor');
}

// ── the real mecivietnam rows (recon 1d.0, 2026-08-19) ───────────────────────
{
  const rows = [
    'https://mecivietnam.com/',
    'https://mecivietnam.com/',
    'https://www.pinterest.com/pin/1084945366506614118/',
    'https://www.pinterest.com/pin/1084945366506614334/',
    'https://www.plurk.com/p/3io6k5imjb',
    'https://www.plurk.com/p/3io6khw56m',
  ];
  const shown = rows.map((r) => displayLabel(r, r));
  assert.deepEqual(shown, [
    'mecivietnam.com', 'mecivietnam.com', 'pinterest.com', 'pinterest.com', 'plurk.com', 'plurk.com',
  ], 'all six live rows read as clean hostnames');
  assert.ok(shown.every((s) => !s.startsWith('http')), 'no rendered label starts with http');

  // The battery account's labels are ordinary titles and must not move.
  for (const l of ['My Website', 'Latest Blog Post', 'Work With Me', 'Shop My Collection']) {
    assert.equal(displayLabel(l, 'https://example.com'), l, `battery label "${l}" unchanged`);
  }
  ok('live rows → hostnames; battery titles untouched');
}

// ── falsification: an inverted / loosened rule breaks the same cases ─────────
{
  // Inverted: "a label with spaces is the URL-ish one" — the battery titles get
  // rewritten and the actual pasted URLs get kept.
  const inverted = (l) => /\s/.test((l || '').trim());
  assert.equal(inverted('My Shop 2024'), true, 'inverted rule calls a human title a URL');
  assert.equal(inverted('https://www.pinterest.com/pin/1/'), false, 'inverted rule keeps the pasted URL');

  // Loosened: drop the letters-only TLD and a version string becomes a domain.
  const loose = (l) => /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/.test((l || '').trim());
  assert.equal(loose('v1.2'), true, 'without the TLD narrowing, "v1.2" is a domain');
  assert.equal(looksLikeUrl('v1.2'), false, 'the shipped rule keeps it');

  // Dropped: no URL check at all — the defect is simply back.
  const none = () => false;
  const naive = (label, url) => (label?.trim() || labelFromUrl(url));
  assert.equal(none('https://www.pinterest.com/pin/1/'), false, 'no-op rule flags nothing');
  assert.equal(naive('https://www.pinterest.com/pin/1/', 'https://www.pinterest.com/pin/1/'),
    'https://www.pinterest.com/pin/1/', 'the pre-1d behaviour: the raw URL renders');
  ok('inverted, loosened and absent rules each reproduce the defect');
}

console.log(`\nAll ${passed} link-label checks passed.`);
