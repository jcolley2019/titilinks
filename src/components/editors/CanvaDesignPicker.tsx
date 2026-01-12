import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Image, 
  Loader2, 
  RefreshCw, 
  Check, 
  X,
  Wallpaper,
  LayoutTemplate,
  Plus
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CanvaDesign {
  id: string;
  title: string;
  thumbnail_url: string | null;
  edit_url: string | null;
  view_url: string | null;
  created_at: string;
  updated_at: string;
}

interface CanvaDesignPickerProps {
  onApplyToHeader: (url: string) => void;
  onApplyToBackground: (url: string) => void;
  onCreateNew: (type: 'header' | 'wallpaper') => void;
  isCreating: boolean;
}

export function CanvaDesignPicker({ 
  onApplyToHeader, 
  onApplyToBackground, 
  onCreateNew,
  isCreating 
}: CanvaDesignPickerProps) {
  const [designs, setDesigns] = useState<CanvaDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [continuation, setContinuation] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedDesign, setSelectedDesign] = useState<CanvaDesign | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);

  const fetchDesigns = useCallback(async (query = '', reset = true) => {
    if (reset) {
      setLoading(true);
      setDesigns([]);
      setContinuation(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const params = new URLSearchParams();
      if (query) params.set('query', query);
      params.set('limit', '20');
      if (!reset && continuation) params.set('continuation', continuation);

      const { data, error } = await supabase.functions.invoke('canva-list-designs', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        body: null,
      });

      // Note: invoke doesn't support query params directly, so we need to use a different approach
      const response = await supabase.functions.invoke(`canva-list-designs?${params.toString()}`);

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data;
      
      if (reset) {
        setDesigns(result.designs || []);
      } else {
        setDesigns(prev => [...prev, ...(result.designs || [])]);
      }
      
      setContinuation(result.continuation);
      setHasMore(result.has_more);
    } catch (err) {
      console.error('Error fetching designs:', err);
      toast.error('Failed to load Canva designs');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [continuation]);

  useEffect(() => {
    fetchDesigns();
  }, []);

  const handleSearch = () => {
    fetchDesigns(searchQuery, true);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleExportAndApply = async (design: CanvaDesign, target: 'header' | 'background') => {
    setSelectedDesign(design);
    setExporting(true);
    setExportProgress('Starting export...');

    try {
      setExportProgress('Exporting from Canva...');
      
      const { data, error } = await supabase.functions.invoke('canva-export-design', {
        body: {
          design_id: design.id,
          format: 'png',
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data?.url) {
        throw new Error('No URL returned from export');
      }

      setExportProgress('Applying to profile...');

      if (target === 'header') {
        onApplyToHeader(data.url);
        toast.success('Header image applied!');
      } else {
        onApplyToBackground(data.url);
        toast.success('Background image applied!');
      }
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export design');
    } finally {
      setExporting(false);
      setExportProgress(null);
      setSelectedDesign(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Create New Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="h-auto py-3 justify-start gap-2"
          onClick={() => onCreateNew('header')}
          disabled={isCreating}
        >
          {isCreating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LayoutTemplate className="h-4 w-4 text-primary" />
          )}
          <div className="text-left">
            <div className="text-sm font-medium">New Header</div>
            <div className="text-xs text-muted-foreground">1200×400px</div>
          </div>
        </Button>
        <Button
          variant="outline"
          className="h-auto py-3 justify-start gap-2"
          onClick={() => onCreateNew('wallpaper')}
          disabled={isCreating}
        >
          {isCreating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wallpaper className="h-4 w-4 text-primary" />
          )}
          <div className="text-left">
            <div className="text-sm font-medium">New Wallpaper</div>
            <div className="text-xs text-muted-foreground">1080×1920px</div>
          </div>
        </Button>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search your designs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyPress}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="icon" onClick={handleSearch}>
          <Search className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={() => fetchDesigns('', true)}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Export Progress Overlay */}
      {exporting && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card border border-border rounded-lg p-6 shadow-lg max-w-sm w-full mx-4 text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-sm font-medium">{exportProgress}</p>
            <p className="text-xs text-muted-foreground">This may take a few seconds...</p>
          </div>
        </div>
      )}

      {/* Designs Grid */}
      <ScrollArea className="h-[300px]">
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="aspect-video rounded-lg" />
            ))}
          </div>
        ) : designs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Image className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No designs found</p>
            <p className="text-xs mt-1">Create a new design in Canva to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pr-4">
            {designs.map((design) => (
              <div
                key={design.id}
                className="group relative rounded-lg border border-border overflow-hidden hover:border-primary/50 transition-all"
              >
                {/* Thumbnail */}
                <div className="aspect-video bg-muted relative">
                  {design.thumbnail_url ? (
                    <img
                      src={design.thumbnail_url}
                      alt={design.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                  )}
                  
                  {/* Hover Actions */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 text-xs"
                      onClick={() => handleExportAndApply(design, 'header')}
                      disabled={exporting}
                    >
                      <LayoutTemplate className="h-3 w-3 mr-1" />
                      Header
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 text-xs"
                      onClick={() => handleExportAndApply(design, 'background')}
                      disabled={exporting}
                    >
                      <Wallpaper className="h-3 w-3 mr-1" />
                      Background
                    </Button>
                  </div>
                </div>

                {/* Title */}
                <div className="p-2">
                  <p className="text-xs font-medium truncate" title={design.title}>
                    {design.title}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load More */}
        {hasMore && !loading && (
          <div className="pt-4 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchDesigns(searchQuery, false)}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Load More
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
