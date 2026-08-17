import { useState, useEffect, useRef, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '@/integrations/supabase/client';
import { randomUUID } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
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
import { Loader2, Image as ImageIcon, Plus, Trash2, GripVertical } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { ITEM_CAPS, validateImageFile, IMAGE_SIZE_LIMITS } from '@/lib/validation';
import { removePublicObject } from '@/lib/storage-cleanup';
import { resolveGalleryCrop, resolveGalleryMediaStyle, type GalleryCrop } from '@/lib/gallery-framing';
import { PhotoCropSheet } from './PhotoCropSheet';

const MAX_ITEMS = ITEM_CAPS.gallery;

type BlockItem = Tables<'block_items'>;

interface GalleryPhoto {
  id: string;
  image_url: string;
  imageFile?: File;
  imagePreview?: string;
  /** TL.GAL.3b — the item's WHOLE style_json, carried through the editor so the
   *  crop write stays additive: the sheet merges `crop` into this object and the
   *  save writes it back entire, so keys owned by other features survive. */
  style_json?: Record<string, any> | null;
}

/**
 * TL.GAL.6 — the live-mirror payload (L6). Everything this panel stages, in the
 * shape the preview needs, republished on every change and cleared on unmount.
 *
 * `photos[].image_url` is a data URL for a staged add: the file has not been
 * uploaded yet, so there is no DB URL to send, and an <img> takes the preview
 * string just as happily. `config` is the block.title JSON the preview parses.
 *
 * `remove` is the one channel that runs downward: the preview keeps its own
 * per-photo trash, and while this panel is open that trash has to reach THIS
 * component's state — see the note on the preview-delete conflict in Editor.
 *
 * TL.GAL.6b — the draft NAMES its own block. It used to be scoped by Editor's
 * `editingBlock`, which is only set by the doors that route through onBlockEdit
 * (the preview's "+" tile and the block card's chevron). ProfileDashboard also
 * opens editors from its own section list and from the guided checklist, and
 * those set activeBlockId internally — so editingBlock stayed null, the whole
 * draft was discarded, and nothing mirrored at all. This panel already knows
 * which block it is editing; nobody has to infer it.
 */
export interface GalleryDraft {
  blockId: string;
  config: { layout: 'full' | 'filmstrip' | 'grid'; autoScroll: boolean; speed: 'slow' | 'medium' | 'fast' };
  photos: Array<{ id: string; image_url: string; style_json: Record<string, any> | null }>;
  remove: (id: string) => void;
}

interface GalleryEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
  /** Live-mirror channel (L6) — see GalleryDraft. Null clears the mirror, which
   *  is how Cancel / X snap the preview back to DB truth. */
  onDraftChange?: (draft: GalleryDraft | null) => void;
}

/**
 * TL.GAL.6 — one photo tile, now sortable. The tile itself stays a click target
 * for the framing sheet, so the drag lives on its own handle rather than on a
 * distance-activated tile: an 8px-anywhere drag would swallow the panel's own
 * vertical scroll on touch, and the panel is a phone-width surface by default.
 * The handle is always visible for the same reason — a hover-only control is
 * unreachable on the surface most of this editing actually happens on.
 */
