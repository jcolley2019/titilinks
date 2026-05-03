import { useState, useEffect, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { 
  Loader2, 
  Image as ImageIcon, 
  Plus, 
  GripVertical, 
  Trash2, 
  ChevronDown,
  ChevronUp,
  ImagePlus,
} from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { validateImageFile, IMAGE_SIZE_LIMITS, ITEM_CAPS, validateUrl } from '@/lib/validation';

type BlockItem = Tables<'block_items'>;

interface MediaItem {
  id: string;
  label: string;
  url: string;
  image_url?: string;
  imageFile?: File;
  imagePreview?: string;
}

interface SortableMediaItemProps {
  item: MediaItem;
  onUpdate: (id: string, field: keyof MediaItem, value: string) => void;
  onDelete: (id: string) => void;
  onImageChange: (id: string, file: File | null) => void;
  errors: Record<string, string>;
}

function SortableMediaItem({ item, onUpdate, onDelete, onImageChange, errors }: SortableMediaItemProps) {
  const [expanded, setExpanded] = useState(!item.url);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validation = validateImageFile(file, IMAGE_SIZE_LIMITS.media);
      if (!validation.valid) {
        toast.error(validation.error);
        return;
      }
      onImageChange(item.id, file);
    }
  };

  const imageUrl = item.imagePreview || item.image_url;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'border rounded-lg bg-card',
        'transition-all duration-150 ease-out',
        'motion-reduce:transition-none motion-reduce:transform-none',
        isDragging
          ? 'opacity-90 shadow-lg scale-[1.01] border-primary/50 z-10 relative'
          : 'border-border',
        isOver && !isDragging ? 'border-primary/40 bg-primary/5' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="flex items-center gap-3 p-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Thumbnail */}
        <div className="h-10 w-10 rounded bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{item.label || 'Untitled Media'}</p>
          <p className="text-xs text-muted-foreground truncate">{item.url || 'No URL set'}</p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setExpanded(!expanded)}
          className="h-8 w-8"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(item.id)}
          className="h-8 w-8 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
          {/* Image Upload */}
          <div className="space-y-2">
            <Label className="text-xs">Cover Image (optional)</Label>
            <div className="flex items-start gap-3">
              <div 
                className="h-20 w-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden cursor-pointer hover:border-primary transition-colors flex-shrink-0"
                onClick={() => fileInputRef.current?.click()}
              >
                {imageUrl ? (
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs"
                >
                  {imageUrl ? 'Change' : 'Upload'}
                </Button>
                {imageUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onImageChange(item.id, null)}
                    className="text-xs text-destructive"
                  >
                    Remove
                  </Button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.gif,.webp"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Label *</Label>
              <Input
                value={item.label}
                onChange={(e) => onUpdate(item.id, 'label', e.target.value)}
                placeholder="Featured Content"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">URL *</Label>
              <Input
                value={item.url}
                onChange={(e) => onUpdate(item.id, 'url', e.target.value)}
                placeholder="https://..."
                className="h-8 text-sm"
              />
            </div>
          </div>
          {errors[item.id] && (
            <p className="text-xs text-destructive">{errors[item.id]}</p>
          )}
        </div>
      )}
    </div>
  );
}

interface FeaturedMediaEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
}

