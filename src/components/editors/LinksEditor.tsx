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
  Camera,
  Lock,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { Tables } from '@/integrations/supabase/types';
import { ITEM_CAPS, validateUrl } from '@/lib/validation';
import { ThumbnailUpload } from './ThumbnailUpload';
import { LinkButton } from '@/components/LinkButton';
import { DEFAULT_BLOCK_STYLE, DEFAULT_THEME, type BlockStyleConfig } from '@/lib/theme-defaults';

const MAX_ITEMS = ITEM_CAPS.links;

type BlockItem = Tables<'block_items'>;

const VALID_SIZES = ['big', 'medium', 'small', 'button'] as const;
type ItemSize = typeof VALID_SIZES[number];

function parseSize(value: string | null | undefined): ItemSize {
  return (VALID_SIZES as readonly string[]).includes(value || '')
    ? (value as ItemSize)
    : 'big';
}

// Title is optional — when empty, fall back to the URL's hostname so the card
// is not blank (FL.11). Tolerates a missing protocol; strips a leading "www.".
function labelFromUrl(url: string | null | undefined): string {
  const raw = (url || '').trim();
  if (!raw) return 'Link';
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return raw;
  }
}

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
  style_json?: Record<string, any> | null;
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
            <p className="text-sm text-muted-foreground truncate">{item.url || 'No URL set'}</p>
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
  blockStyle,
  onBack,
  onSave,
  onDelete,
}: {
  item: LinkItem;
  isNew: boolean;
  blockStyle: BlockStyleConfig;
  onBack: () => void;
  onSave: (item: LinkItem) => void;
  onDelete: (id: string) => void;
}) {
  const [local, setLocal] = useState<LinkItem>(item);
  const [colorTab, setColorTab] = useState<'title' | 'background'>('background');
  const [subtitleExpanded, setSubtitleExpanded] = useState<boolean>(!!item.subtitle);

  const update = (field: keyof LinkItem, value: any) => {
    setLocal(prev => ({ ...prev, [field]: value }));
  };

  // Per-link style overrides live on block_items.style_json (additive — any
  // future keys are preserved). Writing null removes the key; empty → null.
  const setStyleField = (key: string, value: string | number | null) => {
    setLocal(prev => {
      const next: Record<string, any> = { ...(prev.style_json || {}) };
      if (value === null) delete next[key];
      else next[key] = value;
      return { ...prev, style_json: Object.keys(next).length ? next : null };
    });
  };

  // Live preview theme — mirror LinksBlock's per-item color override so the
  // preview card matches the live profile: bg_color → fill, title_color → text.
  const previewTheme = (local.bg_color || local.title_color)
    ? {
        ...DEFAULT_THEME,
        buttons: {
          ...DEFAULT_THEME.buttons,
          ...(local.bg_color ? { fill_color: local.bg_color } : {}),
          ...(local.title_color ? { text_color: local.title_color } : {}),
        },
      }
    : DEFAULT_THEME;

  // Merge per-link border (style_json) over the block-level style so the
  // preview reflects per-item-first precedence; falls back to block border.
  const sj = local.style_json || {};
  const previewBlockStyle: Partial<BlockStyleConfig> = {
    ...blockStyle,
    ...(sj.border_width != null ? { border_width: sj.border_width } : {}),
    ...(sj.border_color ? { border_color: sj.border_color } : {}),
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
        <h3 className="font-semibold text-base">
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
          {/* Live Preview — EMPTY big/medium/small show a TitiLinks-brand
              placeholder (centered + corner camera, Link.me style); once an
              image exists (or size=button) it renders the real LinkButton.
              Editor-preview only — the live profile and FL.3 stay untouched.
              ThumbnailUpload still owns the hidden input + upload via open(). */}
          <ThumbnailUpload
            value={local.image_url}
            onChange={(url) => update('image_url', url)}
            renderTrigger={({ open, uploading }) => {
              const noImage = !local.image_url;
              const isCover = local.size === 'big' || local.size === 'small';
              const camBtn = (px: number, small: boolean) => (
                <button
                  type="button"
                  onClick={open}
                  disabled={uploading}
                  aria-label={noImage ? 'Add image' : 'Replace image'}
                  style={{ height: px, width: px }}
                  className="rounded-full bg-black/50 border border-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors disabled:opacity-60"
                >
                  {uploading
                    ? <Loader2 className={small ? 'h-4 w-4 animate-spin' : 'h-5 w-5 animate-spin'} />
                    : <Camera className={small ? 'h-4 w-4' : 'h-5 w-5'} />}
                </button>
              );
              const placeholderBg =
                'linear-gradient(180deg, rgba(201,165,92,0.10) 0%, rgba(255,255,255,0.02) 100%)';

              let body: React.ReactNode;

              if (noImage && isCover) {
                // Empty Big/Small → cover-shaped brand placeholder
                body = (
                  <div
                    className="relative w-full overflow-hidden border border-white/10"
                    style={{
                      aspectRatio: local.size === 'big' ? '16 / 10' : '16 / 7',
                      borderRadius: local.size === 'big' ? 16 : 14,
                      background: placeholderBg,
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      {camBtn(48, false)}
                    </div>
                    <div
                      className={local.size === 'big'
                        ? 'absolute left-4 right-4 bottom-3 text-left'
                        : 'absolute inset-x-0 bottom-3 px-4 text-center'}
                    >
                      <span
                        className="font-bold text-white/90"
                        style={{
                          fontSize: local.size === 'big' ? 17 : 15,
                          textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                        }}
                      >
                        {local.label || 'Title'}
                      </span>
                    </div>
                    <div className="absolute top-2 left-2 z-10">{camBtn(30, true)}</div>
                  </div>
                );
              } else if (noImage && local.size === 'medium') {
                // Empty Medium → row placeholder with a SQUARE (1:1) thumb slot
                body = (
                  <div
                    className="w-full flex items-center gap-3 border border-white/10 px-3 py-3"
                    style={{ borderRadius: 14, background: placeholderBg }}
                  >
                    <button
                      type="button"
                      onClick={open}
                      disabled={uploading}
                      aria-label="Add image"
                      className="shrink-0 h-12 w-12 rounded-[10px] bg-black/40 border border-white/20 flex items-center justify-center text-white hover:bg-black/60 transition-colors disabled:opacity-60"
                    >
                      {uploading
                        ? <Loader2 className="h-5 w-5 animate-spin" />
                        : <Camera className="h-5 w-5" />}
                    </button>
                    <span className="font-semibold text-white/90 text-[15px]">
                      {local.label || 'Title'}
                    </span>
                  </div>
                );
              } else {
                // Button (no image) or any size WITH image → real LinkButton + corner camera
                body = (
                  <div className="relative w-full flex items-center justify-center">
                    <LinkButton
                      as="button"
                      type="button"
                      theme={previewTheme}
                      blockStyle={previewBlockStyle}
                      title={local.label || 'Title'}
                      subtitle={local.subtitle || undefined}
                      media={local.image_url ? { kind: 'image', src: local.image_url } : undefined}
                      meta={
                        local.is_adult && local.badge
                          ? `18+ · ${local.badge}`
                          : local.is_adult
                          ? '18+'
                          : local.badge
                          ? local.badge
                          : undefined
                      }
                      size={local.size}
                      onClick={(e) => e.preventDefault()}
                    />
                    <div className="absolute top-2 left-2 z-10">{camBtn(30, true)}</div>
                  </div>
                );
              }

              // Fixed footprint: always reserve the Big placeholder's 16/10
              // height so switching sizes never resizes the preview area; the
              // active card/placeholder is centered inside it.
              return (
                <div className="relative w-full" style={{ aspectRatio: '16 / 10' }}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    {body}
                  </div>
                </div>
              );
            }}
          />
          <p className="text-sm text-center text-muted-foreground">
            Find the look that fits you best
          </p>

          {/* Size Picker */}
          <div className="grid grid-cols-4 gap-2">
            {sizes.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => update('size', key)}
                className={`py-2 text-sm font-semibold rounded-lg border-2 transition-all ${
                  local.size === key
                    ? 'border-[#C9A55C] bg-[#C9A55C]/10 text-[#C9A55C]'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Reserve constant height: always rendered, toggled invisible so
              the fields below never shift when the warning appears/disappears. */}
          <p
            aria-hidden={!((local.size === 'big' || local.size === 'small') && !local.image_url)}
            className={`text-sm text-[#C9A55C] ${
              (local.size === 'big' || local.size === 'small') && !local.image_url
                ? ''
                : 'invisible'
            }`}
          >
            This will display as a button because there's no image. Add an image to use the{' '}
            {local.size === 'big' ? 'big' : 'small'} thumbnail.
          </p>

          {/* URL Input */}
          <div className="space-y-1">
            <Label className="text-sm">Link, phone number, or email</Label>
            <Input
              value={local.url}
              onChange={(e) => update('url', e.target.value)}
              placeholder="https://..."
              className="h-10 text-[#0e0c09]"
            />
          </div>

          {/* Title Input */}
          <div className="space-y-1">
            <Label className="text-sm">Title</Label>
            <Input
              value={local.label}
              onChange={(e) => update('label', e.target.value)}
              placeholder="My Link"
              className="h-10 text-[#0e0c09]"
            />
          </div>

          {/* Subtitle Input — collapsed behind a chevron; value is preserved
              when collapsed (field is only hidden, never cleared). */}
          <Collapsible
            open={subtitleExpanded}
            onOpenChange={setSubtitleExpanded}
            className="space-y-1"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between py-1 text-sm font-medium text-foreground"
              >
                <span>Subtitle (optional)</span>
                {subtitleExpanded
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Input
                value={local.subtitle || ''}
                onChange={(e) => update('subtitle', e.target.value)}
                placeholder="Check this out"
                className="h-10 text-[#0e0c09]"
              />
            </CollapsibleContent>
          </Collapsible>

          {/* Customize Color */}
          <div className="space-y-3">
            <p className="text-base font-semibold">Customize Color</p>
            <div className="flex rounded-lg overflow-hidden border border-border">
              <button
                onClick={() => setColorTab('title')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  colorTab === 'title'
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                Title
              </button>
              <button
                onClick={() => setColorTab('background')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
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
                className="flex-1 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-secondary"
              >
                No color
              </button>
            </div>
          </div>

          {/* Per-link Border — stored on block_items.style_json (additive;
              takes precedence over the block-level Style Variants border) */}
          <div className="space-y-3">
            <p className="text-base font-semibold">Border</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">
                  Width ({(local.style_json?.border_width as number | undefined) ?? 0}px)
                </Label>
                <Slider
                  value={[(local.style_json?.border_width as number | undefined) ?? 0]}
                  onValueChange={([v]) => setStyleField('border_width', v)}
                  min={0}
                  max={4}
                  step={1}
                  className="py-2"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Color</Label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={(local.style_json?.border_color as string | undefined) || '#C9A55C'}
                    onChange={(e) => setStyleField('border_color', e.target.value)}
                    className="w-10 h-10 rounded-lg border border-border p-1 cursor-pointer"
                  />
                  <button
                    onClick={() => setStyleField('border_color', null)}
                    className="flex-1 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-secondary"
                  >
                    None
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 18+ Toggle */}
          <div className="flex items-center justify-between py-3 border-t border-border">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-normal text-muted-foreground">
                18+ Link
              </Label>
            </div>
            <Switch
              checked={local.is_adult || false}
              onCheckedChange={(checked) => update('is_adult', checked)}
            />
          </div>

          {/* Animations PRO Upsell — on-brand locked state (visual only) */}
          <div className="rounded-xl border border-[#C9A55C]/30 bg-black/30 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#C9A55C]/20">
              <div>
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-[#C9A55C]" />
                  <p className="text-base font-semibold text-white">Animations</p>
                </div>
                <p className="text-sm text-white/70">
                  Add motion to your link to draw attention.
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-white/50" />
            </div>
            <div className="p-4">
              <p className="text-sm text-white/90 mb-3">
                Animations are part of TitiLinks Pro. Upgrade to unlock
                motion effects for your links.
              </p>
              <button className="w-full py-2 text-sm font-semibold rounded-lg bg-[#C9A55C] text-[#0e0c09] hover:bg-[#C9A55C]/90 transition-colors">
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
          size: parseSize(item.size),
          bg_color: item.bg_color ?? null,
          title_color: item.title_color ?? null,
          style_json: (item.style_json as Record<string, any> | null) ?? null,
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
      // Title (label) is optional (FL.11) — it falls back to the URL hostname
      // at save time. Still cap its length and validate the URL.
      if (item.label.length > 100) {
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

        const payload = {
          label: item.label.trim() || labelFromUrl(item.url),
          url: item.url,
          subtitle: item.subtitle || null,
          badge: item.badge || null,
          is_adult: item.is_adult || false,
          image_url: item.image_url || null,
          size: item.size || null,
          bg_color: item.bg_color || null,
          title_color: item.title_color || null,
          style_json: (item.style_json && Object.keys(item.style_json).length > 0
            ? item.style_json
            : null) as Tables<'block_items'>['style_json'],
          order_index: i,
        };

        if (isNew) {
          const { error } = await supabase
            .from('block_items')
            .insert({ block_id: blockId, ...payload });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('block_items')
            .update(payload)
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
          blockStyle={styleConfig}
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
                  <Button variant="outline" size="sm" className="w-full justify-between gap-2 text-foreground">
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
                      <Label className="text-sm">Button Variant</Label>
                      <Select
                        value={styleConfig.variant}
                        onValueChange={(value: 'filled' | 'outline' | 'glass' | 'minimal') =>
                          setStyleConfig(prev => ({ ...prev, variant: value }))
                        }
                      >
                        <SelectTrigger className="h-8 text-sm text-foreground">
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
                      <Label className="text-sm">Font Style</Label>
                      <Select
                        value={styleConfig.font_style}
                        onValueChange={(value: 'normal' | 'mono' | 'serif') =>
                          setStyleConfig(prev => ({ ...prev, font_style: value }))
                        }
                      >
                        <SelectTrigger className="h-8 text-sm text-foreground">
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
                      <Label className="text-sm">Border Width ({styleConfig.border_width}px)</Label>
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
                      <Label className="text-sm">Border Color</Label>
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
                      <Label className="text-sm">Background Opacity ({Math.round(styleConfig.background_opacity * 100)}%)</Label>
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
                      <Label className="text-sm">Letter Spacing ({styleConfig.letter_spacing.toFixed(2)}em)</Label>
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
                  className="gap-2 text-foreground"
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
                  className="flex-1 text-foreground"
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
