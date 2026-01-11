import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Palette, Type, MousePointer, Save, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getThemeWithDefaults, type ThemeJson } from '@/lib/theme-defaults';

interface DesignEditorProps {
  pageId: string;
  themeJson: unknown;
  onUpdate: () => void;
}

export function DesignEditor({ pageId, themeJson, onUpdate }: DesignEditorProps) {
  const [theme, setTheme] = useState<ThemeJson>(() => getThemeWithDefaults(themeJson));
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('background');

  useEffect(() => {
    setTheme(getThemeWithDefaults(themeJson));
  }, [themeJson]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('pages')
        .update({ theme_json: JSON.parse(JSON.stringify(theme)) })
        .eq('id', pageId);

      if (error) throw error;
      toast.success('Design saved!');
      onUpdate();
    } catch (error) {
      console.error('Error saving theme:', error);
      toast.error('Failed to save design');
    } finally {
      setSaving(false);
    }
  };

  const updateBackground = (updates: Partial<ThemeJson['background']>) => {
    setTheme((prev) => ({
      ...prev,
      background: { ...prev.background, ...updates },
    }));
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

  return (
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
              <div className="space-y-2">
                <Label>Gradient CSS</Label>
                <Input
                  value={theme.background.gradient_css}
                  onChange={(e) => updateBackground({ gradient_css: e.target.value })}
                  placeholder="linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)"
                />
                <div
                  className="h-16 rounded-md border border-border"
                  style={{ background: theme.background.gradient_css }}
                />
              </div>
            )}

            {theme.background.type === 'image' && (
              <>
                <div className="space-y-2">
                  <Label>Image URL</Label>
                  <Input
                    value={theme.background.image_url}
                    onChange={(e) => updateBackground({ image_url: e.target.value })}
                    placeholder="https://example.com/bg.jpg"
                  />
                </div>
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
                    max={1}
                    step={0.05}
                  />
                </div>
              </>
            )}
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
  );
}
