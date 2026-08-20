// TL.EVNT Stage 2 — unit test for the events field contract (src/lib/event-fields.ts).
//
// The repo has no unit-test runner; pure checks are standalone .mjs scripts run
// via `npx tsx` (see gallery-framing.test.mjs). Wired into `npm run guard`.
// Run: `npx tsx scripts/event-fields.test.mjs`.
//
// This lib IS the wall-clock ruling in code: the card renders through it, the
// editor round-trips through it, and the invariant under test is that a time
// the creator TYPES comes back as the same components no matter what — the
// compose → (DB echo) → parse → decompose chain must be the identity.

import assert from 'node:assert/strict';
import {
  EVENT_POSTER_ASPECT,
  composeEventSubtitle,
  composeStartsAt,
  decomposeEventLocation,
  decomposeStartsAt,
  eventCtaState,
  eventHasContent,
  eventStyleOf,
  hasEnded,
  parseWallClock,
  sortEvents,
  wallClockKey,
} from '../src/lib/event-fields';

let passed = 0;
const ok = (m) => { passed++; console.log(`ok ${m}`); };

// ── 1. parseWallClock reads components textually, every stored shape ─────────
{
  // PostgREST echoes timestamptz as ISO with an offset; the offset must be
  // IGNORED — reading it would re-zone the creator's typed time.
  assert.deepEqual(parseWallClock('2026-09-01T19:30:00+00:00'), { y: 2026, mo: 9, d: 1, h: 19, mi: 30, hasTime: true });
  // A non-UTC offset on a hand-written row still reads as its face value.
  assert.deepEqual(parseWallClock('2026-09-01T19:30:00-05:00'), { y: 2026, mo: 9, d: 1, h: 19, mi: 30, hasTime: true });
  // Postgres text form uses a space separator.
  assert.deepEqual(parseWallClock('2026-09-01 07:05:00+00'), { y: 2026, mo: 9, d: 1, h: 7, mi: 5, hasTime: true });
  // Date-only → midnight, hasTime false.
  assert.deepEqual(parseWallClock('2026-12-24'), { y: 2026, mo: 12, d: 24, h: 0, mi: 0, hasTime: false });
  // Garbage never becomes NaN fields.
  assert.equal(parseWallClock(null), null);
  assert.equal(parseWallClock(undefined), null);
  assert.equal(parseWallClock(''), null);
  assert.equal(parseWallClock('next tuesday'), null);
  assert.equal(parseWallClock('26-09-01'), null);
  ok('parseWallClock reads components textually, offset ignored');
}

// ── 2. compose → parse → decompose is the identity (the wall-clock invariant) ─
{
  const composed = composeStartsAt('2026-09-01', '19:30', false);
  assert.equal(composed, '2026-09-01T19:30:00+00:00', 'explicit +00:00 pins the round-trip');
  assert.deepEqual(decomposeStartsAt(composed), { date: '2026-09-01', time: '19:30' });
  // What the DB actually echoes back parses to the SAME components.
  assert.deepEqual(decomposeStartsAt('2026-09-01T19:30:00+00:00'), { date: '2026-09-01', time: '19:30' });
  assert.deepEqual(decomposeStartsAt('2026-09-01 19:30:00+00'), { date: '2026-09-01', time: '19:30' });
  // Single-digit components pad back out.
  assert.deepEqual(decomposeStartsAt(composeStartsAt('2026-01-05', '07:05', false)), { date: '2026-01-05', time: '07:05' });
  ok('decompose(compose(d, t)) === {d, t}');
}

// ── 3. composeStartsAt edge shapes ────────────────────────────────────────────
{
  assert.equal(composeStartsAt('', '19:30', false), null, 'no date → null (undated event)');
  assert.equal(composeStartsAt('not-a-date', '19:30', false), null, 'malformed date → null');
  assert.equal(composeStartsAt('2026-09-01', '19:30', true), '2026-09-01T00:00:00+00:00', 'all-day stores midnight');
  assert.equal(composeStartsAt('2026-09-01', '', false), '2026-09-01T00:00:00+00:00', 'time-less stores midnight');
  assert.equal(composeStartsAt('2026-09-01', '19:30:45', false), '2026-09-01T19:30:00+00:00', 'HH:MM:SS input truncates to minutes');
  assert.equal(composeStartsAt('2026-09-01', '7pm', false), '2026-09-01T00:00:00+00:00', 'malformed time falls back to midnight');
  assert.deepEqual(decomposeStartsAt(null), { date: '', time: '' }, 'null starts_at → empty inputs');
  ok('composeStartsAt edges');
}

// ── 4. hasEnded lifecycle (nowKey injected, so the test is date-stable) ──────
{
  const now = wallClockKey({ y: 2026, mo: 8, d: 19, h: 20, mi: 0, hasTime: true });
  const ev = (starts_at, ends_at = null) => ({ starts_at, ends_at });
  assert.equal(hasEnded(ev('2026-08-20T19:00:00+00:00'), now), false, 'future event not ended');
  assert.equal(hasEnded(ev('2026-08-19T21:00:00+00:00'), now), false, 'later today not ended');
  assert.equal(hasEnded(ev('2026-08-19T10:00:00+00:00'), now), false, 'started <24h ago still live (no end given)');
  assert.equal(hasEnded(ev('2026-08-18T10:00:00+00:00'), now), true, 'started >24h ago ended');
  assert.equal(hasEnded(ev('2026-08-19T10:00:00+00:00', '2026-08-19T12:00:00+00:00'), now), true, 'explicit end in the past wins over the 24h window');
  assert.equal(hasEnded(ev('2026-08-01T10:00:00+00:00', '2026-08-30T12:00:00+00:00'), now), false, 'explicit future end keeps an old start live');
  assert.equal(hasEnded(ev(null), now), false, 'no date at all — never auto-hide');
  ok('hasEnded lifecycle');
}

