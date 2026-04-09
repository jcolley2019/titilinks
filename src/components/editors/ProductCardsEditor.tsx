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
  ShoppingBag, 
  Plus, 
  GripVertical, 
  Trash2, 
  ChevronDown,
  ChevronUp,
  ImagePlus,
  X,
  ShieldAlert,
  DollarSign,
  LayoutGrid,
  LayoutList,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { Tables } from '@/integrations/supabase/types';
import { validateImageFile, IMAGE_SIZE_LIMITS, ITEM_CAPS, validateUrl } from '@/lib/validation';

const MAX_ITEMS = ITEM_CAPS.product_cards;

type BlockItem = Tables<'block_items'>;

interface ProductItem {
  id: string;
  label: string;
  url: string;
  image_url?: string;
  subtitle?: string;
  badge?: string;
  is_adult?: boolean;
  price?: number | null;
  compare_at_price?: number | null;
  currency?: string;
  cta_label?: string;
  imageFile?: File;
  imagePreview?: string;
}

interface ProductCardsConfig {
  layout: 'stacked' | 'split';
}

interface SortableProductItemProps {
  item: ProductItem;
  onUpdate: (id: string, field: keyof ProductItem, value: string | boolean | number | null) => void;
  onDelete: (id: string) => void;
  onImageChange: (id: string, file: File | null) => void;
  errors: Record<string, string>;
}

