import { useState, useEffect } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { 
  Loader2, 
  CircleDot, 
  Plus, 
  GripVertical, 
  Trash2, 
  ChevronDown,
  Globe,
} from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { ITEM_CAPS, validateUrl } from '@/lib/validation';
import { ThumbnailUpload } from './ThumbnailUpload';
import { cn } from '@/lib/utils';

const MAX_ITEMS = ITEM_CAPS.social_icon_row;

type BlockItem = Tables<'block_items'>;

// Social platform icons using emoji (matches existing pattern)
const SOCIAL_PRESETS = [
  { label: 'TikTok', icon: '🎵' },
  { label: 'Instagram', icon: '📸' },
  { label: 'YouTube', icon: '▶️' },
  { label: 'Facebook', icon: '👤' },
  { label: 'Snapchat', icon: '👻' },
  { label: 'Kick', icon: '🎮' },
  { label: 'Twitch', icon: '🎮' },
  { label: 'Discord', icon: '💬' },
  { label: 'X', icon: '𝕏' },
  { label: 'Spotify', icon: '🎧' },
  { label: 'Apple Music', icon: '🍎' },
  { label: 'LinkedIn', icon: '💼' },
  { label: 'Pinterest', icon: '📌' },
  { label: 'Threads', icon: '🧵' },
  { label: 'WhatsApp', icon: '💬' },
  { label: 'Telegram', icon: '✈️' },
  { label: 'Website', icon: '🌐' },
];

interface IconRowConfig {
  icon_size: 'sm' | 'md' | 'lg';
  spacing: 'tight' | 'normal' | 'loose';
  use_theme_color: boolean;
  custom_color: string;
}

const DEFAULT_CONFIG: IconRowConfig = {
  icon_size: 'md',
  spacing: 'normal',
  use_theme_color: true,
  custom_color: '#ffffff',
};

interface SocialIconItem {
  id: string;
  label: string;
  url: string;
  image_url?: string | null;
}

interface SortableIconItemProps {
  item: SocialIconItem;
  onUpdate: (id: string, field: keyof SocialIconItem, value: string | null) => void;
  onDelete: (id: string) => void;
  error?: string;
}

function SortableIconItem({ item, onUpdate, onDelete, error }: SortableIconItemProps) {
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

  const preset = SOCIAL_PRESETS.find(p => p.label === item.label);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'border rounded-lg bg-card p-3',
        'transition-all duration-150 ease-out',
        isDragging ? 'opacity-90 shadow-lg scale-[1.01] border-primary/50 z-10' : 'border-border'
      )}
    >
      <div className="flex items-center gap-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <span className="text-xl">{preset?.icon || '🔗'}</span>

        <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
          <Input
            value={item.label}
            onChange={(e) => onUpdate(item.id, 'label', e.target.value)}
            placeholder="Label"
            className="h-8 text-sm"
          />
          <Input
            value={item.url}
            onChange={(e) => onUpdate(item.id, 'url', e.target.value)}
            placeholder="https://..."
            className="h-8 text-sm"
          />
        </div>

        <ThumbnailUpload
          value={item.image_url}
          onChange={(url) => onUpdate(item.id, 'image_url', url)}
          size="sm"
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(item.id)}
          className="h-8 w-8 text-destructive hover:text-destructive flex-shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  );
}

interface SocialIconRowEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