// ── 5. sortEvents: pinned first, then soonest, undated sink ──────────────────
{
  const mk = (id, starts_at, pinned = false, order_index = 0) => ({ id, starts_at, order_index, style_json: pinned ? { pinned: true } : null });
  const sorted = sortEvents([
    mk('undated', null, false, 1),
    mk('late', '2026-12-01T20:00:00+00:00'),
    mk('pinned-late', '2026-12-15T20:00:00+00:00', true),
    mk('soon', '2026-09-01T20:00:00+00:00'),
    mk('undated-first', null, false, 0),
  ]);
  assert.deepEqual(sorted.map((e) => e.id), ['pinned-late', 'soon', 'late', 'undated-first', 'undated']);
  ok('sortEvents: pinned first, soonest next, undated sink by order_index');
}

// ── 6. eventStyleOf: only a real object is a style ────────────────────────────
{
  assert.deepEqual(eventStyleOf(null), {});
  assert.deepEqual(eventStyleOf(undefined), {});
  assert.deepEqual(eventStyleOf('{"pinned":true}'), {}, 'a JSON string is not a style');
  assert.deepEqual(eventStyleOf([{ pinned: true }]), {}, 'an array is not a style');
  assert.deepEqual(eventStyleOf({ pinned: true, venue: 'The Fillmore' }), { pinned: true, venue: 'The Fillmore' });
  ok('eventStyleOf shape guards');
}

// ── 7. venue/city ↔ subtitle contract ─────────────────────────────────────────
{
  assert.equal(composeEventSubtitle('The Fillmore', 'Miami'), 'The Fillmore, Miami');
  assert.equal(composeEventSubtitle('  The Fillmore  ', ''), 'The Fillmore');
  assert.equal(composeEventSubtitle('', 'Miami'), 'Miami');
  assert.equal(composeEventSubtitle('', '  '), null, 'both empty → null subtitle');

  // Canonical style_json keys win.
  assert.deepEqual(
    decomposeEventLocation({ venue: 'The Fillmore', city: 'Miami' }, 'anything'),
    { venue: 'The Fillmore', city: 'Miami' },
  );
  // Either key alone still counts as canonical (a venue-less city must not
  // fall back and duplicate the subtitle into venue).
  assert.deepEqual(decomposeEventLocation({ city: 'Miami' }, 'Miami'), { venue: '', city: 'Miami' });
  // Pre-stage-2 rows (SQL fixtures, stage-1 rows): whole subtitle → venue, lossless.
  assert.deepEqual(
    decomposeEventLocation({ pinned: true }, 'The Books & Books Courtyard, Coral Gables'),
    { venue: 'The Books & Books Courtyard, Coral Gables', city: '' },
  );
  assert.deepEqual(decomposeEventLocation(null, null), { venue: '', city: '' });
  ok('venue/city ↔ subtitle: canonical split wins, legacy subtitle falls back losslessly');
}

// ── 8. eventCtaState: no link → no pill, ever (Joey's Stage 2 gate ruling) ───
{
  // The no-link column of the truth table — flags can never conjure a pill.
  assert.equal(eventCtaState(false, false, false), 'none');
  assert.equal(eventCtaState(false, true, false), 'none', 'sold-out without a link still shows nothing');
  assert.equal(eventCtaState(false, false, true), 'none');
  assert.equal(eventCtaState(false, true, true), 'none');
  // With a link: live by default, sold-out and ended inert it.
  assert.equal(eventCtaState(true, false, false), 'active');
  assert.equal(eventCtaState(true, true, false), 'sold_out');
  assert.equal(eventCtaState(true, false, true), 'ended');
  // Sold-out wins over ended — the shipped card's label precedence.
  assert.equal(eventCtaState(true, true, true), 'sold_out');
  ok('eventCtaState: full truth table, no link → none');
}

// ── 9b. EVENT_POSTER_ASPECT: one constant, two consumers (Stage 3a.3) ────────
{
  // Joey's ruling: the framed poster window is 4:5. The PhotoCropSheet's crop
  // window and the card's render box BOTH read this constant — a drift between
  // them would skew every framed poster, so the value itself is pinned here.
  assert.equal(EVENT_POSTER_ASPECT, 4 / 5);
  ok('EVENT_POSTER_ASPECT is 4:5');
}

// ── 9. eventHasContent: the Save-time prune predicate (TL.EVNT Stage 3a) ─────
{
  const empty = { title: '', date: '', venue: '', city: '', url: '', ctaLabel: '' };
  // A completely empty draft (abandoned "Add event") is the ONLY thing pruned.
  assert.equal(eventHasContent(empty, false), false);
  // Whitespace is not content.
  assert.equal(eventHasContent({ ...empty, title: '   ', venue: '  ' }, false), false);
  // Any single typed field keeps the row — the TL.SOC.4 no-silent-drop rule.
  for (const key of ['title', 'date', 'venue', 'city', 'url', 'ctaLabel']) {
    assert.equal(eventHasContent({ ...empty, [key]: 'x' }, false), true, `${key} alone keeps the row`);
  }
  // A poster alone is content: Titi's invites carry their own dates, so an
  // image-only event must survive Save (both saved and freshly staged).
  assert.equal(eventHasContent(empty, true), true);
  ok('eventHasContent: only truly empty drafts prune; a poster alone survives');
}

console.log(`\nevent-fields: ${passed} checks passed`);
