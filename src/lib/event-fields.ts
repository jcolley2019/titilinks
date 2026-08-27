// TL.EVNT Stage 2 — the events block's pure field logic, re-homed from
// EventsBlock.tsx (the glide.ts precedent: once an editor needs the same
// functions the card uses, the shared home is src/lib, not a component import).
// EventsBlock renders through these; EventsEditor maps its form fields through
// them; scripts/event-fields.test.mjs asserts them. One home, no forks.
//
// Field mapping onto block_items — only starts_at/ends_at are real columns; the
// rest ride what the table already had:
//   label      → event title            url        → ticket link
//   subtitle   → venue / city (display) cta_label  → ticket button label
//   starts_at  → start (wall-clock)     ends_at    → end (wall-clock, optional)
//   archived_at→ archive stamp (3c — non-null = archived, never renders publicly)
//   style_json → { all_day, sold_out, pinned, venue, city }
//
// `venue` and `city` are the editor-canonical SPLIT of the card's one subtitle
// line: the card renders subtitle, the editor edits the pair, and Save derives
// subtitle from them (composeEventSubtitle). Splitting a joined string back
// apart would be lossy, so the split is stored, not parsed.
//
// WALL-CLOCK RULING (Joey, Aug 2026): times NEVER convert between zones. A 7pm
// launch reads "7pm" to every visitor, in any zone. See parseWallClock for how
// that is enforced, and the 20260818120100 migration for why moving to real
// per-event timezones is a data migration rather than a toggle.

/**
 * TL.EVNT Stage 3a.3 — the framed poster window's aspect (width / height),
 * ruled 4:5 by Joey. ONE constant feeds BOTH the PhotoCropSheet's crop window
 * and the card's render box: the stored crop percentages assume the two are
 * the same shape, so if they ever disagreed the card would skew the image.
 * Only a FRAMED poster uses this — an unframed one renders whole at its own
 * aspect, and the lightbox always shows the full original.
 */
export const EVENT_POSTER_ASPECT = 4 / 5;

/** The style_json keys an event carries. All optional; absent = false / empty.
 *  (`crop` — the poster framing window — also lives in style_json, but it is
 *  owned and validated by src/lib/gallery-framing.ts, not read through here.) */
export interface EventStyle {
  all_day?: boolean;
  sold_out?: boolean;
  pinned?: boolean;
  venue?: string;
  city?: string;
}

export function eventStyleOf(styleJson: unknown): EventStyle {
  if (!styleJson || typeof styleJson !== 'object' || Array.isArray(styleJson)) return {};
  return styleJson as EventStyle;
}

/** A date/time as the creator TYPED it — no zone attached, by design. */
export interface WallClock {
  y: number;
  mo: number; // 1-12
  d: number;
  h: number;
  mi: number;
  hasTime: boolean;
}

/**
 * Pull the literal calendar fields out of a stored timestamp WITHOUT letting the
 * visitor's timezone touch them.
 *
 * `new Date(iso)` would defeat the whole wall-clock ruling: it resolves the
 * string to an instant and every getter then answers in the VISITOR's zone, so
 * a 7pm Miami launch would render "4pm" to a reader in Los Angeles and they
 * would show up at the wrong time. Reading the components textually is what
 * makes the card say the same thing everywhere on earth.
 */
export function parseWallClock(iso: string | null | undefined): WallClock | null {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return {
    y: Number(y),
    mo: Number(mo),
    d: Number(d),
    h: h === undefined ? 0 : Number(h),
    mi: mi === undefined ? 0 : Number(mi),
    hasTime: h !== undefined,
  };
}

/**
 * Put a wall-clock on a single comparable scale. Both the event and "now" are
 * projected through Date.UTC, so the comparison is DST-proof and reads exactly
 * as "has the visitor's own clock passed this time yet?" — the only sane
 * question under the wall-clock ruling. Never used for display.
 */
export function wallClockKey(wc: WallClock): number {
  return Date.UTC(wc.y, wc.mo - 1, wc.d, wc.h, wc.mi);
}

export function nowWallClockKey(): number {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes());
}

/** The two timestamp columns, structurally — so block cards (full BlockItem
 *  rows) and editor drafts (staged strings) go through the SAME lifecycle
 *  functions instead of each growing their own. */
export interface EventTimes {
  starts_at: string | null;
  ends_at: string | null;
}

/**
 * Has this event finished? Uses `ends_at` when present, otherwise start + 24h
 * (Joey's ruling: most one-off events state no end, and a same-day event should
 * not vanish while it is still happening).
 */
export function hasEnded(item: EventTimes, nowKey: number = nowWallClockKey()): boolean {
  const end = parseWallClock(item.ends_at);
  if (end) return wallClockKey(end) < nowKey;
  const start = parseWallClock(item.starts_at);
  if (!start) return false; // no date at all — never auto-hide it
  return wallClockKey(start) + 24 * 60 * 60 * 1000 < nowKey;
}

