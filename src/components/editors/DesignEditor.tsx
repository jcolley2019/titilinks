import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Palette, Type, MousePointer, Save, Loader2, Upload, X, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getThemeWithDefaults, type ThemeJson } from '@/lib/theme-defaults';
import { useAuth } from '@/hooks/useAuth';
import { ThemePreview } from './ThemePreview';

const GRADIENT_PRESETS = [
  { name: 'Midnight', css: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' },
  { name: 'Sunset', css: 'linear-gradient(135deg, #ff6b6b 0%, #feca57 50%, #ff9ff3 100%)' },
  { name: 'Ocean', css: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #6B8DD6 100%)' },
];

interface DesignEditorProps {
  pageId: string;
  themeJson: unknown;
  onUpdate: () => void;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
}

export function DesignEditor({ pageId, themeJson, onUpdate, displayName, bio, avatarUrl }: DesignEditorProps) {
  const { user } = useAuth();
  const [theme, setTheme] = useState<ThemeJson>(() => getThemeWithDefaults(themeJson));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('background');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTheme(getThemeWithDefaults(themeJson));
  }, [themeJson]);

  const saveTheme = async (newTheme: ThemeJson) => {
    try {
      const { error } = await supabase
        .from('pages')
        .update({ theme_json: JSON.parse(JSON.stringify(newTheme)) })
        .eq('id', pageId);

      if (error) throw error;
      toast.success('Design saved!');
      onUpdate();
    } catch (error) {
      console.error('Error saving theme:', error);
      toast.error('Failed to save design');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    await saveTheme(theme);
    setSaving(false);
  };

  const updateBackground = (updates: Partial<ThemeJson['background']>, autoSave = false) => {
    setTheme((prev) => {
      const newTheme = {
        ...prev,
        background: { ...prev.background, ...updates },
      };
      if (autoSave) {
        saveTheme(newTheme);
      }
      return newTheme;
    });
  };

  const updateButtons = (updates: Partial<ThemeJson['buttons']>) => {
    setTheme((prev) => ({
      ...prev,
      buttons: { ...prev.buttons, ...updates },
    }));
  };

  const updateTypography = (updates: Partial<ThemeJson['typography']>) => {
    setTheme((prev) => ({
      ...prev,
      typography: { ...prev.typography, ...updates },
    }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5MB or less');
      return;
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Only JPEG, PNG, GIF, and WebP images are allowed');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/bg-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('page-assets')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('page-assets')
        .getPublicUrl(fileName);

      updateBackground({ image_url: urlData.publicUrl }, true);
      toast.success('Background image uploaded!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeBackgroundImage = () => {
    updateBackground({ image_url: '' }, true);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Controls Panel */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Design Settings
          </CardTitle>
          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </Button>
        </CardHeader>
        <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="background" className="gap-2">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Background</span>
            </TabsTrigger>
            <TabsTrigger value="buttons" className="gap-2">
              <MousePointer className="h-4 w-4" />
              <span className="hidden sm:inline">Buttons</span>
            </TabsTrigger>
            <TabsTrigger value="typography" className="gap-2">
              <Type className="h-4 w-4" />
              <span className="hidden sm:inline">Typography</span>
            </TabsTrigger>
          </TabsList>

          {/* Background Tab */}
          <TabsContent value="background" className="space-y-4">
            <div className="space-y-2">
              <Label>Background Type</Label>
              <Select
                value={theme.background.type}
                onValueChange={(v) => updateBackground({ type: v as 'solid' | 'gradient' | 'image' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">Solid Color</SelectItem>
                  <SelectItem value="gradient">Gradient</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {theme.background.type === 'solid' && (
              <div className="space-y-2">
                <Label>Solid Color</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={theme.background.solid_color}
                    onChange={(e) => updateBackground({ solid_color: e.target.value })}
                    className="w-16 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    value={theme.background.solid_color}
                    onChange={(e) => updateBackground({ solid_color: e.target.value })}
                    placeholder="#1a1a2e"
                    className="flex-1"
                  />
                </div>
              </div>
            )}

            {theme.background.type === 'gradient' && (
              <div className="space-y-3">
                <Label>Choose a Preset Gradient</Label>
                <div className="grid grid-cols-3 gap-2">
                  {GRADIENT_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => updateBackground({ gradient_css: preset.css })}
                      className={`relative h-16 rounded-md border-2 transition-all ${
                        theme.background.gradient_css === preset.css
                          ? 'border-primary ring-2 ring-primary/30'
                          : 'border-border hover:border-primary/50'
                      }`}
                      style={{ background: preset.css }}
                    >
                      {theme.background.gradient_css === preset.css && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-md">
                          <Check className="h-5 w-5 text-white" />
                        </div>
                      )}
                      <span className="absolute bottom-1 left-1 text-xs text-white drop-shadow-md">
                        {preset.name}
                      </span>
                    </button>
                  ))}
                </div>
                <div
                  className="h-20 rounded-md border border-border"
                  style={{ background: theme.background.gradient_css }}
                />
              </div>
            )}

            {theme.background.type === 'image' && (
              <div className="space-y-3">
                <Label>Background Image</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                {theme.background.image_url ? (
                  <div className="relative">
                    <div
                      className="h-32 rounded-md border border-border bg-cover bg-center"
                      style={{ backgroundImage: `url(${theme.background.image_url})` }}
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8"
                      onClick={removeBackgroundImage}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full h-24 border-dashed gap-2"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Upload className="h-5 w-5" />
                    )}
                    {uploading ? 'Uploading...' : 'Upload Image'}
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  Max 5MB. Supported: JPEG, PNG, GIF, WebP
                </p>
              </div>
            )}

            {/* Overlay Controls - shown for all background types */}
            <div className="pt-4 border-t border-border space-y-3">
              <Label className="text-muted-foreground">Overlay Settings</Label>
              <div className="space-y-2">
                <Label>Overlay Color</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={theme.background.overlay_color}
                    onChange={(e) => updateBackground({ overlay_color: e.target.value })}
                    className="w-16 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    value={theme.background.overlay_color}
                    onChange={(e) => updateBackground({ overlay_color: e.target.value })}
                    placeholder="#000000"
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Overlay Opacity: {Math.round(theme.background.overlay_opacity * 100)}%</Label>
                <Slider
                  value={[theme.background.overlay_opacity]}
                  onValueChange={([v]) => updateBackground({ overlay_opacity: v })}
                  min={0}
                  max={0.8}
                  step={0.05}
                />
              </div>

              {/* Background Preview */}
              <div className="pt-2">
                <Label className="text-muted-foreground mb-2 block">Preview</Label>
                <div
                  className="relative h-24 rounded-md border border-border overflow-hidden"
                  style={{
                    background:
                      theme.background.type === 'solid'
                        ? theme.background.solid_color
                        : theme.background.type === 'gradient'
                        ? theme.background.gradient_css
                        : theme.background.image_url
                        ? `url(${theme.background.image_url})`
                        : '#1a1a2e',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundColor: theme.background.overlay_color,
                      opacity: theme.background.overlay_opacity,
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      className="text-sm font-medium px-3 py-1 rounded"
                      style={{ color: theme.typography.text_color }}
                    >
                      Your content here
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Buttons Tab */}
          <TabsContent value="buttons" className="space-y-4">
            <div className="space-y-2">
              <Label>Button Shape</Label>
              <Select
                value={theme.buttons.shape}
                onValueChange={(v) => updateButtons({ shape: v as 'pill' | 'rounded' | 'square' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pill">Pill</SelectItem>
                  <SelectItem value="rounded">Rounded</SelectItem>
                  <SelectItem value="square">Square</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Fill Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={theme.buttons.fill_color}
                  onChange={(e) => updateButtons({ fill_color: e.target.value })}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={theme.buttons.fill_color}
                  onChange={(e) => updateButtons({ fill_color: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Text Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={theme.buttons.text_color}
                  onChange={(e) => updateButtons({ text_color: e.target.value })}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={theme.buttons.text_color}
                  onChange={(e) => updateButtons({ text_color: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Enable Border</Label>
              <Switch
                checked={theme.buttons.border_enabled}
                onCheckedChange={(v) => updateButtons({ border_enabled: v })}
              />
            </div>

            {theme.buttons.border_enabled && (
              <div className="space-y-2">
                <Label>Border Color</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={theme.buttons.border_color}
                    onChange={(e) => updateButtons({ border_color: e.target.value })}
                    className="w-16 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    value={theme.buttons.border_color}
                    onChange={(e) => updateButtons({ border_color: e.target.value })}
                    className="flex-1"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <Label>Enable Shadow</Label>
              <Switch
                checked={theme.buttons.shadow_enabled}
                onCheckedChange={(v) => updateButtons({ shadow_enabled: v })}
              />
            </div>

            <div className="space-y-2">
              <Label>Density</Label>
              <Select
                value={theme.buttons.density}
                onValueChange={(v) => updateButtons({ density: v as 'compact' | 'normal' | 'roomy' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">Compact</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="roomy">Roomy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Button Preview */}
            <div className="pt-4 border-t border-border">
              <Label className="text-muted-foreground mb-3 block">Preview</Label>
              <button
                className="w-full py-3 font-medium transition-all"
                style={{
                  backgroundColor: theme.buttons.fill_color,
                  color: theme.buttons.text_color,
                  borderRadius:
                    theme.buttons.shape === 'pill'
                      ? '9999px'
                      : theme.buttons.shape === 'rounded'
                      ? '0.5rem'
                      : '0',
                  border: theme.buttons.border_enabled
                    ? `2px solid ${theme.buttons.border_color}`
                    : 'none',
                  boxShadow: theme.buttons.shadow_enabled
                    ? '0 4px 14px rgba(0,0,0,0.25)'
                    : 'none',
                  padding:
                    theme.buttons.density === 'compact'
                      ? '0.5rem 1rem'
                      : theme.buttons.density === 'roomy'
                      ? '1rem 1.5rem'
                      : '0.75rem 1.25rem',
                }}
              >
                Sample Button
              </button>
            </div>
          </TabsContent>

          {/* Typography Tab */}
          <TabsContent value="typography" className="space-y-4">
            <div className="space-y-2">
              <Label>Font Family</Label>
              <Select
                value={theme.typography.font}
                onValueChange={(v) => updateTypography({ font: v as 'inter' | 'system' | 'serif' | 'mono' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inter">Inter</SelectItem>
                  <SelectItem value="system">System Default</SelectItem>
                  <SelectItem value="serif">Serif</SelectItem>
                  <SelectItem value="mono">Monospace</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Text Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={theme.typography.text_color}
                  onChange={(e) => updateTypography({ text_color: e.target.value })}
                  className="w-16 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={theme.typography.text_color}
                  onChange={(e) => updateTypography({ text_color: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>

            {/* Typography Preview */}
            <div className="pt-4 border-t border-border">
              <Label className="text-muted-foreground mb-3 block">Preview</Label>
              <div
                className="p-4 rounded-md border border-border"
                style={{
                  color: theme.typography.text_color,
                  fontFamily:
                    theme.typography.font === 'inter'
                      ? "'Inter', sans-serif"
                      : theme.typography.font === 'system'
                      ? 'system-ui, sans-serif'
                      : theme.typography.font === 'serif'
                      ? 'Georgia, serif'
                      : 'monospace',
                  backgroundColor: theme.background.type === 'solid' ? theme.background.solid_color : 'transparent',
                }}
              >
                <h3 className="text-xl font-bold mb-2">Sample Heading</h3>
                <p className="text-sm opacity-80">This is how your text will appear on your page.</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        </CardContent>
      </Card>

      {/* Live Preview Panel */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-medium text-foreground">Live Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <ThemePreview
              theme={theme}
              displayName={displayName}
              bio={bio}
              avatarUrl={avatarUrl}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
