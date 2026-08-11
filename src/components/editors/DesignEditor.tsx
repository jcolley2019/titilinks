import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BUTTON_SHAPES, shapeSwatchStyle } from '@/lib/button-shapes';
import { FONT_OPTIONS } from '@/lib/fonts';
import { Palette, Pipette, Type, MousePointer, Save, Loader2, X, Plus, Trash2, Bookmark, Sparkles, LayoutTemplate } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getThemeWithDefaults, THEME_PRESETS, type ThemeJson, type ThemeTypography, type PageId } from '@/lib/theme-defaults';
import { captureSnapshot } from '@/lib/snapshots';
import { withEffectivePageStyle } from '@/lib/surface';
import { isAnimationId } from '@/lib/animations';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useLanguage } from '@/hooks/useLanguage';

import { TemplateGallery } from './TemplateGallery';
import { ButtonSurfaceControls } from './ButtonSurfaceControls';
import { UserFontsSection } from './UserFontsSection';

// The custom-preset panel below is parked behind `{false && …}`. Its query was
// still firing on every editor mount, so each open of the design panel cost a
// Supabase round-trip feeding UI nobody can reach. Gate the fetch on the same
// flag, so query and panel wake up together.
const CUSTOM_PRESETS_UI_ENABLED: boolean = false;

interface DesignEditorProps {
  pageId: string;
  themeJson: unknown;
  onUpdate: () => void;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  // LIVE.THEME.1 (L5): streams the in-progress draft theme to the phone
  // preview on every mutation; null clears the override.
  onThemeDraftChange?: (draft: ThemeJson | null) => void;
  // FOOTER.3: Cancel closes the panel; the draft reverts because the
  // component unmounts and LIVE.THEME.1 clears the preview override.
  onClose?: () => void;
  // PAGES.STYLE.1: the page being edited. This tab's option sets derive from
  // its effective style, so the Buttons tab can never offer a look the active
  // page won't render. Absent → page1.
  activePageId?: PageId;
}

