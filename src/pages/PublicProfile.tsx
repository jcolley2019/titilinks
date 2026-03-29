import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Link as LinkIcon, 
  ExternalLink, 
  ShoppingBag, 
  Users,
  Image as ImageIcon,
  Share2,
  ShieldAlert,
  ArrowUp,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Tables, Enums } from '@/integrations/supabase/types';
import { useEventTracking } from '@/hooks/useEventTracking';
import { triggerHaptic } from '@/hooks/useHapticFeedback';
import { AdultContentDialog, hasAdultConsent } from '@/components/AdultContentDialog';
import { getThemeWithDefaults, applyAutoContrast, type ThemeJson, type BlockStyleConfig, DEFAULT_BLOCK_STYLE } from '@/lib/theme-defaults';
import { PageBackground } from '@/components/PageBackground';
import { LinkButton } from '@/components/LinkButton';
import { ThumbnailImage } from '@/components/ThumbnailImage';
import { SmoothImage } from '@/components/SmoothImage';
import { StickyCtaBar } from '@/components/StickyCtaBar';
import { cn } from '@/lib/utils';

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

  // Get theme with defaults and apply auto-contrast if enabled
  const rawTheme = getThemeWithDefaults(page.theme_json);
  const theme = applyAutoContrast(rawTheme);

  // Get custom page labels from theme_json
  const themePages = (page.theme_json as { pages?: { page1?: { label?: string }; page2?: { label?: string } } })?.pages;
  const page1Label = themePages?.page1?.label || 'Page 1';
  const page2Label = themePages?.page2?.label || 'Page 2';
  const currentPageLabel = detectedMode === 'shop' ? page1Label : page2Label;

  // Get font family based on theme
  const getFontFamily = (): string => {
    switch (theme.typography.font) {
      case 'inter':
        return "'Inter', sans-serif";
      case 'system':
        return 'system-ui, sans-serif';
      case 'serif':
        return 'Georgia, serif';
      case 'mono':
        return 'monospace';
      default:
        return "'Inter', sans-serif";
    }
  };

  // Render header based on layout
  const renderHeader = () => {
    const headerLayout = theme.header?.layout || 'overlay';
    const hasHeaderImage = theme.header?.enabled && theme.header?.image_url;

    // Overlay layout: Full-width header image with content overlaid
    if (headerLayout === 'overlay' && hasHeaderImage) {
      return (
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative mb-8 -mx-4 -mt-8"
        >
          {/* Header Image - Fixed height container */}
          <div className="relative h-48 overflow-hidden">
            <SmoothImage 
              src={theme.header.image_url} 
              alt="Header" 
              containerClassName="h-full w-full"
              skeletonClassName="bg-muted/30"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
          </div>
          
          {/* Overlaid Profile Info */}
          <div className="absolute bottom-0 left-0 right-0 transform translate-y-1/2 text-center px-4">
            <Avatar className="h-20 w-20 mx-auto mb-2 ring-4 ring-background shadow-lg">
              {page.avatar_url ? (
                <AvatarImage src={page.avatar_url} alt={page.display_name || page.handle} />
              ) : null}
              <AvatarFallback 
                className="text-xl"
                style={{
                  backgroundColor: theme.buttons.fill_color,
                  color: theme.buttons.text_color,
                }}
              >
                {(page.display_name || page.handle).charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          
          {/* Spacer for overlaid avatar */}
          <div className="h-12" />
          
          {/* Text below avatar */}
          <div className="text-center mt-4 px-4">
            <h1 className="text-xl font-bold" style={{ color: theme.typography.text_color }}>
              {page.display_name || `@${page.handle}`}
            </h1>
            {page.bio && (
              <p 
                className="text-sm mt-1 max-w-xs mx-auto opacity-80"
                style={{ color: theme.typography.text_color }}
              >
                {page.bio}
              </p>
            )}
            <div 
              className="flex items-center justify-center gap-1 mt-2 text-xs opacity-60"
              style={{ color: theme.typography.text_color }}
            >
              <span>{currentPageLabel}</span>
            </div>
          </div>
        </motion.header>
      );
    }

    // Card layout: Header image inside a rounded card with text below
    if (headerLayout === 'card' && hasHeaderImage) {
      return (
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          {/* Card with header image - Fixed height container */}
          <div className="mb-4 rounded-2xl overflow-hidden mx-auto max-w-md shadow-lg h-40">
            <SmoothImage 
              src={theme.header.image_url} 
              alt="Header" 
              containerClassName="h-full w-full"
              skeletonClassName="bg-muted/30"
            />
          </div>
          
          <Avatar className="h-20 w-20 mx-auto mb-4 ring-2 ring-white/20 -mt-12 relative z-10 shadow-lg">
            {page.avatar_url ? (
              <AvatarImage src={page.avatar_url} alt={page.display_name || page.handle} />
            ) : null}
            <AvatarFallback 
              className="text-xl"
              style={{
                backgroundColor: theme.buttons.fill_color,
                color: theme.buttons.text_color,
              }}
            >
              {(page.display_name || page.handle).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <h1 className="text-xl font-bold" style={{ color: theme.typography.text_color }}>
            {page.display_name || `@${page.handle}`}
          </h1>
          {page.bio && (
            <p 
              className="text-sm mt-1 max-w-xs mx-auto opacity-80"
              style={{ color: theme.typography.text_color }}
            >
              {page.bio}
            </p>
          )}
          <div 
            className="flex items-center justify-center gap-1 mt-2 text-xs opacity-60"
            style={{ color: theme.typography.text_color }}
          >
            <span>{currentPageLabel}</span>
          </div>
        </motion.header>
      );
    }

    // Split layout: Modern storefront style with side-by-side or stacked content
    if (headerLayout === 'split' && hasHeaderImage) {
      return (
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          {/* Split layout container */}
          <div className="rounded-2xl overflow-hidden bg-white/5 backdrop-blur-sm border border-white/10">
            {/* Header image section - Fixed height container */}
            <div className="h-32 overflow-hidden">
              <SmoothImage 
                src={theme.header.image_url} 
                alt="Header" 
                containerClassName="h-full w-full"
                skeletonClassName="bg-muted/30"
              />
            </div>
            
            {/* Profile section */}
            <div className="p-4 text-center">
              <Avatar className="h-16 w-16 mx-auto mb-3 ring-2 ring-white/20 -mt-12 relative z-10 shadow-lg">
                {page.avatar_url ? (
                  <AvatarImage src={page.avatar_url} alt={page.display_name || page.handle} />
                ) : null}
                <AvatarFallback 
                  className="text-lg"
                  style={{
                    backgroundColor: theme.buttons.fill_color,
                    color: theme.buttons.text_color,
                  }}
                >
                  {(page.display_name || page.handle).charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              <h1 className="text-lg font-bold" style={{ color: theme.typography.text_color }}>
                {page.display_name || `@${page.handle}`}
              </h1>
              {page.bio && (
                <p 
                  className="text-sm mt-1 opacity-80"
                  style={{ color: theme.typography.text_color }}
                >
                  {page.bio}
                </p>
              )}
              <div 
                className="flex items-center justify-center gap-1 mt-2 text-xs opacity-60"
                style={{ color: theme.typography.text_color }}
              >
                <span>{currentPageLabel}</span>
              </div>
            </div>
          </div>
        </motion.header>
      );
    }

    // Default layout (no header image or fallback)
    return (
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <Avatar className="h-20 w-20 mx-auto mb-4 ring-2 ring-white/20">
          {page.avatar_url ? (
            <AvatarImage src={page.avatar_url} alt={page.display_name || page.handle} />
          ) : null}
          <AvatarFallback 
            className="text-xl"
            style={{
              backgroundColor: theme.buttons.fill_color,
              color: theme.buttons.text_color,
            }}
          >
            {(page.display_name || page.handle).charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <h1 className="text-xl font-bold" style={{ color: theme.typography.text_color }}>
          {page.display_name || `@${page.handle}`}
        </h1>
        {page.bio && (
          <p 
            className="text-sm mt-1 max-w-xs mx-auto opacity-80"
            style={{ color: theme.typography.text_color }}
          >
            {page.bio}
          </p>
        )}
        <div 
          className="flex items-center justify-center gap-1 mt-2 text-xs opacity-60"
          style={{ color: theme.typography.text_color }}
        >
          <span>{currentPageLabel}</span>
        </div>
      </motion.header>
    );
  };

  // Share handler
  const handleShare = async () => {
    const shareUrl = window.location.href;
    const shareTitle = page.display_name || `@${page.handle}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, url: shareUrl });
      } catch {
        // User cancelled share — no-op
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied!');
    }
  };

  return (
    <PageBackground theme={theme}>
      {/* Content Layer */}
      <div
        className="relative max-w-[640px] mx-auto px-4 py-8 pb-20"
        style={{
          fontFamily: getFontFamily(),
          color: theme.typography.text_color,
        }}
      >
        {/* Share button — top-right of profile */}
        <button
          onClick={handleShare}
          className="absolute top-4 right-4 z-10 p-2 rounded-full backdrop-blur-md transition-transform active:scale-90"
          style={{
            backgroundColor: `${theme.buttons.fill_color}20`,
            color: theme.typography.text_color,
          }}
          aria-label="Share this page"
        >
          <Share2 size={18} />
        </button>
        {/* Header */}
        {renderHeader()}

        {/* Blocks - keyed by mode for crossfade on mode change */}
        <div 
          key={detectedMode}
          className="space-y-6 animate-mode-fade motion-reduce:animate-none"
        >
          {blocks.length === 0 ? (
          <EmptyState textColor={theme.typography.text_color} />
          ) : (
            blocks.map((block, index) => (
              <motion.section
                key={block.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="motion-reduce:!opacity-100 motion-reduce:!transform-none"
              >
                <BlockRenderer block={block} onOutboundClick={handleOutboundClick} theme={theme} pageId={page?.id} />
              </motion.section>
            ))
          )}
        </div>

        {/* Footer - extra padding for sticky CTA */}
        <footer className={`mt-12 text-center ${stickyCtaEnabled ? 'pb-16' : ''}`}>
          <p className="text-xs opacity-60" style={{ color: theme.typography.text_color }}>
            Powered by <span className="font-semibold"><span style={{ color: '#F5F3EE' }}>Titi</span><span style={{ color: '#C9A55C', fontStyle: 'italic' }}>Links</span></span>
          </p>
        </footer>
      </div>

      {/* Sticky CTA Bar */}
      {(() => {
        const primaryCtaBlock = blocks.find(b => b.type === 'primary_cta');
        const primaryCtaItem = primaryCtaBlock?.items[0];
        return primaryCtaItem ? (
          <StickyCtaBar
            enabled={stickyCtaEnabled}
            ctaLabel={primaryCtaItem.label}
            ctaUrl={primaryCtaItem.url}
            theme={theme}
            onOutboundClick={() => {
              if (primaryCtaBlock) {
                handleOutboundClick('primary_cta', primaryCtaBlock.id, primaryCtaItem.id, primaryCtaItem.url, primaryCtaItem.is_adult || false);
              }
            }}
          />
        ) : null;
      })()}

      {/* Adult Content Dialog */}
      <AdultContentDialog
        open={!!pendingAdultLink}
        onOpenChange={(open) => !open && setPendingAdultLink(null)}
        onConfirm={handleAdultConfirm}
        onCancel={handleAdultCancel}
      />

      {/* Scroll-to-top button */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-20 right-4 z-40 flex items-center gap-1 rounded-full px-3 py-2 text-xs font-medium shadow-lg backdrop-blur-md transition-transform active:scale-90"
            style={{
              backgroundColor: theme.buttons.fill_color,
              color: theme.buttons.text_color,
            }}
            aria-label="Scroll to top"
          >
            <ArrowUp size={14} />
            Top
          </motion.button>
        )}
      </AnimatePresence>
      />
    </PageBackground>
  );
}

type ClickHandler = (blockType: string, blockId: string, itemId: string, url: string, isAdult?: boolean) => boolean;

interface BlockRendererProps {
  block: BlockWithItems;
  onOutboundClick: ClickHandler;
  theme: ThemeJson;
}

function BlockRenderer({ block, onOutboundClick, theme, pageId }: BlockRendererProps & { pageId?: string }) {
  const blockProps = { block, onOutboundClick, theme };
  
  switch (block.type) {
    case 'primary_cta':
      return <PrimaryCtaBlock {...blockProps} />;
    case 'social_links':
      return <SocialLinksBlock {...blockProps} />;
    case 'links':
      return <LinksBlock {...blockProps} />;
    case 'product_cards':
      return <ProductCardsBlock {...blockProps} />;
    case 'featured_media':
      return <FeaturedMediaBlock {...blockProps} />;
    case 'hero_card':
      return <HeroCardBlock {...blockProps} />;
    case 'social_icon_row':
      return <SocialIconRowBlock {...blockProps} />;
    case 'email_subscribe':
      return <EmailSubscribeBlock block={block} theme={theme} pageId={pageId} />;
    case 'content_section':
      return <ContentSectionBlock {...blockProps} />;
    default:
      return null;
  }
}

interface ThemedBlockProps {
  block: BlockWithItems;
  onOutboundClick: ClickHandler;
  theme: ThemeJson;
}

function PrimaryCtaBlock({ block, onOutboundClick, theme }: ThemedBlockProps) {
  const item = block.items[0];
  if (!item) return null;

  // Parse block style config from title
  let blockStyle: Partial<BlockStyleConfig> = {};
  try {
    const parsed = JSON.parse(block.title || '{}');
    if (parsed.style) {
      blockStyle = parsed.style;
    }
  } catch {
    // Not JSON, ignore
  }

  const handleClick = (e: React.MouseEvent) => {
    const shouldNavigate = onOutboundClick(block.type, block.id, item.id, item.url, item.is_adult || false);
    if (!shouldNavigate) {
      e.preventDefault();
    }
  };

  return (
    <div data-block-type="primary_cta">
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
        onClick={handleClick}
      >
        <LinkButton theme={theme} blockStyle={blockStyle}>
          <div className="relative">
            {item.is_adult && (
              <div className="absolute -top-2 -right-2">
                <ShieldAlert className="h-4 w-4 opacity-70" />
              </div>
            )}
            <p className="font-semibold text-lg">{item.label}</p>
            {item.subtitle && (
              <p className="text-sm opacity-80 mt-1">{item.subtitle}</p>
            )}
          </div>
        </LinkButton>
      </a>
    </div>
  );
}

// Inline SVG brand icons for social platforms
function SocialSvgIcon({ label, size = 20 }: { label: string; size?: number }) {
  const lower = label.toLowerCase();
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor', xmlns: 'http://www.w3.org/2000/svg' } as const;

  if (lower.includes('tiktok')) return (
    <svg {...props}><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V9.4a8.16 8.16 0 004.76 1.52V7.47a4.85 4.85 0 01-1-.78z"/></svg>
  );
  if (lower.includes('instagram')) return (
    <svg {...props}><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
  );
  if (lower.includes('youtube')) return (
    <svg {...props}><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
  );
  if (lower.includes('facebook')) return (
    <svg {...props}><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
  );
  if (lower.includes('snapchat')) return (
    <svg {...props}><path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12.959-.289.089-.05.19-.078.292-.078a.68.68 0 01.689.675c0 .345-.263.594-.63.75-.525.22-1.065.36-1.395.465-.09.029-.176.06-.239.09a.96.96 0 00-.449.63c-.03.149-.015.299.045.449.12.3.72 1.545 1.725 2.535.735.72 1.485 1.2 2.175 1.44.105.03.195.06.285.09.36.12.585.225.585.585 0 .45-.435.585-.825.705-.525.165-1.215.27-1.755.345-.06.315-.12.63-.195.93-.06.24-.135.465-.27.465-.135.03-.3-.015-.525-.06a5.7 5.7 0 00-.96-.12c-.36 0-.705.06-1.05.195-.48.18-.93.51-1.41.855-.735.54-1.575 1.155-2.91 1.155-1.335 0-2.175-.615-2.91-1.155-.48-.345-.93-.675-1.41-.855a3.08 3.08 0 00-1.05-.195 5.58 5.58 0 00-.96.12c-.225.045-.39.09-.525.06-.135 0-.21-.225-.27-.465-.075-.3-.135-.615-.195-.93-.54-.075-1.23-.18-1.755-.345-.39-.12-.825-.255-.825-.705 0-.36.225-.465.585-.585.09-.03.18-.06.285-.09.69-.24 1.44-.72 2.175-1.44 1.005-.99 1.605-2.235 1.725-2.535.06-.15.075-.3.045-.449a.96.96 0 00-.449-.63c-.063-.03-.149-.061-.239-.09-.33-.105-.87-.245-1.395-.465-.367-.156-.63-.405-.63-.75a.68.68 0 01.689-.675c.103 0 .203.028.292.078.3.17.659.305.959.289.198 0 .326-.045.401-.09a14.4 14.4 0 01-.033-.57c-.104-1.628-.23-3.654.299-4.847C7.859 1.069 11.216.793 12.206.793z"/></svg>
  );
  if (lower.includes('twitter') || lower.includes(' x') || lower === 'x') return (
    <svg {...props}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
  );
  if (lower.includes('spotify')) return (
    <svg {...props}><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
  );
  if (lower.includes('discord')) return (
    <svg {...props}><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.8732.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/></svg>
  );
  if (lower.includes('twitch') || lower.includes('kick')) return (
    <svg {...props}><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>
  );
  if (lower.includes('linkedin')) return (
    <svg {...props}><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
  );
  if (lower.includes('pinterest')) return (
    <svg {...props}><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641 0 12.017 0z"/></svg>
  );
  if (lower.includes('threads')) return (
    <svg {...props}><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.17.408-2.265 1.33-3.084.88-.782 2.123-1.257 3.591-1.375.963-.078 1.858-.034 2.688.13-.043-.745-.207-1.332-.49-1.76-.388-.588-1.024-.893-1.912-.917-1.593-.042-2.651.434-3.158 1.073l-.027.038-1.63-1.274.038-.046c.833-1.029 2.39-1.676 4.763-1.6 1.404.036 2.513.548 3.298 1.524.672.833 1.05 1.96 1.127 3.358a9.6 9.6 0 011.094.672c1.126.808 1.952 1.786 2.389 2.826.755 1.797.795 4.568-1.37 6.694C18.028 23.182 15.59 23.96 12.186 24zm-1.248-7.498c-.052 0-.104.002-.157.004-1.476.082-2.417.856-2.375 1.653.043.788.842 1.417 2.127 1.417h.007c1.354-.074 2.927-.813 2.68-3.622-.564-.126-1.47-.252-2.282-.252v.8z"/></svg>
  );
  if (lower.includes('whatsapp')) return (
    <svg {...props}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
  );
  if (lower.includes('telegram')) return (
    <svg {...props}><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
  );
  if (lower.includes('apple') && lower.includes('music')) return (
    <svg {...props}><path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043A5.022 5.022 0 0019.7.283a10.1 10.1 0 00-1.898-.122C17.337.09 16.872.06 12 .06s-5.337.03-5.803.101A10.1 10.1 0 004.3.283a5.022 5.022 0 00-1.874.608C1.308 1.604.563 2.604.246 3.914A9.23 9.23 0 00.006 6.104c-.073.465-.103.93-.103 5.803s.03 5.337.103 5.803a9.23 9.23 0 00.24 2.19c.317 1.31 1.062 2.31 2.18 3.043a5.022 5.022 0 001.874.608c.465.073.93.103 1.898.122.465.072.93.04 5.803.04s5.337.032 5.803-.04a10.1 10.1 0 001.898-.122 5.022 5.022 0 001.874-.608c1.118-.733 1.863-1.733 2.18-3.043a9.23 9.23 0 00.24-2.19c.073-.466.103-.93.103-5.803s-.03-5.338-.103-5.803zM16.95 15.97c0 .65-.158 1.263-.476 1.808a3.38 3.38 0 01-1.263 1.263c-.544.317-1.122.476-1.742.476-.598 0-1.13-.166-1.594-.497-.463-.33-.795-.765-.993-1.302s-.225-1.075-.083-1.614c.142-.538.418-.988.826-1.348.408-.36.882-.572 1.42-.635.11-.011.552-.07 1.327-.178v-4.96l-5.56 1.711v6.468c0 .65-.158 1.263-.476 1.808a3.38 3.38 0 01-1.263 1.263c-.544.317-1.122.476-1.742.476-.598 0-1.13-.166-1.594-.497-.463-.33-.795-.765-.993-1.302s-.225-1.075-.083-1.614c.142-.538.418-.988.826-1.348.408-.36.882-.572 1.42-.635.11-.011.552-.07 1.327-.178V7.66c0-.339.07-.636.213-.89.142-.254.35-.446.621-.576l5.96-2.537a1.52 1.52 0 01.385-.122c.144-.03.28-.013.406.05.127.063.223.16.288.288.065.129.098.27.098.425v8.862z"/></svg>
  );
  // Default link icon
  return (
    <svg {...props} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
  );
}

function SocialLinksBlock({ block, onOutboundClick, theme }: ThemedBlockProps) {
  if (block.items.length === 0) return null;

  const handleClick = (e: React.MouseEvent, item: BlockItem) => {
    const shouldNavigate = onOutboundClick(block.type, block.id, item.id, item.url, item.is_adult || false);
    if (!shouldNavigate) {
      e.preventDefault();
    }
  };

  const getPlatformIcon = (label: string, size = 20) => {
    return <SocialSvgIcon label={label} size={size} />;
  };

  return (
    <div className="flex flex-wrap justify-center gap-3">
      {block.items.map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full transition-colors relative overflow-hidden"
          style={{
            backgroundColor: `${theme.buttons.fill_color}20`,
          }}
          title={item.label}
          onClick={(e) => handleClick(e, item)}
        >
          {item.image_url ? (
            <ThumbnailImage src={item.image_url} alt={item.label} />
          ) : (
            getPlatformIcon(item.label, 20)
          )}
          {item.is_adult && (
            <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 flex items-center justify-center">
              <span className="text-[8px] font-bold text-white">18</span>
            </div>
          )}
        </a>
      ))}
    </div>
  );
}

function LinksBlock({ block, onOutboundClick, theme }: ThemedBlockProps) {
  if (block.items.length === 0) return null;

  // Parse block style config from title
  let blockStyle: Partial<BlockStyleConfig> = {};
  try {
    const parsed = JSON.parse(block.title || '{}');
    if (parsed.style) {
      blockStyle = parsed.style;
    }
  } catch {
    // Not JSON, ignore
  }

  const handleClick = (e: React.MouseEvent, item: BlockItem) => {
    const shouldNavigate = onOutboundClick(block.type, block.id, item.id, item.url, item.is_adult || false);
    if (!shouldNavigate) {
      e.preventDefault();
    }
  };

  return (
    <div className="space-y-3">
      {block.items.map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
          onClick={(e) => handleClick(e, item)}
        >
          <LinkButton
            theme={theme}
            blockStyle={blockStyle}
            leftThumbnail={item.image_url || undefined}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{item.label}</p>
                  {item.is_adult && (
                    <span className="text-[10px] font-semibold bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded flex items-center gap-0.5 flex-shrink-0">
                      <ShieldAlert className="h-3 w-3" />
                      18+
                    </span>
                  )}
                  {item.badge && (
                    <span 
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ backgroundColor: `${theme.buttons.fill_color}20`, color: theme.buttons.fill_color }}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
                {item.subtitle && (
                  <p className="text-xs truncate mt-0.5 opacity-60">{item.subtitle}</p>
                )}
              </div>
            </div>
          </LinkButton>
        </a>
      ))}
    </div>
  );
}

function ProductCardsBlock({ block, onOutboundClick, theme }: ThemedBlockProps) {
  if (block.items.length === 0) return null;

  // Parse layout config from block title
  let layout: 'stacked' | 'split' = 'stacked';
  try {
    const parsed = JSON.parse(block.title || '{}');
    if (parsed.layout === 'split') layout = 'split';
  } catch {
    // Not JSON, ignore
  }

  const handleClick = (e: React.MouseEvent, item: BlockItem) => {
    const shouldNavigate = onOutboundClick(block.type, block.id, item.id, item.url, item.is_adult || false);
    if (!shouldNavigate) {
      e.preventDefault();
    }
  };

  const getButtonRadius = () => {
    switch (theme.buttons.shape) {
      case 'pill': return '9999px';
      case 'rounded': return '16px';
      case 'square': return '6px';
      default: return '16px';
    }
  };

  const formatPrice = (price: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(price);
  };

  const getDiscountPercent = (price: number, compareAt: number) => {
    return Math.round(((compareAt - price) / compareAt) * 100);
  };

  const renderStackedCard = (item: BlockItem) => (
    <a
      key={item.id}
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block group"
      onClick={(e) => handleClick(e, item)}
      onTouchStart={() => triggerHaptic('light')}
    >
      <motion.div
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.1 }}
        className="overflow-hidden transform-gpu will-change-transform motion-reduce:transform-none"
        style={{
          backgroundColor: `${theme.buttons.fill_color}08`,
          borderRadius: getButtonRadius(),
          border: `1px solid ${theme.buttons.fill_color}15`,
        }}
      >
        <div className="aspect-square flex items-center justify-center overflow-hidden relative" style={{ backgroundColor: `${theme.buttons.fill_color}05` }}>
          {item.image_url ? (
            <ThumbnailImage 
              src={item.image_url} 
              alt={item.label}
              className="group-hover:scale-105 transition-transform duration-300 motion-reduce:transition-none"
            />
          ) : (
            <ShoppingBag className="h-8 w-8 opacity-40" style={{ color: theme.typography.text_color }} />
          )}
          {item.is_adult && (
            <div className="absolute top-2 right-2 bg-red-500/90 text-white px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-0.5">
              <ShieldAlert className="h-3 w-3" />
              18+
            </div>
          )}
          {item.badge && (
            <span 
              className="absolute top-2 left-2 text-[10px] font-bold px-2 py-1 rounded"
              style={{ backgroundColor: theme.buttons.fill_color, color: theme.buttons.text_color }}
            >
              {item.badge}
            </span>
          )}
          {item.compare_at_price && item.price && item.compare_at_price > item.price && (
            <span 
              className="absolute top-2 right-2 text-[10px] font-bold px-2 py-1 rounded bg-red-500 text-white"
            >
              -{getDiscountPercent(item.price, item.compare_at_price)}%
            </span>
          )}
        </div>
        <div className="p-3 space-y-2">
          <p className="font-semibold text-sm line-clamp-2" style={{ color: theme.typography.text_color }}>{item.label}</p>
          
          {/* Price Display */}
          {item.price && (
            <div className="flex items-center gap-2">
              <span className="font-bold text-base" style={{ color: theme.buttons.fill_color }}>
                {formatPrice(item.price, item.currency || 'USD')}
              </span>
              {item.compare_at_price && item.compare_at_price > item.price && (
                <span className="text-xs line-through opacity-50" style={{ color: theme.typography.text_color }}>
                  {formatPrice(item.compare_at_price, item.currency || 'USD')}
                </span>
              )}
            </div>
          )}

          {!item.price && item.subtitle && (
            <p className="text-xs opacity-60" style={{ color: theme.typography.text_color }}>{item.subtitle}</p>
          )}

          {/* CTA Button */}
          {item.cta_label && (
            <div
              className="w-full text-center py-2 text-xs font-semibold transition-transform duration-100 active:scale-[0.98] transform-gpu motion-reduce:transform-none"
              style={{ 
                backgroundColor: theme.buttons.fill_color, 
                color: theme.buttons.text_color,
                borderRadius: theme.buttons.shape === 'pill' ? '9999px' : theme.buttons.shape === 'square' ? '6px' : '8px'
              }}
            >
              {item.cta_label}
            </div>
          )}
        </div>
      </motion.div>
    </a>
  );

  const renderSplitCard = (item: BlockItem) => (
    <a
      key={item.id}
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block group"
      onClick={(e) => handleClick(e, item)}
      onTouchStart={() => triggerHaptic('light')}
    >
      <motion.div
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.1 }}
        className="flex overflow-hidden transform-gpu will-change-transform motion-reduce:transform-none"
        style={{
          backgroundColor: `${theme.buttons.fill_color}08`,
          borderRadius: getButtonRadius(),
          border: `1px solid ${theme.buttons.fill_color}15`,
        }}
      >
        {/* Image */}
        <div className="w-28 h-28 flex-shrink-0 flex items-center justify-center overflow-hidden relative" style={{ backgroundColor: `${theme.buttons.fill_color}05` }}>
          {item.image_url ? (
            <ThumbnailImage 
              src={item.image_url} 
              alt={item.label}
              className="group-hover:scale-105 transition-transform duration-300 motion-reduce:transition-none"
            />
          ) : (
            <ShoppingBag className="h-6 w-6 opacity-40" style={{ color: theme.typography.text_color }} />
          )}
          {item.is_adult && (
            <div className="absolute top-1 right-1 bg-red-500/90 text-white px-1 py-0.5 rounded text-[8px] font-semibold flex items-center gap-0.5">
              <ShieldAlert className="h-2.5 w-2.5" />
              18+
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-sm line-clamp-2" style={{ color: theme.typography.text_color }}>{item.label}</p>
              {item.badge && (
                <span 
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ backgroundColor: `${theme.buttons.fill_color}20`, color: theme.buttons.fill_color }}
                >
                  {item.badge}
                </span>
              )}
            </div>
            {item.subtitle && (
              <p className="text-xs mt-1 opacity-60 line-clamp-1" style={{ color: theme.typography.text_color }}>{item.subtitle}</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 mt-2">
            {/* Price */}
            {item.price ? (
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm" style={{ color: theme.buttons.fill_color }}>
                  {formatPrice(item.price, item.currency || 'USD')}
                </span>
                {item.compare_at_price && item.compare_at_price > item.price && (
                  <>
                    <span className="text-[10px] line-through opacity-50" style={{ color: theme.typography.text_color }}>
                      {formatPrice(item.compare_at_price, item.currency || 'USD')}
                    </span>
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-500 text-white">
                      -{getDiscountPercent(item.price, item.compare_at_price)}%
                    </span>
                  </>
                )}
              </div>
            ) : (
              <div />
            )}

            {/* CTA Button */}
            {item.cta_label && (
              <motion.span
                whileHover={{ scale: 1.05 }}
                className="text-[10px] font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
                style={{ 
                  backgroundColor: theme.buttons.fill_color, 
                  color: theme.buttons.text_color,
                  borderRadius: theme.buttons.shape === 'pill' ? '9999px' : theme.buttons.shape === 'square' ? '4px' : '6px'
                }}
              >
                {item.cta_label}
              </motion.span>
            )}
          </div>
        </div>
      </motion.div>
    </a>
  );

  return (
    <div className="space-y-3">
      {layout === 'stacked' ? (
        <div className="grid grid-cols-2 gap-3">
          {block.items.map(renderStackedCard)}
        </div>
      ) : (
        <div className="space-y-3">
          {block.items.map(renderSplitCard)}
        </div>
      )}
    </div>
  );
}

function FeaturedMediaBlock({ block, onOutboundClick, theme }: ThemedBlockProps) {
  if (block.items.length === 0) return null;

  const handleClick = (e: React.MouseEvent, item: BlockItem) => {
    const shouldNavigate = onOutboundClick(block.type, block.id, item.id, item.url, item.is_adult || false);
    if (!shouldNavigate) {
      e.preventDefault();
    }
  };

  const getButtonRadius = () => {
    switch (theme.buttons.shape) {
      case 'pill': return '9999px';
      case 'rounded': return '16px';
      case 'square': return '6px';
      default: return '16px';
    }
  };

  return (
    <div className="space-y-3">
      {block.title && (
        <h3 className="text-sm font-medium opacity-70" style={{ color: theme.typography.text_color }}>{block.title}</h3>
      )}
      <div className="space-y-3">
        {block.items.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block group"
            onClick={(e) => handleClick(e, item)}
          >
            <motion.div
              whileTap={{ scale: 0.98 }}
              className="relative overflow-hidden transition-colors"
              style={{
                borderRadius: getButtonRadius(),
                border: `1px solid ${theme.buttons.fill_color}20`,
              }}
            >
              {item.image_url ? (
                <div className="aspect-video">
                  <ThumbnailImage 
                    src={item.image_url} 
                    alt={item.label}
                    className="group-hover:scale-105 transition-transform duration-300 motion-reduce:transition-none"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  {item.is_adult && (
                    <div className="absolute top-2 right-2 bg-red-500/90 text-white px-2 py-1 rounded text-xs font-semibold flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" />
                      18+
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <p className="font-semibold text-white">{item.label}</p>
                  </div>
                </div>
              ) : (
                <div className="aspect-video flex items-center justify-center relative" style={{ backgroundColor: `${theme.buttons.fill_color}10` }}>
                  <ImageIcon className="h-10 w-10 opacity-40" style={{ color: theme.typography.text_color }} />
                  {item.is_adult && (
                    <div className="absolute top-2 right-2 bg-red-500/90 text-white px-2 py-1 rounded text-xs font-semibold flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" />
                      18+
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </a>
        ))}
      </div>
    </div>
  );
}

function HeroCardBlock({ block, theme }: Omit<ThemedBlockProps, 'onOutboundClick'>) {
  const item = block.items[0];
  if (!item || !item.image_url) return null;

  // Parse config from badge field
  let config = {
    card_radius: 'lg' as 'sm' | 'md' | 'lg',
    show_profile_avatar: true,
    text_alignment: 'center' as 'left' | 'center' | 'right',
    text_color: '#ffffff',
    overlay_opacity: 0.4,
  };
  
  if (item.badge) {
    try {
      const parsed = JSON.parse(item.badge);
      config = { ...config, ...parsed };
    } catch (e) {
      // Use defaults
    }
  }

  const getRadius = () => {
    switch (config.card_radius) {
      case 'sm': return '12px';
      case 'md': return '20px';
      case 'lg': return '28px';
      default: return '20px';
    }
  };

  const getTextAlign = (): React.CSSProperties['textAlign'] => {
    return config.text_alignment;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="relative overflow-hidden w-full"
      style={{ borderRadius: getRadius() }}
    >
      {/* Hero Image */}
      <div className="aspect-[16/9] relative">
        <img 
          src={item.image_url} 
          alt={item.label || 'Hero'} 
          className="w-full h-full object-cover"
          loading="eager"
        />
        
        {/* Gradient Overlay */}
        <div 
          className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent"
          style={{ opacity: config.overlay_opacity + 0.4 }}
        />
        
        {/* Content Overlay */}
        <div 
          className="absolute bottom-0 left-0 right-0 p-5 sm:p-6"
          style={{ color: config.text_color, textAlign: getTextAlign() }}
        >
          {/* Headline */}
          {item.label && item.label !== 'Hero Card' && (
            <h2 className="text-xl sm:text-2xl font-bold drop-shadow-lg mb-1">
              {item.label}
            </h2>
          )}
          
          {/* Subheadline */}
          {item.subtitle && (
            <p className="text-sm sm:text-base opacity-90 drop-shadow">
              {item.subtitle}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Social Icon Row - icons only, no labels
function SocialIconRowBlock({ block, onOutboundClick, theme }: ThemedBlockProps) {
  if (block.items.length === 0) return null;

  // Parse config from block title
  let config = {
    icon_size: 'md' as 'sm' | 'md' | 'lg',
    spacing: 'normal' as 'tight' | 'normal' | 'loose',
    use_theme_color: true,
    custom_color: '#ffffff',
  };

  if (block.title) {
    try {
      const parsed = JSON.parse(block.title);
      config = { ...config, ...parsed };
    } catch {
      // Use defaults
    }
  }

  const handleClick = (e: React.MouseEvent, item: BlockItem) => {
    const shouldNavigate = onOutboundClick(block.type, block.id, item.id, item.url, item.is_adult || false);
    if (!shouldNavigate) {
      e.preventDefault();
    }
  };

  const getIconSize = () => {
    switch (config.icon_size) {
      case 'sm': return 18;
      case 'md': return 22;
      case 'lg': return 26;
    }
  };

  const getSize = () => {
    switch (config.icon_size) {
      case 'sm': return 'h-11 w-11';
      case 'md': return 'h-12 w-12';
      case 'lg': return 'h-14 w-14';
    }
  };

  const getGap = () => {
    switch (config.spacing) {
      case 'tight': return 'gap-2';
      case 'normal': return 'gap-3';
      case 'loose': return 'gap-4';
    }
  };

  const sizeClass = getSize();
  const bgColor = config.use_theme_color 
    ? `${theme.buttons.fill_color}20` 
    : `${config.custom_color}20`;

  return (
    <div className={`flex flex-wrap justify-center ${getGap()}`}>
      {block.items.map((item) => (
        <motion.a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          whileTap={{ scale: 0.95 }}
          className={`${sizeClass} rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 motion-reduce:transform-none`}
          style={{ backgroundColor: bgColor }}
          title={item.label}
          onClick={(e) => handleClick(e, item)}
        >
          {item.image_url ? (
            <ThumbnailImage src={item.image_url} alt={item.label} />
          ) : (
            <SocialSvgIcon label={item.label} size={getIconSize()} />
          )}
        </motion.a>
      ))}
    </div>
  );
}

// Email Subscribe Block
interface EmailSubscribeBlockProps {
  block: BlockWithItems;
  theme: ThemeJson;
  pageId?: string;
}

function EmailSubscribeBlock({ block, theme, pageId }: EmailSubscribeBlockProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const item = block.items[0];
  if (!item) return null;

  // Parse config
  let config = {
    title: 'Stay up to date',
    placeholder: 'your@email.com',
    button_label: 'Subscribe',
    success_message: 'Thanks for subscribing! 🎉',
    redirect_url: '',
    collect_name: false,
    name_placeholder: 'Your name',
  };

  if (item.badge) {
    try {
      const parsed = JSON.parse(item.badge);
      config = { ...config, ...parsed };
    } catch {
      // Use defaults
    }
  }

  const validateEmail = (email: string): boolean => {
    return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!pageId) {
      setError('Unable to subscribe');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error: rpcError } = await supabase.rpc('subscribe_to_page', {
        p_page_id: pageId,
        p_email: email,
        p_name: config.collect_name ? name : null,
      });

      if (rpcError) throw rpcError;

      const result = data as { success: boolean; error?: string };
      
      if (result.success) {
        setSuccess(true);
        
        // Redirect if configured
        if (config.redirect_url) {
          setTimeout(() => {
            window.location.href = config.redirect_url;
          }, 1500);
        }
      } else {
        setError(result.error || 'Failed to subscribe');
      }
    } catch (err: any) {
      console.error('Subscribe error:', err);
      setError('Failed to subscribe. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getButtonRadius = () => {
    switch (theme.buttons.shape) {
      case 'pill': return '9999px';
      case 'rounded': return '12px';
      case 'square': return '4px';
      default: return '12px';
    }
  };

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="p-4 rounded-xl text-center"
        style={{
          backgroundColor: `${theme.buttons.fill_color}15`,
          borderRadius: getButtonRadius(),
        }}
      >
        <div className="flex items-center justify-center gap-2" style={{ color: theme.buttons.fill_color }}>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="font-medium">{config.success_message}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      {config.title && (
        <p 
          className="text-sm font-medium text-center"
          style={{ color: theme.typography.text_color }}
        >
          {config.title}
        </p>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-2">
        {config.collect_name && (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={config.name_placeholder}
            className="w-full h-11 px-4 rounded-lg bg-white/10 border border-white/20 text-inherit placeholder:opacity-50 focus:outline-none focus:ring-2 focus:ring-white/30"
            style={{
              color: theme.typography.text_color,
              borderRadius: getButtonRadius(),
            }}
          />
        )}
        
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            placeholder={config.placeholder}
            required
            className="flex-1 h-11 px-4 rounded-lg bg-white/10 border border-white/20 text-inherit placeholder:opacity-50 focus:outline-none focus:ring-2 focus:ring-white/30 min-w-0"
            style={{
              color: theme.typography.text_color,
              borderRadius: getButtonRadius(),
            }}
          />
          <motion.button
            type="submit"
            disabled={loading}
            whileTap={{ scale: 0.98 }}
            className="h-11 px-5 font-medium flex items-center gap-2 flex-shrink-0 disabled:opacity-70"
            style={{
              backgroundColor: theme.buttons.fill_color,
              color: theme.buttons.text_color,
              borderRadius: getButtonRadius(),
            }}
          >
            {loading ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              config.button_label
            )}
          </motion.button>
        </div>
        
        {error && (
          <p className="text-xs text-red-400 text-center">{error}</p>
        )}
      </form>
    </div>
  );
}

// Content Section Block with Carousel/Grid/List
function ContentSectionBlock({ block, onOutboundClick, theme }: ThemedBlockProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  if (block.items.length === 0) return null;

  // Parse config from block title
  let config = {
    section_title: '',
    view_all_url: '',
    view_all_label: 'View all',
    layout: 'carousel' as 'list' | 'grid' | 'carousel',
  };

  if (block.title) {
    try {
      const parsed = JSON.parse(block.title);
      config = { ...config, ...parsed };
    } catch {
      config.section_title = block.title;
    }
  }

  const handleClick = (e: React.MouseEvent, item: BlockItem) => {
    const shouldNavigate = onOutboundClick(block.type, block.id, item.id, item.url, item.is_adult || false);
    if (!shouldNavigate) {
      e.preventDefault();
    }
  };

  const getRadius = () => {
    switch (theme.buttons.shape) {
      case 'pill': return '24px';
      case 'rounded': return '16px';
      case 'square': return '8px';
      default: return '16px';
    }
  };

  // Handle scroll for carousel pagination dots
  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const scrollLeft = container.scrollLeft;
      const itemWidth = container.firstElementChild?.clientWidth || 200;
      const gap = 12;
      const newIndex = Math.round(scrollLeft / (itemWidth + gap));
      setActiveIndex(Math.min(newIndex, block.items.length - 1));
    }
  };

  const scrollToIndex = (index: number) => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const itemWidth = container.firstElementChild?.clientWidth || 200;
      const gap = 12;
      container.scrollTo({
        left: index * (itemWidth + gap),
        behavior: 'smooth',
      });
    }
  };

  // Render carousel item
  const renderItem = (item: BlockItem, isCarousel = false) => (
    <a
      key={item.id}
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => handleClick(e, item)}
      className={cn(
        'block group',
        isCarousel && 'flex-shrink-0 w-[200px] snap-start'
      )}
    >
      <motion.div
        whileTap={{ scale: 0.98 }}
        className="overflow-hidden"
        style={{ borderRadius: getRadius() }}
      >
        {/* Image with fixed aspect ratio */}
        <div 
          className="aspect-[4/3] relative overflow-hidden"
          style={{ backgroundColor: `${theme.buttons.fill_color}10` }}
        >
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.label}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 motion-reduce:transform-none"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="h-8 w-8 opacity-30" style={{ color: theme.typography.text_color }} />
            </div>
          )}
        </div>
        
        {/* Content */}
        <div 
          className="p-3"
          style={{ backgroundColor: `${theme.buttons.fill_color}08` }}
        >
          <p 
            className="font-medium text-sm line-clamp-2"
            style={{ color: theme.typography.text_color }}
          >
            {item.label}
          </p>
          {item.subtitle && (
            <p 
              className="text-xs mt-1 opacity-60"
              style={{ color: theme.typography.text_color }}
            >
              {item.subtitle}
            </p>
          )}
        </div>
      </motion.div>
    </a>
  );

  return (
    <div 
      className="rounded-2xl overflow-hidden"
      style={{ 
        backgroundColor: `${theme.buttons.fill_color}08`,
        borderRadius: getRadius(),
      }}
    >
      {/* Header Row */}
      {(config.section_title || config.view_all_url) && (
        <div className="flex items-center justify-between px-4 py-3">
          {config.section_title && (
            <h3 
              className="font-semibold"
              style={{ color: theme.typography.text_color }}
            >
              {config.section_title}
            </h3>
          )}
          {config.view_all_url && (
            <a
              href={config.view_all_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium opacity-70 hover:opacity-100 transition-opacity"
              style={{ color: theme.buttons.fill_color }}
            >
              {config.view_all_label} →
            </a>
          )}
        </div>
      )}

      {/* Content Area */}
      <div className="px-4 pb-4">
        {config.layout === 'carousel' && (
          <>
            {/* Carousel with scroll-snap */}
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-3"
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              {block.items.map((item) => renderItem(item, true))}
            </div>

            {/* Pagination Dots */}
            {block.items.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-2">
                {block.items.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => scrollToIndex(index)}
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-200',
                      index === activeIndex ? 'w-4' : 'w-1.5 opacity-40'
                    )}
                    style={{
                      backgroundColor: index === activeIndex 
                        ? theme.buttons.fill_color 
                        : theme.typography.text_color,
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {config.layout === 'grid' && (
          <div className="grid grid-cols-2 gap-3">
            {block.items.map((item) => renderItem(item))}
          </div>
        )}

        {config.layout === 'list' && (
          <div className="space-y-3">
            {block.items.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => handleClick(e, item)}
                className="flex items-center gap-3 group"
              >
                <div 
                  className="w-16 h-12 rounded-lg overflow-hidden flex-shrink-0"
                  style={{ backgroundColor: `${theme.buttons.fill_color}10` }}
                >
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.label}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 opacity-30" style={{ color: theme.typography.text_color }} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p 
                    className="font-medium text-sm truncate group-hover:underline"
                    style={{ color: theme.typography.text_color }}
                  >
                    {item.label}
                  </p>
                  {item.subtitle && (
                    <p 
                      className="text-xs opacity-60 truncate"
                      style={{ color: theme.typography.text_color }}
                    >
                      {item.subtitle}
                    </p>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ textColor }: { textColor: string }) {
  return (
    <div className="text-center py-12">
      <div className="rounded-full bg-white/10 p-4 w-fit mx-auto mb-4">
        <LinkIcon className="h-8 w-8" style={{ color: textColor, opacity: 0.6 }} />
      </div>
      <p style={{ color: textColor, opacity: 0.6 }}>No content yet</p>
    </div>
  );
}

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
