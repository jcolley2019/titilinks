// EventsEditor — edits an Events block (TL.EVNT Stage 2). Modeled on
// CarouselEditor/GalleryEditor: staged semantics (every edit is local state,
// Save commits, Cancel/X discards), panelMode/Dialog split, sticky Cancel/Save
// bar. Field mapping lives in src/lib/event-fields.ts — this file only moves
// strings between inputs and that contract.
//
// THE PANEL OWNS THE FULL LIST (Joey's past-event ruling, resolved the Stage 2
// way): the editor's block-card preview deliberately does NOT forward editMode
// (see tests/49-events-card.spec.ts), so ended events never show there — they
// show HERE instead, greyed and tagged, where delete (and later archive) live.
//
// List order: upcoming first (same pinned-then-soonest order the card renders),
// ended events at the bottom — partitioned ONCE at fetch so rows never jump
// while the creator is typing a date. Order_index is written from array
// position on Save, but the card sorts by date itself, so it is inert for now
// (reorder is Stage 4).

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Loader2, Calendar, Plus, Trash2, Pin, MapPin } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import type { Tables } from '@/integrations/supabase/types';
import { ITEM_CAPS } from '@/lib/validation';
import {
  composeEventSubtitle,
  composeStartsAt,
  decomposeEventLocation,
  decomposeStartsAt,
  eventStyleOf,
  hasEnded,
  nowWallClockKey,
  parseWallClock,
  sortEvents,
} from '@/lib/event-fields';

const MAX_ITEMS = ITEM_CAPS.events;

type BlockItem = Tables<'block_items'>;

interface EventDraft {
  id: string;
  title: string;
  date: string; // 'YYYY-MM-DD' or ''
  time: string; // 'HH:MM' or ''
  allDay: boolean;
  venue: string;
  city: string;
  url: string;
  ctaLabel: string;
  soldOut: boolean;
  pinned: boolean;
  /** Carried through untouched — no end-time field until the Stage 3 archive
   *  lifecycle; hasEnded still needs the stored value for the greyed tag. */
  ends_at: string | null;
  /** The row's WHOLE style_json, so the save stays additive (the Gallery/Links
   *  precedent): event keys merge onto it and it is written back entire, so
   *  keys owned by other features survive. */
  style_json: Record<string, any> | null;
}

interface EventsEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
}

const inputCls =
  'w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#C9A55C]/50';

/** The house toggle, verbatim from GalleryEditor/CarouselEditor. */
function ToggleRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-white/60">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        className={`w-[33px] h-[18px] rounded-full relative transition-colors ${on ? 'bg-[#C9A55C]' : 'bg-white/10'}`}
      >
        <span className={`absolute top-[1.5px] left-[1.5px] w-[15px] h-[15px] rounded-full bg-white transition-transform ${on ? 'translate-x-[15px]' : ''}`} />
      </button>
    </div>
  );
}

/** A draft's ended-ness from its STAGED fields, so typing a future date
 *  un-greys the row live — same lifecycle rule as the card, via the same lib. */
function draftEnded(ev: EventDraft, nowKey: number): boolean {
  return hasEnded(
    { starts_at: composeStartsAt(ev.date, ev.time, ev.allDay || !ev.time), ends_at: ev.ends_at },
    nowKey,
  );
}

