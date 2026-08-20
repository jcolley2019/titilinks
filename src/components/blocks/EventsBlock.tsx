// EventsBlock — shows, launches, appearances. A single stacked list of
// full-width cards, each with a calendar-date tile on the left and title /
// venue / time on the right.
//
// TL.EVNT Stage 1. Deliberately NOT layout-configurable: an events list is read
// top-to-bottom (the next date is the whole point), so it has no filmstrip/grid
// mode and never touches the shared glide machinery in lib/glide.ts. If a second
// look is ever wanted it should be a CARD STYLE on this same stacked list, not a
// second scroll axis.
//
// Field mapping onto block_items — only starts_at/ends_at are new columns; the
// rest ride what the table already had:
//   label      → event title            url        → ticket link
//   subtitle   → venue / location       cta_label  → ticket button label
//   starts_at  → start (wall-clock)     ends_at    → end (wall-clock, optional)
//   style_json → { all_day, sold_out, pinned } + the editor-canonical
//                { venue, city } split (see src/lib/event-fields.ts)
//
// WALL-CLOCK RULING (Joey, Aug 2026): times NEVER convert between zones. A 7pm
// launch reads "7pm" to every visitor, in any zone. See parseWallClock in
// src/lib/event-fields.ts (the shared pure home this card and the EventsEditor
// both resolve through) for how that is enforced, and the 20260818120100
// migration for why moving to real per-event timezones is a data migration
// rather than a toggle.

import { Clock, MapPin, Pin, Ticket } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { translateContent } from '@/lib/content-i18n';
import { triggerHaptic } from '@/hooks/useHapticFeedback';
import type { ThemedBlockProps } from './types';
import { cardSurface, isFullBleedTheme } from '@/lib/surface';
import { coerceLegibleText } from '@/lib/contrast';
import { animationClass, resolveAnimation } from '@/lib/animations';
import { safeHref } from '@/lib/safe-url';
import {
  eventCtaState,
  eventStyleOf,
  hasEnded,
  nowWallClockKey,
  parseWallClock,
  sortEvents,
  type WallClock,
} from '@/lib/event-fields';

/**
 * A Date carrying the wall-clock fields as UTC, for FORMATTING only. Every
 * formatter below passes `timeZone: 'UTC'` to read them straight back, so the
 * rendered string is a pure function of what was typed.
 */
function formatDate(wc: WallClock, lang: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(Date.UTC(wc.y, wc.mo - 1, wc.d, wc.h, wc.mi)).toLocaleDateString(lang, {
    ...opts,
    timeZone: 'UTC',
  });
}

