import { useState, useEffect, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { hopPath } from '@/lib/adult-gate';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Link as LinkIcon,
  ExternalLink,
  Share2,
  UserPlus,
} from 'lucide-react';
import type { Tables, Enums } from '@/integrations/supabase/types';
import { useEventTracking } from '@/hooks/useEventTracking';
import { useLanguage } from '@/hooks/useLanguage';
import { AdultGateModal } from '@/components/AdultGateModal';
import { getThemeWithDefaults, applyAutoContrast, resolveDesktopStageDeviceId, type ThemeJson } from '@/lib/theme-defaults';
import { resolveEffectivePageStyle } from '@/lib/surface';
import { PageBackground } from '@/components/PageBackground';
import { StickyCtaBar } from '@/components/StickyCtaBar';
import { cn } from '@/lib/utils';
import { EditableProfileView } from '@/components/EditableProfileView';
import { TrackingPixels } from '@/components/TrackingPixels';
import { DesktopStage } from '@/components/DesktopStage';
import { ensureUserFontFaces, fontsFromBrandJson } from '@/lib/user-fonts';
import { usePublicPageBranding } from '@/hooks/usePublicPageBranding';
import { can } from '@/lib/entitlements';

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
  // 1. Explicit page selector (?page=1 / ?page=2).
  const pageParam = searchParams.get('page');
  if (pageParam === '2') {
    return { mode: 'page2', reason: 'param' };
  }
  if (pageParam === '1') {
    return { mode: 'page1', reason: 'param' };
  }

  // 2. Referrer from social platforms -> Page 1.
  if (typeof document !== 'undefined' && document.referrer) {
    const referrer = document.referrer.toLowerCase();
    if (referrer.includes('tiktok.com') || referrer.includes('instagram.com')) {
      return { mode: 'page1', reason: 'referrer' };
    }
  }

  // 3. Default -> Page 1.
  return { mode: 'page1', reason: 'default' };
}