export function EventsEditor({ blockId, open, onOpenChange, onSave, panelMode }: EventsEditorProps) {
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<EventDraft[]>([]);
  const [existingItems, setExistingItems] = useState<BlockItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (open) fetchEvents();
  }, [open, blockId]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('block_items')
        .select('*')
        .eq('block_id', blockId)
        .order('order_index', { ascending: true });
      if (error) throw error;

      const items = data || [];
      setExistingItems(items);

      // Upcoming first in the card's own order, ended at the bottom —
      // partitioned here, once, so the list is stable while editing.
      const nowKey = nowWallClockKey();
      const sorted = sortEvents(items);
      const ordered = [...sorted.filter((i) => !hasEnded(i, nowKey)), ...sorted.filter((i) => hasEnded(i, nowKey))];

      setEvents(
        ordered.map((item) => {
          const flags = eventStyleOf(item.style_json);
          const { date, time } = decomposeStartsAt(item.starts_at);
          const { venue, city } = decomposeEventLocation(item.style_json, item.subtitle);
          return {
            id: item.id,
            title: item.label || '',
            date,
            // Midnight on an all-day event is storage encoding, not a typed time.
            time: flags.all_day ? '' : time,
            allDay: !!flags.all_day,
            venue,
            city,
            url: item.url || '',
            ctaLabel: item.cta_label || '',
            soldOut: !!flags.sold_out,
            pinned: !!flags.pinned,
            ends_at: item.ends_at,
            style_json: (item.style_json as Record<string, any> | null) ?? null,
          };
        }),
      );
    } catch (error) {
      console.error('Error fetching events:', error);
      toast.error(t('eventsEditor.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const addEvent = () => {
    if (events.length >= MAX_ITEMS) {
      toast.error(t('eventsEditor.maxEvents').replace('{max}', String(MAX_ITEMS)));
      return;
    }
    const id = `new-${Date.now()}-${Math.random()}`;
    // New events go to the top, right under the Add button, form open.
    setEvents((prev) => [
      { id, title: '', date: '', time: '', allDay: false, venue: '', city: '', url: '', ctaLabel: '', soldOut: false, pinned: false, ends_at: null, style_json: null },
      ...prev,
    ]);
    setSelectedId(id);
  };

  const updateEvent = (id: string, patch: Partial<EventDraft>) => {
    setEvents((prev) => prev.map((ev) => (ev.id === id ? { ...ev, ...patch } : ev)));
  };

  const deleteEvent = (id: string) => {
    // Staged like every other edit here — the row only really dies on Save,
    // and Cancel brings it back, so no confirm step (the Carousel precedent;
    // the Gallery confirm guards an uploaded FILE, which events don't have).
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleSave = async () => {
    // Prune only rows that are COMPLETELY empty (an abandoned "Add event") —
    // anything the creator typed persists verbatim, even title-less. Silently
    // dropping part-filled rows on Save is the exact SocialLinksEditor trap
    // TL.SOC.4 had to fix; never reintroduce it.
    const kept = events.filter(
      (ev) => ev.title.trim() || ev.date || ev.venue.trim() || ev.city.trim() || ev.url.trim() || ev.ctaLabel.trim(),
    );
    setSaving(true);
    try {
      // Delete removed items.
      const keptIds = kept.filter((ev) => !ev.id.startsWith('new-')).map((ev) => ev.id);
      const toDelete = existingItems.filter((ei) => !keptIds.includes(ei.id));
      for (const item of toDelete) {
        const { error } = await supabase.from('block_items').delete().eq('id', item.id);
        if (error) throw error;
      }

      // Upsert kept items in display order.
      for (let i = 0; i < kept.length; i++) {
        const ev = kept[i];

        // A dated event with no typed time IS all-day on the card (the only
        // honest render of "no time given"), so the flag converges to match.
        const allDay = ev.allDay || (!!ev.date && !ev.time);

        // Additive style_json merge: event keys set when meaningful, deleted
        // when not (absent = false is the card's contract), everything another
        // feature put there left alone.
        const style: Record<string, any> = { ...(ev.style_json || {}) };
        const setOrDelete = (key: string, value: unknown) => {
          if (value) style[key] = value;
          else delete style[key];
        };
        setOrDelete('all_day', allDay);
        setOrDelete('sold_out', ev.soldOut);
        setOrDelete('pinned', ev.pinned);
        setOrDelete('venue', ev.venue.trim());
        setOrDelete('city', ev.city.trim());

        const fields = {
          label: ev.title.trim(),
          url: ev.url.trim(),
          subtitle: composeEventSubtitle(ev.venue, ev.city),
          cta_label: ev.ctaLabel.trim() || null,
          starts_at: composeStartsAt(ev.date, ev.time, allDay),
          order_index: i,
          style_json: Object.keys(style).length ? style : null,
          // ends_at deliberately absent: this editor has no end field yet
          // (Stage 3), and an update must not null out a stored value.
        };

        if (ev.id.startsWith('new-')) {
          const { error } = await supabase.from('block_items').insert({ block_id: blockId, ...fields });
          if (error) throw error;
        } else {
          const { error } = await supabase.from('block_items').update(fields).eq('id', ev.id);
          if (error) throw error;
        }
      }

      // The dashboard swallows the close below and this panel stays mounted, so
      // `open` never flips and the fetch effect won't rerun. Re-sync from the DB
      // here (the GAL.1b lesson) — otherwise staged `new-` rows re-insert on the
      // next Save and the delete-diff runs against pre-save rows.
      await fetchEvents();

      toast.success(t('eventsEditor.saved'));
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving events:', error);
      toast.error(error.message || t('eventsEditor.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  /** Row summary date, through the same UTC-formatting trick as the card so it
   *  is a pure function of what was typed. */
  const rowDate = (ev: EventDraft): string => {
    const wc = parseWallClock(composeStartsAt(ev.date, ev.time, ev.allDay || !ev.time));
    if (!wc) return t('eventsEditor.noDate');
    const d = new Date(Date.UTC(wc.y, wc.mo - 1, wc.d, wc.h, wc.mi));
    const day = d.toLocaleDateString(language, { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const year = wc.y !== new Date().getFullYear() ? ` ${wc.y}` : '';
    if (ev.allDay || !ev.time) return `${day}${year} · ${t('events.allDay')}`;
    return `${day}${year} · ${d.toLocaleTimeString(language, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })}`;
  };

  const nowKey = nowWallClockKey();

  const innerContent = (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          <ScrollArea className={panelMode ? 'flex-1 min-h-0 px-4 -mx-4' : 'flex-1 min-h-0 -mx-6 px-6'}>
            <div className="space-y-3 pb-3">
              {events.length < MAX_ITEMS && (
                <button
                  type="button"
                  onClick={addEvent}
                  className="w-full py-3 rounded-xl border-2 border-dashed border-[#C9A55C]/40 flex items-center justify-center gap-2 hover:border-[#C9A55C]/70 hover:bg-[#C9A55C]/5 transition-colors"
                >
                  <Plus className="h-5 w-5 text-[#C9A55C]/70" />
                  <span className="text-xs font-medium text-[#C9A55C]/80">{t('eventsEditor.addEvent')}</span>
                </button>
              )}

              {events.length === 0 && (
                <p className="mt-1 text-center text-xs text-white/40">{t('eventsEditor.emptyState')}</p>
              )}

              {events.map((ev) => {
                const isSel = ev.id === selectedId;
                const ended = draftEnded(ev, nowKey);
                return (
                  <div
                    key={ev.id}
                    className={`rounded-xl border bg-white/5 overflow-hidden transition-colors ${
                      isSel ? 'border-[#C9A55C]' : 'border-white/10'
                    } ${ended && !isSel ? 'opacity-50' : ''}`}
                  >
                    {/* Row header — tap to open/close the fields. */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(isSel ? null : ev.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(isSel ? null : ev.id); } }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {ev.pinned && <Pin className="h-3 w-3 shrink-0 text-[#C9A55C]" />}
                          <p className={`truncate text-sm font-semibold ${ev.title.trim() ? 'text-white' : 'text-white/40'}`}>
                            {ev.title.trim() || t('eventsEditor.untitled')}
                          </p>
                          {ended && (
                            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">
                              {t('events.ended')}
                            </span>
                          )}
                          {ev.soldOut && !ended && (
                            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-white/10 text-white/60">
                              {t('events.soldOut')}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-white/50">
                          <span className="shrink-0">{rowDate(ev)}</span>
                          {(ev.venue.trim() || ev.city.trim()) && (
                            <>
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate">{[ev.venue.trim(), ev.city.trim()].filter(Boolean).join(', ')}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteEvent(ev.id); }}
                        aria-label={t('eventsEditor.removeEvent')}
                        className="shrink-0 h-7 w-7 rounded-full bg-black/40 text-white/60 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Fields — single column, full-width inputs (panel-width surface). */}
                    {isSel && (
                      <div className="px-3 pb-3 pt-1 space-y-3 border-t border-white/10">
                        <div className="space-y-1 pt-2">
                          <p className="text-xs text-white/60">{t('eventsEditor.eventTitle')}</p>
                          <input
                            value={ev.title}
                            onChange={(e) => updateEvent(ev.id, { title: e.target.value })}
                            placeholder={t('eventsEditor.eventTitlePlaceholder')}
                            className={inputCls}
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-white/60">{t('eventsEditor.date')}</p>
                          {/* [color-scheme:dark] keeps the native picker glyph
                              visible on the dark panel. */}
                          <input
                            type="date"
                            value={ev.date}
                            onChange={(e) => updateEvent(ev.id, { date: e.target.value })}
                            className={`${inputCls} [color-scheme:dark]`}
                          />
                        </div>
                        <ToggleRow
                          label={t('events.allDay')}
                          on={ev.allDay}
                          onToggle={() => updateEvent(ev.id, { allDay: !ev.allDay })}
                        />
                        {!ev.allDay && (
                          <div className="space-y-1">
                            <p className="text-xs text-white/60">{t('eventsEditor.time')}</p>
                            <input
                              type="time"
                              value={ev.time}
                              onChange={(e) => updateEvent(ev.id, { time: e.target.value })}
                              className={`${inputCls} [color-scheme:dark]`}
                            />
                          </div>
                        )}
                        <div className="space-y-1">
                          <p className="text-xs text-white/60">{t('eventsEditor.venue')}</p>
                          <input
                            value={ev.venue}
                            onChange={(e) => updateEvent(ev.id, { venue: e.target.value })}
                            placeholder={t('eventsEditor.venuePlaceholder')}
                            className={inputCls}
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-white/60">{t('eventsEditor.city')}</p>
                          <input
                            value={ev.city}
                            onChange={(e) => updateEvent(ev.id, { city: e.target.value })}
                            placeholder={t('eventsEditor.cityPlaceholder')}
                            className={inputCls}
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-white/60">{t('eventsEditor.ticketLink')}</p>
                          <input
                            value={ev.url}
                            onChange={(e) => updateEvent(ev.id, { url: e.target.value })}
                            placeholder="https://…"
                            inputMode="url"
                            className={`${inputCls} truncate`}
                          />
                        </div>
                        {/* TL.EVNT.STAGE2b (Joey's gate): no link → no pill on
                            the card, so the label field stays VISIBLE but
                            disabled — the creator can see the option exists and
                            why it's inert. A stored label survives disabled;
                            data is never dropped for being momentarily inert. */}
                        <div className={`space-y-1 ${ev.url.trim() ? '' : 'opacity-40'}`}>
                          <p className="text-xs text-white/60">{t('eventsEditor.ticketLabel')}</p>
                          <input
                            value={ev.ctaLabel}
                            onChange={(e) => updateEvent(ev.id, { ctaLabel: e.target.value })}
                            placeholder={t('events.tickets')}
                            disabled={!ev.url.trim()}
                            className={`${inputCls} disabled:cursor-not-allowed`}
                          />
                          {/* Suggestion chips (the Gallery layout-chip look):
                              tapping one fills the field, which stays free-text. */}
                          <div className="flex flex-wrap gap-2 pt-1">
                            {[
                              t('events.tickets'),
                              t('eventsEditor.labelRsvp'),
                              t('eventsEditor.labelStream'),
                              t('eventsEditor.labelInfo'),
                            ].map((chip) => (
                              <button
                                key={chip}
                                type="button"
                                onClick={() => updateEvent(ev.id, { ctaLabel: chip })}
                                disabled={!ev.url.trim()}
                                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
                                  ev.ctaLabel === chip
                                    ? 'bg-[#C9A55C] text-[#0e0c09]'
                                    : 'bg-white/5 text-foreground border border-white/10'
                                }`}
                              >
                                {chip}
                              </button>
                            ))}
                          </div>
                        </div>
                        <ToggleRow
                          label={t('events.soldOut')}
                          on={ev.soldOut}
                          onToggle={() => updateEvent(ev.id, { soldOut: !ev.soldOut })}
                        />
                        <ToggleRow
                          label={t('eventsEditor.pin')}
                          on={ev.pinned}
                          onToggle={() => updateEvent(ev.id, { pinned: !ev.pinned })}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Actions — pinned to the bottom of the panel while content scrolls. */}
          <div className="sticky bottom-0 z-10 mt-auto flex gap-3 -mx-4 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-[#0e0c09]">
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-12 rounded-xl bg-white/10 text-white border border-white/20 hover:bg-white/20"
            >
              {t('blockEditor.cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 h-12 rounded-xl bg-[#C9A55C] text-black font-semibold hover:bg-[#C9A55C]/90 disabled:opacity-40"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('blockEditor.saving')}
                </>
              ) : (
                t('blockEditor.save')
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  );

  if (panelMode) {
    return (
      <div className="flex flex-1 flex-col min-h-0 bg-[#0e0c09] text-white px-4 pt-4">
        {innerContent}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            {t('eventsEditor.dialogTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('eventsEditor.dialogDescription')} ({events.length}/{MAX_ITEMS})
          </DialogDescription>
        </DialogHeader>
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