function SortableProductItem({ item, onUpdate, onDelete, onImageChange, errors }: SortableProductItemProps) {
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
      const validation = validateImageFile(file, IMAGE_SIZE_LIMITS.product);
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
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{item.label || 'Untitled Product'}</p>
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
            <Label className="text-xs">Product Image (optional)</Label>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Label *</Label>
              <Input
                value={item.label}
                onChange={(e) => onUpdate(item.id, 'label', e.target.value)}
                placeholder="Product Name"
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

          {/* Pricing Section */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-xs font-medium">Pricing</Label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={item.price ?? ''}
                  onChange={(e) => onUpdate(item.id, 'price', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="29.99"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Compare at</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={item.compare_at_price ?? ''}
                  onChange={(e) => onUpdate(item.id, 'compare_at_price', e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="39.99"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Currency</Label>
                <Select
                  value={item.currency || 'USD'}
                  onValueChange={(value) => onUpdate(item.id, 'currency', value)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="JPY">JPY</SelectItem>
                    <SelectItem value="CAD">CAD</SelectItem>
                    <SelectItem value="AUD">AUD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Badge (optional)</Label>
              <Input
                value={item.badge || ''}
                onChange={(e) => onUpdate(item.id, 'badge', e.target.value)}
                placeholder="SALE"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CTA Label</Label>
              <Input
                value={item.cta_label || ''}
                onChange={(e) => onUpdate(item.id, 'cta_label', e.target.value)}
                placeholder="Buy Now"
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Adult Content Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              <Label className="text-xs font-normal text-muted-foreground">
                18+ Link (shows warning before opening)
              </Label>
            </div>
            <Switch
              checked={item.is_adult || false}
              onCheckedChange={(checked) => onUpdate(item.id, 'is_adult', checked)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface ProductCardsEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
}

export function ProductCardsEditor({ blockId, open, onOpenChange, onSave, panelMode }: ProductCardsEditorProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<ProductItem[]>([]);
  const [existingItems, setExistingItems] = useState<BlockItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<ProductCardsConfig>({ layout: 'stacked' });
  const [blockTitle, setBlockTitle] = useState<string | null>(null);

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
      // Fetch block config
      const { data: blockData, error: blockError } = await supabase
        .from('blocks')
        .select('title')
        .eq('id', blockId)
        .single();
      
      if (blockError) throw blockError;
      
      // Parse config from block title
      if (blockData?.title) {
        try {
          const parsed = JSON.parse(blockData.title);
          if (parsed.layout) {
            setConfig({ layout: parsed.layout });
          }
        } catch {
          // Not JSON, just a plain title
          setBlockTitle(blockData.title);
        }
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
          image_url: item.image_url || undefined,
          subtitle: item.subtitle || '',
          badge: item.badge || '',
          is_adult: item.is_adult || false,
          price: item.price,
          compare_at_price: item.compare_at_price,
          currency: item.currency || 'USD',
          cta_label: item.cta_label || '',
        }))
      );
    } catch (error) {
      console.error('Error fetching items:', error);
      toast.error('Failed to load products');
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

  const addProduct = () => {
    if (items.length >= MAX_ITEMS) {
      toast.error(`Maximum ${MAX_ITEMS} products allowed`);
      return;
    }
    const newItem: ProductItem = {
      id: `new-${Date.now()}-${Math.random()}`,
      label: '',
      url: '',
      subtitle: '',
      badge: '',
      is_adult: false,
      price: null,
      compare_at_price: null,
      currency: 'USD',
      cta_label: '',
    };
    setItems([...items, newItem]);
  };

  const updateItem = (id: string, field: keyof ProductItem, value: string | boolean | number | null) => {
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
      toast.error(`Maximum ${MAX_ITEMS} products allowed`);
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
      // Save block config (layout) to block title
      const configJson = JSON.stringify({ layout: config.layout });
      await supabase
        .from('blocks')
        .update({ title: configJson })
        .eq('id', blockId);

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

        const itemData = {
          block_id: blockId,
          label: item.label,
          url: item.url,
          image_url: imageUrl || null,
          subtitle: item.subtitle || null,
          badge: item.badge || null,
          is_adult: item.is_adult || false,
          order_index: i,
          price: item.price ?? null,
          compare_at_price: item.compare_at_price ?? null,
          currency: item.currency || 'USD',
          cta_label: item.cta_label || null,
        };

        if (isNew) {
          const { error } = await supabase.from('block_items').insert(itemData);
          if (error) throw error;
        } else {
          const { block_id: _, ...updateData } = itemData;
          const { error } = await supabase
            .from('block_items')
            .update(updateData)
            .eq('id', item.id);
          if (error) throw error;
        }
      }

      toast.success('Products saved');
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving products:', error);
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
          {/* Layout Selector */}
          <div className="mb-4 p-3 bg-secondary/30 rounded-lg">
            <Label className="text-xs font-medium mb-2 block">Card Layout</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={config.layout === 'stacked' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setConfig({ ...config, layout: 'stacked' })}
                className="flex-1 gap-2"
              >
                <LayoutGrid className="h-4 w-4" />
                Stacked
              </Button>
              <Button
                type="button"
                variant={config.layout === 'split' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setConfig({ ...config, layout: 'split' })}
                className="flex-1 gap-2"
              >
                <LayoutList className="h-4 w-4" />
                Split
              </Button>
            </div>
          </div>

          {/* Add Product Button */}
          <div className="mb-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addProduct}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Product
            </Button>
          </div>

          {/* Items List */}
          <ScrollArea className="flex-1 -mx-6 px-6">
            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No products yet.</p>
                <p className="text-sm">Click "Add Product" to get started.</p>
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
                      <SortableProductItem
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

          {/* Preview Grid */}
          {items.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">Preview</p>
              <div className="grid grid-cols-3 gap-2">
                {items.slice(0, 6).map((item) => (
                  <div key={item.id} className="aspect-square rounded-lg bg-secondary/50 overflow-hidden relative">
                    {(item.imagePreview || item.image_url) ? (
                      <img
                        src={item.imagePreview || item.image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    {item.badge && (
                      <span className="absolute top-1 right-1 text-[8px] bg-primary text-primary-foreground px-1 rounded">
                        {item.badge}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {items.length > 6 && (
                <p className="text-xs text-muted-foreground mt-1 text-center">
                  +{items.length - 6} more
                </p>
              )}
            </div>
          )}

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
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            Edit Product Cards
          </DialogTitle>
          <DialogDescription>
            Showcase products with links to external stores.
          </DialogDescription>
        </DialogHeader>
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
