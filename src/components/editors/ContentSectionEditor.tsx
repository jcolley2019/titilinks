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
  LayoutGrid, 
  Plus, 
  GripVertical, 
  Trash2, 
  ChevronDown,
  ChevronUp,
  ImagePlus,
  List,
  Grid3X3,
  Rows3,
} from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { validateImageFile, IMAGE_SIZE_LIMITS, ITEM_CAPS, validateUrl } from '@/lib/validation';
import { cn } from '@/lib/utils';

const MAX_ITEMS = ITEM_CAPS.content_section;

type BlockItem = Tables<'block_items'>;

interface ContentSectionConfig {
  section_title: string;
  view_all_url: string;
  view_all_label: string;
  layout: 'list' | 'grid' | 'carousel';
}

const DEFAULT_CONFIG: ContentSectionConfig = {
  section_title: '',
  view_all_url: '',
  view_all_label: 'View all',
  layout: 'carousel',
};

interface ContentItem {
  id: string;
  title: string;
  url: string;
  image_url?: string;
  meta_left?: string;
  imageFile?: File;
  imagePreview?: string;
}

interface SortableContentItemProps {
  item: ContentItem;
  onUpdate: (id: string, field: keyof ContentItem, value: string) => void;
  onDelete: (id: string) => void;
  onImageChange: (id: string, file: File | null) => void;
  error?: string;
}

function SortableContentItem({ item, onUpdate, onDelete, onImageChange, error }: SortableContentItemProps) {
  const [expanded, setExpanded] = useState(!item.url);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
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
      className={cn(
        'border rounded-lg bg-card',
        'transition-all duration-150 ease-out',
        isDragging ? 'opacity-90 shadow-lg scale-[1.01] border-primary/50 z-10' : 'border-border'
      )}
    >
      <div className="flex items-center gap-3 p-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Thumbnail */}
        <div className="h-10 w-10 rounded bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{item.title || 'Untitled'}</p>
          <p className="text-xs text-muted-foreground truncate">{item.meta_left || 'No meta'}</p>
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
          <div className="flex items-start gap-3">
            <div 
              className="h-16 w-24 rounded-lg border-2 border-dashed border-border flex items-center justify-center overflow-hidden cursor-pointer hover:border-primary transition-colors flex-shrink-0"
              onClick={() => fileInputRef.current?.click()}
            >
              {imageUrl ? (
                <img src={imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus className="h-5 w-5 text-muted-foreground" />
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Title *</Label>
              <Input
                value={item.title}
                onChange={(e) => onUpdate(item.id, 'title', e.target.value)}
                placeholder="Recipe name"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Meta (e.g., "30 min")</Label>
              <Input
                value={item.meta_left || ''}
                onChange={(e) => onUpdate(item.id, 'meta_left', e.target.value)}
                placeholder="30 min"
                className="h-8 text-sm"
              />
            </div>
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

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}

interface ContentSectionEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
}

export function ContentSectionEditor({ blockId, open, onOpenChange, onSave, panelMode }: ContentSectionEditorProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [existingItems, setExistingItems] = useState<BlockItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<ContentSectionConfig>(DEFAULT_CONFIG);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, blockId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch block to get title (stores config)
      const { data: blockData } = await supabase
        .from('blocks')
        .select('title')
        .eq('id', blockId)
        .single();

      if (blockData?.title) {
        try {
          const parsed = JSON.parse(blockData.title);
          setConfig({ ...DEFAULT_CONFIG, ...parsed });
        } catch {
          setConfig({ ...DEFAULT_CONFIG, section_title: blockData.title });
        }
      }

      // Fetch items
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
          title: item.label,
          url: item.url,
          image_url: item.image_url || undefined,
          meta_left: item.subtitle || undefined,
        }))
      );
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load content section');
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

  const addItem = () => {
    if (items.length >= MAX_ITEMS) {
      toast.error(`Maximum ${MAX_ITEMS} items allowed`);
      return;
    }
    const newItem: ContentItem = {
      id: `new-${Date.now()}-${Math.random()}`,
      title: '',
      url: '',
    };
    setItems([...items, newItem]);
  };

  const updateItem = (id: string, field: keyof ContentItem, value: string) => {
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

    items.forEach((item) => {
      if (!item.title.trim()) {
        newErrors[item.id] = 'Title is required';
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
      .from('page-assets')
      .upload(filePath, file);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('page-assets')
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
      // Save config to block title
      await supabase
        .from('blocks')
        .update({ title: JSON.stringify(config) })
        .eq('id', blockId);

      // Delete removed items
      const currentIds = items.filter((i) => !i.id.startsWith('new-')).map((i) => i.id);
      const toDelete = existingItems.filter((ei) => !currentIds.includes(ei.id));

      for (const item of toDelete) {
        await supabase.from('block_items').delete().eq('id', item.id);
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
          await supabase.from('block_items').insert({
            block_id: blockId,
            label: item.title,
            url: item.url,
            image_url: imageUrl || null,
            subtitle: item.meta_left || null,
            order_index: i,
          });
        } else {
          await supabase
            .from('block_items')
            .update({
              label: item.title,
              url: item.url,
              image_url: imageUrl || null,
              subtitle: item.meta_left || null,
              order_index: i,
            })
            .eq('id', item.id);
        }
      }

      toast.success('Content section saved');
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving:', error);
      toast.error(error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const layoutOptions: { value: ContentSectionConfig['layout']; icon: typeof List; label: string }[] = [
    { value: 'carousel', icon: Rows3, label: 'Carousel' },
    { value: 'grid', icon: Grid3X3, label: 'Grid' },
    { value: 'list', icon: List, label: 'List' },
  ];

  const innerContent = (
    <>
      {!panelMode && (
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            Edit Content Section
          </DialogTitle>
          <DialogDescription>
            Create a section with cards in carousel, grid, or list layout.
          </DialogDescription>
        </DialogHeader>
      )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 space-y-4">
            {/* Section Settings */}
            <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
              <div className="space-y-2">
                <Label>Section Title</Label>
                <Input
                  value={config.section_title}
                  onChange={(e) => setConfig({ ...config, section_title: e.target.value })}
                  placeholder="Recipes"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">View All Label</Label>
                  <Input
                    value={config.view_all_label}
                    onChange={(e) => setConfig({ ...config, view_all_label: e.target.value })}
                    placeholder="View all"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">View All URL</Label>
                  <Input
                    value={config.view_all_url}
                    onChange={(e) => setConfig({ ...config, view_all_url: e.target.value })}
                    placeholder="https://..."
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              {/* Layout Selector */}
              <div className="space-y-2">
                <Label>Layout</Label>
                <div className="flex gap-2">
                  {layoutOptions.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <Button
                        key={opt.value}
                        type="button"
                        variant={config.layout === opt.value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setConfig({ ...config, layout: opt.value })}
                        className="flex-1 gap-2"
                      >
                        <Icon className="h-4 w-4" />
                        {opt.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Add Item */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addItem}
              disabled={items.length >= MAX_ITEMS}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Item ({items.length}/{MAX_ITEMS})
            </Button>

            {/* Items List */}
            <ScrollArea className="flex-1 -mx-6 px-6">
              {items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No items yet</p>
                  <p className="text-xs">Add content items above</p>
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <SortableContentItem
                          key={item.id}
                          item={item}
                          onUpdate={updateItem}
                          onDelete={deleteItem}
                          onImageChange={handleImageChange}
                          error={errors[item.id]}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </ScrollArea>

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || loading}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Section'
                )}
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