function SortablePhotoTile({
  photo,
  onOpenCrop,
  onDelete,
}: {
  photo: GalleryPhoto;
  onOpenCrop: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useLanguage();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: photo.id });

  // The tile paints through the SAME resolver as the live page, so a staged
  // crop is visible here before it is ever saved — which is what makes
  // "Cancel discards" observable.
  const cropStyle = resolveGalleryMediaStyle(photo.style_json);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={() => onOpenCrop(photo.id)}
      className={`relative aspect-square rounded-xl overflow-hidden bg-secondary group cursor-pointer ${
        isDragging ? 'z-10 opacity-80 ring-2 ring-[#C9A55C]' : ''
      }`}
    >
      <img
        src={photo.imagePreview || photo.image_url}
        alt={t('galleryEditor.photoAlt')}
        className={cropStyle ? 'absolute object-cover' : 'absolute inset-0 w-full h-full object-cover'}
        style={cropStyle ?? undefined}
      />
      <button
        type="button"
        aria-label={t('galleryEditor.dragToReorder')}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-2 left-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center touch-none cursor-grab active:cursor-grabbing hover:bg-black/80 transition-colors"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(photo.id); }}
        className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function GalleryEditor({ blockId, open, onOpenChange, onSave, panelMode, onDraftChange }: GalleryEditorProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [existingItems, setExistingItems] = useState<BlockItem[]>([]);
  const [layout, setLayout] = useState<'full' | 'filmstrip' | 'grid'>('full');
  const [autoScroll, setAutoScroll] = useState(true);
  const [speed, setSpeed] = useState<'slow' | 'medium' | 'fast'>('slow');
  // TL.GAL.3b door B — which photo the framing sheet is open on (null = closed).
  const [cropTargetId, setCropTargetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (open) {
      fetchPhotos();
    }
  }, [open, blockId]);

  const fetchPhotos = async () => {
    setLoading(true);
    try {
      const { data: blockRow } = await supabase
        .from('blocks')
        .select('title')
        .eq('id', blockId)
        .maybeSingle();
      try {
        const parsed = JSON.parse(blockRow?.title || '');
        setLayout(parsed?.layout === 'filmstrip' || parsed?.layout === 'grid' ? parsed.layout : 'full');
        setAutoScroll(parsed?.autoScroll !== false);
        setSpeed(parsed?.speed === 'fast' || parsed?.speed === 'medium' ? parsed.speed : 'slow');
      } catch { setLayout('full'); }

      const { data, error } = await supabase
        .from('block_items')
        .select('*')
        .eq('block_id', blockId)
        .order('order_index', { ascending: true });

      if (error) throw error;

      setExistingItems(data || []);
      setPhotos(
        (data || []).map((item) => ({
          id: item.id,
          image_url: item.image_url || '',
          // TL.GAL.3b: carrying style_json here is what makes the GAL.1b
          // post-save re-sync round-trip a crop losslessly — this mapper runs
          // again right after every Save, and anything it drops is lost.
          style_json: (item.style_json as Record<string, any> | null) ?? null,
        }))
      );
    } catch (error) {
      console.error('Error fetching gallery:', error);
      toast.error(t('galleryEditor.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remaining = MAX_ITEMS - photos.length;
    if (remaining <= 0) {
      toast.error(t('galleryEditor.maxPhotos').replace('{count}', String(MAX_ITEMS)));
      return;
    }

    const filesToAdd = Array.from(files).slice(0, remaining);

    filesToAdd.forEach((file) => {
      const validation = validateImageFile(file, IMAGE_SIZE_LIMITS.media);
      if (!validation.valid) {
        toast.error(`${file.name}: ${validation.error}`);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setPhotos((prev) => [
          ...prev,
          {
            id: `new-${Date.now()}-${Math.random()}`,
            image_url: '',
            imageFile: file,
            imagePreview: reader.result as string,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Stable identity on purpose: it travels upward on the draft as `remove`, and
  // a fresh closure every render would re-publish the draft on every render.
  const deletePhoto = useCallback((id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // TL.GAL.6 — drag-to-reorder. Order is staged like everything else here: the
  // array position IS the order, and handleSave already writes `order_index: i`
  // from it for both the insert and the update path, so Save commits this for
  // free and Cancel drops it with the rest of the draft.
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setPhotos((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  // TL.GAL.6 — publish the draft (L6), following the LinksEditor precedent.
  // Nothing here writes to the DB: Save still owns that. Held back until the
  // fetch lands, or the empty pre-fetch state would blank the preview's gallery
  // for a beat every time the panel opens.
  useEffect(() => {
    if (!open || loading) return;
    onDraftChange?.({
      blockId,
      config: { layout, autoScroll, speed },
      photos: photos.map((p) => ({
        id: p.id,
        image_url: p.imagePreview || p.image_url,
        style_json: p.style_json ?? null,
      })),
      remove: deletePhoto,
    });
  }, [open, loading, blockId, layout, autoScroll, speed, photos, onDraftChange, deletePhoto]);

  // Cancel / X unmounts this panel, and clearing the mirror here is what makes
  // the preview revert to DB truth.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { onDraftChange?.(null); }, []);

  // TL.GAL.3b — stage a framing change. ADDITIVE, per the LinksEditor precedent:
  // merge onto whatever style_json the row already carries, and write null for
  // the key (not for the object) when the photo goes back to suggested framing.
  // Staged only — nothing reaches the DB until the panel's own Save.
  const setPhotoCrop = (id: string, crop: GalleryCrop | null) => {
    setPhotos((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const next: Record<string, any> = { ...(p.style_json || {}) };
      if (crop === null) delete next.crop;
      else next.crop = crop;
      return { ...p, style_json: Object.keys(next).length ? next : null };
    }));
  };

  const uploadImage = async (file: File): Promise<string> => {
    if (!user) throw new Error('Not authenticated');

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${randomUUID()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('products')
      .upload(fileName, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('products')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Upload new images
      const uploadedPhotos: GalleryPhoto[] = [];
      for (const photo of photos) {
        if (photo.imageFile) {
          const url = await uploadImage(photo.imageFile);
          uploadedPhotos.push({ ...photo, image_url: url, imageFile: undefined, imagePreview: undefined });
        } else {
          uploadedPhotos.push(photo);
        }
      }

      // Delete removed items
      const currentIds = uploadedPhotos.filter((p) => !p.id.startsWith('new-')).map((p) => p.id);
      const toDelete = existingItems.filter((ei) => !currentIds.includes(ei.id));

      for (const item of toDelete) {
        const { error } = await supabase.from('block_items').delete().eq('id', item.id);
        if (error) throw error;
        // Row gone, so drop its file too — best-effort, never blocks the save.
        removePublicObject('products', item.image_url);
      }

      // Update or create items
      for (let i = 0; i < uploadedPhotos.length; i++) {
        const photo = uploadedPhotos[i];
        const isNew = photo.id.startsWith('new-');

        if (isNew) {
          const { error } = await supabase.from('block_items').insert({
            block_id: blockId,
            label: 'Photo',
            url: '',
            image_url: photo.image_url,
            order_index: i,
            // A staged photo can be framed before it has ever been saved.
            style_json: photo.style_json ?? null,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('block_items')
            .update({
              image_url: photo.image_url,
              order_index: i,
              // Written whole, having been merged onto the object this editor
              // read at fetch time — see the GalleryPhoto.style_json note.
              style_json: photo.style_json ?? null,
            })
            .eq('id', photo.id);
          if (error) throw error;
        }
      }

      const { error: layoutError } = await supabase
        .from('blocks')
        .update({ title: JSON.stringify({ layout, autoScroll, speed }) })
        .eq('id', blockId);
      if (layoutError) throw layoutError;

      // The panel swallows the close below and stays mounted, so `open` never
      // flips and the fetch effect won't rerun. Re-sync from the DB here —
      // otherwise staged files (new- ids + imageFile) re-upload and re-insert
      // on the next Save, and the delete-diff runs against pre-save rows.
      await fetchPhotos();

      toast.success(t('galleryEditor.saved'));
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving gallery:', error);
      toast.error(error.message || t('galleryEditor.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const cropTarget = photos.find((p) => p.id === cropTargetId) || null;

  const innerContent = (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Layout picker */}
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">{t('galleryEditor.layout')}</p>
            <div className="flex items-center gap-2">
              {(['full', 'filmstrip', 'grid'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setLayout(opt)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    layout === opt
                      ? 'bg-[#C9A55C] text-[#0e0c09]'
                      : 'bg-white/5 text-foreground border border-white/10'
                  }`}
                >
                  {opt === 'full' ? t('galleryEditor.layoutFull') : opt === 'filmstrip' ? t('galleryEditor.layoutFilmstrip') : t('galleryEditor.layoutGrid')}
                </button>
              ))}
            </div>
            {layout === 'filmstrip' && (
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t('galleryEditor.autoScroll')}</span>
                  <button
                    type="button"
                    onClick={() => setAutoScroll(!autoScroll)}
                    className={`w-[33px] h-[18px] rounded-full relative transition-colors ${autoScroll ? 'bg-[#C9A55C]' : 'bg-white/10'}`}
                  >
                    <span className={`absolute top-[1.5px] left-[1.5px] w-[15px] h-[15px] rounded-full bg-white transition-transform ${autoScroll ? 'translate-x-[15px]' : ''}`} />
                  </button>
                </div>
                {autoScroll && (
                  <div className="flex items-center gap-1.5">
                    {(['slow', 'medium', 'fast'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSpeed(s)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                          speed === s ? 'bg-[#C9A55C] text-[#0e0c09]' : 'bg-white/5 text-foreground border border-white/10'
                        }`}
                      >
                        {s === 'slow' ? t('galleryEditor.speedSlow') : s === 'medium' ? t('galleryEditor.speedMedium') : t('galleryEditor.speedFast')}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Add Photo Button */}
          <div className="mb-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Photo Grid */}
          <ScrollArea className={panelMode ? 'flex-1 min-h-0 px-4' : 'flex-1 min-h-0 -mx-6 px-6'}>
            {/* Always show the grid so the dashed "+ Add photos" box appears
                immediately (even when empty) — no separate empty state. */}
            {/* The "+" tile is deliberately OUTSIDE SortableContext — it is a
                button, not a photo, and registering it would let a drag land on
                a slot that has no order_index to take. */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 gap-3">
                  {photos.length < MAX_ITEMS && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square rounded-xl border-2 border-dashed border-muted-foreground/40 flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    >
                      <Plus className="h-7 w-7 text-muted-foreground/60" />
                      <span className="text-xs font-medium text-muted-foreground/70">{t('galleryEditor.addPhotos')}</span>
                    </button>
                  )}
                  {photos.map((photo) => (
                    <SortablePhotoTile
                      key={photo.id}
                      photo={photo}
                      onOpenCrop={setCropTargetId}
                      onDelete={deletePhoto}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
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

          {/* Door B. Portals to body above the panel (z-140 > the panel's 120),
              so it works identically from the slide-in panel and the dialog. */}
          {cropTarget && (
            <PhotoCropSheet
              key={cropTarget.id}
              src={cropTarget.imagePreview || cropTarget.image_url}
              crop={resolveGalleryCrop(cropTarget.style_json)}
              onCancel={() => setCropTargetId(null)}
              onApply={(next) => { setPhotoCrop(cropTarget.id, next); setCropTargetId(null); }}
            />
          )}
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
            <ImageIcon className="h-5 w-5 text-primary" />
            {t('galleryEditor.title')}
          </DialogTitle>
          <DialogDescription>
            {t('galleryEditor.dialogDescription')} ({photos.length}/{MAX_ITEMS})
          </DialogDescription>
        </DialogHeader>
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
