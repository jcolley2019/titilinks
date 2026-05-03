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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { 
  Loader2, 
  ImagePlus, 
  AlignLeft,
  AlignCenter,
  AlignRight,
  LayoutTemplate,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { validateImageFile, IMAGE_SIZE_LIMITS } from '@/lib/validation';

interface HeroCardConfig {
  headline: string;
  subheadline: string;
  card_radius: 'sm' | 'md' | 'lg';
  show_profile_avatar: boolean;
  text_alignment: 'left' | 'center' | 'right';
  text_color: string;
  overlay_opacity: number;
}

const DEFAULT_CONFIG: HeroCardConfig = {
  headline: '',
  subheadline: '',
  card_radius: 'lg',
  show_profile_avatar: true,
  text_alignment: 'center',
  text_color: '#ffffff',
  overlay_opacity: 0.4,
};

interface HeroCardEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
}

export function HeroCardEditor({ blockId, open, onOpenChange, onSave, panelMode }: HeroCardEditorProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Hero card state
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [config, setConfig] = useState<HeroCardConfig>(DEFAULT_CONFIG);
  const [existingItemId, setExistingItemId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      fetchHeroCard();
    }
  }, [open, blockId]);

  const fetchHeroCard = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('block_items')
        .select('*')
        .eq('block_id', blockId)
        .order('order_index', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setExistingItemId(data.id);
        setImageUrl(data.image_url || null);
        
        // Parse config from badge field (we use badge to store JSON config)
        let parsedConfig = { ...DEFAULT_CONFIG };
        if (data.badge) {
          try {
            const storedConfig = JSON.parse(data.badge);
            parsedConfig = { ...DEFAULT_CONFIG, ...storedConfig };
          } catch (e) {
            console.log('Could not parse hero card config');
          }
        }
        
        // Use label for headline, subtitle for subheadline
        parsedConfig.headline = data.label || '';
        parsedConfig.subheadline = data.subtitle || '';
        
        setConfig(parsedConfig);
      } else {
        setExistingItemId(null);
        setImageUrl(null);
        setConfig(DEFAULT_CONFIG);
      }
    } catch (error) {
      console.error('Error fetching hero card:', error);
      toast.error('Failed to load hero card');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validation = validateImageFile(file, IMAGE_SIZE_LIMITS.media);
      if (!validation.valid) {
        toast.error(validation.error);
        return;
      }
      
      setImageFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageUrl(null);
    setImageFile(null);
    setImagePreview(null);
  };

  const uploadImage = async (file: File): Promise<string> => {
    if (!user) throw new Error('Not authenticated');
    
    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/hero-${crypto.randomUUID()}.${fileExt}`;

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
    setSaving(true);
    try {
      // Upload new image if needed
      let finalImageUrl = imageUrl;
      if (imageFile) {
        setUploading(true);
        finalImageUrl = await uploadImage(imageFile);
        setUploading(false);
      }

      // Store config (excluding headline/subheadline which go in separate fields)
      const configToStore = {
        card_radius: config.card_radius,
        show_profile_avatar: config.show_profile_avatar,
        text_alignment: config.text_alignment,
        text_color: config.text_color,
        overlay_opacity: config.overlay_opacity,
      };

      const itemData = {
        block_id: blockId,
        label: config.headline || 'Hero Card',
        subtitle: config.subheadline || null,
        url: '#', // Hero cards don't need a URL, but field is required
        image_url: finalImageUrl,
        badge: JSON.stringify(configToStore),
        order_index: 0,
      };

      if (existingItemId) {
        const { error } = await supabase
          .from('block_items')
          .update(itemData)
          .eq('id', existingItemId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('block_items')
          .insert(itemData);
        if (error) throw error;
      }

      toast.success('Hero card saved');
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving hero card:', error);
      toast.error(error.message || 'Failed to save');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  const displayImage = imagePreview || imageUrl;

  const radiusOptions: { value: HeroCardConfig['card_radius']; label: string }[] = [
    { value: 'sm', label: 'Small' },
    { value: 'md', label: 'Medium' },
    { value: 'lg', label: 'Large' },
  ];

  const alignmentOptions: { value: HeroCardConfig['text_alignment']; icon: typeof AlignLeft }[] = [
    { value: 'left', icon: AlignLeft },
    { value: 'center', icon: AlignCenter },
    { value: 'right', icon: AlignRight },
  ];

  const innerContent = (
    <>
      {!panelMode && (
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-primary" />
            Edit Hero Card
          </DialogTitle>
          <DialogDescription>
            Create a stunning hero section at the top of your page.
          </DialogDescription>
        </DialogHeader>
      )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-6 py-4">
            {/* Image Upload */}
            <div className="space-y-3">
              <Label>Hero Image</Label>
              <div 
                className={cn(
                  "relative w-full aspect-square rounded-xl border-2 border-dashed border-border",
                  "flex items-center justify-center overflow-hidden cursor-pointer",
                  "hover:border-primary/50 transition-colors bg-muted/30"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                {displayImage ? (
                  <>
                    <img 
                      src={displayImage} 
                      alt="Hero preview" 
                      className="w-full h-full object-cover"
                    />
                    <div 
                      className="absolute inset-0 bg-black pointer-events-none"
                      style={{ opacity: config.overlay_opacity }}
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage();
                      }}
                      className="absolute top-2 right-2 h-8 w-8"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <div className="text-center text-muted-foreground">
                    <ImagePlus className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Click to upload hero image</p>
                    <p className="text-xs opacity-75">Recommended: 1200x1200px (1:1)</p>
                  </div>
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

            {/* Headline */}
            <div className="space-y-2">
              <Label htmlFor="headline">Headline (optional)</Label>
              <Input
                id="headline"
                value={config.headline}
                onChange={(e) => setConfig({ ...config, headline: e.target.value })}
                placeholder="Welcome to my page"
                maxLength={100}
              />
            </div>

            {/* Subheadline */}
            <div className="space-y-2">
              <Label htmlFor="subheadline">Subheadline (optional)</Label>
              <Input
                id="subheadline"
                value={config.subheadline}
                onChange={(e) => setConfig({ ...config, subheadline: e.target.value })}
                placeholder="Creator • Entrepreneur • Dreamer"
                maxLength={150}
              />
            </div>

            {/* Card Radius */}
            <div className="space-y-3">
              <Label>Card Corners</Label>
              <div className="flex gap-2">
                {radiusOptions.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={config.card_radius === opt.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setConfig({ ...config, card_radius: opt.value })}
                    className="flex-1"
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Text Alignment */}
            <div className="space-y-3">
              <Label>Text Alignment</Label>
              <div className="flex gap-2">
                {alignmentOptions.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <Button
                      key={opt.value}
                      type="button"
                      variant={config.text_alignment === opt.value ? 'default' : 'outline'}
                      size="icon"
                      onClick={() => setConfig({ ...config, text_alignment: opt.value })}
                      className="h-10 w-10"
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Text Color */}
            <div className="space-y-3">
              <Label>Text Color</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={config.text_color}
                  onChange={(e) => setConfig({ ...config, text_color: e.target.value })}
                  className="h-10 w-14 rounded border border-border cursor-pointer"
                />
                <Input
                  value={config.text_color}
                  onChange={(e) => setConfig({ ...config, text_color: e.target.value })}
                  className="flex-1 font-mono text-sm"
                  placeholder="#ffffff"
                />
              </div>
            </div>

            {/* Overlay Opacity */}
            <div className="space-y-3">
              <Label>Image Overlay</Label>
              <div className="flex items-center gap-4">
                <Slider
                  value={[config.overlay_opacity * 100]}
                  onValueChange={([val]) => setConfig({ ...config, overlay_opacity: val / 100 })}
                  min={0}
                  max={80}
                  step={5}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground w-12 text-right">
                  {Math.round(config.overlay_opacity * 100)}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Darken the image for better text readability
              </p>
            </div>

            {/* Show Avatar Toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <Label htmlFor="show-avatar">Show Profile Avatar</Label>
                <p className="text-xs text-muted-foreground">
                  Display your avatar in the hero section
                </p>
              </div>
              <Switch
                id="show-avatar"
                checked={config.show_profile_avatar}
                onCheckedChange={(checked) => setConfig({ ...config, show_profile_avatar: checked })}
              />
            </div>

            {/* Live Preview */}
            {displayImage && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div 
                  className={cn(
                    "relative w-full aspect-square overflow-hidden",
                    config.card_radius === 'sm' && 'rounded-lg',
                    config.card_radius === 'md' && 'rounded-xl',
                    config.card_radius === 'lg' && 'rounded-2xl'
                  )}
                >
                  <img 
                    src={displayImage} 
                    alt="Preview" 
                    className="w-full h-full object-cover"
                  />
                  <div 
                    className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"
                    style={{ opacity: config.overlay_opacity + 0.3 }}
                  />
                  <div 
                    className={cn(
                      "absolute bottom-0 left-0 right-0 p-4",
                      config.text_alignment === 'left' && 'text-left',
                      config.text_alignment === 'center' && 'text-center',
                      config.text_alignment === 'right' && 'text-right'
                    )}
                    style={{ color: config.text_color }}
                  >
                    {config.headline && (
                      <h3 className="text-lg font-bold drop-shadow-lg">{config.headline}</h3>
                    )}
                    {config.subheadline && (
                      <p className="text-sm opacity-90 drop-shadow">{config.subheadline}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {uploading ? 'Uploading...' : 'Saving...'}
              </>
            ) : (
              'Save Hero Card'
            )}
          </Button>
        </div>
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
