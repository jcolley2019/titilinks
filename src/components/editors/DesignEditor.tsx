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
import { ThemePreview } from './ThemePreview';
import { TemplateGallery } from './TemplateGallery';
import { CanvaDesignPicker } from './CanvaDesignPicker';

const GRADIENT_PRESETS = [
  { name: 'Midnight', css: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' },
  { name: 'Sunset', css: 'linear-gradient(135deg, #ff6b6b 0%, #feca57 50%, #ff9ff3 100%)' },
  { name: 'Ocean', css: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #6B8DD6 100%)' },
];

// Helper to format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
  const [theme, setTheme] = useState<ThemeJson>(() => getThemeWithDefaults(themeJson));
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
      toast.success('Canva connected successfully!');
      // Clear the URL params
      navigate('/dashboard/editor?tab=design', { replace: true });
    } else if (canvaStatus === 'error') {
      if (message?.toLowerCase().includes('mfa')) {
        setCanvaError('mfa');
      } else {
        toast.error(message || 'Failed to connect Canva');
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
      toast.success('Preset saved!');
      setSavePresetOpen(false);
      setNewPresetName('');
      fetchCustomPresets();
    } catch (error) {
      console.error('Error saving preset:', error);
      toast.error('Failed to save preset');
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
      toast.success('Preset deleted');
      fetchCustomPresets();
    } catch (error) {
      console.error('Error deleting preset:', error);
      toast.error('Failed to delete preset');
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

  const connectToCanva = async () => {
    try {
      // Call the edge function to get the Canva auth URL while we still have the session
      const { data, error } = await supabase.functions.invoke('canva-connect', {
        body: { redirectOrigin: window.location.origin }
      });

      if (error) {
        toast.error(error.message || "Failed to connect to Canva");
        return;
      }

      if (data?.authUrl) {
        // Navigate to Canva at the top-level context
        if (window.top) window.top.location.href = data.authUrl;
        else window.location.href = data.authUrl;
      } else {
        toast.error("No authorization URL received");
      }
    } catch (err) {
      console.error('Error initiating Canva connect:', err);
      toast.error("Failed to initiate Canva connection");
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
        toast.error("Failed to disconnect Canva");
        return;
      }
      
      setCanvaConnected(false);
      toast.success("Canva disconnected");
    } catch (err) {
      console.error('Error disconnecting Canva:', err);
      toast.error("Failed to disconnect Canva");
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
        toast.error(error.message || "Failed to create design");
        return;
      }

      if (data?.code === 'MISSING_SCOPE') {
        setCanvaError('missing_scope');
        return;
      }

      if (data?.edit_url) {
        // Open Canva editor in new tab
        window.open(data.edit_url, '_blank', 'noopener,noreferrer');
        toast.success("Opening Canva editor...");
      } else {
        toast.error("Failed to get design URL from Canva");
      }
    } catch (err) {
      console.error('Error creating Canva design:', err);
      toast.error("Failed to create design in Canva");
    } finally {
      setCreatingDesign(false);
    }
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
          {/* Design Tools Section */}
          <div className="mb-6 pb-6 border-b border-border">
            <Label className="text-sm font-medium mb-3 block">Design Tools</Label>
            <div className="grid grid-cols-2 gap-2">
              {/* Template Gallery Button */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2 h-auto py-3">
                    <LayoutTemplate className="h-4 w-4 text-primary" />
                    <div className="text-left">
                      <div className="text-sm font-medium">Template Gallery</div>
                      <div className="text-xs text-muted-foreground">Browse templates</div>
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

          {/* Canva Studio Section */}
          {canvaConnected && (
              <div className="mb-6 pb-6 border-b border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Image className="h-5 w-5 text-primary" />
                    <Label className="text-sm font-medium">Canva Studio</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-500 border border-green-500/30">
                      <Check className="h-3 w-3" />
                      Connected
                    </span>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={disconnectCanva}
                      title="Disconnect Canva"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Import a Canva design as your header image or background.
                </p>

                {/* Canva Background Preview */}
                {theme.background.source === 'canva' && theme.background.image_url && (
                  <div className="mb-4 p-3 rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Wallpaper className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium">Background</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Canva</span>
                    </div>
                    <div className="flex gap-3">
                      <div className="w-20 h-14 rounded-md overflow-hidden bg-muted flex-shrink-0 border border-border">
                        <img 
                          src={theme.background.image_url} 
                          alt="Background" 
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
                          Replace
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
                          Remove
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
                      <span className="text-xs font-medium">Header</span>
                      {theme.header.source === 'canva' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Canva</span>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <div className="w-20 h-14 rounded-md overflow-hidden bg-muted flex-shrink-0 border border-border">
                        <img 
                          src={theme.header.image_url} 
                          alt="Header" 
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
                          Replace
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
                          Remove
                        </Button>
                      </div>
                    </div>
                    
                    {/* Header Layout Selector */}
                    <div className="mt-3 pt-3 border-t border-border">
                      <Label className="text-xs font-medium mb-2 block">Header Layout</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'overlay' as const, label: 'Overlay', desc: 'Text on image' },
                          { value: 'card' as const, label: 'Card', desc: 'Image in card' },
                          { value: 'split' as const, label: 'Split', desc: 'Storefront style' },
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
                    </div>
                  </div>
                )}
                
                {/* Last Imported from Canva */}
                {theme.canva_last_import && (
                  <div className="mb-4 p-3 rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium">Last imported from Canva</span>
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
                          <span>{formatRelativeTime(theme.canva_last_import.imported_at)}</span>
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
                    ? 'Import another design'
                    : (theme.background.source === 'canva' && theme.background.image_url) || 
                      (theme.header?.enabled && theme.header?.image_url) 
                      ? 'Add another Canva design' 
                      : 'Choose a Canva design'}
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
                            <p className="text-sm font-medium text-destructive">MFA Required</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Your Canva account requires Multi-Factor Authentication.
                            </p>
                          </>
                        ) : canvaError === 'missing_scope' ? (
                          <>
                            <p className="text-sm font-medium text-destructive">Permission Required</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Design creation requires additional permissions.
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
                              Reconnect Canva
                            </Button>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-destructive">Error</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Something went wrong. Please try again.
                            </p>
                          </>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="mt-2 h-7 text-xs"
                          onClick={() => setCanvaError(null)}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

          {/* Quick Start Presets Section */}
          <div className="mb-6 pb-6 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium">Quick Start Presets</Label>
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
                My Saved Presets
              </Label>
              <Dialog open={savePresetOpen} onOpenChange={setSavePresetOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 h-7 text-xs">
                    <Plus className="h-3 w-3" />
                    Save Current
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[400px]">
                  <DialogHeader>
                    <DialogTitle>Save Theme Preset</DialogTitle>
                    <DialogDescription>
                      Save your current theme settings as a reusable preset.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <Label htmlFor="preset-name" className="text-sm font-medium">
                      Preset Name
                    </Label>
                    <Input
                      id="preset-name"
                      value={newPresetName}
                      onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder="e.g., My Brand Theme"
                      className="mt-2"
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setSavePresetOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={saveCustomPreset}
                      disabled={!newPresetName.trim() || savingPreset}
                    >
                      {savingPreset ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Save Preset
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
                No saved presets yet. Customize your theme and save it!
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
                  <Label className="text-sm font-medium">Microinteractions</Label>
                  <p className="text-xs text-muted-foreground">Hover lift & press animations</p>
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
              Users with "reduce motion" enabled in their device settings will not see animations regardless of this setting.
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
                  <Label className="text-sm font-medium">Match styles to background</Label>
                  <p className="text-xs text-muted-foreground">Auto-adjust colors for readability</p>
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
              When enabled, automatically adjusts overlay opacity and text color for better readability on image backgrounds.
            </p>
          </div>

          {/* Canva Integration Section */}
          <div className="mb-6 pb-6 border-b border-border">
            <div className="flex items-center gap-2 mb-3">
              <Image className="h-4 w-4 text-primary" />
              <Label className="text-sm font-medium">Canva Design</Label>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Create custom headers and backgrounds using Canva's design tools.
            </p>
            
            {canvaLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : canvaConnected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <Check className="h-4 w-4" />
                  <span>Connected to Canva</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => toast.info('Design picker coming soon!')}
                >
                  <Image className="h-4 w-4" />
                  Choose Design
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => navigate('/api/canva/connect')}
              >
                <Image className="h-4 w-4" />
                Connect Canva
              </Button>
            )}
          </div>

          {/* Canva MFA Error Panel */}
          {canvaError === 'mfa' && (
            <div className="mb-6 pb-6 border-b border-border">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Canva requires MFA to be enabled
                    </p>
                    <p className="text-xs text-muted-foreground">
                      In Canva: Settings → Login → set a password (if needed), then enable MFA (Login verification).
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Return here and try again once enabled.
                    </p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={connectToCanva}
                  className="w-full gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
              </div>
            </div>
          )}

          {/* Canva Setup Help Panel */}
          <Collapsible className="mb-6 pb-6 border-b border-border">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium cursor-pointer text-muted-foreground">Canva Setup Help</Label>
                </div>
                <span className="text-xs text-muted-foreground">Click to expand</span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4 text-sm">
                <p className="font-medium text-foreground">Connect Canva to design custom headers and wallpapers:</p>
                
                <ol className="list-decimal list-inside space-y-3 text-muted-foreground">
                  <li>
                    In{' '}
                    <a 
                      href="https://www.canva.com/developers/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      Canva Developer Portal
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    , create a <strong className="text-foreground">Canva Connect</strong> integration under <strong className="text-foreground">"Your integrations"</strong>
                  </li>
                  <li>
                    Add redirect URL:{' '}
                    <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono text-foreground">
                      https://titilinks.lovable.app/api/canva/callback
                    </code>
                  </li>
                  <li>
                    Enable scopes:{' '}
                    <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono text-foreground">design:meta:read</code>
                    {' '}and{' '}
                    <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono text-foreground">design:content:read</code>
                  </li>
                  <li>
                    Copy <strong className="text-foreground">Client ID</strong> and <strong className="text-foreground">Client Secret</strong> into Lovable environment variables
                  </li>
                </ol>

                <div className="mt-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    <strong>Note:</strong> The Canva "Your apps" → Code upload screen is for Apps SDK and is <em>not</em> used for this feature. Use "Your integrations" instead.
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

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