export function FeaturedMediaEditor({ blockId, open, onOpenChange, onSave, panelMode }: FeaturedMediaEditorProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [existingItems, setExistingItems] = useState<BlockItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const MAX_ITEMS = ITEM_CAPS.featured_media;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (open) {
      fetchItems();
    }
  }, [open, blockId]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('block_items')
        .select('*')
        .eq('block_id', blockId)
        .order('order_index', { ascending: true });

      if (error) throw error;

      setExistingItems(data || []);
      setItems(
        (data || []).map((item) => ({
          id: item.id,
          label: item.label,
          url: item.url,
          image_url: item.image_url || undefined,
        }))
      );
    } catch (error) {
      console.error('Error fetching items:', error);
      toast.error('Failed to load media items');
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      setItems(arrayMove(items, oldIndex, newIndex));
    }
  };

  const addMedia = () => {
    if (items.length >= MAX_ITEMS) {
      toast.error(`Maximum ${MAX_ITEMS} items allowed`);
      return;
    }
    const newItem: MediaItem = {
      id: `new-${Date.now()}-${Math.random()}`,
      label: '',
      url: '',
    };
    setItems([...items, newItem]);
  };

  const updateItem = (id: string, field: keyof MediaItem, value: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
    if (errors[id]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleImageChange = (id: string, file: File | null) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
              setItems((current) =>
                current.map((i) =>
                  i.id === id ? { ...i, imagePreview: reader.result as string } : i
                )
              );
            };
            reader.readAsDataURL(file);
            return { ...item, imageFile: file };
          } else {
            return { ...item, imageFile: undefined, imagePreview: undefined, image_url: undefined };
          }
        }
        return item;
      })
    );
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    let valid = true;

    // Enforce item cap
    if (items.length > MAX_ITEMS) {
      toast.error(`Maximum ${MAX_ITEMS} items allowed`);
      return false;
    }

    items.forEach((item) => {
      if (!item.label.trim()) {
        newErrors[item.id] = 'Label is required';
        valid = false;
      } else if (item.label.length > 100) {
        newErrors[item.id] = 'Label must be less than 100 characters';
        valid = false;
      } else {
        const urlError = validateUrl(item.url);
        if (urlError) {
          newErrors[item.id] = urlError;
          valid = false;
        }
      }
    });

    setErrors(newErrors);
    return valid;
  };

  const uploadImage = async (file: File): Promise<string> => {
    if (!user) throw new Error('Not authenticated');
    
    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/${crypto.randomUUID()}.${fileExt}`;

    const { error } = await supabase.storage
      .from('products')
      .upload(filePath, file);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('products')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSave = async () => {
    if (!validate()) {
      toast.error('Please fix the errors before saving');
      return;
    }

    setSaving(true);
    try {
      // Delete removed items
      const currentIds = items.filter((i) => !i.id.startsWith('new-')).map((i) => i.id);
      const toDelete = existingItems.filter((ei) => !currentIds.includes(ei.id));

      for (const item of toDelete) {
        const { error } = await supabase.from('block_items').delete().eq('id', item.id);
        if (error) throw error;
      }

      // Update or create items
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const isNew = item.id.startsWith('new-');

        // Upload image if new file
        let imageUrl = item.image_url;
        if (item.imageFile) {
          imageUrl = await uploadImage(item.imageFile);
        }

        if (isNew) {
          const { error } = await supabase.from('block_items').insert({
            block_id: blockId,
            label: item.label,
            url: item.url,
            image_url: imageUrl || null,
            order_index: i,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('block_items')
            .update({
              label: item.label,
              url: item.url,
              image_url: imageUrl || null,
              order_index: i,
            })
            .eq('id', item.id);
          if (error) throw error;
        }
      }

      toast.success('Featured media saved');
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving media:', error);
      toast.error(error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const innerContent = (
    <>
      {!panelMode && (
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            Edit Featured Media
          </DialogTitle>
          <DialogDescription>
            Showcase up to {MAX_ITEMS} featured items with cover images.
          </DialogDescription>
        </DialogHeader>
      )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Add Media Button */}
            <div className="mb-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addMedia}
                disabled={items.length >= MAX_ITEMS}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Media ({items.length}/{MAX_ITEMS})
              </Button>
            </div>

            <ScrollArea className="flex-1 -mx-6 px-6">
              {items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No media items yet</p>
                  <p className="text-xs mt-1">Add up to {MAX_ITEMS} featured items</p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={items.map((i) => i.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2 pb-4">
                      {items.map((item) => (
                        <SortableMediaItem
                          key={item.id}
                          item={item}
                          onUpdate={updateItem}
                          onDelete={deleteItem}
                          onImageChange={handleImageChange}
                          errors={errors}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-4 border-t border-border mt-auto">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        )}
    </>
  );

  if (panelMode) {
    return (
      <div className="flex flex-col h-full bg-[#0e0c09] text-white overflow-y-auto px-4 py-4">
        {innerContent}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
