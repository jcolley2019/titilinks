import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { AdultContentDialog, hasAdultConsent } from '@/components/AdultContentDialog';
import { getThemeWithDefaults, type ThemeJson } from '@/lib/theme-defaults';
import { PageBackground } from '@/components/PageBackground';
import { LinkButton } from '@/components/LinkButton';

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
  // 1. Check query param mode=recruit
  const modeParam = searchParams.get('mode');
  if (modeParam === 'recruit') {
    return { mode: 'recruit', reason: 'param' };
  }

  // 2. Check utm_campaign=recruit
  const utmCampaign = searchParams.get('utm_campaign');
  if (utmCampaign === 'recruit') {
    return { mode: 'recruit', reason: 'utm' };
  }

  // 3. Check referrer for social platforms -> shop
  if (typeof document !== 'undefined' && document.referrer) {
    const referrer = document.referrer.toLowerCase();
    if (referrer.includes('tiktok.com') || referrer.includes('instagram.com')) {
      return { mode: 'shop', reason: 'referrer' };
    }
  }

  // 4. Default -> shop
  return { mode: 'shop', reason: 'default' };
}

export default function PublicProfile() {
  const { handle } = useParams<{ handle: string }>();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<BlockWithItems[]>([]);
  const [notFound, setNotFound] = useState(false);

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
        setLoading(false);
        return;
      }

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

  // Get theme with defaults
  const theme = getThemeWithDefaults(page.theme_json);

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
            {detectedMode === 'shop' ? (
              <ShoppingBag className="h-3 w-3" />
            ) : (
              <Users className="h-3 w-3" />
            )}
            <span className="capitalize">{detectedMode}</span>
          </div>
        </motion.header>

        {/* Blocks */}
        <div className="space-y-6">
          {blocks.length === 0 ? (
          <EmptyState textColor={theme.typography.text_color} />
          ) : (
            blocks.map((block, index) => (
              <motion.section
                key={block.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <BlockRenderer block={block} onOutboundClick={handleOutboundClick} theme={theme} />
              </motion.section>
            ))
          )}
        </div>

        {/* Footer */}
        <footer className="mt-12 text-center">
          <p className="text-xs opacity-60" style={{ color: theme.typography.text_color }}>
            Powered by <span className="font-semibold">TitiLINKS</span>
          </p>
        </footer>
      </div>

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

function BlockRenderer({ block, onOutboundClick, theme }: BlockRendererProps) {
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

  const handleClick = (e: React.MouseEvent) => {
    const shouldNavigate = onOutboundClick(block.type, block.id, item.id, item.url, item.is_adult || false);
    if (!shouldNavigate) {
      e.preventDefault();
    }
  };

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block"
      onClick={handleClick}
    >
      <LinkButton theme={theme}>
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

  // Get platform icon based on label
  const getPlatformEmoji = (label: string): string => {
    const lower = label.toLowerCase();
    if (lower.includes('tiktok')) return '🎵';
    if (lower.includes('instagram')) return '📸';
    if (lower.includes('youtube')) return '▶️';
    if (lower.includes('facebook')) return '👤';
    if (lower.includes('snapchat')) return '👻';
    if (lower.includes('twitch') || lower.includes('kick')) return '🎮';
    if (lower.includes('discord')) return '💬';
    if (lower.includes('twitter') || lower === 'x') return '𝕏';
    if (lower.includes('spotify')) return '🎧';
    if (lower.includes('apple')) return '🍎';
    return '🔗';
  };

  return (
    <div className="flex flex-wrap justify-center gap-3">
      {block.items.map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center h-11 w-11 rounded-full transition-colors relative overflow-hidden"
          style={{
            backgroundColor: `${theme.buttons.fill_color}20`,
          }}
          title={item.label}
          onClick={(e) => handleClick(e, item)}
        >
          {item.image_url ? (
            <img src={item.image_url} alt={item.label} className="w-full h-full object-cover" />
          ) : (
            <span className="text-lg">{getPlatformEmoji(item.label)}</span>
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

  const handleClick = (e: React.MouseEvent, item: BlockItem) => {
    const shouldNavigate = onOutboundClick(block.type, block.id, item.id, item.url, item.is_adult || false);
    if (!shouldNavigate) {
      e.preventDefault();
    }
  };

  return (
    <div className="space-y-3">
      {block.title && (
        <h3 className="text-sm font-medium mb-3 opacity-70" style={{ color: theme.typography.text_color }}>{block.title}</h3>
      )}
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
      <div className="grid grid-cols-2 gap-3">
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
              className="overflow-hidden transition-colors"
              style={{
                backgroundColor: `${theme.buttons.fill_color}10`,
                borderRadius: getButtonRadius(),
                border: `1px solid ${theme.buttons.fill_color}20`,
              }}
            >
              <div className="aspect-square flex items-center justify-center overflow-hidden relative" style={{ backgroundColor: `${theme.buttons.fill_color}05` }}>
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.label}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
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
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-1">
                  <p className="font-medium text-sm line-clamp-2" style={{ color: theme.typography.text_color }}>{item.label}</p>
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
                  <p className="text-xs mt-1 opacity-60" style={{ color: theme.typography.text_color }}>{item.subtitle}</p>
                )}
              </div>
            </motion.div>
          </a>
        ))}
      </div>
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
                  <img
                    src={item.image_url}
                    alt={item.label}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
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
