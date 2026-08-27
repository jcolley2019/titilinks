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

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { randomUUID } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
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
import { Loader2, Calendar, Plus, Trash2, Pin, MapPin, ImagePlus } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import type { Tables } from '@/integrations/supabase/types';
import { ITEM_CAPS, validateImageFile, IMAGE_SIZE_LIMITS } from '@/lib/validation';
import { removePublicObject } from '@/lib/storage-cleanup';
import { resolveGalleryCrop, resolveGalleryMediaStyle, type GalleryCrop } from '@/lib/gallery-framing';
import { PhotoCropSheet } from './PhotoCropSheet';
import {
  EVENT_POSTER_ASPECT,
  composeEventSubtitle,
  composeStartsAt,
  decomposeEventLocation,
  decomposeStartsAt,
  eventHasContent,
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
  /** TL.EVNT Stage 3a — the poster, staged the GalleryEditor way: `posterUrl`
   *  is the SAVED public URL ('' = none), a freshly picked file rides in
   *  `posterFile` + `posterPreview` (data URL) and only reaches storage on
   *  Save. Cancel drops the staged pair; the old-file cleanup diff runs against
   *  `existingItems` at save time, so clearing this draft deletes nothing. */
  posterUrl: string;
  posterFile?: File;
  posterPreview?: string;
  /** Carried through untouched — no end-time field until the Stage 3 archive
   *  lifecycle; hasEnded still needs the stored value for the greyed tag. */
  ends_at: string | null;
  /** The row's WHOLE style_json, so the save stays additive (the Gallery/Links
   *  precedent): event keys merge onto it and it is written back entire, so
   *  keys owned by other features survive. */
  style_json: Record<string, any> | null;
}

/**
 * TL.EVNT.3b — the block_items shape an EventDraft becomes. Only the columns
 * EventsBlock actually reads; the preview's substitution merges these onto the
 * real DB row (or a synthetic one for a not-yet-inserted event), so the rest of
 * the table's columns are inert here.
 */
export interface EventRow {
  id: string;
  label: string;
  subtitle: string | null;
  url: string;
  cta_label: string | null;
  starts_at: string | null;
  ends_at: string | null;
  image_url: string | null;
  order_index: number;
  style_json: Record<string, any> | null;
}

/**
 * TL.EVNT.3b — the live-mirror payload, following GalleryDraft (L6) exactly:
 * the panel's whole staged list in the shape the preview needs, republished on
 * every change and cleared when the panel goes away.
 *
 * The draft NAMES its own block (the TL.GAL.6b lesson): scoping it by Editor's
 * `editingBlock` only works for the doors routing through onBlockEdit, and the
 * dashboard's section list and guided checklist set activeBlockId directly.
 *
 * Unlike GalleryDraft there is no downward `remove` channel — the events card
 * has no per-item trash in the preview, so the panel is the only editor of
 * this list and nothing has to reach back into it.
 */
export interface EventsDraft {
  blockId: string;
  items: EventRow[];
}

/**
 * The ONE draft→row mapping. Save commits it (swapping in the uploaded poster
 * URL, and dropping ends_at because this editor has no end field yet); the
 * live mirror publishes it as-is with the staged data URL. Pure, and shared on
 * purpose: a second copy of this mapping is how a preview starts lying about
 * what Save will write.
 */
function composeEventRow(ev: EventDraft, orderIndex: number): EventRow {
  // A dated event with no typed time IS all-day on the card (the only honest
  // render of "no time given"), so the flag converges to match.
  const allDay = ev.allDay || (!!ev.date && !ev.time);

  // Additive style_json merge: event keys set when meaningful, deleted when not
  // (absent = false is the card's contract), everything another feature put
  // there — the poster `crop` included — left alone.
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

  return {
    id: ev.id,
    label: ev.title.trim(),
    subtitle: composeEventSubtitle(ev.venue, ev.city),
    url: ev.url.trim(),
    cta_label: ev.ctaLabel.trim() || null,
    starts_at: composeStartsAt(ev.date, ev.time, allDay),
    ends_at: ev.ends_at,
    // A staged file has no DB URL yet, and an <img> takes the preview data URL
    // just as happily (the GalleryDraft precedent). Save overwrites this with
    // the uploaded public URL.
    image_url: ev.posterPreview || ev.posterUrl || null,
    order_index: orderIndex,
    style_json: Object.keys(style).length ? style : null,
  };
}

