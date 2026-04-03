import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Palette, Type, MousePointer, Save, Loader2, Upload, X, Check, Plus, Trash2, Bookmark, Sparkles, LayoutTemplate, HelpCircle, ExternalLink, AlertTriangle, RefreshCw, Image, Wallpaper, Clock } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { getThemeWithDefaults, THEME_PRESETS, type ThemeJson } from '@/lib/theme-defaults';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { ThemePreview } from './ThemePreview';
import { TemplateGallery } from './TemplateGallery';
import { CanvaDesignPicker } from './CanvaDesignPicker';

const GRADIENT_PRESETS = [
  { name: 'Midnight', css: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' },
  { name: 'Sunset', css: 'linear-gradient(135deg, #ff6b6b 0%, #feca57 50%, #ff9ff3 100%)' },
  { name: 'Ocean', css: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #6B8DD6 100%)' },
];

// Helper to format relative time
function formatRelativeTime(dateString: string, t: (key: string) => string, language: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('design.timeJustNow');
  if (diffMins < 60) return `${diffMins}${t('design.timeMinsAgo')}`;
  if (diffHours < 24) return `${diffHours}${t('design.timeHoursAgo')}`;
  if (diffDays < 7) return `${diffDays}${t('design.timeDaysAgo')}`;

  return date.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric' });
}

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
  const { t, language } = useLanguage();
  const [theme, setTheme] = useState<ThemeJson>(() => getThemeWithDefaults(themeJson));
  const currentPageStyle = (theme as any).pageStyle || 'classic';
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('background');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Custom presets state
  const [customPresets, setCustomPresets] = useState<Array<{ id: string; name: string; theme_json: unknown }>>([]);
  const [loadingPresets, setLoadingPresets] = useState(true);
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [savingPreset, setSavingPreset] = useState(false);

  // Canva connection state
  const [canvaError, setCanvaError] = useState<'mfa' | 'generic' | 'missing_scope' | null>(null);
  const [canvaConnected, setCanvaConnected] = useState(false);
  const [canvaLoading, setCanvaLoading] = useState(true);
  const [creatingDesign, setCreatingDesign] = useState(false);
  const [showCanvaPicker, setShowCanvaPicker] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Check Canva connection status on mount and handle callback params
  useEffect(() => {
    const checkCanvaConnection = async () => {
      if (!user) {
        setCanvaLoading(false);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('canva_connections')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (error) {
          console.error('Error checking Canva connection:', error);
        }
        
        setCanvaConnected(!!data);
      } catch (error) {
        console.error('Error checking Canva connection:', error);
      } finally {
        setCanvaLoading(false);
      }
    };

    checkCanvaConnection();

    // Handle callback params
    const canvaStatus = searchParams.get('canva');
    const message = searchParams.get('message');
    
    if (canvaStatus === 'connected') {
      setCanvaConnected(true);
      toast.success(t('design.canvaConnected'));
      // Clear the URL params
      navigate('/dashboard/editor?tab=design', { replace: true });
    } else if (canvaStatus === 'error') {
      if (message?.toLowerCase().includes('mfa')) {
        setCanvaError('mfa');
      } else {
        toast.error(message || t('design.canvaConnectFailed'));
      }
      navigate('/dashboard/editor?tab=design', { replace: true });
    }
  }, [user, searchParams, navigate]);

  // Fetch custom presets
  const fetchCustomPresets = async () => {
    if (!user) return;
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
          theme_json: JSON.parse(JSON.stringify(theme)),
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
      const { error } = await supabase
        .from('pages')
        .update({ theme_json: JSON.parse(JSON.stringify(newTheme)) })
        .eq('id', pageId);

      if (error) throw error;
      toast.success(t('design.designSaved'));
      onUpdate();
    } catch (error) {
      console.error('Error saving theme:', error);
      toast.error(t('design.designSaveFailed'));
    }
  };

  const savePageStyle = async (newStyle: string) => {
    try {
      const updatedTheme = {
        ...theme,
        pageStyle: newStyle,
      };
      const { error } = await supabase
        .from('pages')
        .update({
          theme_json: JSON.parse(JSON.stringify(updatedTheme))
        })
        .eq('id', pageId);
      if (error) throw error;
      setTheme(updatedTheme as ThemeJson);
      toast.success(t('design.designSaved'));
      onUpdate();
    } catch (error) {
      console.error('Error saving page style:', error);
      toast.error(t('design.designSaveFailed'));
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('design.imgSizeError'));
      return;
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error(t('design.imgTypeError'));
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
      toast.success(t('design.bgImageUploaded'));
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(t('design.bgUploadFailed'));
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

  const connectToCanva = async () => {
    try {
      // Call the edge function to get the Canva auth URL while we still have the session
      const { data, error } = await supabase.functions.invoke('canva-connect', {
        body: { redirectOrigin: window.location.origin }
      });

      if (error) {
        toast.error(error.message || t('design.canvaConnectFailed'));
        return;
      }

      if (data?.authUrl) {
        // Navigate to Canva at the top-level context
        if (window.top) window.top.location.href = data.authUrl;
        else window.location.href = data.authUrl;
      } else {
        toast.error(t('design.canvaNoAuthUrl'));
      }
    } catch (err) {
      console.error('Error initiating Canva connect:', err);
      toast.error(t('design.canvaConnectInitFailed'));
    }
  };

  const disconnectCanva = async () => {
    if (!user) return;
    
    try {
      const { error } = await supabase
        .from('canva_connections')
        .delete()
        .eq('user_id', user.id);
      
      if (error) {
        toast.error(t('design.canvaDisconnectFailed'));
        return;
      }

      setCanvaConnected(false);
      toast.success(t('design.canvaDisconnected'));
    } catch (err) {
      console.error('Error disconnecting Canva:', err);
      toast.error(t('design.canvaDisconnectFailed'));
    }
  };

  const createDesignInCanva = async (designType: 'header' | 'wallpaper') => {
    setCreatingDesign(true);
    setCanvaError(null);
    
    try {
      const dimensions = designType === 'header' 
        ? { width: 1200, height: 400, title: 'Profile Header' }
        : { width: 1080, height: 1920, title: 'Profile Wallpaper' };
      
      const { data, error } = await supabase.functions.invoke('canva-create-design', {
        body: dimensions
      });

      if (error) {
        console.error('Canva create design error:', error);
        toast.error(error.message || t('design.canvaCreateFailed'));
        return;
      }

      if (data?.code === 'MISSING_SCOPE') {
        setCanvaError('missing_scope');
        return;
      }

      if (data?.edit_url) {
        // Open Canva editor in new tab
        window.open(data.edit_url, '_blank', 'noopener,noreferrer');
        toast.success(t('design.canvaOpeningEditor'));
      } else {
        toast.error(t('design.canvaDesignUrlFailed'));
      }
    } catch (err) {
      console.error('Error creating Canva design:', err);
      toast.error(t('design.canvaCreateFailed'));
    } finally {
      setCreatingDesign(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Controls Panel */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            {t('design.title')}
          </CardTitle>
          <Button onClick={handleSave} disabled={saving} size="sm" className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('design.save')}
          </Button>
        </CardHeader>
        <CardContent>
          {/* Page Style Picker */}
          <div className="mb-6 pb-6 border-b border-border">
            <Label className="text-sm font-medium mb-3 block flex items-center gap-2">
              <LayoutTemplate className="h-4 w-4 text-primary" />
              {t('design.pageStyle') || 'Page Style'}
            </Label>
            <p className="text-xs text-muted-foreground mb-3">
              {t('design.pageStyleDesc') || 'Choose how your profile page looks to visitors'}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  value: 'classic',
                  label: t('design.styleClassic') || 'Classic',
                  desc: t('design.styleClassicDesc') || 'Circle avatar, centered layout',
                  preview: (
                    <div className="flex flex-col items-center gap-1 p-2">
                      <div className="w-8 h-8 rounded-full bg-white/20" />
                      <div className="w-12 h-1.5 rounded bg-white/20" />
                      <div className="w-10 h-1 rounded bg-white/10" />
                    </div>
                  )
                },
                {
                  value: 'hero',
                  label: t('design.styleHero') || 'Hero',
                  desc: t('design.styleHeroDesc') || 'Full-width photo with name overlay',
                  preview: (
                    <div className="relative h-12 w-full rounded overflow-hidden bg-white/10">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-1 left-0 right-0 flex flex-col items-center">
                        <div className="w-10 h-1.5 rounded bg-white/60" />
                      </div>
                    </div>
                  )
                },
                {
                  value: 'full_bleed',
                  label: t('design.styleFullBleed') || 'Full Bleed',
                  desc: t('design.styleFullBleedDesc') || 'Immersive full-screen photo',
                  preview: (
                    <div className="relative h-12 w-full rounded overflow-hidden bg-white/10">
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/80" />
                      <div className="absolute bottom-1 left-0 right-0 flex flex-col items-center gap-0.5">
                        <div className="w-12 h-1.5 rounded bg-white/80" />
                        <div className="w-8 h-1 rounded bg-white/40" />
                      </div>
                    </div>
                  )
                },
              ].map((style) => (
                <button
                  key={style.value}
                  type="button"
                  onClick={() => savePageStyle(style.value)}
                  className={cn(
                    'flex flex-col rounded-xl border-2 overflow-hidden transition-all text-left',
                    currentPageStyle === style.value
                      ? 'border-[#C9A55C] bg-[#C9A55C]/5'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  {style.preview}
                  <div className="p-2">
                    <div className={cn(
                      'text-xs font-semibold',
                      currentPageStyle === style.value ? 'text-[#C9A55C]' : 'text-foreground'
                    )}>
                      {style.label}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                      {style.desc}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Design Tools Section */}
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

              {/* Canva Loading */}
              {canvaLoading && (
                <Button variant="outline" className="w-full justify-start gap-2 h-auto py-3" disabled>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <div className="text-left min-w-0">
                    <div className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
                      {t('design.canvaStudio')}
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap" style={{ background: 'hsl(43 65% 55% / 0.15)', border: '1px solid hsl(43 65% 55% / 0.3)', color: 'hsl(43 65% 55%)' }}>{t('design.comingSoon')}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{t('design.checking')}</div>
                  </div>
                </Button>
              )}

              {/* Canva Connected - Opens Picker */}
              {canvaConnected && (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 h-auto py-3"
                  onClick={() => setShowCanvaPicker(true)}
                >
                  <Image className="h-4 w-4 text-primary" />
                  <div className="text-left min-w-0">
                    <div className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
                      {t('design.canvaStudio')}
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[10px] font-medium bg-green-500/20 text-green-500">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap" style={{ background: 'hsl(43 65% 55% / 0.15)', border: '1px solid hsl(43 65% 55% / 0.3)', color: 'hsl(43 65% 55%)' }}>{t('design.comingSoon')}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{t('design.importDesigns')}</div>
                  </div>
                </Button>
              )}

              {/* Canva Connect Button - Not connected */}
              {!canvaConnected && !canvaLoading && (
                <div className="flex flex-col">
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 h-auto py-3"
                    onClick={connectToCanva}
                  >
                    <Image className="h-4 w-4 text-primary" />
                    <div className="text-left min-w-0">
                      <div className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
                        {t('design.canvaStudio')}
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap" style={{ background: 'hsl(43 65% 55% / 0.15)', border: '1px solid hsl(43 65% 55% / 0.3)', color: 'hsl(43 65% 55%)' }}>{t('design.comingSoon')}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{t('design.connectToImport')}</div>
                    </div>
                  </Button>

                  {/* Canva Setup Help - Below the button */}
                  <Collapsible className="mt-2">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-start p-0 h-auto hover:bg-transparent text-xs">
                        <div className="flex items-center gap-1.5">
                          <HelpCircle className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground text-[11px]">{t('design.canvaSetupHelp')}</span>
                        </div>
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3 text-xs">
                        <p className="font-medium text-foreground">{t('design.canvaSetupIntro')}</p>

                        <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                          <li>
                            {t('design.canvaStep1Prefix')}{' '}
                            <a
                              href="https://www.canva.com/developers/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-0.5"
                            >
                              {t('design.canvaDeveloperPortal')}
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                            , {t('design.canvaStep1Create')} <strong className="text-foreground">{t('design.canvaConnect')}</strong> {t('design.canvaStep1Suffix')}
                          </li>
                          <li>
                            {t('design.canvaStep2')}{' '}
                            <code className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono text-foreground">
                              https://titilinks.lovable.app/api/canva/callback
                            </code>
                          </li>
                          <li>
                            {t('design.canvaStep3')}{' '}
                            <code className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono text-foreground">design:meta:read</code>
                            {' '}{t('design.canvaStep3And')}{' '}
                            <code className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono text-foreground">design:content:read</code>
                          </li>
                          <li>
                            {t('design.canvaStep4Copy')} <strong className="text-foreground">{t('design.canvaClientId')}</strong> {t('design.canvaStep3And')} <strong className="text-foreground">{t('design.canvaClientSecret')}</strong> {t('design.canvaStep4Suffix')}
                          </li>
                        </ol>

                        <div className="p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                          <p className="text-[10px] text-amber-600 dark:text-amber-400">
                            <strong>{t('design.noteLabel')}</strong> {t('design.canvaNote')}
                          </p>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              )}
            </div>

            {/* Canva MFA Error - Show inline */}
            {canvaError === 'mfa' && (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-foreground">{t('design.mfaRequired')}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {t('design.mfaDesc')}
                    </p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={connectToCanva}
                  className="w-full h-7 text-xs gap-1.5"
                >
                  <RefreshCw className="h-3 w-3" />
                  {t('design.retry')}
                </Button>
              </div>
            )}
          </div>

          {/* Canva Studio Section - Only show when connected and has content */}
          {canvaConnected && (
            (theme.background.source === 'canva' || theme.header?.source === 'canva' || theme.canva_last_import) && (
              <div className="mb-6 pb-6 border-b border-border">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <Image className="h-4 w-4 text-primary flex-shrink-0" />
                    <Label className="text-sm font-medium">{t('design.canvaImports')}</Label>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap" style={{ background: 'hsl(43 65% 55% / 0.15)', border: '1px solid hsl(43 65% 55% / 0.3)', color: 'hsl(43 65% 55%)' }}>{t('design.comingSoon')}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                    onClick={disconnectCanva}
                  >
                    {t('design.disconnect')}
                  </Button>
                </div>

                {/* Canva Background Preview */}
                {theme.background.source === 'canva' && theme.background.image_url && (
                  <div className="mb-4 p-3 rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Wallpaper className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium">{t('design.background')}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Canva</span>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-20 h-14 rounded-md overflow-hidden bg-muted flex-shrink-0 border border-border">
                        <img 
                          src={theme.background.image_url} 
                          alt={t('design.background')} 
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 flex-1">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-7 text-xs justify-start gap-1.5"
                          onClick={() => setShowCanvaPicker(true)}
                        >
                          <RefreshCw className="h-3 w-3" />
                          {t('design.replace')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs justify-start gap-1.5 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            // Revert to solid color, clear image and source
                            updateBackground({
                              type: 'solid',
                              image_url: '',
                              source: null
                            }, true);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                          {t('design.remove')}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Canva Header Preview */}
                {theme.header?.enabled && theme.header?.image_url && (
                  <div className="mb-4 p-3 rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium">{t('design.header')}</span>
                      {theme.header.source === 'canva' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Canva</span>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <div className="w-20 h-14 rounded-md overflow-hidden bg-muted flex-shrink-0 border border-border">
                        <img 
                          src={theme.header.image_url} 
                          alt={t('design.header')} 
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 flex-1">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-7 text-xs justify-start gap-1.5"
                          onClick={() => setShowCanvaPicker(true)}
                        >
                          <RefreshCw className="h-3 w-3" />
                          {t('design.replace')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs justify-start gap-1.5 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            // Disable header and clear image/source
                            updateHeader({
                              enabled: false,
                              image_url: '',
                              source: null
                            }, true);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                          {t('design.remove')}
                        </Button>
                      </div>
                    </div>
                    
                    {/* Header Layout Selector */}
                    <div className="mt-3 pt-3 border-t border-border">
                      <Label className="text-xs font-medium mb-2 block">{t('design.headerLayout')}</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'overlay' as const, label: t('design.layoutOverlay'), desc: t('design.layoutOverlayDesc') },
                          { value: 'card' as const, label: t('design.layoutCard'), desc: t('design.layoutCardDesc') },
                          { value: 'split' as const, label: t('design.layoutSplit'), desc: t('design.layoutSplitDesc') },
                          { value: 'cinematic' as const, label: t('design.layoutCinematic'), desc: t('design.layoutCinematicDesc') },
                          { value: 'immersive' as const, label: t('design.layoutImmersive'), desc: t('design.layoutImmersiveDesc') },
                        ].map((layout) => (
                          <button
                            key={layout.value}
                            type="button"
                            onClick={() => updateHeader({ layout: layout.value }, true)}
                            className={cn(
                              'p-2 rounded-lg border text-center transition-all',
                              (theme.header?.layout || 'overlay') === layout.value
                                ? 'border-primary bg-primary/10'
                                : 'border-border hover:border-primary/50'
                            )}
                          >
                            <div className="text-xs font-medium">{layout.label}</div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">{layout.desc}</div>
                          </button>
                        ))}
                      </div>

                      {/* Online Indicator toggle — only for immersive layout */}
                      {(theme.header?.layout === 'immersive') && (
                        <div className="mt-3 flex items-center justify-between">
                          <Label className="text-xs font-medium">{t('design.onlineIndicator')}</Label>
                          <button
                            type="button"
                            onClick={() => {
                              setTheme((prev) => {
                                const newTheme = { ...prev, online_indicator: !prev.online_indicator };
                                saveTheme(newTheme);
                                return newTheme;
                              });
                            }}
                            className={cn(
                              'relative w-9 h-5 rounded-full transition-colors',
                              theme.online_indicator ? 'bg-green-500' : 'bg-muted'
                            )}
                          >
                            <span className={cn(
                              'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                              theme.online_indicator && 'translate-x-4'
                            )} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Last Imported from Canva */}
                {theme.canva_last_import && (
                  <div className="mb-4 p-3 rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium">{t('design.lastImportedCanva')}</span>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-16 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0 border border-border">
                        {theme.canva_last_import.thumbnail_url ? (
                          <img 
                            src={theme.canva_last_import.thumbnail_url} 
                            alt={theme.canva_last_import.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Image className="h-4 w-4 text-muted-foreground/50" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" title={theme.canva_last_import.title}>
                          {theme.canva_last_import.title}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span className="capitalize">{theme.canva_last_import.target}</span>
                          <span>•</span>
                          <span>{formatRelativeTime(theme.canva_last_import.imported_at, t, language)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                <Button 
                  variant="outline" 
                  className="w-full justify-center gap-2"
                  onClick={() => setShowCanvaPicker(true)}
                >
                  <Image className="h-4 w-4" />
                  {theme.canva_last_import
                    ? t('design.importAnother')
                    : (theme.background.source === 'canva' && theme.background.image_url) ||
                      (theme.header?.enabled && theme.header?.image_url)
                      ? t('design.addAnotherCanva')
                      : t('design.chooseCanvaDesign')}
                </Button>
                
                <CanvaDesignPicker
                  open={showCanvaPicker}
                  onOpenChange={setShowCanvaPicker}
                  onApplyToHeader={(result) => {
                    // Update header with the Canva design
                    updateHeader({ 
                      image_url: result.url, 
                      enabled: true,
                      source: 'canva' 
                    }, false);
                    // Store import metadata and save
                    setTheme(prev => {
                      const newTheme = {
                        ...prev,
                        canva_last_import: {
                          design_id: result.design_id,
                          title: result.title,
                          thumbnail_url: result.thumbnail_url,
                          target: 'header' as const,
                          imported_at: new Date().toISOString(),
                        },
                      };
                      saveTheme(newTheme);
                      return newTheme;
                    });
                  }}
                  onApplyToBackground={(result) => {
                    // Update background type to image, set URL and source
                    updateBackground({ 
                      type: 'image',
                      image_url: result.url, 
                      source: 'canva' 
                    }, false);
                    // Store import metadata and save
                    setTheme(prev => {
                      const newTheme = {
                        ...prev,
                        canva_last_import: {
                          design_id: result.design_id,
                          title: result.title,
                          thumbnail_url: result.thumbnail_url,
                          target: 'background' as const,
                          imported_at: new Date().toISOString(),
                        },
                      };
                      saveTheme(newTheme);
                      return newTheme;
                    });
                  }}
                  onCreateNew={createDesignInCanva}
                  isCreating={creatingDesign}
                />

                {/* Canva Error Display */}
                {canvaError && (
                  <div className="mt-3 p-3 rounded-lg border border-destructive/50 bg-destructive/10">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                      <div className="flex-1">
                        {canvaError === 'mfa' ? (
                          <>
                            <p className="text-sm font-medium text-destructive">{t('design.canvaErrorMfa')}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {t('design.canvaErrorMfaDesc')}
                            </p>
                          </>
                        ) : canvaError === 'missing_scope' ? (
                          <>
                            <p className="text-sm font-medium text-destructive">{t('design.canvaErrorPermission')}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {t('design.canvaErrorPermissionDesc')}
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2 h-7 text-xs"
                              onClick={() => {
                                setCanvaError(null);
                                disconnectCanva();
                              }}
                            >
                              {t('design.reconnectCanva')}
                            </Button>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-destructive">{t('design.canvaErrorGeneric')}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {t('design.canvaErrorGenericDesc')}
                            </p>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 h-7 text-xs"
                          onClick={() => setCanvaError(null)}
                        >
                          {t('design.dismiss')}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          )}

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
                  onClick={() => setTheme(preset.theme)}
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

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="background" className="gap-2">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">{t('design.tabBackground')}</span>
            </TabsTrigger>
            <TabsTrigger value="buttons" className="gap-2">
              <MousePointer className="h-4 w-4" />
              <span className="hidden sm:inline">{t('design.tabButtons')}</span>
            </TabsTrigger>
            <TabsTrigger value="typography" className="gap-2">
              <Type className="h-4 w-4" />
              <span className="hidden sm:inline">{t('design.tabTypography')}</span>
            </TabsTrigger>
          </TabsList>

          {/* Background Tab */}
          <TabsContent value="background" className="space-y-4">
            <div className="space-y-2">
              <Label>{t('design.backgroundType')}</Label>
              <Select
                value={theme.background.type}
                onValueChange={(v) => updateBackground({ type: v as 'solid' | 'gradient' | 'image' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">{t('design.solidColor')}</SelectItem>
                  <SelectItem value="gradient">{t('design.gradient')}</SelectItem>
                  <SelectItem value="image">{t('design.image')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {theme.background.type === 'solid' && (
              <div className="space-y-2">
                <Label>{t('design.solidColor')}</Label>
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
                <Label>{t('design.choosePresetGradient')}</Label>
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
                        {t(`design.gradient${preset.name}`)}
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
                <Label>{t('design.backgroundImage')}</Label>
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
                    {uploading ? t('design.uploading') : t('design.uploadImage')}
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  {t('design.uploadNote')}
                </p>
              </div>
            )}

            {/* Overlay Controls - shown for all background types */}
            <div className="pt-4 border-t border-border space-y-3">
              <Label className="text-muted-foreground">{t('design.overlaySettings')}</Label>
              <div className="space-y-2">
                <Label>{t('design.overlayColor')}</Label>
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
                <Label>{t('design.overlayOpacity')} {Math.round(theme.background.overlay_opacity * 100)}%</Label>
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
                <Label className="text-muted-foreground mb-2 block">{t('design.preview')}</Label>
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
                      {t('design.yourContentHere')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Buttons Tab */}
          <TabsContent value="buttons" className="space-y-4">
            <div className="space-y-2">
              <Label>{t('design.buttonShape')}</Label>
              <Select
                value={theme.buttons.shape}
                onValueChange={(v) => updateButtons({ shape: v as 'pill' | 'rounded' | 'square' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pill">{t('design.pill')}</SelectItem>
                  <SelectItem value="rounded">{t('design.rounded')}</SelectItem>
                  <SelectItem value="square">{t('design.square')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('design.fillColor')}</Label>
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
              <Label>{t('design.textColor')}</Label>
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
              <Label>{t('design.enableBorder')}</Label>
              <Switch
                checked={theme.buttons.border_enabled}
                onCheckedChange={(v) => updateButtons({ border_enabled: v })}
              />
            </div>

            {theme.buttons.border_enabled && (
              <div className="space-y-2">
                <Label>{t('design.borderColor')}</Label>
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
              <Label>{t('design.enableShadow')}</Label>
              <Switch
                checked={theme.buttons.shadow_enabled}
                onCheckedChange={(v) => updateButtons({ shadow_enabled: v })}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('design.density')}</Label>
              <Select
                value={theme.buttons.density}
                onValueChange={(v) => updateButtons({ density: v as 'compact' | 'normal' | 'roomy' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">{t('design.compact')}</SelectItem>
                  <SelectItem value="normal">{t('design.normal')}</SelectItem>
                  <SelectItem value="roomy">{t('design.roomy')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Button Preview */}
            <div className="pt-4 border-t border-border">
              <Label className="text-muted-foreground mb-3 block">{t('design.preview')}</Label>
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
                {t('design.sampleButton')}
              </button>
            </div>
          </TabsContent>

          {/* Typography Tab */}
          <TabsContent value="typography" className="space-y-4">
            <div className="space-y-2">
              <Label>{t('design.fontFamily')}</Label>
              <Select
                value={theme.typography.font}
                onValueChange={(v) => updateTypography({ font: v as 'inter' | 'system' | 'serif' | 'mono' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inter">Inter</SelectItem>
                  <SelectItem value="system">{t('design.systemDefault')}</SelectItem>
                  <SelectItem value="serif">{t('design.serif')}</SelectItem>
                  <SelectItem value="mono">{t('design.monospace')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('design.textColor')}</Label>
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
              <Label className="text-muted-foreground mb-3 block">{t('design.preview')}</Label>
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
                <h3 className="text-xl font-bold mb-2">{t('design.sampleHeading')}</h3>
                <p className="text-sm opacity-80">{t('design.sampleText')}</p>
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
            <CardTitle className="text-lg font-medium text-foreground">{t('design.livePreview')}</CardTitle>
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
