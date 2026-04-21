import { useState, useEffect, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Link as LinkIcon,
  ExternalLink,
  Share2,
} from 'lucide-react';
import type { Tables, Enums } from '@/integrations/supabase/types';
import { useEventTracking } from '@/hooks/useEventTracking';
import { AdultContentDialog, hasAdultConsent } from '@/components/AdultContentDialog';
import { getThemeWithDefaults, applyAutoContrast, type ThemeJson } from '@/lib/theme-defaults';
import { PageBackground } from '@/components/PageBackground';
import { StickyCtaBar } from '@/components/StickyCtaBar';
import { cn } from '@/lib/utils';
import { EditableProfileView } from '@/components/EditableProfileView';

type Page = Tables<'pages'>;
type Mode = Tables<'modes'>;
type Block = Tables<'blocks'>;
type BlockItem = Tables<'block_items'>;

type ModeType = Enums<'mode_type'>;
type RoutingReason = 'param' | 'utm' | 'referrer' | 'default';

interface BlockWithItems extends Block {
  items: BlockItem[];
}

interface ModeDetectionResult {
  mode: ModeType;
  reason: RoutingReason;
}

function detectMode(searchParams: URLSearchParams): ModeDetectionResult {
  // 1. Check query param page=2 (new neutral param)
  const pageParam = searchParams.get('page');
  if (pageParam === '2') {
    return { mode: 'recruit', reason: 'param' };
  }
  if (pageParam === '1') {
    return { mode: 'shop', reason: 'param' };
  }

  // 2. Check query param mode=recruit (backward compatibility)
  const modeParam = searchParams.get('mode');
  if (modeParam === 'recruit') {
    return { mode: 'recruit', reason: 'param' };
  }

  // 3. Check utm_campaign=recruit
  const utmCampaign = searchParams.get('utm_campaign');
  if (utmCampaign === 'recruit') {
    return { mode: 'recruit', reason: 'utm' };
  }

  // 4. Check referrer for social platforms -> shop
  if (typeof document !== 'undefined' && document.referrer) {
    const referrer = document.referrer.toLowerCase();
    if (referrer.includes('tiktok.com') || referrer.includes('instagram.com')) {
      return { mode: 'shop', reason: 'referrer' };
    }
  }

  // 5. Default -> shop (Page 1)
  return { mode: 'shop', reason: 'default' };
}

