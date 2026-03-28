import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
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
} from 'lucide-react';
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

  return (
    <PageBackground theme={theme}>
      {/* Content Layer */}
      <div
        className="max-w-[640px] mx-auto px-4 py-8 pb-20"
        style={{
          fontFamily: getFontFamily(),
          color: theme.typography.text_color,
        }}
      >
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
      case 'sm': return { container: 'h-11 w-11', icon: 'text-lg' };
      case 'md': return { container: 'h-12 w-12', icon: 'text-xl' };
      case 'lg': return { container: 'h-14 w-14', icon: 'text-2xl' };
    }
  };

  const getGap = () => {
    switch (config.spacing) {
      case 'tight': return 'gap-2';
      case 'normal': return 'gap-3';
      case 'loose': return 'gap-4';
    }
  };

  const size = getSize();
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
          className={`${size.container} rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 motion-reduce:transform-none`}
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