interface EventsEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
  /** Live-mirror channel (TL.EVNT.3b) — see EventsDraft. Null clears the
   *  mirror, which is how Cancel / X snap the preview back to DB truth. */
  onDraftChange?: (draft: EventsDraft | null) => void;
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

export function EventsEditor({ blockId, open, onOpenChange, onSave, panelMode, onDraftChange }: EventsEditorProps) {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<EventDraft[]>([]);
  const [existingItems, setExistingItems] = useState<BlockItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // One ref is enough: the file input renders only inside the SELECTED row's
  // form, and exactly one row is open at a time.
  const posterInputRef = useRef<HTMLInputElement>(null);
  // TL.EVNT Stage 3a.3 — which event's poster the framing sheet is open on.
  const [cropTargetId, setCropTargetId] = useState<string | null>(null);

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
            posterUrl: item.image_url || '',
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
      { id, title: '', date: '', time: '', allDay: false, venue: '', city: '', url: '', ctaLabel: '', soldOut: false, pinned: false, posterUrl: '', ends_at: null, style_json: null },
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

  // TL.EVNT.3b — publish the draft, following the GalleryEditor precedent (L6).
  // Nothing here writes to the DB: Save still owns that.
  //
  // Held back until the fetch lands, or the empty pre-fetch state would blank
  // the preview's events for a beat every time the panel opens. Filtered
  // through the SAME eventHasContent predicate Save prunes with, so a fresh
  // "Add event" row stays out of the preview until the creator types something
  // into it — and the array position published here is the order_index Save
  // will write, so the preview and the saved page order identically.
  useEffect(() => {
    if (!open) { onDraftChange?.(null); return; }
    if (loading) return;
    onDraftChange?.({
      blockId,
      items: events
        .filter((ev) => eventHasContent(ev, !!(ev.posterUrl || ev.posterFile)))
        .map((ev, i) => composeEventRow(ev, i)),
    });
  }, [open, loading, blockId, events, onDraftChange]);

  // Cancel / X unmounts this panel, and clearing the mirror here is what makes
  // the preview revert to DB truth.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { onDraftChange?.(null); }, []);

  /** style_json minus the poster framing. A crop belongs to the IMAGE it was
   *  chosen on (the PhotoCropSheet isSuggested note): applied to a different
   *  poster it would mis-frame it, so any pick/remove strips it. */
  const stripCrop = (style: Record<string, any> | null): Record<string, any> | null => {
    if (!style || !('crop' in style)) return style;
    const { crop: _crop, ...rest } = style;
    return Object.keys(rest).length ? rest : null;
  };

  /** Stage a picked poster file — validation now, storage only on Save. */
  const handlePosterPick = (id: string, file: File | null | undefined) => {
    if (!file) return;
    const validation = validateImageFile(file, IMAGE_SIZE_LIMITS.media);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setEvents((prev) => prev.map((ev) => ev.id === id
        ? { ...ev, posterFile: file, posterPreview: reader.result as string, style_json: stripCrop(ev.style_json) }
        : ev));
    };
    reader.readAsDataURL(file);
    if (posterInputRef.current) posterInputRef.current.value = '';
  };

  /** TL.EVNT Stage 3a.3 — stage the framing sheet's result. Additive merge on
   *  the row's WHOLE style_json (the Gallery precedent): null deletes the key,
   *  everything another feature owns survives. Staged only — Save commits. */
  const stagePosterCrop = (id: string, crop: GalleryCrop | null) => {
    setEvents((prev) => prev.map((ev) => {
      if (ev.id !== id) return ev;
      if (crop === null) return { ...ev, style_json: stripCrop(ev.style_json) };
      return { ...ev, style_json: { ...(ev.style_json || {}), crop } };
    }));
  };

  /** Upload to the products bucket under the events/ prefix. The first path
   *  segment must stay the user id — that folder IS the bucket's RLS check. */
  const uploadPoster = async (file: File): Promise<string> => {
    if (!user) throw new Error('Not authenticated');
    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/events/${randomUUID()}.${fileExt}`;
    const { error } = await supabase.storage.from('products').upload(filePath, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('products').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleSave = async () => {
    // Prune only rows that are COMPLETELY empty (an abandoned "Add event") —
    // anything the creator typed persists verbatim, even title-less. The
    // predicate lives in event-fields.ts (unit-tested); a poster alone is
    // content too.
    const kept = events.filter((ev) => eventHasContent(ev, !!(ev.posterUrl || ev.posterFile)));
    setSaving(true);
    try {
      // Delete removed items.
      const keptIds = kept.filter((ev) => !ev.id.startsWith('new-')).map((ev) => ev.id);
      const toDelete = existingItems.filter((ei) => !keptIds.includes(ei.id));
      for (const item of toDelete) {
        const { error } = await supabase.from('block_items').delete().eq('id', item.id);
        if (error) throw error;
        // STOR.4: row gone on the creator's explicit Save, so drop its poster
        // file too — user-intent only, best-effort, never blocks the save.
        // Snapshots may still hold the URL (the gallery precedent): a restore
        // shows a broken poster rather than resurrecting a deleted file.
        removePublicObject('products', item.image_url);
      }

      // Upsert kept items in display order.
      for (let i = 0; i < kept.length; i++) {
        const ev = kept[i];

        // Staged poster reaches storage only here — the GalleryEditor pattern.
        const posterUrl = ev.posterFile ? await uploadPoster(ev.posterFile) : ev.posterUrl;

        // TL.EVNT.3b — the row comes from the same composeEventRow the live
        // mirror publishes, so what the preview showed IS what gets written.
        // Two deliberate differences, both of them save-only:
        //   • image_url takes the UPLOADED url (the mirror carries the staged
        //     data URL, which has no business in the database);
        //   • ends_at is dropped — this editor has no end field yet (Stage 3),
        //     and an update must not null out a stored value.
        const { id: _id, ends_at: _endsAt, ...row } = composeEventRow(ev, i);
        const fields = { ...row, image_url: posterUrl || null };

        if (ev.id.startsWith('new-')) {
          const { error } = await supabase.from('block_items').insert({ block_id: blockId, ...fields });
          if (error) throw error;
        } else {
          const { error } = await supabase.from('block_items').update(fields).eq('id', ev.id);
          if (error) throw error;
          // Poster replaced or removed and the row write committed: drop the
          // superseded file (STOR.4 — user intent, best-effort). Diffed against
          // the FETCHED row, not the draft, so Cancel paths never get here.
          const prev = existingItems.find((ei) => ei.id === ev.id);
          if (prev?.image_url && prev.image_url !== (posterUrl || null)) {
            removePublicObject('products', prev.image_url);
          }
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

  // TL.EVNT Stage 3a.3 — the framing sheet's target draft. Seeded from the
  // STAGED style_json through the same resolveGalleryCrop the render uses, so
  // reopening the sheet lands on exactly the window the thumb is painting.
  const cropTarget = cropTargetId ? events.find((ev) => ev.id === cropTargetId) : undefined;
  const cropSrc = cropTarget ? cropTarget.posterPreview || cropTarget.posterUrl : '';

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
                        {/* TL.EVNT Stage 3a — poster. Staged like a gallery
                            add: preview from the data URL, storage on Save.
                            UNCROPPED preview (max-h clamp, width fits) — the
                            same treatment the card gives it, so what the
                            creator sees here is what the page shows. */}
                        <div className="space-y-1">
                          <p className="text-xs text-white/60">{t('eventsEditor.poster')}</p>
                          <input
                            ref={posterInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            className="hidden"
                            onChange={(e) => handlePosterPick(ev.id, e.target.files?.[0])}
                          />
                          {ev.posterPreview || ev.posterUrl ? (
                            <div className="rounded-lg border border-white/10 bg-white/5 p-2">
                              {/* The thumb paints through the SAME resolver as
                                  the card (the gallery-tile precedent), so a
                                  staged framing is visible here before it is
                                  ever saved — what makes "Cancel discards"
                                  observable. Unframed → whole file, contain. */}
                              {(() => {
                                const thumbCrop = resolveGalleryMediaStyle(ev.style_json);
                                return thumbCrop ? (
                                  <div
                                    className="relative mx-auto w-32 overflow-hidden rounded"
                                    style={{ aspectRatio: `${EVENT_POSTER_ASPECT}` }}
                                  >
                                    <img
                                      src={ev.posterPreview || ev.posterUrl}
                                      alt={ev.title.trim() || t('eventsEditor.untitled')}
                                      className="object-cover"
                                      style={thumbCrop}
                                    />
                                  </div>
                                ) : (
                                  <img
                                    src={ev.posterPreview || ev.posterUrl}
                                    alt={ev.title.trim() || t('eventsEditor.untitled')}
                                    className="mx-auto max-h-40 w-auto max-w-full rounded"
                                  />
                                );
                              })()}
                              <button
                                type="button"
                                onClick={() => setCropTargetId(ev.id)}
                                className="mt-2 w-full py-2 rounded-lg text-xs font-semibold bg-[#C9A55C]/10 text-[#C9A55C] border border-[#C9A55C]/30 hover:bg-[#C9A55C]/20 transition-colors"
                              >
                                {t('eventsEditor.adjustFraming')}
                              </button>
                              <div className="mt-2 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => posterInputRef.current?.click()}
                                  className="flex-1 py-2 rounded-lg text-xs font-medium bg-white/5 text-white/80 border border-white/10 hover:bg-white/10 transition-colors"
                                >
                                  {t('eventsEditor.replacePoster')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEvents((prev) => prev.map((e2) => e2.id === ev.id
                                    ? { ...e2, posterUrl: '', posterFile: undefined, posterPreview: undefined, style_json: stripCrop(e2.style_json) }
                                    : e2))}
                                  className="flex-1 py-2 rounded-lg text-xs font-medium bg-white/5 text-white/60 border border-white/10 hover:bg-red-500/20 hover:text-red-300 transition-colors"
                                >
                                  {t('eventsEditor.removePoster')}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => posterInputRef.current?.click()}
                              className="w-full py-3 rounded-lg border border-dashed border-white/20 flex items-center justify-center gap-2 text-white/50 hover:border-[#C9A55C]/50 hover:text-[#C9A55C]/80 transition-colors"
                            >
                              <ImagePlus className="h-4 w-4" />
                              <span className="text-xs font-medium">{t('eventsEditor.addPoster')}</span>
                            </button>
                          )}
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

      {/* Framing sheet — portals to body, staged via stagePosterCrop; only
          the panel's own Save writes anything. */}
      {cropTarget && cropSrc && (
        <PhotoCropSheet
          src={cropSrc}
          crop={resolveGalleryCrop(cropTarget.style_json)}
          aspect={EVENT_POSTER_ASPECT}
          onCancel={() => setCropTargetId(null)}
          onApply={(c) => {
            stagePosterCrop(cropTarget.id, c);
            setCropTargetId(null);
          }}
        />
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
