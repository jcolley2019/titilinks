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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import {
  Loader2,
  Link as LinkIcon,
  Plus,
  GripVertical,
  Trash2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Palette,
  Settings2,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { Tables } from '@/integrations/supabase/types';
import { ITEM_CAPS, validateUrl } from '@/lib/validation';
import { ThumbnailUpload } from './ThumbnailUpload';
import { DEFAULT_BLOCK_STYLE, type BlockStyleConfig } from '@/lib/theme-defaults';

const MAX_ITEMS = ITEM_CAPS.links;

type BlockItem = Tables<'block_items'>;

interface LinksBlockConfig {
  style: BlockStyleConfig;
}

interface LinkItem {
  id: string;
  label: string;
  url: string;
  subtitle?: string;
  badge?: string;
  is_adult?: boolean;
  image_url?: string | null;
  size?: 'big' | 'medium' | 'small' | 'button';
  bg_color?: string | null;
  title_color?: string | null;
}

interface SortableLinkRowProps {
  item: LinkItem;
  onEdit: (item: LinkItem) => void;
  onDelete: (id: string) => void;
}

function SortableLinkRow({ item, onEdit, onDelete }: SortableLinkRowProps) {
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
      <div className="flex items-center gap-2 p-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div
          className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer"
          onClick={() => onEdit(item)}
        >
          <LinkIcon className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{item.label || 'Untitled Link'}</p>
            <p className="text-xs text-muted-foreground truncate">{item.url || 'No URL set'}</p>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(item.id)}
          className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function LinkDetailPanel({
  item,
  isNew,
  onBack,
  onSave,
  onDelete,
}: {
  item: LinkItem;
  isNew: boolean;
  onBack: () => void;
  onSave: (item: LinkItem) => void;
  onDelete: (id: string) => void;
}) {
  const [local, setLocal] = useState<LinkItem>(item);
  const [colorTab, setColorTab] = useState<'title' | 'background'>('background');

  const update = (field: keyof LinkItem, value: any) => {
    setLocal(prev => ({ ...prev, [field]: value }));
  };

  const sizes = [
    { key: 'big', label: 'Big' },
    { key: 'medium', label: 'Medium' },
    { key: 'small', label: 'Small' },
    { key: 'button', label: 'Button' },
  ] as const;

  return (
    <div className="flex flex-col h-full">
      {/* Header with back arrow */}
      <div className="flex items-center gap-3 pb-4 border-b border-border mb-4">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h3 className="font-semibold text-sm">
          {isNew ? 'Add Link' : 'Edit Link'}
        </h3>
        {!isNew && (
          <button
            onClick={() => { onDelete(local.id); onBack(); }}
            className="ml-auto text-destructive hover:text-destructive/80"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <ScrollArea className="flex-1 -mx-6 px-6">
        <div className="space-y-4">
          {/* Image Upload Area */}
          <ThumbnailUpload
            value={local.image_url}
            onChange={(url) => update('image_url', url)}
          />
          <p className="text-xs text-center text-muted-foreground">
            Find the look that fits you best
          </p>

          {/* Size Picker */}
          <div className="grid grid-cols-4 gap-2">
            {sizes.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => update('size', key)}
                className={`py-2 text-xs font-semibold rounded-lg border-2 transition-all ${
                  local.size === key
                    ? 'border-[#C9A55C] bg-[#C9A55C]/10 text-[#C9A55C]'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* URL Input */}
          <div className="space-y-1">
            <Label className="text-xs">Link, phone number, or email</Label>
            <Input
              value={local.url}
              onChange={(e) => update('url', e.target.value)}
              placeholder="https://..."
              className="h-10"
            />
          </div>

          {/* Title Input */}
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input
              value={local.label}
              onChange={(e) => update('label', e.target.value)}
              placeholder="My Link"
              className="h-10"
            />
          </div>

          {/* Subtitle Input */}
          <div className="space-y-1">
            <Label className="text-xs">Subtitle (optional)</Label>
            <Input
              value={local.subtitle || ''}
              onChange={(e) => update('subtitle', e.target.value)}
              placeholder="Check this out"
              className="h-10"
            />
          </div>

          {/* Customize Color */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Customize Color</p>
            <div className="flex rounded-lg overflow-hidden border border-border">
              <button
                onClick={() => setColorTab('title')}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  colorTab === 'title'
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                Title
              </button>
              <button
                onClick={() => setColorTab('background')}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  colorTab === 'background'
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                Background
              </button>
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={colorTab === 'title'
                  ? (local.title_color || '#ffffff')
                  : (local.bg_color || '#C9A55C')}
                onChange={(e) => update(
                  colorTab === 'title' ? 'title_color' : 'bg_color',
                  e.target.value
                )}
                className="w-10 h-10 rounded-lg border border-border p-1 cursor-pointer"
              />
              <button
                onClick={() => update(
                  colorTab === 'title' ? 'title_color' : 'bg_color',
                  null
                )}
                className="flex-1 py-2 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-secondary"
              >
                No color
              </button>
            </div>
          </div>

          {/* 18+ Toggle */}
          <div className="flex items-center justify-between py-3 border-t border-border">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              <Label className="text-xs font-normal text-muted-foreground">
                18+ Link
              </Label>
            </div>
            <Switch
              checked={local.is_adult || false}
              onCheckedChange={(checked) => update('is_adult', checked)}
            />
          </div>

          {/* Animations PRO Upsell */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="text-sm font-semibold">Animations</p>
                <p className="text-xs text-muted-foreground">
                  Add motion to your link to draw attention.
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="p-4 bg-secondary/30">
              <p className="text-xs text-muted-foreground mb-3">
                Animations are part of TitiLinks Pro. Upgrade to unlock
                motion effects for your links.
              </p>
              <button className="w-full py-2 text-xs font-semibold rounded-lg border border-border text-foreground hover:bg-secondary transition-colors">
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Save button */}
      <div className="pt-4 mt-4 border-t border-border">
        <Button
          onClick={() => { onSave(local); onBack(); }}
          className="w-full gradient-primary text-primary-foreground"
        >
          {isNew ? 'Add' : 'Update'}
        </Button>
      </div>
    </div>
  );
}

interface LinksEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
}

export function LinksEditor({ blockId, open, onOpenChange, onSave, panelMode }: LinksEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<LinkItem[]>([]);
  const [existingItems, setExistingItems] = useState<BlockItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [styleConfig, setStyleConfig] = useState<BlockStyleConfig>(DEFAULT_BLOCK_STYLE);
  const [styleExpanded, setStyleExpanded] = useState(false);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [editingItem, setEditingItem] = useState<LinkItem | null>(null);
  const [isNewItem, setIsNewItem] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (open) {
      fetchItems();
      setView('list');
      setEditingItem(null);
    }
  }, [open, blockId]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      // Fetch block to get style config from title
      const { data: blockData, error: blockError } = await supabase
        .from('blocks')
        .select('title')
        .eq('id', blockId)
        .single();

      if (blockError) throw blockError;

      // Parse style config from title
      try {
        const parsed = JSON.parse(blockData?.title || '{}');
        if (parsed.style) {
          setStyleConfig({ ...DEFAULT_BLOCK_STYLE, ...parsed.style });
        } else {
          setStyleConfig(DEFAULT_BLOCK_STYLE);
        }
      } catch {
        setStyleConfig(DEFAULT_BLOCK_STYLE);
      }

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
          subtitle: item.subtitle || '',
          badge: item.badge || '',
          is_adult: item.is_adult || false,
          image_url: item.image_url || null,
          size: 'big' as const,
          bg_color: null,
          title_color: null,
        }))
      );
    } catch (error) {
      console.error('Error fetching items:', error);
      toast.error('Failed to load links');
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

  const addLink = () => {
    if (items.length >= MAX_ITEMS) {
      toast.error(`Maximum ${MAX_ITEMS} links allowed`);
      return;
    }
    const newItem: LinkItem = {
      id: `new-${Date.now()}-${Math.random()}`,
      label: '',
      url: '',
      subtitle: '',
      badge: '',
      is_adult: false,
      image_url: null,
      size: 'big',
      bg_color: null,
      title_color: null,
    };
    setEditingItem(newItem);
    setIsNewItem(true);
    setView('detail');
  };

  const editLink = (item: LinkItem) => {
    setEditingItem({ ...item });
    setIsNewItem(false);
    setView('detail');
  };

  const updateItem = (id: string, field: keyof LinkItem, value: string | boolean | null) => {
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

    // Enforce item cap
    if (items.length > MAX_ITEMS) {
      toast.error(`Maximum ${MAX_ITEMS} links allowed`);
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

  const handleSave = async () => {
    if (!validate()) {
      toast.error('Please fix the errors before saving');
      return;
    }

    setSaving(true);
    try {
      // Save style config to block title
      const configJson: LinksBlockConfig = { style: styleConfig };
      const { error: blockError } = await supabase
        .from('blocks')
        .update({ title: JSON.stringify(configJson) })
        .eq('id', blockId);

      if (blockError) throw blockError;

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

        if (isNew) {
          const { error } = await supabase.from('block_items').insert({
            block_id: blockId,
            label: item.label,
            url: item.url,
            subtitle: item.subtitle || null,
            badge: item.badge || null,
            is_adult: item.is_adult || false,
            image_url: item.image_url || null,
            order_index: i,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('block_items')
            .update({
              label: item.label,
              url: item.url,
              subtitle: item.subtitle || null,
              badge: item.badge || null,
              is_adult: item.is_adult || false,
              image_url: item.image_url || null,
              order_index: i,
            })
            .eq('id', item.id);
          if (error) throw error;
        }
      }

      toast.success('Links saved');
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving links:', error);
      toast.error(error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const innerContent = (
    <>
      {view === 'detail' && editingItem ? (
        <LinkDetailPanel
          item={editingItem}
          isNew={isNewItem}
          onBack={() => { setView('list'); setEditingItem(null); }}
          onSave={(updated) => {
            if (isNewItem) {
              setItems(prev => [...prev, updated]);
            } else {
              setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
            }
          }}
          onDelete={deleteItem}
        />
      ) : (
        <>
          {!panelMode && (
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LinkIcon className="h-5 w-5 text-primary" />
                Edit Links
              </DialogTitle>
              <DialogDescription>
                Add custom links to display on your page.
              </DialogDescription>
            </DialogHeader>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Style Variants Section */}
              <Collapsible open={styleExpanded} onOpenChange={setStyleExpanded} className="mb-4">
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Palette className="h-4 w-4 text-primary" />
                      <span>Style Variants</span>
                    </div>
                    {styleExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-4">
                  {/* Variant Select */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Button Variant</Label>
                      <Select
                        value={styleConfig.variant}
                        onValueChange={(value: 'filled' | 'outline' | 'glass' | 'minimal') =>
                          setStyleConfig(prev => ({ ...prev, variant: value }))
                        }
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="filled">Filled</SelectItem>
                          <SelectItem value="outline">Outline</SelectItem>
                          <SelectItem value="glass">Glass</SelectItem>
                          <SelectItem value="minimal">Minimal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Font Style</Label>
                      <Select
                        value={styleConfig.font_style}
                        onValueChange={(value: 'normal' | 'mono' | 'serif') =>
                          setStyleConfig(prev => ({ ...prev, font_style: value }))
                        }
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="mono">Monospace</SelectItem>
                          <SelectItem value="serif">Serif</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Border Width & Color */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Border Width ({styleConfig.border_width}px)</Label>
                      <Slider
                        value={[styleConfig.border_width]}
                        onValueChange={([value]) => setStyleConfig(prev => ({ ...prev, border_width: value }))}
                        min={0}
                        max={4}
                        step={1}
                        className="py-2"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Border Color</Label>
                      <Input
                        type="color"
                        value={styleConfig.border_color || '#ffffff'}
                        onChange={(e) => setStyleConfig(prev => ({ ...prev, border_color: e.target.value }))}
                        className="h-8 p-1 w-full"
                      />
                    </div>
                  </div>

                  {/* Background Opacity & Letter Spacing */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Background Opacity ({Math.round(styleConfig.background_opacity * 100)}%)</Label>
                      <Slider
                        value={[styleConfig.background_opacity]}
                        onValueChange={([value]) => setStyleConfig(prev => ({ ...prev, background_opacity: value }))}
                        min={0}
                        max={1}
                        step={0.05}
                        className="py-2"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Letter Spacing ({styleConfig.letter_spacing.toFixed(2)}em)</Label>
                      <Slider
                        value={[styleConfig.letter_spacing]}
                        onValueChange={([value]) => setStyleConfig(prev => ({ ...prev, letter_spacing: value }))}
                        min={-0.05}
                        max={0.2}
                        step={0.01}
                        className="py-2"
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Add Link Button */}
              <div className="mb-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addLink}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Link
                </Button>
              </div>

              {/* Items List */}
              <ScrollArea className="flex-1 -mx-6 px-6">
                {items.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <LinkIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No links yet.</p>
                    <p className="text-sm">Click "Add Link" to get started.</p>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {items.map((item) => (
                          <SortableLinkRow
                            key={item.id}
                            item={item}
                            onEdit={editLink}
                            onDelete={deleteItem}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </ScrollArea>

              {/* Actions */}
              <div className="flex gap-3 pt-4 mt-4 border-t border-border">
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
