import { useState, useEffect, useCallback, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Search,
  Image,
  Loader2,
  RefreshCw,
  Wallpaper,
  LayoutTemplate,
  Clock,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyToHeader: (url: string) => void;
  onApplyToBackground: (url: string) => void;
  onCreateNew: (type: 'header' | 'wallpaper') => void;
  isCreating: boolean;
}

// Helper function to fetch Canva designs
async function fetchCanvaDesigns({
  query = '',
  limit = 20,
  continuation = '',
}: {
  query?: string;
  limit?: number;
  continuation?: string;
}): Promise<{
  designs: CanvaDesign[];
  continuation: string | null;
  has_more: boolean;
}> {
  const params = new URLSearchParams();
  if (query) params.set('query', query);
  params.set('limit', String(limit));
  if (continuation) params.set('continuation', continuation);

  const response = await supabase.functions.invoke(
    `canva-list-designs?${params.toString()}`,
    { method: 'GET' }
  );

  if (response.error) {
    throw new Error(response.error.message);
  }

  const result = response.data as {
    designs?: CanvaDesign[];
    continuation?: string | null;
    has_more?: boolean;
  };

  return {
    designs: result.designs || [],
    continuation: result.continuation || null,
    has_more: !!result.has_more,
  };
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function DesignCard({
  design,
  isSelected,
  onClick,
}: {
  design: CanvaDesign;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative rounded-lg border overflow-hidden transition-all text-left w-full',
        'hover:border-primary/50 hover:shadow-md',
        isSelected
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-border'
      )}
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

        {/* Selected indicator */}
        {isSelected && (
          <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
              <svg className="w-4 h-4 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Title */}
      <div className="p-2.5">
        <p className="text-sm font-medium truncate" title={design.title}>
          {design.title}
        </p>
      </div>
    </button>
  );
}

function DetailPanel({
  design,
  onApplyToHeader,
  onApplyToBackground,
  exporting,
  exportProgress,
}: {
  design: CanvaDesign | null;
  onApplyToHeader: () => void;
  onApplyToBackground: () => void;
  exporting: boolean;
  exportProgress: string | null;
}) {
  if (!design) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground">
        <Image className="h-12 w-12 mb-4 opacity-40" />
        <p className="text-sm font-medium">Select a design</p>
        <p className="text-xs mt-1">Click on a design to see options</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Large Preview */}
      <div className="aspect-video bg-muted rounded-lg overflow-hidden border border-border">
        {design.thumbnail_url ? (
          <img
            src={design.thumbnail_url}
            alt={design.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Image className="h-12 w-12 text-muted-foreground/50" />
          </div>
        )}
      </div>

      {/* Details */}
      <div className="mt-4 space-y-3 flex-1">
        <h3 className="font-semibold text-lg leading-tight">{design.title}</h3>
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span>Updated {formatDate(design.updated_at)}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2 pt-4 border-t border-border mt-4">
        {exporting ? (
          <div className="flex items-center justify-center gap-2 py-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{exportProgress || 'Exporting...'}</span>
          </div>
        ) : (
          <>
            <Button
              className="w-full justify-center gap-2"
              onClick={onApplyToBackground}
            >
              <Wallpaper className="h-4 w-4" />
              Use as Background
            </Button>
            <Button
              variant="outline"
              className="w-full justify-center gap-2"
              onClick={onApplyToHeader}
            >
              <LayoutTemplate className="h-4 w-4" />
              Use as Header
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function CanvaDesignPicker({
  open,
  onOpenChange,
  onApplyToHeader,
  onApplyToBackground,
  onCreateNew,
  isCreating,
}: CanvaDesignPickerProps) {
  const [designs, setDesigns] = useState<CanvaDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'recent' | 'search'>('recent');
  const [continuation, setContinuation] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedDesign, setSelectedDesign] = useState<CanvaDesign | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<CanvaDesign[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const loadDesigns = useCallback(async (query = '', reset = true) => {
    if (reset) {
      setLoading(true);
      setError(null);
      if (query) {
        setSearchResults([]);
      } else {
        setDesigns([]);
      }
      setContinuation(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const result = await fetchCanvaDesigns({
        query,
        limit: 20,
        continuation: !reset && continuation ? continuation : '',
      });

      if (query) {
        if (reset) {
          setSearchResults(result.designs);
        } else {
          setSearchResults((prev) => [...prev, ...result.designs]);
        }
        setHasSearched(true);
        setActiveTab('search');
      } else {
        if (reset) {
          setDesigns(result.designs);
        } else {
          setDesigns((prev) => [...prev, ...result.designs]);
        }
      }

      setContinuation(result.continuation);
      setHasMore(result.has_more);
    } catch (err) {
      console.error('Error fetching designs:', err);
      const message = err instanceof Error ? err.message : 'Failed to load designs';
      setError(message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [continuation]);

  useEffect(() => {
    if (open) {
      loadDesigns();
      setSelectedDesign(null);
      setSearchQuery('');
      setHasSearched(false);
      setActiveTab('recent');
      setError(null);
    }
  }, [open]);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      loadDesigns(searchQuery.trim(), true);
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleExportAndApply = async (target: 'header' | 'background') => {
    if (!selectedDesign) return;

    setExporting(true);
    setExportProgress('Starting export...');

    try {
      setExportProgress('Exporting from Canva...');

      const { data, error } = await supabase.functions.invoke('canva-export-design', {
        body: {
          design_id: selectedDesign.id,
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

      onOpenChange(false);
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export design');
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };

  const displayedDesigns = activeTab === 'search' ? searchResults : designs;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] max-h-[700px] p-0 gap-0 flex flex-col">
        {/* Top Bar */}
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">Choose a design</DialogTitle>
          </div>
        </DialogHeader>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Grid */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-border">
            {/* Search Input */}
            <div className="p-4 border-b border-border flex-shrink-0">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search your Canva designs"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyPress}
                    className="pl-9"
                  />
                </div>
                <Button variant="outline" size="icon" onClick={handleSearch}>
                  <Search className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => loadDesigns('', true)}
                  title="Refresh"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as 'recent' | 'search')}
              className="flex-1 flex flex-col min-h-0"
            >
              <TabsList className="mx-4 mt-2 w-fit flex-shrink-0">
                <TabsTrigger value="recent" className="gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Recent
                </TabsTrigger>
                <TabsTrigger value="search" className="gap-1.5" disabled={!hasSearched}>
                  <Search className="h-3.5 w-3.5" />
                  Search results
                </TabsTrigger>
              </TabsList>

              <TabsContent value="recent" className="flex-1 m-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-4">
                    {loading ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {[...Array(6)].map((_, i) => (
                          <div key={i} className="space-y-2">
                            <Skeleton className="aspect-video rounded-lg" />
                            <Skeleton className="h-4 w-3/4" />
                          </div>
                        ))}
                      </div>
                    ) : error ? (
                      <div className="text-center py-12">
                        <AlertCircle className="h-12 w-12 mx-auto mb-3 text-destructive opacity-70" />
                        <p className="text-sm font-medium text-destructive">Failed to load designs</p>
                        <p className="text-xs mt-1 text-muted-foreground max-w-xs mx-auto">{error}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-4"
                          onClick={() => loadDesigns('', true)}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Retry
                        </Button>
                      </div>
                    ) : displayedDesigns.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Image className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm font-medium">No designs found</p>
                        <p className="text-xs mt-1">Create a new design in Canva to get started</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {displayedDesigns.map((design) => (
                          <DesignCard
                            key={design.id}
                            design={design}
                            isSelected={selectedDesign?.id === design.id}
                            onClick={() => setSelectedDesign(design)}
                          />
                        ))}
                      </div>
                    )}

                    {/* Load More */}
                    {hasMore && !loading && (
                      <div className="pt-4 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => loadDesigns(activeTab === 'search' ? searchQuery : '', false)}
                          disabled={loadingMore}
                        >
                          {loadingMore && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                          Load More
                        </Button>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="search" className="flex-1 m-0 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-4">
                    {loading ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {[...Array(6)].map((_, i) => (
                          <div key={i} className="space-y-2">
                            <Skeleton className="aspect-video rounded-lg" />
                            <Skeleton className="h-4 w-3/4" />
                          </div>
                        ))}
                      </div>
                    ) : error ? (
                      <div className="text-center py-12">
                        <AlertCircle className="h-12 w-12 mx-auto mb-3 text-destructive opacity-70" />
                        <p className="text-sm font-medium text-destructive">Search failed</p>
                        <p className="text-xs mt-1 text-muted-foreground max-w-xs mx-auto">{error}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-4"
                          onClick={() => loadDesigns(searchQuery, true)}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Retry
                        </Button>
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm font-medium">No results found</p>
                        <p className="text-xs mt-1">Try a different search term</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {searchResults.map((design) => (
                          <DesignCard
                            key={design.id}
                            design={design}
                            isSelected={selectedDesign?.id === design.id}
                            onClick={() => setSelectedDesign(design)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Panel - Detail */}
          <div className="w-[280px] flex-shrink-0 p-4 bg-muted/30 hidden md:block">
            <DetailPanel
              design={selectedDesign}
              onApplyToHeader={() => handleExportAndApply('header')}
              onApplyToBackground={() => handleExportAndApply('background')}
              exporting={exporting}
              exportProgress={exportProgress}
            />
          </div>
        </div>

        {/* Mobile Bottom Panel */}
        {selectedDesign && (
          <div className="md:hidden border-t border-border p-4 flex-shrink-0 bg-background">
            <div className="flex items-center gap-3">
              <div className="w-16 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                {selectedDesign.thumbnail_url ? (
                  <img
                    src={selectedDesign.thumbnail_url}
                    alt={selectedDesign.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Image className="h-5 w-5 text-muted-foreground/50" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedDesign.title}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {exporting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Button size="sm" onClick={() => handleExportAndApply('background')}>
                      <Wallpaper className="h-4 w-4 mr-1" />
                      Background
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleExportAndApply('header')}>
                      <LayoutTemplate className="h-4 w-4 mr-1" />
                      Header
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