export default function PublicProfile() {
  const { handle } = useParams<{ handle: string }>();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page | null>(null);
  // PRICE.TRUTH.1 / PROMO.TOGGLE.1: page owner's plan + optional-badge toggle,
  // read through the same public security-definer RPC pattern as pixels/fonts
  // above. Fails toward { free, badge shown }.
  const ownerBranding = usePublicPageBranding(page?.id);
  const [blocksByMode, setBlocksByMode] = useState<{ page1: BlockWithItems[]; page2: BlockWithItems[] }>({ page1: [], page2: [] });
  const [notFound, setNotFound] = useState(false);
  // PIXELS.1: the page owner's tracking-pixel IDs, read through a public
  // security-definer RPC (profiles is owner-only, so an anon visitor can't
  // select them directly). Best-effort — a null result just means no pixels.
  const [pixelIds, setPixelIds] = useState<{ meta: string | null; tiktok: string | null; ga4: string | null }>({
    meta: null,
    tiktok: null,
    ga4: null,
  });
  const [stickyCtaByMode, setStickyCtaByMode] = useState<{ page1: boolean; page2: boolean }>({ page1: false, page2: false });
  const [selectedMode, setSelectedMode] = useState<'page1' | 'page2'>('page1');
  // Visitor switcher flips selectedMode → derive the active page's blocks + sticky CTA (no refetch).
  const blocks = blocksByMode[selectedMode] ?? [];
  const stickyCtaEnabled = stickyCtaByMode[selectedMode] ?? false;

  // Scroll-to-top visibility
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [headerOpacity, setHeaderOpacity] = useState(0);
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  const [shareView, setShareView] = useState(false);
  const [shareName, setShareName] = useState('');
  const [shareEmail, setShareEmail] = useState('');
  const [shareMsg, setShareMsg] = useState('');
  // DESK.STAGE.1: on a wide viewport the page scrolls INSIDE the stage, so the
  // window never moves and `window.scrollY` would sit at 0 forever — the header
  // would never fade in. The stage hands back its own scroller; `null` means
  // the viewport is narrow and the window is the scroller, as before.
  const [scrollHost, setScrollHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const target: HTMLElement | Window = scrollHost ?? window;
    const onScroll = () => {
      const y = scrollHost ? scrollHost.scrollTop : window.scrollY;
      setShowScrollTop(y > 300);
      setHeaderOpacity(Math.min(y / 220, 1));
    };
    onScroll(); // resync when the scroller changes under us
    target.addEventListener('scroll', onScroll, { passive: true });
    return () => target.removeEventListener('scroll', onScroll);
  }, [scrollHost]);

  // Keep the iOS safe-area (status-bar region) fixed black so it blends with the chrome
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#0e0c09';
    return () => { document.body.style.backgroundColor = prev; };
  }, []);

  const navigate = useNavigate();

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
    setSelectedMode(detectedMode as 'page1' | 'page2');
  }, [detectedMode]);

  // Handle outbound click with adult content check
  const handleOutboundClick = useCallback((
    blockType: string,
    blockId: string,
    itemId: string,
    url: string,
    isAdult?: boolean
  ) => {
    // ADULT.2a: a gated link never carries its URL in the DOM, so there is
    // nothing to navigate to — the gate takes the confirmation and opens it.
    // Unconditional by design: consent is not remembered across loads.
    if (isAdult) {
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
      // ADULT.2b: forward through the /go hop rather than opening the
      // destination here. Same tab, per the Link.me reference: the hop
      // replaces itself, so Back from the destination lands on this profile,
      // and a same-tab navigation can't be swallowed by a popup blocker the
      // way a window.open one step removed from the tap can be.
      navigate(hopPath(pendingAdultLink.itemId));
      setPendingAdultLink(null);
    }
  }, [pendingAdultLink, trackOutboundClick, navigate]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

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

      // PIXELS.1: best-effort read of the owner's tracking pixels via the
      // public security-definer RPC. Isolated try/catch so a pixels failure
      // (RLS, missing function pre-migration) never 404s the profile.
      try {
        const { data: px } = await supabase.rpc('get_public_tracking_pixels', {
          page_handle: handle.toLowerCase(),
        });
        const row = Array.isArray(px) ? px[0] : px;
        setPixelIds({
          meta: row?.meta_pixel_id ?? null,
          tiktok: row?.tiktok_pixel_id ?? null,
          ga4: row?.ga4_id ?? null,
        });
      } catch (pxErr) {
        console.warn('[pixels] fetch failed:', pxErr);
      }

      // BRAND.1: best-effort read of the owner's uploaded fonts via the public
      // security-definer RPC (profiles.brand_json is owner-only RLS, same
      // pattern as pixels above), then register their @font-face rules so any
      // `custom:` font key on this page resolves. Isolated try/catch: a fonts
      // failure (missing function pre-migration) never 404s the profile.
      try {
        const { data: brandFonts } = await supabase.rpc('get_public_brand_fonts', {
          page_handle: handle.toLowerCase(),
        });
        ensureUserFontFaces(fontsFromBrandJson(brandFonts));
      } catch (fontErr) {
        console.warn('[fonts] fetch failed:', fontErr);
      }

      // Fetch both modes (page1 = Page 1, page2 = Page 2) so the visitor
      // switcher can flip pages instantly without a refetch.
      const { data: modesData, error: modeError } = await supabase
        .from('modes')
        .select('*')
        .eq('page_id', pageData.id)
        .in('type', ['page1', 'page2']);

      if (modeError) throw modeError;

      const shopMode = (modesData || []).find((m) => m.type === 'page1') as (Mode & { sticky_cta_enabled?: boolean }) | undefined;
      const page2Mode = (modesData || []).find((m) => m.type === 'page2') as (Mode & { sticky_cta_enabled?: boolean }) | undefined;

      setStickyCtaByMode({
        page1: shopMode?.sticky_cta_enabled ?? false,
        page2: page2Mode?.sticky_cta_enabled ?? false,
      });

      const modeIds = (modesData || []).map((m) => m.id);
      if (modeIds.length === 0) {
        setBlocksByMode({ page1: [], page2: [] });
        setLoading(false);
        return;
      }

      // Fetch enabled blocks for both modes in one query.
      const { data: blocksData, error: blocksError } = await supabase
        .from('blocks')
        .select('*')
        .in('mode_id', modeIds)
        .eq('is_enabled', true)
        .order('order_index', { ascending: true });

      if (blocksError) throw blocksError;

      const allBlocks = blocksData || [];
      // Fetch items for all blocks (both modes) in one query.
      const blockIds = allBlocks.map((b) => b.id);
      const { data: itemsData, error: itemsError } = await supabase
        .from('block_items')
        .select('*')
        .in('block_id', blockIds)
        .order('order_index', { ascending: true });

      if (itemsError) throw itemsError;

      const groupForMode = (modeId: string | undefined): BlockWithItems[] =>
        !modeId ? [] : allBlocks
          .filter((b) => b.mode_id === modeId)
          .map((block) => ({
            ...block,
            items: (itemsData || []).filter((item) => item.block_id === block.id),
          }));

      setBlocksByMode({
        page1: groupForMode(shopMode?.id),
        page2: groupForMode(page2Mode?.id),
      });
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

  const handleSaveContact = () => {
    if (!page) return;
    const esc = (s: string) => String(s).replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const name = page.display_name || page.handle || 'Contact';
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${esc(name)}`, `URL:${profileUrl}`];
    if (page.bio) lines.push(`NOTE:${esc(page.bio)}`);
    lines.push('END:VCARD');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9]/gi, '_')}.vcf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const ownerEmail = (page?.theme_json as any)?.contactCard?.email || '';

  const closeContactSheet = () => {
    setContactSheetOpen(false);
    setShareView(false);
    setShareName('');
    setShareEmail('');
    setShareMsg('');
  };

  const sendShareBack = () => {
    const subject = `New contact from ${shareName || 'a visitor'} via your link page`;
    const body = `Name: ${shareName}\nEmail: ${shareEmail}\n\n${shareMsg}`;
    window.location.href = `mailto:${ownerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    closeContactSheet();
  };
  const ogTitle = page ? `${page.display_name || page.handle} | TitiLinks` : 'TitiLinks';
  const ogDescription = page?.bio || 'Check out my links, products, and more on TitiLinks.';
  const page2AvatarUrl = (page?.theme_json as any)?.avatar_url_page2 || null;
  const heroInheritPublic = (page?.theme_json as any)?.pages?.page2?.heroInherit === true;
  const ogImage = (selectedMode === 'page2' && !heroInheritPublic && page2AvatarUrl)
    ? page2AvatarUrl
    : (page?.avatar_url || 'https://titilinks.lovable.app/placeholder.svg');
  // PAGES.STYLE.1: the page in view renders its OWN effective style — the
  // visitor switching pages re-derives this, so a full-bleed Page 2 keeps its
  // transparent header even when Page 1 is hero.
  const isFullBleedPage = resolveEffectivePageStyle(page?.theme_json, selectedMode) === 'full_bleed';
  // DESK.STAGE.1: the ambient backdrop paints the page's OWN hero photo. Same
  // per-page selection the live hero uses (Page 2 mirrors Page 1 when it
  // inherits), so the blur behind the stage always matches what is on it — and
  // because it is the identical URL, it costs no extra request.
  const publicTheme = getThemeWithDefaults(page?.theme_json);
  const page1HeroImage = publicTheme.header?.image_url || page?.avatar_url || '';
  const backdropImage = selectedMode === 'page2'
    ? (heroInheritPublic ? page1HeroImage : (page2AvatarUrl || ''))
    : page1HeroImage;
  // DESK.STAGE.2: the owner's stage device. Read from the RAW theme_json —
  // getThemeWithDefaults returns the VISUAL theme and drops structural keys, so
  // `publicTheme` is not where this lives. Profile-level (not per-page): the
  // stage is the window the whole profile is viewed through.
  const stageDeviceId = resolveDesktopStageDeviceId(page?.theme_json);

  return (
    <>
      <Helmet>
        <title>{ogTitle}</title>
        <meta property="og:title" content={ogTitle} />
        <meta property="og:description" content={ogDescription} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:url" content={profileUrl} />
        <meta name="theme-color" content="#0e0c09" />
        <meta property="og:type" content="profile" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={ogTitle} />
        <meta name="twitter:description" content={ogDescription} />
        <meta name="twitter:image" content={ogImage} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Bebas+Neue&family=Abril+Fatface&family=Pacifico&family=Orbitron:wght@400;700&family=Caveat:wght@400;700&family=Archivo+Black&family=Lora:wght@400;700&family=Patrick+Hand&family=Space+Grotesk:wght@400;700&display=swap" rel="stylesheet" />
      </Helmet>
      {/* PIXELS.1 — public-route-only pixel injection (the fence). Renders null;
          injects the owner's base pixels into the head. Never mounted by the
          editor / dashboard / visitor-preview. */}
      <TrackingPixels metaPixelId={pixelIds.meta} tiktokPixelId={pixelIds.tiktok} ga4Id={pixelIds.ga4} />
      {/* DESK.STAGE.1: below the breakpoint this renders `children` and nothing
          else — the narrow page is untouched. Above it, the page moves inside a
          phone-shaped stage and every measured container aspect becomes the
          phone's, so the desktop render IS the mobile render. */}
      <DesktopStage backdropImage={backdropImage} theme={publicTheme} deviceId={stageDeviceId} onScrollHost={setScrollHost}>
      <div className="min-h-screen bg-[#0e0c09]">
        {/* Public header — transparent at top; color + name fade in on scroll (Step 2) */}
        <header className="fixed top-0 left-0 right-0 z-50" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', backgroundColor: `rgba(14, 12, 9, ${isFullBleedPage ? 0 : headerOpacity})` }}>
          <div className="flex items-center justify-between px-4 h-14">
            <div className="min-w-0 flex-1" style={{ opacity: headerOpacity, ...(isFullBleedPage ? { textShadow: '0 1px 8px rgba(0,0,0,0.7)' } : {}) }}>
              <p className="truncate text-white font-semibold text-[15px] leading-none">
                {page?.display_name || page?.handle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setContactSheetOpen(true)}
              aria-label={t('publicProfile.saveContactAria')}
              className="flex items-center justify-center h-9 w-9 rounded-full bg-black/30 backdrop-blur-sm text-white"
            >
              <UserPlus className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* FS.HEADER-b: full-screen only — content melts away as it
            scrolls under the transparent header, keeping the header
            name legible. Sits below the header (z-50), above the
            scrolling content. Hero pages: none. */}
        {isFullBleedPage && (
          <div
            aria-hidden="true"
            className="fixed top-0 left-0 right-0 z-40 pointer-events-none"
            style={{
              height: 'calc(env(safe-area-inset-top, 0px) + 96px)',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.45) 45%, transparent 100%)',
              opacity: headerOpacity,
            }}
          />
        )}

        {/* Contact sheet — Save to Contacts (Step A) */}
        <AnimatePresence>
          {contactSheetOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeContactSheet}
                className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 32, stiffness: 320 }}
                className="fixed bottom-0 left-0 right-0 z-[61] rounded-t-3xl bg-[#17130e] px-6 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+1.75rem)]"
              >
                <div className="mx-auto mb-6 h-1 w-10 rounded-full bg-white/15" />
                {!shareView ? (
                  <>
                    <div className="flex flex-col items-center text-center">
                      <Avatar className="h-16 w-16 mb-3">
                        <AvatarImage src={page?.avatar_url || ''} alt={page?.display_name || ''} />
                        <AvatarFallback className="bg-[#C9A55C] text-[#0e0c09] font-semibold">
                          {(page?.display_name || page?.handle || '?').charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <p className="text-white font-semibold text-lg leading-tight">
                        {page?.display_name || page?.handle}
                      </p>
                      {page?.handle && (
                        <p className="text-white/45 text-sm mt-0.5">@{page.handle}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { handleSaveContact(); ownerEmail ? setShareView(true) : closeContactSheet(); }}
                      className="mt-6 w-full rounded-2xl bg-[#C9A55C] py-3.5 font-semibold text-[#0e0c09]"
                    >
                      {t('publicProfile.saveToContacts')}
                    </button>
                    <button
                      type="button"
                      onClick={closeContactSheet}
                      className="mt-2 w-full rounded-2xl py-3 font-medium text-white/50"
                    >
                      {t('publicProfile.cancel')}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-white font-semibold text-lg text-center leading-tight">
                      {t('publicProfile.sendYourInfo').replace('{name}', page?.display_name || page?.handle || '')}
                    </p>
                    <p className="text-white/45 text-sm text-center mt-1 mb-4">{t('publicProfile.straightToInbox')}</p>
                    <input
                      type="text"
                      value={shareName}
                      onChange={(e) => setShareName(e.target.value)}
                      placeholder={t('publicProfile.yourNamePlaceholder')}
                      className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/30 outline-none focus:border-[#C9A55C] mb-2"
                    />
                    <input
                      type="email"
                      value={shareEmail}
                      onChange={(e) => setShareEmail(e.target.value)}
                      placeholder={t('publicProfile.yourEmailPlaceholder')}
                      className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/30 outline-none focus:border-[#C9A55C] mb-2"
                    />
                    <textarea
                      value={shareMsg}
                      onChange={(e) => setShareMsg(e.target.value)}
                      placeholder={t('publicProfile.reachOutPlaceholder')}
                      rows={3}
                      className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder-white/30 outline-none focus:border-[#C9A55C] resize-none mb-4"
                    />
                    <button
                      type="button"
                      disabled={!shareName || !shareEmail}
                      onClick={sendShareBack}
                      className="w-full rounded-2xl bg-[#C9A55C] py-3.5 font-semibold text-[#0e0c09] disabled:opacity-40"
                    >
                      {t('publicProfile.send')}
                    </button>
                    <button
                      type="button"
                      onClick={closeContactSheet}
                      className="mt-2 w-full rounded-2xl py-3 font-medium text-white/50"
                    >
                      {t('publicProfile.noThanks')}
                    </button>
                  </>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
        <EditableProfileView
          page={page}
          blocks={blocks}
          editMode={false}
          showBranding={!can(ownerBranding.plan, 'removeBranding') || ownerBranding.show_badge}
          onBlockEdit={() => {}}
          onBlockToggle={() => {}}
          onBlockReorder={() => {}}
          onRefresh={() => {}}
          selectedMode={selectedMode}
          onModeChange={setSelectedMode}
          onOutboundClick={handleOutboundClick}
        />
        <AdultGateModal
          open={!!pendingAdultLink}
          onOpenChange={(o) => { if (!o) handleAdultCancel(); }}
          onConfirm={handleAdultConfirm}
          onCancel={handleAdultCancel}
        />
      </div>
      </DesktopStage>
    </>
  );
}

// ─── Helper Components (kept for NotFoundView, PublicProfileSkeleton) ────────

function NotFoundView({ handle }: { handle?: string }) {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground mb-2">404</h1>
        <p className="text-muted-foreground">
          {handle ? t('publicProfile.handleNotFound').replace('{handle}', handle) : t('publicProfile.pageNotFound')}
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
