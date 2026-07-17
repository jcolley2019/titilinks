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
import { useLanguage } from '@/hooks/useLanguage';
import { cn, randomUUID } from '@/lib/utils';
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
  const { t } = useLanguage();
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
      toast.error(t('heroCardEditor.loadError'));
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
    const filePath = `${user.id}/hero-${randomUUID()}.${fileExt}`;

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

      toast.success(t('heroCardEditor.saved'));
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving hero card:', error);
      toast.error(error.message || t('heroCardEditor.saveError'));
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  const displayImage = imagePreview || imageUrl;

  const radiusOptions: { value: HeroCardConfig['card_radius']; label: string }[] = [
    { value: 'sm', label: t('blockEditor.small') },
    { value: 'md', label: t('blockEditor.medium') },
    { value: 'lg', label: t('blockEditor.large') },
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
            {t('heroCardEditor.title')}
          </DialogTitle>
          <DialogDescription>
            {t('heroCardEditor.description')}
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
              <Label>{t('heroCardEditor.heroImage')}</Label>
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
                      alt={t('heroCardEditor.heroPreviewAlt')} 
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
                    <p className="text-sm">{t('heroCardEditor.uploadPrompt')}</p>
                    <p className="text-xs opacity-75">{t('heroCardEditor.recommendedSize')}</p>
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
              <Label htmlFor="headline">{t('heroCardEditor.headline')}</Label>
              <Input
                id="headline"
                value={config.headline}
                onChange={(e) => setConfig({ ...config, headline: e.target.value })}
                placeholder={t('heroCardEditor.headlinePlaceholder')}
                maxLength={100}
              />
            </div>

            {/* Subheadline */}
            <div className="space-y-2">
              <Label htmlFor="subheadline">{t('heroCardEditor.subheadline')}</Label>
              <Input
                id="subheadline"
                value={config.subheadline}
                onChange={(e) => setConfig({ ...config, subheadline: e.target.value })}
                placeholder={t('heroCardEditor.subheadlinePlaceholder')}
                maxLength={150}
              />
            </div>

            {/* Card Radius */}
            <div className="space-y-3">
              <Label>{t('heroCardEditor.cardCorners')}</Label>
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
              <Label>{t('heroCardEditor.textAlignment')}</Label>
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
              <Label>{t('design.textColor')}</Label>
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
              <Label>{t('heroCardEditor.imageOverlay')}</Label>
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
                {t('heroCardEditor.overlayHint')}
              </p>
            </div>

            {/* Show Avatar Toggle */}
            <div className="flex items-center justify-between py-2">
              <div>
                <Label htmlFor="show-avatar">{t('heroCardEditor.showAvatar')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('heroCardEditor.showAvatarHint')}
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
                <Label>{t('design.preview')}</Label>
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
                    alt={t('heroCardEditor.previewAlt')} 
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

        {/* Footer — pinned to the bottom of the panel while content scrolls. */}
        <div className="sticky bottom-0 z-10 mt-auto flex gap-3 -mx-4 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-[#0e0c09]">
          <Button
            onClick={() => onOpenChange(false)}
            className="flex-1 h-12 rounded-xl bg-white/10 text-white border border-white/20 hover:bg-white/20"
          >
            {t('blockEditor.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 h-12 rounded-xl bg-[#C9A55C] text-black font-semibold hover:bg-[#C9A55C]/90 disabled:opacity-40"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {uploading ? t('design.uploading') : t('blockEditor.saving')}
              </>
            ) : (
              t('blockEditor.save')
            )}
          </Button>
        </div>
    </>
  );

  if (panelMode) {
    return (
      <div className="flex flex-1 flex-col bg-[#0e0c09] text-white px-4 pt-4">
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
