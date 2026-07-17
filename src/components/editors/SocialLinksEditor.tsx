import { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { PlatformIcon } from '@/components/PlatformIcon';
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
import { toast } from 'sonner';
import { 
  Loader2,
  Share2,
  Plus,
  GripVertical,
  Trash2,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import type { Tables } from '@/integrations/supabase/types';
import { ITEM_CAPS, validateUrl } from '@/lib/validation';
import { PLATFORM_CATALOG as PLATFORM_CATEGORIES } from '@/lib/platform-catalog';

const MAX_ITEMS = ITEM_CAPS.social_links;

type BlockItem = Tables<'block_items'>;

// Maps a platform's bare handle/username to its full profile URL.
const SOCIAL_URL_BUILDERS: Record<string, (h: string) => string> = {
  'TikTok': (h) => `https://tiktok.com/@${h}`,
  'Instagram': (h) => `https://instagram.com/${h}`,
  'YouTube': (h) => `https://youtube.com/@${h}`,
  'Facebook': (h) => `https://facebook.com/${h}`,
  'X (Twitter)': (h) => `https://x.com/${h}`,
  'Snapchat': (h) => `https://snapchat.com/add/${h}`,
  'Threads': (h) => `https://threads.com/@${h}`,
  'Pinterest': (h) => `https://pinterest.com/${h}`,
  'LinkedIn': (h) => `https://linkedin.com/in/${h}`,
  'GitHub': (h) => `https://github.com/${h}`,
  'Telegram': (h) => `https://t.me/${h}`,
  'WhatsApp': (h) => `https://wa.me/${h.replace(/[^0-9]/g, '')}`,
  'Calendly': (h) => `https://calendly.com/${h}`,
  'SoundCloud': (h) => `https://soundcloud.com/${h}`,
  'PayPal': (h) => `https://paypal.me/${h}`,
  'Venmo': (h) => `https://venmo.com/u/${h}`,
  'Cash App': (h) => `https://cash.app/$${h.replace(/^\$/, '')}`,
  'Twitch': (h) => `https://twitch.tv/${h}`,
  'Kick': (h) => `https://kick.com/${h}`,
  'Substack': (h) => `https://substack.com/@${h}`,
  'Depop': (h) => `https://depop.com/${h}`,
  'Etsy': (h) => `https://etsy.com/shop/${h}`,
  'OnlyFans': (h) => `https://onlyfans.com/${h}`,
  'Fansly': (h) => `https://fansly.com/${h}`,
  'Privacy': (h) => `https://privacy.com.br/@${h}`,
  'FatalFans': (h) => `https://fatalfans.com/${h}`,
  'Bluesky': (h) => `https://bsky.app/profile/${h}`,
  'Reddit': (h) => `https://reddit.com/user/${h}`,
  'Lemon8': (h) => `https://lemon8-app.com/@${h}`,
  'BeReal': (h) => `https://bere.al/${h}`,
  'Patreon': (h) => `https://patreon.com/${h}`,
  'Ko-fi': (h) => `https://ko-fi.com/${h}`,
  'Buy Me a Coffee': (h) => `https://buymeacoffee.com/${h}`,
  'Messenger': (h) => `https://m.me/${h}`,
  'Whop': (h) => `https://whop.com/${h}`,
};

// Turn whatever the user typed into a usable URL: full URLs pass through,
// bare handles expand via the platform builder, bare domains get https://.
const buildSocialUrl = (label: string, raw: string): string => {
  const v = (raw || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  const builder = SOCIAL_URL_BUILDERS[label];
  if (builder) return builder(v.replace(/^@/, ''));
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v)) return `https://${v}`;
  return v;
};

const itemSchema = z.object({
  id: z.string(),
  label: z.string().min(1, 'Label is required').max(50),
  url: z.string()
    .min(1, 'URL is required')
    .refine(
      (val) => val.startsWith('http://') || val.startsWith('https://'),
      'URL must include protocol (http:// or https://)'
    ),
  subtitle: z.string().max(100).optional(),
  badge: z.string().max(20).optional(),
  image_url: z.string().nullable().optional(),
});

type SocialItem = z.infer<typeof itemSchema>;

interface SortableItemProps {
  item: SocialItem;
  onUpdate: (id: string, field: keyof SocialItem, value: string | null) => void;
  onDelete: (id: string) => void;
  errors: Record<string, string>;
}

function SortableItem({ item, onUpdate, onDelete, errors }: SortableItemProps) {
  const [expanded, setExpanded] = useState(false);

  // Auto-expand when there's an error for this item
  useEffect(() => {
    if (errors[item.id]) {
      setExpanded(true);
    }
  }, [errors[item.id]]);

  // Auto-expand a bare handle into its full profile URL as the user types
  // (mirrors LinksEditor's debounced auto-unfurl). buildSocialUrl passes full
  // URLs through unchanged, so re-running after expansion never loops.
  useEffect(() => {
    const raw = (item.url || '').trim();
    if (!raw || /^https?:\/\//i.test(raw)) return;
    const id = setTimeout(() => {
      const built = buildSocialUrl(item.label, raw);
      if (built !== item.url) onUpdate(item.id, 'url', built);
    }, 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.url, item.label]);

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

  const preset = PLATFORM_CATEGORIES.flatMap(c => c.platforms).find(p => p.label === item.label);

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

        <PlatformIcon label={item.label} size={20} />

        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <p className="font-medium text-sm truncate">{item.label}</p>
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
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={item.label}
                onChange={(e) => onUpdate(item.id, 'label', e.target.value)}
                placeholder="Label"
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

interface SocialLinksEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
  iconSize?: 'small' | 'medium' | 'large';
  onIconSizeChange?: (v: 'small' | 'medium' | 'large') => void;
  iconColorMode?: 'color' | 'black' | 'white';
  onIconColorModeChange?: (v: 'color' | 'black' | 'white') => void;
}

export function SocialLinksEditor({ blockId, open, onOpenChange, onSave, panelMode, iconSize, onIconSizeChange, iconColorMode, onIconColorModeChange }: SocialLinksEditorProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<SocialItem[]>([]);
  const [existingItems, setExistingItems] = useState<BlockItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showPlatformPicker, setShowPlatformPicker] = useState(false);
  const [localIconSize, setLocalIconSize] = useState<'small' | 'medium' | 'large'>(iconSize ?? 'medium');
  const [localIconColorMode, setLocalIconColorMode] = useState<'color' | 'black' | 'white'>(iconColorMode ?? 'color');

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
          subtitle: item.subtitle || '',
          badge: item.badge || '',
          image_url: item.image_url || null,
        }))
      );
    } catch (error) {
      console.error('Error fetching items:', error);
      toast.error('Failed to load social links');
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

  const addPreset = (platform: { label: string; icon: string; placeholder?: string }) => {
    if (items.length >= MAX_ITEMS) {
      toast.error(`Maximum ${MAX_ITEMS} social links allowed`);
      return;
    }
    const newItem: SocialItem = {
      id: `new-${Date.now()}-${Math.random()}`,
      label: platform.label,
      url: '',
      subtitle: '',
      badge: '',
      image_url: null,
    };
    setItems([...items, newItem]);
  };

  const addCustom = () => {
    if (items.length >= MAX_ITEMS) {
      toast.error(`Maximum ${MAX_ITEMS} social links allowed`);
      return;
    }
    const newItem: SocialItem = {
      id: `new-${Date.now()}-${Math.random()}`,
      label: 'Custom Link',
      url: '',
      subtitle: '',
      badge: '',
      image_url: null,
    };
    setItems([...items, newItem]);
  };

  const updateItem = (id: string, field: keyof SocialItem, value: string | null) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
    // Clear error when user types
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

  const validate = (list: SocialItem[] = items): boolean => {
    const newErrors: Record<string, string> = {};
    let valid = true;

    // Enforce item cap
    if (list.length > MAX_ITEMS) {
      toast.error(`Maximum ${MAX_ITEMS} social links allowed`);
      return false;
    }

    list.forEach((item) => {
      if (!item.label.trim()) {
        newErrors[item.id] = 'Label is required';
        valid = false;
      } else if (item.label.length > 50) {
        newErrors[item.id] = 'Label must be less than 50 characters';
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
    // Expand bare handles into full profile URLs before validating + saving.
    const normalized = items.map((it) => ({ ...it, url: buildSocialUrl(it.label, it.url) }));
    if (normalized.some((it, i) => it.url !== items[i].url)) setItems(normalized);
    if (!validate(normalized)) {
      toast.error('Please fix the errors before saving. Expand items to see details.');
      return;
    }

    setSaving(true);
    try {
      // Delete removed items
      const currentIds = normalized.filter((i) => !i.id.startsWith('new-')).map((i) => i.id);
      const toDelete = existingItems.filter((ei) => !currentIds.includes(ei.id));

      for (const item of toDelete) {
        const { error } = await supabase.from('block_items').delete().eq('id', item.id);
        if (error) throw error;
      }

      // Update or create items
      for (let i = 0; i < normalized.length; i++) {
        const item = normalized[i];
        const isNew = item.id.startsWith('new-');

        if (isNew) {
          const { error } = await supabase.from('block_items').insert({
            block_id: blockId,
            label: item.label,
            url: item.url,
            subtitle: item.subtitle || null,
            badge: item.badge || null,
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
              image_url: item.image_url || null,
              order_index: i,
            })
            .eq('id', item.id);
          if (error) throw error;
        }
      }

      toast.success('Social links saved');
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving social links:', error);
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
          {/* Icon Size — global, saved to page headerConfig.iconSize */}
          <div className="mb-4">
            <label className="text-xs text-white/50 block mb-1.5">Icon Size</label>
            <div className="flex gap-1.5">
              {(['small', 'medium', 'large'] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => { setLocalIconSize(sz); onIconSizeChange?.(sz); }}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    localIconSize === sz
                      ? 'bg-[#C9A55C] text-[#0e0c09]'
                      : 'bg-white/10 text-white/50'
                  }`}
                >
                  {sz.charAt(0).toUpperCase() + sz.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Icon Color — global, saved to page headerConfig.iconColorMode */}
          <div className="mb-4">
            <label className="text-xs text-white/50 block mb-1.5">Icon Color</label>
            <div className="flex gap-1.5">
              {([
                { value: 'color', label: 'Brand' },
                { value: 'black', label: 'Black' },
                { value: 'white', label: 'White' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setLocalIconColorMode(opt.value); onIconColorModeChange?.(opt.value); }}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    localIconColorMode === opt.value
                      ? 'bg-[#C9A55C] text-[#0e0c09]'
                      : 'bg-white/10 text-white/50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Platform Picker Toggle */}
          <div className="mb-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowPlatformPicker(!showPlatformPicker)}
              className="gap-2 w-full justify-between"
            >
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Platform
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showPlatformPicker ? 'rotate-180' : ''}`} />
            </Button>
          </div>

          {showPlatformPicker && (
            <div className="mb-4 border border-border rounded-xl overflow-hidden bg-card">
              {/* Search */}
              <div className="p-3 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search platforms..."
                    className="pl-9 h-9 text-sm"
                  />
                </div>
                {search && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {PLATFORM_CATEGORIES.flatMap(c => c.platforms).filter(p =>
                      p.label.toLowerCase().includes(search.toLowerCase())
                    ).length} platforms found
                  </p>
                )}
              </div>

              {/* Categories or Search Results */}
              <div>
                {search ? (
                  /* Search results - flat list */
                  <div>
                    {PLATFORM_CATEGORIES.flatMap(c => c.platforms)
                      .filter(p => p.label.toLowerCase().includes(search.toLowerCase()))
                      .map((platform) => (
                        <button
                          key={platform.label}
                          type="button"
                          onClick={() => {
                            addPreset(platform);
                            setSearch('');
                            setShowPlatformPicker(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border last:border-0 text-left"
                        >
                          <span className="w-8 flex items-center justify-center"><PlatformIcon label={platform.label} size={22} /></span>
                          <div>
                            <p className="text-sm font-medium">{platform.label}</p>
                            <p className="text-xs text-muted-foreground">{platform.placeholder}</p>
                          </div>
                        </button>
                      ))}
                    {PLATFORM_CATEGORIES.flatMap(c => c.platforms).filter(p =>
                      p.label.toLowerCase().includes(search.toLowerCase())
                    ).length === 0 && (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                        No platforms found for &quot;{search}&quot;
                      </div>
                    )}
                  </div>
                ) : (
                  /* Categorized view */
                  PLATFORM_CATEGORIES.map((category) => (
                    <div key={category.label} className="border-b border-border last:border-0">
                      {/* Category header */}
                      <button
                        type="button"
                        onClick={() => setExpandedCategory(
                          expandedCategory === category.label ? null : category.label
                        )}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex gap-1">
                            {category.platforms.slice(0, 4).map((p) => (
                              <span key={p.label} className="flex items-center"><PlatformIcon label={p.label} size={16} /></span>
                            ))}
                          </div>
                          <div className="text-left">
                            <p className="text-xs font-semibold uppercase tracking-wide text-[#C9A55C]">
                              {category.label}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {category.platforms.length} platforms
                            </p>
                          </div>
                        </div>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${
                          expandedCategory === category.label ? 'rotate-180' : ''
                        }`} />
                      </button>

                      {/* Expanded platform list */}
                      {expandedCategory === category.label && (
                        <div className="bg-muted/20">
                          {category.platforms.map((platform) => (
                            <button
                              key={platform.label}
                              type="button"
                              onClick={() => {
                                addPreset(platform);
                                setShowPlatformPicker(false);
                                setExpandedCategory(null);
                              }}
                              className="w-full flex items-center gap-3 px-6 py-3 hover:bg-muted/50 transition-colors border-t border-border text-left"
                            >
                              <span className="w-8 flex items-center justify-center"><PlatformIcon label={platform.label} size={22} /></span>
                              <div>
                                <p className="text-sm font-medium">{platform.label}</p>
                                <p className="text-xs text-muted-foreground">
                                  + {platform.placeholder}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Custom link option at bottom */}
              <div className="border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    addCustom();
                    setShowPlatformPicker(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <span className="text-xl w-8 text-center">🔗</span>
                  <div>
                    <p className="text-sm font-medium">Custom Link</p>
                    <p className="text-xs text-muted-foreground">Add any URL</p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Items List */}
          <div className={panelMode ? 'flex-1 overflow-y-auto px-4 min-w-0' : 'flex-1 overflow-y-auto -mx-6 px-6 min-w-0'}>
            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Share2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No social links yet.</p>
                <p className="text-sm">Use Quick Add above to get started.</p>
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
                      <SortableItem
                        key={item.id}
                        item={item}
                        onUpdate={updateItem}
                        onDelete={deleteItem}
                        errors={errors}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

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
      <div className="flex flex-1 flex-col bg-[#0e0c09] text-white overflow-x-clip px-4 pt-4">
        {innerContent}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            Edit Social Links
          </DialogTitle>
          <DialogDescription>
            Add your social media profiles and other links.
          </DialogDescription>
        </DialogHeader>
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