/**
 * Display order: pinned first, then soonest first. Undated events sink to the
 * bottom rather than pretending to be imminent. Pure — the DB's `order_index`
 * is not the sort here, because a date list that ignores dates is just a list.
 */
export function sortEvents<
  T extends { starts_at: string | null; order_index: number; style_json: unknown },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const pa = eventStyleOf(a.style_json).pinned ? 0 : 1;
    const pb = eventStyleOf(b.style_json).pinned ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const wa = parseWallClock(a.starts_at);
    const wb = parseWallClock(b.starts_at);
    if (!wa && !wb) return a.order_index - b.order_index;
    if (!wa) return 1;
    if (!wb) return -1;
    return wallClockKey(wa) - wallClockKey(wb);
  });
}

/** What the card's ticket pill is doing, if anything. */
export type EventCtaState = 'none' | 'active' | 'sold_out' | 'ended';

/**
 * RULING (Joey's Stage 2 gate, Aug 2026): the pill renders ONLY when a ticket
 * link exists — an event without a destination gets no pill at all, not an
 * inert one. `hasLink` is the SAFE link (the card passes `!!safeHref(url)`), so
 * a stored URL the XSS guard refuses also counts as "no destination" — an
 * unopenable pill would be a lie either way.
 *
 * With a link: sold-out relabels and inerts the pill and wins over ended
 * (matching the shipped card's label precedence); ended inerts it; otherwise
 * it is live.
 */
export function eventCtaState(hasLink: boolean, soldOut: boolean, ended: boolean): EventCtaState {
  if (!hasLink) return 'none';
  if (soldOut) return 'sold_out';
  if (ended) return 'ended';
  return 'active';
}

// ── Editor field mapping (TL.EVNT Stage 2) ───────────────────────────────────
// The editor holds native-input strings (date 'YYYY-MM-DD', time 'HH:MM'); the
// DB holds a timestamptz. These two functions are the ONLY bridge, and they are
// exact inverses under the wall-clock ruling: the stored offset is pinned to
// +00:00 on write, PostgREST echoes the same components back, and parseWallClock
// reads them textually — so decompose(compose(d, t)) === {d, t}, always.

/**
 * Build the `starts_at` write value from the editor's fields. The explicit
 * +00:00 is what makes the round-trip exact regardless of the DB's timezone
 * setting — an unqualified timestamp would be interpreted in whatever zone the
 * server happens to run. All-day (or time-less) events store midnight; the
 * style_json.all_day flag is what suppresses the time on the card, because a
 * timestamptz cannot itself say "no time was given".
 */
export function composeStartsAt(date: string, time: string, allDay: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = !allDay && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : '00:00';
  return `${date}T${t}:00+00:00`;
}

/** Split a stored timestamp back into the editor's native-input strings. The
 *  caller blanks `time` itself when style_json.all_day is set — midnight is the
 *  storage encoding of "no time", not a time the creator typed. */