export default function PublicProfile() {
  const { handle } = useParams<{ handle: string }>();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<BlockWithItems[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [stickyCtaEnabled, setStickyCtaEnabled] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'shop' | 'recruit'>('shop');

  // Scroll-to-top visibility
  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Adult content interstitial state
  const [pendingAdultLink, setPendingAdultLink] = useState<{
    url: string;
    blockType: string;
    blockId: string;
    itemId: string;
  } | null>(null);

  const { mode: detectedMode, reason: routingReason } = useMemo(() => detectMode(searchParams), [searchParams]);
  const { trackPageLoad, trackOutboundClick } = useEventTracking(page?.id || null, detectedMode);

  // Sync selectedMode with detected mode from URL
  useEffect(() => {
    setSelectedMode(detectedMode as 'shop' | 'recruit');
  }, [detectedMode]);

  // Handle outbound click with adult content check
  const handleOutboundClick = useCallback((
    blockType: string,
    blockId: string,
    itemId: string,
    url: string,
    isAdult?: boolean
  ) => {
    // If adult content and user hasn't consented, show dialog
    if (isAdult && !hasAdultConsent()) {
      setPendingAdultLink({ url, blockType, blockId, itemId });
      return false; // Prevent navigation
    }
    
    // Track the click
    trackOutboundClick(blockType, blockId, itemId, url);
    return true; // Allow navigation
  }, [trackOutboundClick]);

  const handleAdultConfirm = useCallback(() => {
    if (pendingAdultLink) {
      // Track the click
      trackOutboundClick(
        pendingAdultLink.blockType,
        pendingAdultLink.blockId,
        pendingAdultLink.itemId,
        pendingAdultLink.url
      );
      // Open the link
      window.open(pendingAdultLink.url, '_blank', 'noopener,noreferrer');
      setPendingAdultLink(null);
    }
  }, [pendingAdultLink, trackOutboundClick]);

  const handleAdultCancel = useCallback(() => {
    setPendingAdultLink(null);
  }, []);

  // Track page load events when page is loaded

  // Track page load events when page is loaded
  useEffect(() => {
    if (page && !loading) {
      trackPageLoad(routingReason);
    }
  }, [page, loading, trackPageLoad, routingReason]);

  useEffect(() => {
    if (handle) {
      fetchPageData();
    }
  }, [handle, detectedMode]);

  const fetchPageData = async () => {
    if (!handle) return;

    setLoading(true);
    try {
      // Fetch page by handle
      const { data: pageData, error: pageError } = await supabase
        .from('pages')
        .select('*')
        .eq('handle', handle.toLowerCase())
        .maybeSingle();

      if (pageError) throw pageError;

      if (!pageData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setPage(pageData);

      // Fetch mode for this page
      const { data: modeData, error: modeError } = await supabase
        .from('modes')
        .select('*')
        .eq('page_id', pageData.id)
        .eq('type', detectedMode)
        .maybeSingle();

      if (modeError) throw modeError;

      if (!modeData) {
        setBlocks([]);
        setStickyCtaEnabled(false);
        setLoading(false);
        return;
      }

      // Store sticky CTA setting
      setStickyCtaEnabled((modeData as Mode & { sticky_cta_enabled?: boolean }).sticky_cta_enabled ?? false);

      // Fetch enabled blocks for this mode
      const { data: blocksData, error: blocksError } = await supabase
        .from('blocks')
        .select('*')
        .eq('mode_id', modeData.id)
        .eq('is_enabled', true)
        .order('order_index', { ascending: true });

      if (blocksError) throw blocksError;

      if (!blocksData || blocksData.length === 0) {
        setBlocks([]);
        setLoading(false);
        return;
      }

      // Fetch items for all blocks
      const blockIds = blocksData.map((b) => b.id);
      const { data: itemsData, error: itemsError } = await supabase
        .from('block_items')
        .select('*')
        .in('block_id', blockIds)
        .order('order_index', { ascending: true });

      if (itemsError) throw itemsError;

      // Group items by block
      const blocksWithItems: BlockWithItems[] = blocksData.map((block) => ({
        ...block,
        items: (itemsData || []).filter((item) => item.block_id === block.id),
      }));

      setBlocks(blocksWithItems);
    } catch (error) {
      console.error('Error fetching page:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <PublicProfileSkeleton />;
  }

  if (notFound || !page) {
    return <NotFoundView handle={handle} />;
  }

  const profileUrl = typeof window !== 'undefined' ? window.location.href : '';
  const ogTitle = page ? `${page.display_name || page.handle} | TitiLinks` : 'TitiLinks';
  const ogDescription = page?.bio || 'Check out my links, products, and more on TitiLinks.';
  const page2AvatarUrl = (page?.theme_json as any)?.avatar_url_page2 || null;
  const ogImage = (selectedMode === 'recruit' && page2AvatarUrl)
    ? page2AvatarUrl
    : (page?.avatar_url || 'https://titilinks.lovable.app/placeholder.svg');

  return (
    <>
      <Helmet>
        <title>{ogTitle}</title>
        <meta property="og:title" content={ogTitle} />
        <meta property="og:description" content={ogDescription} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={profileUrl} />
        <meta property="og:type" content="profile" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={ogTitle} />
        <meta name="twitter:description" content={ogDescription} />
        <meta name="twitter:image" content={ogImage} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Bebas+Neue&family=Abril+Fatface&family=Pacifico&family=Orbitron:wght@400;700&family=Caveat:wght@400;700&family=Archivo+Black&family=Lora:wght@400;700&family=Patrick+Hand&family=Space+Grotesk:wght@400;700&display=swap" rel="stylesheet" />
      </Helmet>
      <div className="min-h-screen bg-[#0e0c09]">
        <EditableProfileView
          page={page}
          blocks={blocks}
          editMode={false}
          onBlockEdit={() => {}}
          onBlockToggle={() => {}}
          onBlockReorder={() => {}}
          onRefresh={() => {}}
          selectedMode={selectedMode}
          onModeChange={setSelectedMode}
          onOutboundClick={handleOutboundClick}
        />
      </div>
    </>
  );
}

// ─── Helper Components (kept for NotFoundView, PublicProfileSkeleton) ────────

function NotFoundView({ handle }: { handle?: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground mb-2">404</h1>
        <p className="text-muted-foreground">
          {handle ? `@${handle} not found` : 'Page not found'}
        </p>
      </div>
    </div>
  );
}

function PublicProfileSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <Skeleton className="h-20 w-20 rounded-full mx-auto mb-4" />
          <Skeleton className="h-6 w-32 mx-auto mb-2" />
          <Skeleton className="h-4 w-48 mx-auto" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
