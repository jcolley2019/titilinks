import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { Loader2, Image as ImageIcon, Plus, Trash2 } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { ITEM_CAPS, validateImageFile, IMAGE_SIZE_LIMITS } from '@/lib/validation';

const MAX_ITEMS = ITEM_CAPS.gallery;

type BlockItem = Tables<'block_items'>;

interface GalleryPhoto {
  id: string;
  image_url: string;
  imageFile?: File;
  imagePreview?: string;
}

interface GalleryEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
}

export function GalleryEditor({ blockId, open, onOpenChange, onSave, panelMode }: GalleryEditorProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [existingItems, setExistingItems] = useState<BlockItem[]>([]);
  const [layout, setLayout] = useState<'full' | 'filmstrip' | 'grid'>('full');
  const [autoScroll, setAutoScroll] = useState(true);
  const [speed, setSpeed] = useState<'slow' | 'medium' | 'fast'>('slow');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        }))
      );
    } catch (error) {
      console.error('Error fetching gallery:', error);
      toast.error('Failed to load gallery');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const remaining = MAX_ITEMS - photos.length;
    if (remaining <= 0) {
      toast.error(`Maximum ${MAX_ITEMS} photos allowed`);
      return;
    }

    const filesToAdd = Array.from(files).slice(0, remaining);

    filesToAdd.forEach((file) => {
      const error = validateImageFile(file, IMAGE_SIZE_LIMITS.media);
      if (error) {
        toast.error(`${file.name}: ${error}`);
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

  const deletePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const uploadImage = async (file: File): Promise<string> => {
    if (!user) throw new Error('Not authenticated');

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${crypto.randomUUID()}.${fileExt}`;

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
          });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('block_items')
            .update({
              image_url: photo.image_url,
              order_index: i,
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

      toast.success('Gallery saved');
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving gallery:', error);
      toast.error(error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

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
            <p className="text-xs text-muted-foreground mb-2">Layout</p>
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
                  {opt === 'full' ? 'Full' : opt === 'filmstrip' ? 'Filmstrip' : 'Grid'}
                </button>
              ))}
            </div>
            {layout === 'filmstrip' && (
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Auto-scroll</span>
                  <button
                    type="button"
                    onClick={() => setAutoScroll(!autoScroll)}
                    className={`w-10 h-6 rounded-full relative transition-colors ${autoScroll ? 'bg-[#C9A55C]' : 'bg-white/10'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${autoScroll ? 'translate-x-4' : ''}`} />
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
                        {s}
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
          <ScrollArea className={panelMode ? 'flex-1 px-4' : 'flex-1 -mx-6 px-6'}>
            {photos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No photos yet.</p>
                <p className="text-sm">Click "Add Photos" to get started.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {photos.length < MAX_ITEMS && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-muted-foreground/40 flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  >
                    <Plus className="h-7 w-7 text-muted-foreground/60" />
                    <span className="text-xs font-medium text-muted-foreground/70">Add photos</span>
                  </button>
                )}
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="relative aspect-square rounded-xl overflow-hidden bg-secondary group"
                  >
                    <img
                      src={photo.imagePreview || photo.image_url}
                      alt="Gallery photo"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <button
                      onClick={() => deletePhoto(photo.id)}
                      className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Actions — pinned to the bottom of the panel while content scrolls. */}
          <div className="sticky bottom-0 z-10 flex gap-3 pt-4 mt-4 border-t border-border bg-[#0e0c09]">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 gradient-primary text-primary-foreground"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  );

  if (panelMode) {
    return (
      <div className="flex flex-col h-full bg-[#0e0c09] text-white px-4 py-4">
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
            Gallery
          </DialogTitle>
          <DialogDescription>
            Upload photos to display on your page. ({photos.length}/{MAX_ITEMS})
          </DialogDescription>
        </DialogHeader>
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
