import { useState, useEffect, useCallback, useRef, type KeyboardEvent } from 'react';
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
  CheckCircle2,
  XCircle,
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

interface CanvaImportResult {
  url: string;
  design_id: string;
  title: string;
  thumbnail_url: string | null;
}

interface CanvaDesignPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyToHeader: (result: CanvaImportResult) => void;
  onApplyToBackground: (result: CanvaImportResult) => void;
  onCreateNew: (type: 'header' | 'wallpaper') => void;
  isCreating: boolean;
}

// Custom hook for debouncing
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Helper function to fetch Canva designs
async function fetchCanvaDesigns({
  query = '',
  limit = 20,
  continuation = '',
  signal,
}: {
  query?: string;
  limit?: number;
  continuation?: string;
  signal?: AbortSignal;
}): Promise<{
  designs: CanvaDesign[];
  continuation: string | null;
  has_more: boolean;
}> {
  // Check if already aborted
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const params = new URLSearchParams();
  if (query) params.set('query', query);
  params.set('limit', String(limit));
  if (continuation) params.set('continuation', continuation);

  const response = await supabase.functions.invoke(
    `canva-list-designs?${params.toString()}`,
    { method: 'GET' }
  );

  // Check if aborted after the request
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

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

// Import step types
type ImportStep = 'exporting' | 'uploading' | 'applying';
type ImportStatus = 'idle' | 'in_progress' | 'success' | 'error';

interface ImportState {
  status: ImportStatus;
  currentStep: ImportStep | null;
  completedSteps: ImportStep[];
  error: string | null;
  target: 'header' | 'background' | null;
}

const IMPORT_STEPS: { key: ImportStep; label: string }[] = [
  { key: 'exporting', label: 'Exporting from Canva…' },
  { key: 'uploading', label: 'Uploading to TitiLinks…' },
  { key: 'applying', label: 'Applying to your page…' },
];

function ImportProgressUI({
  importState,
  onRetry,
  onCancel,
}: {
  importState: ImportState;
  onRetry: () => void;
  onCancel: () => void;
}) {
  if (importState.status === 'idle') return null;

  return (
    <div className="space-y-4">
      {/* Steps */}
      <div className="space-y-3">
        {IMPORT_STEPS.map((step, index) => {
          const isCompleted = importState.completedSteps.includes(step.key);
          const isCurrent = importState.currentStep === step.key;
          const isPending = !isCompleted && !isCurrent;
          const hasError = importState.status === 'error' && isCurrent;

          return (
            <div
              key={step.key}
              className={cn(
                'flex items-center gap-3 text-sm transition-opacity',
                isPending && 'opacity-40'
              )}
            >
              {/* Step indicator */}
              <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : hasError ? (
                  <XCircle className="h-5 w-5 text-destructive" />
                ) : isCurrent ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
                )}
              </div>

              {/* Step label */}
              <span
                className={cn(
                  'flex-1',
                  isCompleted && 'text-muted-foreground line-through',
                  isCurrent && !hasError && 'text-foreground font-medium',
                  hasError && 'text-destructive font-medium'
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Error state */}
      {importState.status === 'error' && (
        <div className="pt-2 space-y-3">
          <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{importState.error || 'Something went wrong'}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={onRetry} className="flex-1">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailPanel({
  design,
  onApplyToHeader,
  onApplyToBackground,
  importState,
  onRetry,
  onCancel,
}: {
  design: CanvaDesign | null;
  onApplyToHeader: () => void;
  onApplyToBackground: () => void;
  importState: ImportState;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const isImporting = importState.status === 'in_progress' || importState.status === 'error';

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

      {/* Action Buttons or Progress */}
      <div className="space-y-2 pt-4 border-t border-border mt-4">
        {isImporting ? (
          <ImportProgressUI
            importState={importState}
            onRetry={onRetry}
            onCancel={onCancel}
          />
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
            
            {/* Recommended sizes helper */}
            <div className="mt-3 p-2.5 rounded-md bg-muted/50 border border-border/50">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                Recommended sizes
              </p>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Wallpaper className="h-3 w-3" />
                    Background
                  </span>
                  <span className="font-mono text-[11px]">1080 × 1920</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <LayoutTemplate className="h-3 w-3" />
                    Header
                  </span>
                  <span className="font-mono text-[11px]">1200 × 400</span>
                </div>
              </div>
            </div>
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
  const [searchResults, setSearchResults] = useState<CanvaDesign[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  // Import state with 3-step tracking
  const [importState, setImportState] = useState<ImportState>({
    status: 'idle',
    currentStep: null,
    completedSteps: [],
    error: null,
    target: null,
  });

  // Refs for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchAbortControllerRef = useRef<AbortController | null>(null);

  // Debounce search query by 300ms
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const loadDesigns = useCallback(async (reset = true) => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    if (reset) {
      setLoading(true);
      setError(null);
      setDesigns([]);
      setContinuation(null);
    } else {
      setLoadingMore(true);
    }

    try {
      const result = await fetchCanvaDesigns({
        query: '',
        limit: 20,
        continuation: !reset && continuation ? continuation : '',
        signal,
      });

      if (reset) {
        setDesigns(result.designs);
      } else {
        setDesigns((prev) => [...prev, ...result.designs]);
      }

      setContinuation(result.continuation);
      setHasMore(result.has_more);
    } catch (err) {
      // Ignore abort errors
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      console.error('Error fetching designs:', err);
      const message = err instanceof Error ? err.message : 'Failed to load designs';
      setError(message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [continuation]);

  const loadSearchResults = useCallback(async (query: string, reset = true) => {
    if (!query.trim()) return;

    // Cancel any pending search request
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort();
    }
    searchAbortControllerRef.current = new AbortController();
    const signal = searchAbortControllerRef.current.signal;

    if (reset) {
      setSearchLoading(true);
      setSearchError(null);
      // Keep previous results while loading to avoid flicker
    } else {
      setLoadingMore(true);
    }

    try {
      const result = await fetchCanvaDesigns({
        query,
        limit: 20,
        continuation: !reset && continuation ? continuation : '',
        signal,
      });

      if (reset) {
        setSearchResults(result.designs);
      } else {
        setSearchResults((prev) => [...prev, ...result.designs]);
      }

      setContinuation(result.continuation);
      setHasMore(result.has_more);
      setActiveTab('search');
    } catch (err) {
      // Ignore abort errors
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      console.error('Error searching designs:', err);
      const message = err instanceof Error ? err.message : 'Search failed';
      setSearchError(message);
    } finally {
      setSearchLoading(false);
      setLoadingMore(false);
    }
  }, [continuation]);

  // Auto-search when debounced query changes
  useEffect(() => {
    if (debouncedSearchQuery.trim()) {
      loadSearchResults(debouncedSearchQuery, true);
    } else if (debouncedSearchQuery === '' && searchResults.length > 0) {
      // Clear search results and switch to recent when query is cleared
      setSearchResults([]);
      setActiveTab('recent');
    }
  }, [debouncedSearchQuery]);

  // Load designs when modal opens
  useEffect(() => {
    if (open) {
      loadDesigns(true);
      setSelectedDesign(null);
      setSearchQuery('');
      setSearchResults([]);
      setActiveTab('recent');
      setError(null);
      setSearchError(null);
    } else {
      // Cancel pending requests when modal closes
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }
    }
  }, [open]);

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      loadSearchResults(searchQuery.trim(), true);
    }
  };

  const resetImportState = () => {
    setImportState({
      status: 'idle',
      currentStep: null,
      completedSteps: [],
      error: null,
      target: null,
    });
  };

  const handleExportAndApply = async (target: 'header' | 'background') => {
    if (!selectedDesign) return;

    // Reset and start import
    setImportState({
      status: 'in_progress',
      currentStep: 'exporting',
      completedSteps: [],
      error: null,
      target,
    });

    try {
      // Step 1: Exporting from Canva
      const { data, error } = await supabase.functions.invoke('canva-export-design', {
        body: {
          design_id: selectedDesign.id,
          format: 'png',
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      // Step 2: Uploading (handled by edge function, but we show the step)
      setImportState(prev => ({
        ...prev,
        currentStep: 'uploading',
        completedSteps: ['exporting'],
      }));

      // Small delay to show the uploading step (upload is done in edge function)
      await new Promise(resolve => setTimeout(resolve, 300));

      if (!data?.url) {
        throw new Error('No URL returned from export');
      }

      // Step 3: Applying to page
      setImportState(prev => ({
        ...prev,
        currentStep: 'applying',
        completedSteps: ['exporting', 'uploading'],
      }));

      const importResult: CanvaImportResult = {
        url: data.url,
        design_id: selectedDesign.id,
        title: selectedDesign.title,
        thumbnail_url: selectedDesign.thumbnail_url,
      };

      if (target === 'header') {
        onApplyToHeader(importResult);
        toast.success('Header image applied!');
      } else {
        onApplyToBackground(importResult);
        toast.success('Background image applied!');
      }

      // Mark as complete and close
      setImportState(prev => ({
        ...prev,
        status: 'success',
        completedSteps: ['exporting', 'uploading', 'applying'],
        currentStep: null,
      }));

      onOpenChange(false);
    } catch (err) {
      console.error('Export error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to export design';
      
      setImportState(prev => ({
        ...prev,
        status: 'error',
        error: errorMessage,
      }));
    }
  };

  const handleRetryImport = () => {
    if (importState.target) {
      handleExportAndApply(importState.target);
    }
  };

  const handleCancelImport = () => {
    resetImportState();
  };

  // Prevent closing while importing
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && importState.status === 'in_progress') {
      // Don't allow closing during import
      return;
    }
    if (!newOpen) {
      resetImportState();
    }
    onOpenChange(newOpen);
  };

  const isImporting = importState.status === 'in_progress';

  const hasSearchQuery = searchQuery.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn(
        "max-w-4xl h-[85vh] max-h-[700px] p-0 gap-0 flex flex-col",
        isImporting && "[&>button]:hidden" // Hide close button during import
      )}>
        {/* Coming Soon Banner */}
        <div className="px-6 py-2.5 border-b flex-shrink-0 flex items-center gap-2" style={{ background: 'hsl(43 65% 55% / 0.08)', borderColor: 'hsl(43 65% 55% / 0.2)' }}>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'hsl(43 65% 55% / 0.15)', border: '1px solid hsl(43 65% 55% / 0.3)', color: 'hsl(43 65% 55%)' }}>Coming Soon</span>
          <span className="text-xs text-muted-foreground">Canva integration is under development. Stay tuned!</span>
        </div>

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
                  {searchLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => loadDesigns(true)}
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
                <TabsTrigger 
                  value="search" 
                  className="gap-1.5" 
                  disabled={!hasSearchQuery && searchResults.length === 0}
                >
                  <Search className="h-3.5 w-3.5" />
                  Search results
                  {searchResults.length > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">({searchResults.length})</span>
                  )}
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
                          onClick={() => loadDesigns(true)}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Retry
                        </Button>
                      </div>
                    ) : designs.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Image className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm font-medium">No designs found</p>
                        <p className="text-xs mt-1">Create a new design in Canva to get started</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {designs.map((design) => (
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
                    {hasMore && !loading && activeTab === 'recent' && (
                      <div className="pt-4 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => loadDesigns(false)}
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
                    {searchLoading && searchResults.length === 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {[...Array(6)].map((_, i) => (
                          <div key={i} className="space-y-2">
                            <Skeleton className="aspect-video rounded-lg" />
                            <Skeleton className="h-4 w-3/4" />
                          </div>
                        ))}
                      </div>
                    ) : searchError ? (
                      <div className="text-center py-12">
                        <AlertCircle className="h-12 w-12 mx-auto mb-3 text-destructive opacity-70" />
                        <p className="text-sm font-medium text-destructive">Search failed</p>
                        <p className="text-xs mt-1 text-muted-foreground max-w-xs mx-auto">{searchError}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-4"
                          onClick={() => loadSearchResults(searchQuery, true)}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Retry
                        </Button>
                      </div>
                    ) : searchResults.length === 0 && hasSearchQuery ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm font-medium">No results found</p>
                        <p className="text-xs mt-1">Try a different search term</p>
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm font-medium">Search your designs</p>
                        <p className="text-xs mt-1">Type to search your Canva designs</p>
                      </div>
                    ) : (
                      <>
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

                        {/* Load More for search */}
                        {hasMore && !searchLoading && (
                          <div className="pt-4 text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => loadSearchResults(searchQuery, false)}
                              disabled={loadingMore}
                            >
                              {loadingMore && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                              Load More
                            </Button>
                          </div>
                        )}
                      </>
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
              importState={importState}
              onRetry={handleRetryImport}
              onCancel={handleCancelImport}
            />
          </div>
        </div>

        {/* Mobile Bottom Panel */}
        {selectedDesign && (
          <div className="md:hidden border-t border-border p-4 flex-shrink-0 bg-background">
            {importState.status === 'in_progress' || importState.status === 'error' ? (
              <div className="space-y-3">
                <ImportProgressUI
                  importState={importState}
                  onRetry={handleRetryImport}
                  onCancel={handleCancelImport}
                />
              </div>
            ) : (
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
                  <Button size="sm" onClick={() => handleExportAndApply('background')}>
                    <Wallpaper className="h-4 w-4 mr-1" />
                    Background
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleExportAndApply('header')}>
                    <LayoutTemplate className="h-4 w-4 mr-1" />
                    Header
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