function formatTime(wc: WallClock, lang: string): string {
  return new Date(Date.UTC(wc.y, wc.mo - 1, wc.d, wc.h, wc.mi)).toLocaleTimeString(lang, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

export function EventsBlock({ block, onOutboundClick, theme, editMode }: ThemedBlockProps) {
  const { t, language } = useLanguage();
  const tc = (text: string | null | undefined) => translateContent(text, t);

  const surface = cardSurface(theme);
  const fullBleed = isFullBleedTheme(theme);
  const textColor = fullBleed ? '#ffffff' : theme.typography.text_color;
  const accent = theme.buttons.fill_color;

  // The date tile is the piece of this card that carries the house look, so it
  // wants the accent — but the accent is ALSO what tints the card underneath it
  // (cardSurface washes the same fill_color), and accent-on-accent-tint is how
  // small text disappears. Measured, not assumed:
  //   • full_bleed paints white glass over an arbitrary PHOTO — unmeasurable by
  //     definition, so the marks take the (already forced white) text color and
  //     the accent survives in cardSurface's hairline instead.
  //   • hero measures the accent against the page's own background through the
  //     shipped coerceLegibleText; if it clears the ratio it is kept, otherwise
  //     the marks fall back to the theme's text color, which the page guarantees.
  // Same failure ICON.CONTRAST.1 fixed for platform glyphs, same reasoning.
  const pageBgHex =
    theme.background.type === 'solid'
      ? theme.background.solid_color
      : theme.background.overlay_color || theme.background.solid_color;
  const markColor =
    fullBleed || coerceLegibleText(accent, pageBgHex, 3.0) !== accent ? textColor : accent;

  // ANIM.2: the ticket pill is a button surface, so it follows the page-level
  // animation through the same class contract LinkButton uses. No per-item
  // override on this surface (matching the product Buy pill).
  const ctaAnimClass = animationClass(resolveAnimation(theme.buttons.animation, undefined));

  const nowKey = nowWallClockKey();

  // The one editor-vs-public divergence in this block: the public page hides an
  // event once it has ended, but the CREATOR keeps seeing it (greyed) so they
  // can still reach it to delete or archive it. Everything else renders identically.
  const visible = sortEvents(block.items).filter((item) => editMode || !hasEnded(item, nowKey));

  if (visible.length === 0) return null;

  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-3" data-testid="events-block">
      {visible.map((item) => {
        const flags = eventStyleOf(item.style_json);
        const start = parseWallClock(item.starts_at);
        const ended = hasEnded(item, nowKey);
        const soldOut = !!flags.sold_out;
        const href = safeHref(item.url);
        // TL.EVNT.STAGE2b ruling: no ticket link → no pill at all. With a link,
        // a sold-out event must not BE a link: an inert card can't fire
        // trackOutboundClick, so analytics never records taps toward a dead
        // ticket page. Same for an ended event still shown to the creator.
        const cta = eventCtaState(!!href, soldOut, ended);
        const interactive = cta === 'active';

        const label = (
          <span
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1"
            style={
              interactive
                ? { backgroundColor: accent, color: theme.buttons.text_color }
                : { backgroundColor: `${textColor}1f`, color: textColor, opacity: 0.75 }
            }
          >
            <Ticket className="h-3 w-3" />
            {soldOut
              ? t('events.soldOut')
              : ended
                ? t('events.ended')
                : tc(item.cta_label) || t('events.tickets')}
          </span>
        );

        return (
          <div
            key={item.id}
            className="flex overflow-hidden rounded-2xl transition-opacity"
            style={{
              backgroundColor: surface.background,
              border: `1px solid ${surface.borderColor}`,
              color: textColor,
              // Greyed, not hidden — the creator still needs to reach it.
              opacity: ended ? 0.45 : soldOut ? 0.7 : 1,
              ...(fullBleed ? { backdropFilter: 'blur(12px)' } : {}),
            }}
          >
            {/* Date tile. A gold HAIRLINE rather than a filled block — a filled
                tile reads as utility chrome; a hairline reads as the house. */}
            <div
              className="flex w-[68px] shrink-0 flex-col items-center justify-center px-1 py-3.5"
              style={{ borderRight: `1px solid ${markColor}59` }}
            >
              {start ? (
                <>
                  <span
                    className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: markColor, opacity: markColor === accent ? 1 : 0.75 }}
                  >
                    {formatDate(start, language, { month: 'short' })}
                  </span>
                  <span className="mt-0.5 text-[26px] font-semibold leading-none tracking-tight tabular-nums">
                    {formatDate(start, language, { day: 'numeric' })}
                  </span>
                  {start.y !== currentYear && (
                    <span className="mt-1 text-[10px] tabular-nums opacity-55">{start.y}</span>
                  )}
                </>
              ) : (
                <Clock className="h-5 w-5 opacity-40" />
              )}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1 px-3.5 py-3">
              <div className="flex items-center gap-1.5">
                {flags.pinned && <Pin className="h-3 w-3 shrink-0" style={{ color: markColor }} />}
                <p className="truncate text-[15px] font-semibold leading-snug">{tc(item.label)}</p>
              </div>

              {item.subtitle && (
                <p className="mt-1 flex items-center gap-1 text-[12px] opacity-70">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{tc(item.subtitle)}</span>
                </p>
              )}

              {start && (
                <p className="mt-0.5 flex items-center gap-1 text-[12px] opacity-70">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {flags.all_day || !start.hasTime
                      ? t('events.allDay')
                      : formatTime(start, language)}
                  </span>
                </p>
              )}

              {cta !== 'none' && (
                <div className="mt-2">
                  {interactive ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        if (!onOutboundClick(block.type, block.id, item.id, item.url)) e.preventDefault();
                      }}
                      onTouchStart={() => triggerHaptic('light')}
                      className={`inline-block ${ctaAnimClass}`.trim()}
                    >
                      {label}
                    </a>
                  ) : (
                    label
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