export function decomposeStartsAt(iso: string | null | undefined): { date: string; time: string } {
  const wc = parseWallClock(iso);
  if (!wc) return { date: '', time: '' };
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${wc.y}-${p(wc.mo)}-${p(wc.d)}`, time: `${p(wc.h)}:${p(wc.mi)}` };
}

/**
 * The Save-time prune predicate (TL.EVNT Stage 3a — re-homed here so it can be
 * unit-tested): keep any draft the creator put SOMETHING into. Only rows that
 * are COMPLETELY empty (an abandoned "Add event") are dropped — silently
 * discarding part-filled rows on Save is the exact SocialLinksEditor trap
 * TL.SOC.4 had to fix; never reintroduce it. A poster counts as content: an
 * image-only event (Titi's invites carry their own dates) must survive Save.
 */
export function eventHasContent(
  f: { title: string; date: string; venue: string; city: string; url: string; ctaLabel: string },
  hasPoster: boolean,
): boolean {
  return !!(
    f.title.trim() ||
    f.date ||
    f.venue.trim() ||
    f.city.trim() ||
    f.url.trim() ||
    f.ctaLabel.trim() ||
    hasPoster
  );
}

/** The card's one location line, derived from the canonical venue/city split. */
export function composeEventSubtitle(venue: string, city: string): string | null {
  return [venue.trim(), city.trim()].filter(Boolean).join(', ') || null;
}

/**
 * The editor's venue/city fields from a stored row. Canonical style_json keys
 * win; a row that predates them (SQL-seeded fixtures, stage-1 rows) falls back
 * to showing its whole subtitle as the venue — lossless, since Save then writes
 * the canonical split without changing what the card displays.
 */
export function decomposeEventLocation(
  styleJson: unknown,
  subtitle: string | null | undefined,
): { venue: string; city: string } {
  const s = eventStyleOf(styleJson);
  if (typeof s.venue === 'string' || typeof s.city === 'string') {
    return { venue: typeof s.venue === 'string' ? s.venue : '', city: typeof s.city === 'string' ? s.city : '' };
  }
  return { venue: subtitle ?? '', city: '' };
}

// ── Archive lifecycle (TL.EVNT.3c) ───────────────────────────────────────────
// Archived = `archived_at IS NOT NULL` on the row (Joey's ruling, Aug 18 2026):
// past events grey + hide publicly, then the creator explicitly deletes or
// archives them. The archive holds its own 20 — SEPARATE from the 20-active
// ITEM_CAPS.events — and an archived event never renders publicly; its only
// surface is the panel's archive view.

/** The archive's own cap. Deliberately NOT in ITEM_CAPS: that table rations
 *  what a block may RENDER, this bounds a lifecycle shelf that never renders. */
export const EVENT_ARCHIVE_CAP = 20;

/** Non-null AND parseable = archived. Run through parseWallClock rather than a
 *  bare null-check so a garbage value can never conjure an archived state. */
export function isArchived(archivedAt: string | null | undefined): boolean {
  return parseWallClock(archivedAt) !== null;
}

/** The creator's local now as a WallClock — the moment "Archive" was tapped,
 *  under the same never-converts discipline as every other event time. */
export function nowWallClock(): WallClock {
  const n = new Date();
  return {
    y: n.getFullYear(),
    mo: n.getMonth() + 1,
    d: n.getDate(),
    h: n.getHours(),
    mi: n.getMinutes(),
    hasTime: true,
  };
}

/**
 * The archive stamp's write value — the same pinned +00:00 shape as
 * composeStartsAt, so parseWallClock(composeArchivedAt(wc)) is exactly the
 * identity and the cleanup-window comparison is a pure component read on any
 * client, in any timezone.
 */
export function composeArchivedAt(wc: WallClock): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${wc.y}-${p(wc.mo)}-${p(wc.d)}T${p(wc.h)}:${p(wc.mi)}:00+00:00`;
}

/** The auto-cleanup windows Joey ruled (days). Off is the absence of a value. */
export const ARCHIVE_CLEANUP_CHOICES = [30, 60, 90] as const;
export type ArchiveCleanupDays = (typeof ARCHIVE_CLEANUP_CHOICES)[number];

/**
 * The events block's per-block config, stored as JSON in `blocks.title` — the
 * app's ONE per-block config surface (the gallery/bio/text precedent; `blocks`
 * has no style_json column). Tolerates the block's born display title ("Events"
 * from the dashboard door) and anything else non-object by reading as "no
 * config yet". Returned raw so writers can merge ADDITIVELY: spread this,
 * set/delete your key, stringify — keys another feature owns survive.
 */
export function parseEventsBlockConfig(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Not JSON — the door's display title. No config yet.
  }
  return {};
}

/** The validated cleanup window from a parsed config: exactly 30, 60 or 90,
 *  anything else — absent, 0, 45, a string — is OFF (null). Off is the default
 *  and the ruling says the creator opts IN, so unknowns must never round up. */
export function archiveCleanupDaysOf(config: unknown): ArchiveCleanupDays | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return null;
  const v = (config as Record<string, unknown>).archiveCleanupDays;
  return (ARCHIVE_CLEANUP_CHOICES as readonly unknown[]).includes(v)
    ? (v as ArchiveCleanupDays)
    : null;
}

/**
 * Is this archived event past its cleanup window? Strictly older than `days`
 * whole days (86 400 000 ms each, DST-proof through the same Date.UTC scale as
 * every lifecycle comparison here). An unparseable stamp is never due: cleanup
 * DELETES PERMANENTLY, so anything ambiguous stays.
 */
export function archiveCleanupDue(
  archivedAt: string | null | undefined,
  days: number,
  nowKey: number,
): boolean {
  const wc = parseWallClock(archivedAt);
  if (!wc) return false;
  return wallClockKey(wc) + days * 24 * 60 * 60 * 1000 < nowKey;
}

/**
 * The save-path cap check (both caps, active first). Counts EXCEEDING a cap
 * violate it — sitting exactly at a cap is legal, the editor's add/archive
 * gestures are what refuse to go past it. Returned as a discriminant so the
 * editor can raise the RIGHT user-facing error instead of silently truncating
 * (the architect's ruling: caps fail loudly, never trim).
 */
export function eventCapViolation(
  activeCount: number,
  archivedCount: number,
  activeCap: number,
  archiveCap: number,
): 'active' | 'archive' | null {
  if (activeCount > activeCap) return 'active';
  if (archivedCount > archiveCap) return 'archive';
  return null;
}
