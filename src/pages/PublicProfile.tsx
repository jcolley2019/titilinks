import { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import type { Tables, Enums } from '@/integrations/supabase/types';

type Page = Tables<'pages'>;
type Mode = Tables<'modes'>;
type Block = Tables<'blocks'>;
type BlockItem = Tables<'block_items'>;

type ModeType = Enums<'mode_type'>;

interface BlockWithItems extends Block {
  items: BlockItem[];
}

function detectMode(searchParams: URLSearchParams): ModeType {
  // 1. Check query param mode=recruit
  const modeParam = searchParams.get('mode');
  if (modeParam === 'recruit') {
    return 'recruit';
  }

  // 2. Check utm_campaign=recruit
  const utmCampaign = searchParams.get('utm_campaign');
  if (utmCampaign === 'recruit') {
    return 'recruit';
  }

  // 3. Check referrer for social platforms -> shop
  if (typeof document !== 'undefined' && document.referrer) {
    const referrer = document.referrer.toLowerCase();
    if (referrer.includes('tiktok.com') || referrer.includes('instagram.com')) {
      return 'shop';
    }
  }

  // 4. Default -> shop
  return 'shop';
}

export default function PublicProfile() {
  const { handle } = useParams<{ handle: string }>();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page | null>(null);
  const [blocks, setBlocks] = useState<BlockWithItems[]>([]);
  const [notFound, setNotFound] = useState(false);

  const detectedMode = useMemo(() => detectMode(searchParams), [searchParams]);

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

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-8 pb-20">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <Avatar className="h-20 w-20 mx-auto mb-4 ring-2 ring-primary/20">
            {page.avatar_url ? (
              <AvatarImage src={page.avatar_url} alt={page.display_name || page.handle} />
            ) : null}
            <AvatarFallback className="text-xl bg-primary text-primary-foreground">
              {(page.display_name || page.handle).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <h1 className="text-xl font-bold text-foreground">
            {page.display_name || `@${page.handle}`}
          </h1>
          {page.bio && (
            <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
              {page.bio}
            </p>
          )}
          <div className="flex items-center justify-center gap-1 mt-2 text-xs text-muted-foreground">
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
            <EmptyState />
          ) : (
            blocks.map((block, index) => (
              <motion.section
                key={block.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <BlockRenderer block={block} />
              </motion.section>
            ))
          )}
        </div>

        {/* Footer */}
        <footer className="mt-12 text-center">
          <p className="text-xs text-muted-foreground">
            Powered by <span className="font-semibold text-primary">TitiLINKS</span>
          </p>
        </footer>
      </div>
    </div>
  );
}

function BlockRenderer({ block }: { block: BlockWithItems }) {
  switch (block.type) {
    case 'primary_cta':
      return <PrimaryCtaBlock block={block} />;
    case 'social_links':
      return <SocialLinksBlock block={block} />;
    case 'links':
      return <LinksBlock block={block} />;
    case 'product_cards':
      return <ProductCardsBlock block={block} />;
    case 'featured_media':
      return <FeaturedMediaBlock block={block} />;
    default:
      return null;
  }
}

function PrimaryCtaBlock({ block }: { block: BlockWithItems }) {
  const item = block.items[0];
  if (!item) return null;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block"
    >
      <motion.div
        whileTap={{ scale: 0.98 }}
        className="bg-primary text-primary-foreground rounded-xl p-4 text-center shadow-lg hover:opacity-90 transition-opacity"
      >
        <p className="font-semibold text-lg">{item.label}</p>
        {item.subtitle && (
          <p className="text-sm opacity-80 mt-1">{item.subtitle}</p>
        )}
      </motion.div>
    </a>
  );
}

function SocialLinksBlock({ block }: { block: BlockWithItems }) {
  if (block.items.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center gap-3">
      {block.items.map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center h-11 w-11 rounded-full bg-secondary hover:bg-secondary/80 transition-colors"
          title={item.label}
        >
          <Share2 className="h-5 w-5 text-foreground" />
        </a>
      ))}
    </div>
  );
}

function LinksBlock({ block }: { block: BlockWithItems }) {
  if (block.items.length === 0) return null;

  return (
    <div className="space-y-2">
      {block.title && (
        <h3 className="text-sm font-medium text-muted-foreground mb-3">{block.title}</h3>
      )}
      {block.items.map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <motion.div
            whileTap={{ scale: 0.98 }}
            className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3 hover:border-primary/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground truncate">{item.label}</p>
                {item.badge && (
                  <span className="text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    {item.badge}
                  </span>
                )}
              </div>
              {item.subtitle && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{item.subtitle}</p>
              )}
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </motion.div>
        </a>
      ))}
    </div>
  );
}

function ProductCardsBlock({ block }: { block: BlockWithItems }) {
  if (block.items.length === 0) return null;

  return (
    <div className="space-y-3">
      {block.title && (
        <h3 className="text-sm font-medium text-muted-foreground">{block.title}</h3>
      )}
      <div className="grid grid-cols-2 gap-3">
        {block.items.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block group"
          >
            <motion.div
              whileTap={{ scale: 0.98 }}
              className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/50 transition-colors"
            >
              <div className="aspect-square bg-secondary flex items-center justify-center overflow-hidden">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.label}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <ShoppingBag className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-1">
                  <p className="font-medium text-sm text-foreground line-clamp-2">{item.label}</p>
                  {item.badge && (
                    <span className="text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded flex-shrink-0">
                      {item.badge}
                    </span>
                  )}
                </div>
                {item.subtitle && (
                  <p className="text-xs text-muted-foreground mt-1">{item.subtitle}</p>
                )}
              </div>
            </motion.div>
          </a>
        ))}
      </div>
    </div>
  );
}

function FeaturedMediaBlock({ block }: { block: BlockWithItems }) {
  if (block.items.length === 0) return null;

  return (
    <div className="space-y-3">
      {block.title && (
        <h3 className="text-sm font-medium text-muted-foreground">{block.title}</h3>
      )}
      <div className="space-y-3">
        {block.items.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block group"
          >
            <motion.div
              whileTap={{ scale: 0.98 }}
              className="relative rounded-xl overflow-hidden bg-card border border-border hover:border-primary/50 transition-colors"
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
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <p className="font-semibold text-white">{item.label}</p>
                  </div>
                </div>
              ) : (
                <div className="aspect-video bg-secondary flex items-center justify-center">
                  <ImageIcon className="h-10 w-10 text-muted-foreground" />
                </div>
              )}
            </motion.div>
          </a>
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12">
      <div className="rounded-full bg-secondary p-4 w-fit mx-auto mb-4">
        <LinkIcon className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground">No content yet</p>
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