export function DesignEditor({ pageId, themeJson, onUpdate, displayName, bio, avatarUrl, onThemeDraftChange, onClose, activePageId = 'page1' }: DesignEditorProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { can } = useEntitlements();
  // ANIM.2: saveTheme strips the page-level animation for a non-entitled
  // profile (belt-and-suspenders with the Buttons-tab picker's own guard).
  const canAnimations = can('linkAnimations');
  const [theme, setTheme] = useState<ThemeJson>(() => getThemeWithDefaults(themeJson));
  // PAGES.STYLE.1: what the MENUS render from — `theme` with pageStyle
  // resolved to the active page. The `theme` draft itself stays the raw write
  // vehicle: saveTheme persists it, and a resolved pageStyle written back would
  // silently become the profile-level default.
  const effectiveTheme = withEffectivePageStyle(theme, themeJson, activePageId);
  const [confirmReset, setConfirmReset] = useState(false);
  // LIVE.THEME.1 (L5): every draft mutation streams to the preview. The
  // seed emission and post-save emissions equal the saved theme, so
  // they're visual no-ops. Unmount clears so a closed panel can't pin a
  // stale look on the preview (hub pattern).
  useEffect(() => { onThemeDraftChange?.(theme); }, [theme, onThemeDraftChange]);
  useEffect(() => () => { onThemeDraftChange?.(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('background');

  // Custom presets state
  const [customPresets, setCustomPresets] = useState<Array<{ id: string; name: string; theme_json: unknown }>>([]);
  const [loadingPresets, setLoadingPresets] = useState(true);
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);

  // Load Google Fonts in editor
  useEffect(() => {
    const id = 'google-fonts-design-editor';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Bebas+Neue&family=Abril+Fatface&family=Pacifico&family=Orbitron:wght@400;700&family=Caveat:wght@400;700&family=Archivo+Black&family=Lora:wght@400;700&family=Patrick+Hand&family=Space+Grotesk:wght@400;700&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  // BRAND.1: the catalog now comes from the SHARED source (src/lib/fonts.ts)
  // — this tab previously carried a local duplicate of the same list.

  // Fetch custom presets
  const fetchCustomPresets = async () => {
    if (!CUSTOM_PRESETS_UI_ENABLED || !user) {
      setLoadingPresets(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('custom_theme_presets')
        .select('id, name, theme_json')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setCustomPresets(data || []);
    } catch (error) {
      console.error('Error fetching custom presets:', error);
    } finally {
      setLoadingPresets(false);
    }
  };

  useEffect(() => {
    fetchCustomPresets();
  }, [user]);

  const saveCustomPreset = async () => {
    if (!user || !newPresetName.trim()) return;
    
    setSavingPreset(true);
    try {
      const { error } = await supabase
        .from('custom_theme_presets')
        .insert({
          user_id: user.id,
          name: newPresetName.trim(),
          // Presets capture the visual theme only — never the page's layout
          // style. pageStyle rides in the merged theme since FS.SURFACE.1c;
          // applying a preset must not flip hero <-> full_bleed.
          theme_json: JSON.parse(JSON.stringify({ ...theme, pageStyle: undefined })),
        });
      
      if (error) throw error;
      toast.success(t('design.presetSaved'));
      setSavePresetOpen(false);
      setNewPresetName('');
      fetchCustomPresets();
    } catch (error) {
      console.error('Error saving preset:', error);
      toast.error(t('design.presetSaveFailed'));
    } finally {
      setSavingPreset(false);
    }
  };

  const deleteCustomPreset = async (presetId: string) => {
    try {
      const { error } = await supabase
        .from('custom_theme_presets')
        .delete()
        .eq('id', presetId);
      
      if (error) throw error;
      toast.success(t('design.presetDeleted'));
      fetchCustomPresets();
    } catch (error) {
      console.error('Error deleting preset:', error);
      toast.error(t('design.presetDeleteFailed'));
    }
  };

  useEffect(() => {
    setTheme(getThemeWithDefaults(themeJson));
  }, [themeJson]);

  const saveTheme = async (newTheme: ThemeJson) => {
    try {
      // ANIM.2: a free profile can never PERSIST a page-level motion effect —
      // strip it at save (the JSON round-trip below erases the undefined),
      // exactly like the per-item editors gate style_json.animation.
      const safeTheme = !canAnimations && isAnimationId(newTheme.buttons.animation)
        ? { ...newTheme, buttons: { ...newTheme.buttons, animation: undefined } }
        : newTheme;
      // Merge over the existing raw json so keys the theme editor doesn't
      // manage (headerConfig, headerCardOrder, avatar_url_page2, pages) survive.
      const extras = (themeJson && typeof themeJson === 'object') ? (themeJson as Record<string, unknown>) : {};
      const { error } = await supabase
        .from('pages')
        .update({ theme_json: { ...extras, ...JSON.parse(JSON.stringify(safeTheme)) } })
        .eq('id', pageId);

      if (error) throw error;
      toast.success(t('design.designSaved'));
      onUpdate();
    } catch (error) {
      console.error('Error saving theme:', error);
      toast.error(t('design.designSaveFailed'));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    await saveTheme(theme);
    setSaving(false);
  };

  const handleReset = async () => {
    // SNAP.1c: back up the current look BEFORE the destructive reset write, so
    // resetting to the brand default is undoable. A capture failure aborts the
    // reset — we never overwrite the theme without a safety net first.
    try {
      await captureSnapshot(pageId, t('snapshots.autoBeforeReset').replace('{name}', 'Default'), 'auto');
    } catch (snapErr) {
      console.error('[snapshots] pre-reset capture failed:', snapErr);
      toast.error(t('snapshots.autoFailed'));
      return;
    }
    const d = THEME_PRESETS[0].theme; // Midnight Gold = brand default
    setTheme((prev) => {
      const newTheme: ThemeJson = {
        ...prev,
        background: { ...d.background },
        buttons: { ...d.buttons },
        typography: { ...d.typography },
      };
      saveTheme(newTheme);
      return newTheme;
    });
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

  const updateHeader = (updates: Partial<NonNullable<ThemeJson['header']>>, autoSave = false) => {
    setTheme((prev) => {
      const defaultHeader: NonNullable<ThemeJson['header']> = { 
        image_url: '', 
        enabled: false, 
        source: null, 
        layout: 'overlay' 
      };
      const newTheme = {
        ...prev,
        header: { ...defaultHeader, ...(prev.header || {}), ...updates },
      };
      if (autoSave) {
        saveTheme(newTheme);
      }
      return newTheme;
    });
  };

  return (
    // FOOTER.1: the flex column is chained root → Card → CardContent so the
    // footer's mt-auto measures against the panel, not against the content.
    // No min-h-0 anywhere on this chain: content must be free to overflow and
    // scroll the dashboard's scroller, which min-h-0 would suppress.
    <div className="flex flex-1 flex-col">
      {/* Controls Panel */}
      <Card className="bg-card border-border flex flex-1 flex-col">
        <CardContent className="flex flex-1 flex-col">
          {/* Design Tools Section */}
          {false && (
          <div className="mb-6 pb-6 border-b border-border">
            <Label className="text-sm font-medium mb-3 block">{t('design.designTools')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {/* Template Gallery Button */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2 h-auto py-3">
                    <LayoutTemplate className="h-4 w-4 text-primary" />
                    <div className="text-left">
                      <div className="text-sm font-medium">{t('design.templateGallery')}</div>
                      <div className="text-xs text-muted-foreground">{t('design.browseTemplates')}</div>
                    </div>
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 col-span-2">
                  <TemplateGallery 
                    pageId={pageId} 
                    onApply={() => {
                      const fetchTheme = async () => {
                        const { data } = await supabase
                          .from('pages')
                          .select('theme_json')
                          .eq('id', pageId)
                          .single();
                        if (data) {
                          setTheme(getThemeWithDefaults(data.theme_json));
                        }
                      };
                      fetchTheme();
                      onUpdate();
                    }} 
                  />
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
          )}

          {false && (<>
          {/* Quick Start Presets Section */}
          <div className="mb-6 pb-6 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium">{t('design.quickStartPresets')}</Label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {THEME_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => { setTheme(preset.theme); saveTheme(preset.theme); }}
                  className="relative p-3 rounded-lg border border-border hover:border-primary/50 transition-all text-left group"
                >
                  {/* Mini preview */}
                  <div
                    className="h-12 rounded-md mb-2 overflow-hidden"
                    style={{
                      background:
                        preset.theme.background.type === 'solid'
                          ? preset.theme.background.solid_color
                          : preset.theme.background.type === 'gradient'
                          ? preset.theme.background.gradient_css
                          : '#1a1a2e',
                    }}
                  >
                    <div className="flex items-center justify-center h-full gap-1 px-2">
                      {[1, 2].map((i) => (
                        <div
                          key={i}
                          className="h-3 flex-1 rounded-full"
                          style={{
                            backgroundColor: preset.theme.buttons.fill_color,
                            borderRadius:
                              preset.theme.buttons.shape === 'pill'
                                ? '9999px'
                                : preset.theme.buttons.shape === 'rounded'
                                ? '4px'
                                : '2px',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="text-sm font-medium text-foreground">{preset.name}</span>
                  <p className="text-xs text-muted-foreground line-clamp-1">{preset.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Presets Section */}
          <div className="mb-6 pb-6 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Bookmark className="h-4 w-4" />
                {t('design.mySavedPresets')}
              </Label>
              <Dialog open={savePresetOpen} onOpenChange={setSavePresetOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 h-7 text-xs">
                    <Plus className="h-3 w-3" />
                    {t('design.saveCurrent')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[400px]">
                  <DialogHeader>
                    <DialogTitle>{t('design.saveThemePreset')}</DialogTitle>
                    <DialogDescription>
                      {t('design.saveThemePresetDesc')}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <Label htmlFor="preset-name" className="text-sm font-medium">
                      {t('design.presetName')}
                    </Label>
                    <Input
                      id="preset-name"
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder={t('design.presetPlaceholder')}
                      className="mt-2"
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setSavePresetOpen(false)}
                    >
                      {t('design.cancel')}
                    </Button>
                    <Button
                      onClick={saveCustomPreset}
                      disabled={!newPresetName.trim() || savingPreset}
                    >
                      {savingPreset ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      {t('design.savePreset')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            
            {loadingPresets ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : customPresets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t('design.noPresetsYet')}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {customPresets.map((preset) => {
                  const presetTheme = getThemeWithDefaults(preset.theme_json);
                  return (
                    <div
                      key={preset.id}
                      className="relative p-3 rounded-lg border border-border hover:border-primary/50 transition-all text-left group"
                    >
                      <button
                        type="button"
                        onClick={() => setTheme(presetTheme)}
                        className="w-full text-left"
                      >
                        {/* Mini preview */}
                        <div
                          className="h-12 rounded-md mb-2 overflow-hidden"
                          style={{
                            background:
                              presetTheme.background.type === 'solid'
                                ? presetTheme.background.solid_color
                                : presetTheme.background.type === 'gradient'
                                ? presetTheme.background.gradient_css
                                : '#1a1a2e',
                          }}
                        >
                          <div className="flex items-center justify-center h-full gap-1 px-2">
                            {[1, 2].map((i) => (
                              <div
                                key={i}
                                className="h-3 flex-1 rounded-full"
                                style={{
                                  backgroundColor: presetTheme.buttons.fill_color,
                                  borderRadius:
                                    presetTheme.buttons.shape === 'pill'
                                      ? '9999px'
                                      : presetTheme.buttons.shape === 'rounded'
                                      ? '4px'
                                      : '2px',
                                }}
                              />
                            ))}
                          </div>
                        </div>
                        <span className="text-sm font-medium text-foreground">{preset.name}</span>
                      </button>
                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteCustomPreset(preset.id);
                        }}
                        className="absolute top-2 right-2 p-1 rounded-md bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/20"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Microinteractions Toggle */}
          <div className="mb-6 pb-6 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <Label className="text-sm font-medium">{t('design.microinteractions')}</Label>
                  <p className="text-xs text-muted-foreground">{t('design.microinteractionsDesc')}</p>
                </div>
              </div>
              <Switch
                checked={theme.motion.enabled}
                onCheckedChange={(checked) => setTheme(prev => ({
                  ...prev,
                  motion: { ...prev.motion, enabled: checked }
                }))}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {t('design.microinteractionsNote')}
            </p>
          </div>

          {/* Auto-Contrast Toggle */}
          <div className="mb-6 pb-6 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Palette className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <Label className="text-sm font-medium">{t('design.matchStyles')}</Label>
                  <p className="text-xs text-muted-foreground">{t('design.matchStylesDesc')}</p>
                </div>
              </div>
              <Switch
                checked={theme.auto_contrast ?? false}
                onCheckedChange={(checked) => setTheme(prev => ({
                  ...prev,
                  auto_contrast: checked
                }))}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {t('design.matchStylesNote')}
            </p>
          </div>
          </>)}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="background">{t('design.tabBackground')}</TabsTrigger>
            <TabsTrigger value="title">{t('design.tabTitle')}</TabsTrigger>
            <TabsTrigger value="font">{t('design.tabFont')}</TabsTrigger>
            <TabsTrigger value="buttons">{t('design.tabButtons') || 'Buttons'}</TabsTrigger>
          </TabsList>

          {/* Background Tab — solid color */}
          <TabsContent value="background" className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">{t('design.backgroundColor')}</Label>
              {'EyeDropper' in window && (
                <button
                  type="button"
                  aria-label={t('design.eyedropper')}
                  onClick={async () => {
                    try {
                      const ed = new (window as any).EyeDropper();
                      const res = await ed.open();
                      updateBackground({ type: 'solid', solid_color: res.sRGBHex });
                    } catch { /* cancelled */ }
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pipette className="h-4 w-4" />
                </button>
              )}
            </div>
            <HexColorPicker
              color={theme.background.solid_color}
              onChange={(c) => updateBackground({ type: 'solid', solid_color: c })}
              style={{ width: '100%' }}
            />
            <div className="flex items-center gap-2">
              <div
                className="w-10 h-10 rounded-md border border-border flex-shrink-0"
                style={{ backgroundColor: theme.background.solid_color }}
              />
              <Input
                value={theme.background.solid_color}
                onChange={(e) => updateBackground({ type: 'solid', solid_color: e.target.value })}
                placeholder="#000000"
                className="flex-1 font-mono uppercase"
              />
            </div>
          </TabsContent>

          {/* Title Tab — main text color */}
          <TabsContent value="title" className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">{t('design.mainTextColor')}</Label>
              {'EyeDropper' in window && (
                <button
                  type="button"
                  aria-label={t('design.eyedropper')}
                  onClick={async () => {
                    try {
                      const ed = new (window as any).EyeDropper();
                      const res = await ed.open();
                      updateTypography({ text_color: res.sRGBHex });
                    } catch { /* cancelled */ }
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pipette className="h-4 w-4" />
                </button>
              )}
            </div>
            <HexColorPicker
              color={theme.typography.text_color}
              onChange={(c) => updateTypography({ text_color: c })}
              style={{ width: '100%' }}
            />
            <div className="flex items-center gap-2">
              <div
                className="w-10 h-10 rounded-md border border-border flex-shrink-0"
                style={{ backgroundColor: theme.typography.text_color }}
              />
              <Input
                value={theme.typography.text_color}
                onChange={(e) => updateTypography({ text_color: e.target.value })}
                placeholder="#FFFFFF"
                className="flex-1 font-mono uppercase"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t('design.textColorDesc')}
            </p>
          </TabsContent>

          {/* Font Tab — global font family */}
          <TabsContent value="font" className="space-y-4">
            <Label className="text-sm font-medium">{t('design.chooseFont')}</Label>
            {/* BRAND.1 — upload affordance + "Your fonts" above the catalog. */}
            <UserFontsSection
              selectedKey={theme.typography.font}
              onSelect={(k) => updateTypography({ font: k })}
            />
            <div className="space-y-1">
              {FONT_OPTIONS.map((font) => (
                <button
                  key={font.value}
                  type="button"
                  onClick={() => updateTypography({ font: font.value as ThemeTypography['font'] })}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-md transition-colors hover:bg-muted/50',
                    theme.typography.font === font.value
                      ? 'bg-[#C9A55C]/10 border border-[#C9A55C]/40'
                      : 'border border-transparent'
                  )}
                >
                  <p className="text-sm font-medium" style={{ fontFamily: font.fontFamily }}>
                    {font.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5" style={{ fontFamily: font.fontFamily }}>
                    The quick brown fox jumps over the lazy dog
                  </p>
                </button>
              ))}
            </div>
          </TabsContent>

          {/* Buttons Tab — GLOBAL button shape (applies to every button). */}
          <TabsContent value="buttons" className="space-y-4">
            <Label className="text-sm font-medium">{t('design.buttonShape') || 'Button shape'}</Label>
            <div className="grid grid-cols-3 gap-2">
              {BUTTON_SHAPES.map(({ key, label }) => {
                const selected = (theme.buttons.shape || 'rounded') === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => updateButtons({ shape: key as ThemeJson['buttons']['shape'] })}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-lg border-2 py-3 transition-all',
                      selected ? 'border-[#C9A55C] bg-[#C9A55C]/10' : 'border-border hover:border-primary/50'
                    )}
                  >
                    <span
                      className="h-4 w-14"
                      style={{ backgroundColor: selected ? '#C9A55C' : 'rgba(255,255,255,0.45)', ...shapeSwatchStyle(key) }}
                    />
                    <span className={cn('text-xs font-semibold', selected ? 'text-[#C9A55C]' : 'text-muted-foreground')}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('design.buttonShapeDesc') || 'Applies to every button on your page. Tap Update to save.'}
            </p>
            <ButtonSurfaceControls theme={effectiveTheme} onPatch={updateButtons} />
          </TabsContent>

        </Tabs>

        {/* Cancel / Save / Reset — mt-auto parks the strip on the bottom edge
            when a tab is short, sticky pins it while a tab scrolls. The negative
            margins escape CardContent's p-6 so the strip spans the card's full
            width and reaches its bottom edge; the matching padding puts the
            buttons back exactly where they were. rounded-b-lg keeps the strip
            inside the card's corner radius. Reset is destructive, so it gets an
            inline confirm (MENU.MAP §2.3 ruling). */}
        <div className="sticky bottom-0 z-10 mt-auto -mx-6 -mb-6 space-y-3 rounded-b-lg border-t border-border px-6 pt-4 pb-6 bg-card">
          <div className="flex gap-3">
            <Button
              type="button"
              onClick={() => onClose?.()}
              className="flex-1 h-12 rounded-xl bg-white/10 text-white border border-white/20 hover:bg-white/20 font-semibold"
            >
              {t('blockEditor.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 h-12 rounded-xl bg-[#C9A55C] text-[#0e0c09] hover:bg-[#C9A55C]/90 font-semibold tracking-wide disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('blockEditor.save')}
            </Button>
          </div>
          {confirmReset ? (
            <div className="rounded-xl border border-[#C9A55C]/40 bg-[#1a160f] px-3 py-3">
              <p className="text-[13px] leading-snug text-white/85">
                {t('design.resetConfirm')}
              </p>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="rounded-md border border-white/20 px-3 py-1.5 text-[13px] font-medium text-white/80 hover:text-white hover:border-white/40 transition-colors"
                >
                  {t('blockEditor.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmReset(false); handleReset(); }}
                  className="rounded-md bg-[#C9A55C] px-3 py-1.5 text-[13px] font-semibold text-[#0e0c09] hover:bg-[#C9A55C]/90 transition-colors"
                >
                  {t('design.resetToDefault')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="w-full text-center text-sm font-semibold tracking-wide text-foreground/80 hover:text-foreground transition-colors py-1"
            >
              {t('design.resetToDefault')}
            </button>
          )}
        </div>
        </CardContent>
      </Card>

    </div>
  );
}