export function SocialIconRowEditor({ blockId, open, onOpenChange, onSave }: SocialIconRowEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<SocialIconItem[]>([]);
  const [existingItems, setExistingItems] = useState<BlockItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPresets, setShowPresets] = useState(false);
  const [config, setConfig] = useState<IconRowConfig>(DEFAULT_CONFIG);
  const [blockTitle, setBlockTitle] = useState<string | null>(null);

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
      // Fetch block to get title (which stores config)
      const { data: blockData, error: blockError } = await supabase
        .from('blocks')
        .select('title')
        .eq('id', blockId)
        .single();

      if (blockError) throw blockError;

      // Parse config from title if it exists
      if (blockData?.title) {
        try {
          const parsed = JSON.parse(blockData.title);
          setConfig({ ...DEFAULT_CONFIG, ...parsed });
        } catch {
          setBlockTitle(blockData.title);
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
          label: item.label,
          url: item.url,
          image_url: item.image_url || null,
        }))
      );
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load social icons');
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

  const addPreset = (preset: typeof SOCIAL_PRESETS[0]) => {
    if (items.length >= MAX_ITEMS) {
      toast.error(`Maximum ${MAX_ITEMS} icons allowed`);
      return;
    }
    const newItem: SocialIconItem = {
      id: `new-${Date.now()}-${Math.random()}`,
      label: preset.label,
      url: '',
      image_url: null,
    };
    setItems([...items, newItem]);
    setShowPresets(false);
  };

  const addCustom = () => {
    if (items.length >= MAX_ITEMS) {
      toast.error(`Maximum ${MAX_ITEMS} icons allowed`);
      return;
    }
    const newItem: SocialIconItem = {
      id: `new-${Date.now()}-${Math.random()}`,
      label: 'Custom',
      url: '',
      image_url: null,
    };
    setItems([...items, newItem]);
  };

  const updateItem = (id: string, field: keyof SocialIconItem, value: string | null) => {
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

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    let valid = true;

    items.forEach((item) => {
      if (!item.label.trim()) {
        newErrors[item.id] = 'Label is required';
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

        if (isNew) {
          await supabase.from('block_items').insert({
            block_id: blockId,
            label: item.label,
            url: item.url,
            image_url: item.image_url || null,
            order_index: i,
          });
        } else {
          await supabase
            .from('block_items')
            .update({
              label: item.label,
              url: item.url,
              image_url: item.image_url || null,
              order_index: i,
            })
            .eq('id', item.id);
        }
      }

      toast.success('Social icons saved');
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving:', error);
      toast.error(error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const sizeOptions: { value: IconRowConfig['icon_size']; label: string }[] = [
    { value: 'sm', label: 'Small' },
    { value: 'md', label: 'Medium' },
    { value: 'lg', label: 'Large' },
  ];

  const spacingOptions: { value: IconRowConfig['spacing']; label: string }[] = [
    { value: 'tight', label: 'Tight' },
    { value: 'normal', label: 'Normal' },
    { value: 'loose', label: 'Loose' },
  ];

  // Preview icon sizes
  const getPreviewSize = () => {
    switch (config.icon_size) {
      case 'sm': return 'h-10 w-10';
      case 'md': return 'h-12 w-12';
      case 'lg': return 'h-14 w-14';
    }
  };

  const getPreviewGap = () => {
    switch (config.spacing) {
      case 'tight': return 'gap-2';
      case 'normal': return 'gap-3';
      case 'loose': return 'gap-4';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleDot className="h-5 w-5 text-primary" />
            Edit Social Icon Row
          </DialogTitle>
          <DialogDescription>
            Display social icons in a clean, tappable row.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0 space-y-4">
            {/* Style Controls */}
            <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/30">
              <div className="grid grid-cols-2 gap-4">
                {/* Icon Size */}
                <div className="space-y-2">
                  <Label className="text-xs">Icon Size</Label>
                  <div className="flex gap-1">
                    {sizeOptions.map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        variant={config.icon_size === opt.value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setConfig({ ...config, icon_size: opt.value })}
                        className="flex-1 text-xs"
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Spacing */}
                <div className="space-y-2">
                  <Label className="text-xs">Spacing</Label>
                  <div className="flex gap-1">
                    {spacingOptions.map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        variant={config.spacing === opt.value ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setConfig({ ...config, spacing: opt.value })}
                        className="flex-1 text-xs"
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Color Settings */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">Use Theme Color</Label>
                  <p className="text-xs text-muted-foreground">Match your page theme</p>
                </div>
                <Switch
                  checked={config.use_theme_color}
                  onCheckedChange={(checked) => setConfig({ ...config, use_theme_color: checked })}
                />
              </div>

              {!config.use_theme_color && (
                <div className="flex items-center gap-3">
                  <Label className="text-xs">Custom Color</Label>
                  <input
                    type="color"
                    value={config.custom_color}
                    onChange={(e) => setConfig({ ...config, custom_color: e.target.value })}
                    className="h-8 w-12 rounded border border-border cursor-pointer"
                  />
                  <Input
                    value={config.custom_color}
                    onChange={(e) => setConfig({ ...config, custom_color: e.target.value })}
                    className="flex-1 h-8 font-mono text-xs"
                  />
                </div>
              )}

              {/* Live Preview */}
              <div className="pt-3 border-t border-border">
                <Label className="text-xs mb-2 block">Preview</Label>
                <div className={cn('flex flex-wrap justify-center', getPreviewGap())}>
                  {(items.length > 0 ? items.slice(0, 5) : [{ label: 'TikTok' }, { label: 'Instagram' }, { label: 'YouTube' }]).map((item, i) => {
                    const preset = SOCIAL_PRESETS.find(p => p.label === item.label);
                    return (
                      <div
                        key={i}
                        className={cn(
                          'rounded-full flex items-center justify-center',
                          getPreviewSize()
                        )}
                        style={{
                          backgroundColor: config.use_theme_color ? 'hsl(var(--primary) / 0.15)' : `${config.custom_color}20`,
                        }}
                      >
                        <span className={cn(
                          config.icon_size === 'sm' && 'text-base',
                          config.icon_size === 'md' && 'text-lg',
                          config.icon_size === 'lg' && 'text-xl'
                        )}>
                          {preset?.icon || '🔗'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Add Icons */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPresets(!showPresets)}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Icon ({items.length}/{MAX_ITEMS})
                <ChevronDown className={cn('h-3 w-3 transition-transform', showPresets && 'rotate-180')} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addCustom}
                className="gap-2"
              >
                <Globe className="h-4 w-4" />
                Custom
              </Button>
            </div>

            {showPresets && (
              <div className="p-3 border border-border rounded-lg bg-secondary/30">
                <div className="flex flex-wrap gap-2">
                  {SOCIAL_PRESETS.map((preset) => (
                    <Button
                      key={preset.label}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addPreset(preset)}
                      className="gap-1 h-8 text-xs"
                    >
                      <span>{preset.icon}</span>
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Icons List */}
            <ScrollArea className="flex-1 -mx-6 px-6">
              {items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CircleDot className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No icons yet</p>
                  <p className="text-xs">Add your social profiles above</p>
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
                        <SortableIconItem
                          key={item.id}
                          item={item}
                          onUpdate={updateItem}
                          onDelete={deleteItem}
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
                  'Save Icons'
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
