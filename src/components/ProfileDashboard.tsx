import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Plus,
  Heart,
  Link as LinkIcon,
  MousePointer,
  Type,
  Palette,
  Video,
  Youtube,
  ShoppingBag,
  Download,
  Lock,
  Calendar,
  FileText,
  BarChart2,
  LayoutGrid,
  Image as ImageIcon,
  User,
  ChevronLeft,
  Files,
  GalleryHorizontalEnd,
  History,
  Sparkles,
  Camera,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { randomUUID } from '@/lib/utils';
import { HeroVideo } from '@/components/EditableProfileView';
import { useAuth } from '@/hooks/useAuth';
import { useEntitlements } from '@/hooks/useEntitlements';
import { resolveEffectivePageStyle, resolveHeroConfig } from '@/lib/surface';
import { canonicalHeroAspect, canonicalFullBleedAspect } from '@/lib/device-presets';
// FIX.MEDIA.1: the panel preview resolves through the SAME function the live
// page does, at the SAME container aspect — that equality is the contract.
import { useElementAspect, type HeroFraming } from '@/lib/hero-framing';
import type { PageId, PageStyle } from '@/lib/theme-defaults';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';
import { PrimaryCtaEditor } from '@/components/editors/PrimaryCtaEditor';
import { SocialLinksEditor } from '@/components/editors/SocialLinksEditor';
import { LinksEditor } from '@/components/editors/LinksEditor';
import type { LinkItem } from '@/components/editors/LinksEditor';
import type { HeaderDraft } from '@/lib/header-draft';
import { ProductCardsEditor } from '@/components/editors/ProductCardsEditor';
import { EmailSubscribeEditor } from '@/components/editors/EmailSubscribeEditor';
import { GalleryEditor } from '@/components/editors/GalleryEditor';
import { CarouselEditor } from '@/components/editors/CarouselEditor';
import { BioEditor } from '@/components/editors/BioEditor';
import { FeaturedMediaEditor } from '@/components/editors/FeaturedMediaEditor';
import { VideoFeedEditor } from '@/components/editors/VideoFeedEditor';
import { HeroCardEditor } from '@/components/editors/HeroCardEditor';
import { SocialIconRowEditor } from '@/components/editors/SocialIconRowEditor';
import { ContentSectionEditor } from '@/components/editors/ContentSectionEditor';
import { TextBlockEditor } from '@/components/editors/TextBlockEditor';
import { TextBlocksPanel } from '@/components/editors/TextBlocksPanel';
import { TrackingPixelsEditor } from '@/components/editors/TrackingPixelsEditor';
import { SnapshotsEditor } from '@/components/editors/SnapshotsEditor';
import { DesignEditor } from '@/components/editors/DesignEditor';
import { TemplateGallery } from '@/components/editors/TemplateGallery';
import { PageSetupWizard, type WizardResume } from '@/components/editors/PageSetupWizard';
import type { ChecklistRoute } from '@/lib/ais-checklist';
import type { BlockWithItems } from '@/components/blocks/types';
import { BLOCK_PRESETS, DEFAULT_PRESET_KEY } from '@/lib/block-presets';
import { FONT_OPTIONS, resolveFontFamily } from '@/lib/fonts';

export interface EditingBlockTarget {
  id: string;
  type: string;
  title: string;
  // G2 single-item entry (links only). When set, the LinksEditor opens straight
  // into the detail panel for that item (directItemId) or a blank new item
  // (directNew) instead of the list.
  directItemId?: string | null;
  directNew?: boolean;
}

interface ProfileDashboardProps {
  open: boolean;
  onClose: () => void;
  pageId: string;
  modeId: string | null;
  onBlockEdit: (blockId: string) => void;
  onRefresh: () => void;
  /** Active editing page (page1 = Page 1, page2 = Page 2). Drives which page's
   *  hero config the dashboard reads/writes, and the Pages config view. */
  selectedMode?: 'page1' | 'page2';
  /** Switches which page is being edited, from the Pages config view. */
  onSelectedModeChange?: (mode: 'page1' | 'page2') => void;
  /**
   * When set together with `open`, the panel skips the section-list view and
   * opens directly into the editor for this block. Pressing back closes the
   * whole panel rather than falling back to the section list — the user came
   * from tapping a live block, not from the add-content menu.
   */
  editingBlock?: EditingBlockTarget | null;
  /** When set with `open`, the panel opens directly into the Video Profile menu
   *  (driven by the hero video pencil). */
  openVideoProfile?: boolean;
  /** FIX.MEDIA.1 — live hero-video framing, reported while a slider is being
   *  dragged so the page preview moves with it instead of waiting on the
   *  debounced save. Null when the Video Profile panel is closed. */
  onVideoPosDraft?: (framing: HeroFraming | null) => void;
  /** Live-mirror channel (L2): forwarded to LinksEditor so the in-progress
   *  draft reaches the preview before Save. */
  onDraftChange?: (item: LinkItem | null) => void;
  /** Live-mirror channel (L3): forwarded to Text/Bio editors so the in-progress
   *  block.title config reaches the preview before Save. */
  onTitleDraftChange?: (title: string | null) => void;
  /** Live-mirror channel (L4): the Name & Handle hub's in-progress header edits,
   *  merged as a patch so each tab publishes only the fields it owns. Null clears. */
  onHeaderDraftChange?: (patch: HeaderDraft | null) => void;
  // LIVE.THEME.1 (L5): pass-through for the theme editor's draft stream.
  // Typed unknown to match this component's themeJson convention.
  onThemeDraftChange?: (draft: unknown) => void;
  themeJson: unknown;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
}

// Name & Handle hub tabs. All four write the same theme_json keys the rest of
// the app already reads (typography.font / typography.text_effect,
// headerConfig.name*/handle*) plus the pages.display_name column.
type TypoTab = 'name' | 'font' | 'color' | 'effects';

// Everything the hub owns, as one snapshot. Seeded when the hub opens; the live
// drafts are compared against it for the dirty flag and restored from it on Cancel.
type HubSeed = {
  displayName: string;
  nameSize: number;
  handleSize: number;
  nameColor: string;
  handleColor: string;
  font: string;
  textEffect: NonNullable<HeaderDraft['textEffect']>;
};

const TYPO_TABS: { key: TypoTab; labelKey: string }[] = [
  { key: 'name', labelKey: 'typoHub.tabName' },
  { key: 'font', labelKey: 'typoHub.tabFont' },
  { key: 'color', labelKey: 'typoHub.tabColor' },
  { key: 'effects', labelKey: 'typoHub.tabEffects' },
];

// <input type="color"> only accepts #rrggbb. handleColor defaults to the
// 8-digit '#ffffff99', so the swatch shows its opaque form while the hex field
// beside it keeps the full value.
const swatchHex = (v: string) => (/^#[0-9a-f]{6}/i.test(v) ? v.slice(0, 7) : '#ffffff');

interface DashboardRow {
  icon: React.ReactNode;
  titleKey: string;
  subtitleKey: string;
  blockType: BlockWithItems['type'] | null;
  toastKey?: string;
  /** Pro/Business-only row. The unlocking entitlement is resolved per row by
   *  `rowUnlocked` — carousel by default, tracking-pixels by its own flag. */
  pro?: boolean;
}

interface DashboardSection {
  labelKey: string;
  rows: DashboardRow[];
}

// Ordering principle (MENU.4): most-commonly-used first, both within a group
// and across groups. My Links leads because it is what people open the
// dashboard to do; the commerce stubs trail because they are not built yet.
const sections: DashboardSection[] = [
  {
    labelKey: 'dashboard.myLinks',
    rows: [
      {
        // AIS.0: guided setup leads the group — it is the fastest path from an
        // empty page to a live one, so it sits above the manual block rows.
        icon: <Sparkles className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.pageSetup',
        subtitleKey: 'dashboard.pageSetupDesc',
        blockType: null,
      },
      {
        icon: <Heart className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.managePlatforms',
        subtitleKey: 'dashboard.managePlatformsDesc',
        blockType: 'social_links',
      },
      {
        icon: <LinkIcon className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.featuredLinks',
        subtitleKey: 'dashboard.featuredLinksDesc',
        blockType: 'links',
      },
      {
        icon: <User className="h-6 w-6 text-white" />,
        titleKey: 'blocks.bio.title',
        subtitleKey: 'blocks.bio.subtitle',
        blockType: 'bio',
      },
      {
        icon: <ImageIcon className="h-6 w-6 text-white" />,
        titleKey: 'blocks.gallery.title',
        subtitleKey: 'blocks.gallery.subtitle',
        blockType: 'gallery',
      },
      {
        icon: <Type className="h-6 w-6 text-white" />,
        titleKey: 'blocks.text.title',
        subtitleKey: 'blocks.text.subtitle',
        blockType: 'text',
      },
      {
        icon: <MousePointer className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.primaryCta',
        subtitleKey: 'dashboard.primaryCtaDesc',
        blockType: 'primary_cta',
      },
      {
        icon: <GalleryHorizontalEnd className="h-6 w-6 text-white" />,
        titleKey: 'blocks.carousel.title',
        subtitleKey: 'blocks.carousel.subtitle',
        blockType: 'carousel',
        pro: true,
      },
      {
        icon: <Youtube className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.videoFeeds',
        subtitleKey: 'dashboard.videoFeedsDesc',
        blockType: 'video_feed',
      },
      {
        icon: <Calendar className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.createEvent',
        subtitleKey: 'dashboard.createEventDesc',
        blockType: null,
        toastKey: 'dashboard.comingSoon',
      },
      {
        icon: <FileText className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.createForm',
        subtitleKey: 'dashboard.createFormDesc',
        blockType: 'email_subscribe',
      },
    ],
  },
  {
    labelKey: 'dashboard.style',
    rows: [
      {
        icon: <Files className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.pages',
        subtitleKey: 'dashboard.pagesDesc',
        blockType: null,
      },
      {
        // The toastKey is load-bearing: handleRowTap routes this row to the
        // design panel by matching it, not by titleKey. It is not a toast.
        icon: <Palette className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.profileCustomization',
        subtitleKey: 'dashboard.profileCustomizationDesc',
        blockType: null,
        toastKey: 'dashboard.openDesignTab',
      },
      {
        // Sits under Profile Customization pending NHC.2, which folds it in.
        icon: <Type className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.nameEffects',
        subtitleKey: 'dashboard.nameEffectsDesc',
        blockType: null,
      },
      {
        // Routed to the gallery panel by titleKey in handleRowTap; carries no
        // toastKey (a dead 'dashboard.openDesignTab' key was removed in TEXT.1 —
        // it never fired, the titleKey branch shadows it).
        icon: <LayoutGrid className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.templateGallery',
        subtitleKey: 'dashboard.templateGalleryDesc',
        blockType: null,
      },
      {
        icon: <Video className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.videoProfile',
        subtitleKey: 'dashboard.videoProfileDesc',
        blockType: null,
      },
      {
        // SNAP.1b: named restore points for the whole look. Not pro-gated at the
        // row (Free gets 1 snapshot) — the quota is enforced inside the panel.
        icon: <History className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.snapshots',
        subtitleKey: 'dashboard.snapshotsDesc',
        blockType: null,
      },
    ],
  },
  {
    labelKey: 'dashboard.ecommerce',
    rows: [
      {
        icon: <ShoppingBag className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.newMerch',
        subtitleKey: 'dashboard.newMerchDesc',
        blockType: 'product_cards',
      },
      {
        icon: <Download className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.digitalProducts',
        subtitleKey: 'dashboard.digitalProductsDesc',
        blockType: null,
        toastKey: 'dashboard.comingSoon',
      },
      {
        icon: <Lock className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.lockedProducts',
        subtitleKey: 'dashboard.lockedProductsDesc',
        blockType: null,
        toastKey: 'dashboard.comingSoon',
      },
    ],
  },
  {
    labelKey: 'dashboard.analytics',
    rows: [
      {
        icon: <BarChart2 className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.trackingPixels',
        subtitleKey: 'dashboard.trackingPixelsDesc',
        blockType: null,
        pro: true,
      },
    ],
  },
];

export function ProfileDashboard({
  open,
  onClose,
  pageId,
  modeId,
  onBlockEdit,
  onRefresh,
  editingBlock,
  openVideoProfile,
  onVideoPosDraft,
  onDraftChange,
  onTitleDraftChange,
  onHeaderDraftChange,
  onThemeDraftChange,
  themeJson,
  displayName,
  bio,
  avatarUrl,
  selectedMode,
  onSelectedModeChange,
}: ProfileDashboardProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { entitlements } = useEntitlements();
  // Two pages (Page 2) is a Pro feature; Free is capped at one page.
  const canTwoPages = entitlements.maxPages >= 2;
  // PAGES.STYLE.1: giving a page a look unlike the profile default is Pro.
  const canPerPageStyle = entitlements.perPageStyle;
  // Carousel is a Pro/Business feature (gates the menu row + its tap).
  const canCarousel = entitlements.carousel;
  // PIXELS.1: tracking pixels are their own Pro capability.
  const canTrackingPixels = entitlements.trackingPixels;
  // Resolve a Pro-flagged row to the entitlement that unlocks it, so the list
  // badge and the tap-gate read one source of truth. Carousel is the default;
  // Tracking Pixels has its own flag. Non-pro rows are always unlocked.
  const rowUnlocked = (row: DashboardRow): boolean =>
    !row.pro ? true : row.titleKey === 'dashboard.trackingPixels' ? canTrackingPixels : canCarousel;
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [designOpen, setDesignOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  // AIS.0: the "Set up my page" guided wizard sub-panel (My Links group).
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
  // AIS.0b: the wizard is a ternary branch, so routing out of it unmounts it and
  // loses its local step/answers. These two survive that round-trip — the answers
  // rebuild the success screen, the ref marks that an editor close should return
  // to the wizard rather than to the section list.
  const [wizardResume, setWizardResume] = useState<WizardResume | null>(null);
  const wizardReturnRef = useRef(false);
  const [videoProfileOpen, setVideoProfileOpen] = useState(false);
  const [nameFxOpen, setNameFxOpen] = useState(false);
  // Name & Handle hub — drafts are seeded when the hub opens (not on every
  // themeJson refresh) so a save's onRefresh can't clobber in-progress edits.
  const [typoTab, setTypoTab] = useState<TypoTab>('name');
  const [nameDraft, setNameDraft] = useState('');
  const [nameSizeDraft, setNameSizeDraft] = useState(28);
  const [handleSizeDraft, setHandleSizeDraft] = useState(14);
  const [nameColorDraft, setNameColorDraft] = useState('#ffffff');
  const [handleColorDraft, setHandleColorDraft] = useState('#ffffff99');
  const [fontDraft, setFontDraft] = useState('inter');
  const [fxDraft, setFxDraft] = useState<HubSeed['textEffect']>({ type: 'none' });
  // The snapshot the drafts were seeded from — also the Cancel target. Null until
  // the hub has been opened once.
  const [hubSeed, setHubSeed] = useState<HubSeed | null>(null);
  const [hubSaving, setHubSaving] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  // PIXELS.1: the Tracking Pixels sub-panel (Analytics group).
  const [pixelsOpen, setPixelsOpen] = useState(false);
  // SNAP.1b: the Snapshots sub-panel (Style group).
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  // TEXT.1: standalone text-blocks list sub-panel. `textEditingId` is the
  // two-level nav state — null = list view, a block id = editing that block.
  const [textBlocksOpen, setTextBlocksOpen] = useState(false);
  const [textEditingId, setTextEditingId] = useState<string | null>(null);
  const [pendingPreset, setPendingPreset] = useState<string | null>(null);
  const [page1LabelDraft, setPage1LabelDraft] = useState('');
  const [page2LabelDraft, setPage2LabelDraft] = useState('');
  // Two-page config (read from theme). `heroInherit` makes Page 2 mirror Page 1's hero.
  const pagesCfg = (themeJson as any)?.pages || {};
  const pagesEnabled: boolean = pagesCfg?.enabled === true;
  const heroInherit: boolean = pagesCfg?.page2?.heroInherit === true;
  // Hero reads/writes target Page 2's own config only when editing Page 2 and not inheriting.
  const heroConfigKey = (selectedMode === 'page2' && !heroInherit) ? 'heroConfig_page2' : 'heroConfig';
  // HERO.DEFAULTS.1: this menu reads only the video-side fields, but it still
  // resolves through the one resolver so no hero read bypasses it. Writers below
  // keep spreading the RAW existingTheme — resolved values never reach a write.
  const heroPageId: PageId = (selectedMode === 'page2' && !heroInherit) ? 'page2' : 'page1';
  const heroCfg = resolveHeroConfig(themeJson, heroPageId);
  const heroVideoUrl: string = heroCfg.video || '';
  const heroAudioMode: 'silent' | 'clip' | 'voiceover' =
    heroCfg.audio === 'clip' || heroCfg.audio === 'voiceover' ? heroCfg.audio : 'silent';
  const heroPlaybackMode: 'once' | 'loop' | 'bounce' =
    heroCfg.playback === 'loop' || heroCfg.playback === 'bounce' ? heroCfg.playback : 'once';
  // Hero video position/zoom drafts — decoupled from image fit/posY. Live preview + debounced save.
  const heroVideoPos0 = heroCfg.videoPos || {};
  const [videoScale, setVideoScale] = useState<number>(typeof heroVideoPos0.scale === 'number' ? heroVideoPos0.scale : 1);
  const [videoPosX, setVideoPosX] = useState<number>(typeof heroVideoPos0.posX === 'number' ? heroVideoPos0.posX : 50);
  const [videoPosY, setVideoPosY] = useState<number>(typeof heroVideoPos0.posY === 'number' ? heroVideoPos0.posY : 50);
  const videoPosTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // FIX.MEDIA.1 — the panel preview's own frame, measured. Feeds the shared
  // resolver so this preview and the live page compute the SAME rectangle.
  const heroPreviewRef = useRef<HTMLButtonElement>(null);
  const heroPreviewAspect = useElementAspect(heroPreviewRef);
  // In-flight framing. The panel owns the truth while a slider is being dragged
  // — the saved value is 400ms behind — so both this preview and the page
  // preview under it read from here and move in real time.
  const heroVideoFramingDraft: HeroFraming = { scale: videoScale, posX: videoPosX, posY: videoPosY };
  // Publish it upward while the panel is open; withdraw on close so the page
  // goes back to rendering the saved value (and a stale drag can't linger).
  useEffect(() => {
    if (!onVideoPosDraft) return;
    onVideoPosDraft(videoProfileOpen ? { scale: videoScale, posX: videoPosX, posY: videoPosY } : null);
  }, [onVideoPosDraft, videoProfileOpen, videoScale, videoPosX, videoPosY]);
  useEffect(() => () => onVideoPosDraft?.(null), [onVideoPosDraft]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [activeBlockType, setActiveBlockType] = useState<string | null>(null);
  const [activeBlockTitle, setActiveBlockTitle] = useState<string>('');
  // G2 direct single-item entry (links only). Null/false => normal list view.
  const [directItemId, setDirectItemId] = useState<string | null>(null);
  const [directNew, setDirectNew] = useState<boolean>(false);
  // 'add' = entered via section list. 'edit' = opened directly via editingBlock prop.
  // Drives whether back-button / save closes the panel or returns to the list.
  const [entryMode, setEntryMode] = useState<'add' | 'edit'>('add');
  // Set by Save so the editor's follow-up onOpenChange(false) is ignored once —
  // saving never closes the panel; the user leaves via the X / back arrow.
  const skipNextCloseRef = useRef(false);

  // When opened with an editingBlock target, jump straight to the editor.
  useEffect(() => {
    if (open && editingBlock) {
      setActiveBlockId(editingBlock.id);
      setActiveBlockType(editingBlock.type);
      setActiveBlockTitle(editingBlock.title);
      setDirectItemId(editingBlock.directItemId ?? null);
      setDirectNew(editingBlock.directNew ?? false);
      setEntryMode('edit');
    }
  }, [open, editingBlock]);

  const handleClose = () => {
    setActiveBlockId(null);
    setActiveBlockType(null);
    setActiveBlockTitle('');
    setDirectItemId(null);
    setDirectNew(false);
    setEntryMode('add');
    setDesignOpen(false);
    setGalleryOpen(false);
    setPageSetupOpen(false);
    setVideoProfileOpen(false);
    setNameFxOpen(false);
    setPagesOpen(false);
    setPixelsOpen(false);
    setSnapshotsOpen(false);
    setTextBlocksOpen(false);
    setTextEditingId(null);
    setPendingPreset(null);
    onClose();
  };

  const handleVideoUpload = async (file: File) => {
    if (!user) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error(t('dashboard.hero.videoTooLarge'));
      return;
    }
    toast(t('dashboard.hero.uploading'));
    try {
      const fileExt = file.name.split('.').pop() || 'mp4';
      const fileName = `${user.id}/hero-video-${randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);
      const existingTheme = (themeJson as any) || {};
      const existingHero = existingTheme[heroConfigKey] || {};
      const { error } = await supabase
        .from('pages')
        .update({ theme_json: { ...existingTheme, [heroConfigKey]: { ...existingHero, video: urlData.publicUrl } } })
        .eq('id', pageId);
      if (error) throw error;
      toast.success(t('dashboard.hero.videoAdded'));
      onRefresh();
    } catch (err) {
      console.error('Video upload error:', err);
      toast.error(t('dashboard.hero.uploadFailed'));
    }
  };

  const saveHeroConfig = async (patch: Record<string, unknown>) => {
    const existingTheme = (themeJson as any) || {};
    const existingHero = existingTheme[heroConfigKey] || {};
    const { error } = await supabase
      .from('pages')
      .update({ theme_json: { ...existingTheme, [heroConfigKey]: { ...existingHero, ...patch } } })
      .eq('id', pageId);
    if (error) { toast.error(t('dashboard.couldNotSave')); return; }
    onRefresh();
  };

  // Re-sync position drafts when the video changes (e.g. new upload). Gated on the URL — NOT on
  // every themeJson refresh — so a save's onRefresh can't yank a slider thumb mid-drag.
  useEffect(() => {
    const vp = ((themeJson as any)?.[heroConfigKey]?.videoPos) || {};
    setVideoScale(typeof vp.scale === 'number' ? vp.scale : 1);
    setVideoPosX(typeof vp.posX === 'number' ? vp.posX : 50);
    setVideoPosY(typeof vp.posY === 'number' ? vp.posY : 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroVideoUrl, heroConfigKey]);

  // Persist position/zoom ~400ms after the last change (covers drag + keyboard) — one PATCH per adjustment.
  const persistVideoPos = (next: { scale: number; posX: number; posY: number }) => {
    if (videoPosTimer.current) clearTimeout(videoPosTimer.current);
    videoPosTimer.current = setTimeout(() => { saveHeroConfig({ videoPos: next }); }, 400);
  };

  // Hero video pencil → open straight into the Video Profile menu. Re-fires only when the
  // signal flips on (Editor clears it on close), so in-panel back-navigation isn't overridden.
  useEffect(() => {
    if (open && openVideoProfile) setVideoProfileOpen(true);
  }, [open, openVideoProfile]);

  const handleVideoRemove = async () => {
    const existingTheme = (themeJson as any) || {};
    const existingHero = { ...(existingTheme[heroConfigKey] || {}) };
    delete existingHero.video;
    const { error } = await supabase
      .from('pages')
      .update({ theme_json: { ...existingTheme, [heroConfigKey]: existingHero } })
      .eq('id', pageId);
    if (error) { toast.error(t('dashboard.hero.removeFailed')); return; }
    toast.success(t('dashboard.hero.videoRemoved'));
    onRefresh();
    setVideoProfileOpen(false);
  };

  // ── Name & Handle hub ──
  // Push a seed snapshot into the live drafts. Used on open and on Cancel.
  const applyHubSeed = (s: HubSeed) => {
    setNameDraft(s.displayName);
    setNameSizeDraft(s.nameSize);
    setHandleSizeDraft(s.handleSize);
    setNameColorDraft(s.nameColor);
    setHandleColorDraft(s.handleColor);
    setFontDraft(s.font);
    setFxDraft(s.textEffect);
  };

  // Seed drafts when the hub opens (avoids clobbering mid-edit). Re-seeding on
  // every open is what makes closing-with-unsaved-changes behave like Cancel.
  useEffect(() => {
    if (!nameFxOpen) return;
    const theme = (themeJson as any) || {};
    const hc = theme.headerConfig || {};
    const typo = theme.typography || {};
    const seed: HubSeed = {
      displayName: displayName || '',
      nameSize: typeof hc.nameSize === 'number' ? hc.nameSize : 28,
      handleSize: typeof hc.handleSize === 'number' ? hc.handleSize : 14,
      nameColor: hc.nameColor || '#ffffff',
      handleColor: hc.handleColor || '#ffffff99',
      font: typo.font || 'inter',
      textEffect: { type: 'none', ...(typo.text_effect || {}) },
    };
    setTypoTab('name');
    applyHubSeed(seed);
    setHubSeed(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameFxOpen]);

  // Draft differs from the snapshot it was seeded from.
  const hubDirty = !!hubSeed && (
    nameDraft !== hubSeed.displayName ||
    nameSizeDraft !== hubSeed.nameSize ||
    handleSizeDraft !== hubSeed.handleSize ||
    nameColorDraft !== hubSeed.nameColor ||
    handleColorDraft !== hubSeed.handleColor ||
    fontDraft !== hubSeed.font ||
    JSON.stringify(fxDraft) !== JSON.stringify(hubSeed.textEffect)
  );

  // Live-mirror (L4): publish the whole draft whenever any hub value moves, so
  // the preview tracks every control without each one having to remember to.
  // Gated on the hub being open — the clear effect below owns the closed case.
  useEffect(() => {
    if (!nameFxOpen || !open) return;
    onHeaderDraftChange?.({
      displayName: nameDraft,
      nameSize: nameSizeDraft,
      handleSize: handleSizeDraft,
      nameColor: nameColorDraft,
      handleColor: handleColorDraft,
      font: fontDraft,
      textEffect: fxDraft,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameFxOpen, open, nameDraft, nameSizeDraft, handleSizeDraft, nameColorDraft, handleColorDraft, fontDraft, fxDraft]);

  // Live-mirror (L4): the header draft lives only as long as the hub is open.
  // Clear it when the hub closes, when the whole dashboard closes (handleClose
  // leaves nameFxOpen set), and on unmount — otherwise a stale draft would keep
  // overriding the preview after the panel is gone. Closing with unsaved edits
  // therefore behaves like Cancel: the draft dies, and the next open re-seeds.
  useEffect(() => {
    if (!nameFxOpen || !open) onHeaderDraftChange?.(null);
  }, [nameFxOpen, open, onHeaderDraftChange]);
  useEffect(() => () => { onHeaderDraftChange?.(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // LIVE.THEME.1 (L5): same discipline for the theme draft — belt and
  // suspenders alongside DesignEditor's own unmount clear.
  useEffect(() => {
    if (!designOpen || !open) onThemeDraftChange?.(null);
  }, [designOpen, open, onThemeDraftChange]);
  useEffect(() => () => { onThemeDraftChange?.(null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Google Fonts for the Font tab's previews — loaded once, and only once the
  // hub is opened (the dashboard itself is always mounted).
  useEffect(() => {
    if (!nameFxOpen) return;
    const id = 'google-fonts-typo-hub';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Bebas+Neue&family=Abril+Fatface&family=Pacifico&family=Orbitron:wght@400;700&family=Caveat:wght@400;700&family=Archivo+Black&family=Lora:wght@400;700&family=Patrick+Hand&family=Space+Grotesk:wght@400;700&display=swap';
    document.head.appendChild(link);
  }, [nameFxOpen]);

  // Commit the whole hub in one write: display_name (only when it changed) plus a
  // single theme_json merge covering headerConfig and typography. Nothing else in
  // the hub touches Supabase — every control just moves the draft.
  const handleHubSave = async () => {
    if (!hubSeed || !hubDirty || hubSaving) return;
    setHubSaving(true);
    const existingTheme = (themeJson as any) || {};
    const existingHeader = existingTheme.headerConfig || {};
    const existingTypo = existingTheme.typography || {};
    const nextName = nameDraft.trim();
    const update: Record<string, unknown> = {
      theme_json: {
        ...existingTheme,
        headerConfig: {
          ...existingHeader,
          nameSize: nameSizeDraft,
          handleSize: handleSizeDraft,
          nameColor: nameColorDraft,
          handleColor: handleColorDraft,
        },
        typography: { ...existingTypo, font: fontDraft, text_effect: fxDraft },
      },
    };
    if (nextName !== hubSeed.displayName) update.display_name = nextName;
    const { error } = await supabase.from('pages').update(update).eq('id', pageId);
    setHubSaving(false);
    if (error) { toast.error(t('dashboard.couldNotSave')); return; }
    // The saved values become the new baseline, so the form goes clean.
    setNameDraft(nextName);
    setHubSeed({
      displayName: nextName,
      nameSize: nameSizeDraft,
      handleSize: handleSizeDraft,
      nameColor: nameColorDraft,
      handleColor: handleColorDraft,
      font: fontDraft,
      textEffect: fxDraft,
    });
    // Await the refetch before dropping the draft: clearing first would let the
    // preview fall back to the stale themeJson prop and flash the old values.
    await Promise.resolve(onRefresh());
    onHeaderDraftChange?.(null);
    toast.success(t('typoHub.saved'));
  };

  // Cancel — throw the draft away and put the seeded values back.
  const handleHubCancel = () => {
    if (hubSeed) applyHubSeed(hubSeed);
    onHeaderDraftChange?.(null);
  };

  // ── Two-page (Pages) config ──
  // Seed label drafts when the Pages view opens (avoids clobbering mid-type).
  useEffect(() => {
    if (pagesOpen) {
      setPage1LabelDraft(pagesCfg?.page1?.label || '');
      setPage2LabelDraft(pagesCfg?.page2?.label || '');
      setPendingPreset(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagesOpen]);

  const savePages = async (patch: Record<string, unknown>) => {
    const existingTheme = (themeJson as any) || {};
    const existingPages = existingTheme.pages || {};
    const { error } = await supabase
      .from('pages')
      .update({ theme_json: { ...existingTheme, pages: { ...existingPages, ...patch } } })
      .eq('id', pageId);
    if (error) { toast.error(t('dashboard.couldNotSave')); return; }
    onRefresh();
  };

  // PAGES.STYLE.0/1: page style is structure, so its switcher and writer live
  // here. PAGES.STYLE.1 made it per-page — the switcher now reads and writes
  // the ACTIVE page's style. The profile-level `pageStyle` is left alone as the
  // fallback for any page that never set one (which is every page that existed
  // before this shipped).
  const activePageId: PageId = selectedMode ?? 'page1';
  const currentPageStyle: PageStyle = resolveEffectivePageStyle(themeJson, activePageId);
  // FIX.MEDIA.1: the shape the hero media actually publishes at, from the same
  // device presets the crop dialog frames to (DP.1 / CROP.3a-C). The panel
  // preview renders at this, so what it shows is what the page renders.
  const heroPreviewTargetAspect =
    currentPageStyle === 'full_bleed' ? canonicalFullBleedAspect() : canonicalHeroAspect();
  // The default a page falls back to. Diverging from it is the Pro line.
  const profileDefaultStyle: PageStyle =
    (themeJson as any)?.pageStyle === 'full_bleed' ? 'full_bleed' : 'hero';

  const savePageStyle = async (newStyle: PageStyle) => {
    if (newStyle === currentPageStyle) return;
    // Pro gate: a page styled unlike the profile default is a Pro capability.
    // Free never reaches this with Page 2 (two pages is already Pro) — it bites
    // on a downgraded account whose Page 2 outlived its plan.
    if (newStyle !== profileDefaultStyle && !canPerPageStyle) {
      toast(t('design.perPageStylePro'), { description: t('design.perPageStyleProDesc') });
      return;
    }
    // Merge-safe: spreads the raw existing theme (BUG.THEME.1 rule) and the
    // existing pages map, so a style write can't drop a label or heroInherit.
    // Untyped on purpose: a typed theme_json write trips TS2322 against the
    // generated Json type (the pages row is Json, not ThemeJson).
    const existingTheme = (themeJson as any) || {};
    const existingPages = existingTheme.pages || {};
    const existingPage = existingPages[activePageId] || {};
    const nextTheme: any = {
      ...existingTheme,
      pages: { ...existingPages, [activePageId]: { ...existingPage, style: newStyle } },
    };
    // Entering hero with no stored posY seeds 25 — faces live in the top third
    // — so a style switch never beheads the photo. Per page: Page 2 seeds its
    // own heroConfig_page2 unless it inherits Page 1's hero (heroConfigKey).
    if (newStyle === 'hero') {
      const existingHero = (existingTheme[heroConfigKey] as Record<string, unknown>) || {};
      if (typeof existingHero.posY !== 'number') {
        nextTheme[heroConfigKey] = { ...existingHero, posY: 25 };
      }
    }
    const { error } = await supabase
      .from('pages')
      .update({ theme_json: nextTheme })
      .eq('id', pageId);
    if (error) { toast.error(t('dashboard.couldNotSave')); return; }
    onRefresh();
  };

  // Ensure Page 2 (the page2 mode) exists, born COMPLETE. New accounts onboard
  // with only Page 1; the second page is created on demand here with the two
  // header social blocks PLUS the full Default block set — the same composition
  // the reset action and onboarding seed from — so an enabled Page 2 is never
  // blank. Returns the mode id (existing or new) so a caller need not wait for
  // Editor's modes refetch to act on it.
  const ensureSecondPage = async (): Promise<string | null> => {
    if (!pageId) return null;
    const { data: existing } = await supabase
      .from('modes')
      .select('id')
      .eq('page_id', pageId)
      .eq('type', 'page2')
      .maybeSingle();
    if (existing) return existing.id;
    const { data: newMode, error } = await supabase
      .from('modes')
      .insert({ page_id: pageId, type: 'page2' })
      .select('id')
      .single();
    if (error || !newMode) { toast.error(t('dashboard.pages.createFailed')); return null; }
    // Header social blocks first (order 0–1), then the Default content set from
    // the shared registry — so a born Page 2 is identical to a freshly-reset one.
    const defaultBlocks = BLOCK_PRESETS.find((p) => p.key === DEFAULT_PRESET_KEY)?.blocks ?? [];
    const header = [
      { type: 'social_links', title: 'Social Links' },
      { type: 'social_icon_row', title: 'Social Icons' },
    ];
    const seed = [...header, ...defaultBlocks].map((b, i) => ({
      mode_id: newMode.id,
      type: b.type as any,
      title: b.title,
      is_enabled: true,
      order_index: i,
    }));
    await supabase.from('blocks').insert(seed);
    return newMode.id;
  };

  const setPageEnabled = async (enabled: boolean) => {
    // Two pages is Pro-gated; Free users get an upsell instead of enabling.
    if (enabled && !canTwoPages) return;
    // New accounts have only Page 1 — create a born-complete Page 2 first.
    if (enabled) await ensureSecondPage();
    // Disabling Page 2 while editing it bounces editing back to Page 1.
    if (!enabled && selectedMode === 'page2') onSelectedModeChange?.('page1');
    // ONE theme_json write for the enabled flag + the dialed-in Page 2 hero
    // seed. Folded together deliberately: a separate heroConfig_page2 write
    // would be clobbered by the stale-prop spread here (this and savePages both
    // spread the themeJson prop, which hasn't refreshed yet). The posY-25 seed
    // rule keeps faces in the top third so a born hero Page 2 renders through
    // the same dialed-in pipeline as Page 1. Untyped: theme_json write (TS2322).
    const existingTheme = (themeJson as any) || {};
    const existingPages = existingTheme.pages || {};
    const nextTheme: any = { ...existingTheme, pages: { ...existingPages, enabled } };
    if (enabled && !existingTheme.heroConfig_page2) {
      nextTheme.heroConfig_page2 = { fit: 'fill', posY: 25 };
    }
    const { error } = await supabase.from('pages').update({ theme_json: nextTheme }).eq('id', pageId);
    if (error) { toast.error(t('dashboard.couldNotSave')); return; }
    onRefresh();
  };
  const setPageLabel = (which: 'page1' | 'page2', label: string) => {
    const existing = (pagesCfg as any)?.[which] || {};
    savePages({ [which]: { ...existing, label: label.trim() || undefined } });
  };
  const setHeroInherit = (inherit: boolean) => {
    const existing = (pagesCfg as any)?.page2 || {};
    savePages({ page2: { ...existing, heroInherit: inherit } });
  };

  // Reset the ACTIVE page to a preset's block set: replace its content blocks,
  // preserving the header social blocks. Today only the Default preset remains.
  const applyPreset = async (presetKey: string) => {
    setPendingPreset(null);
    // The modeId prop can lag a freshly-created Page 2: Editor refetches modes
    // on refresh, but a reset tapped immediately after enabling can beat that.
    // Resolve the active mode from the DB when the prop is null so the reset
    // still lands instead of firing the noMode toast (the FIX.P2 race repro).
    let activeModeId = modeId;
    if (!activeModeId && pageId) {
      const { data } = await supabase
        .from('modes')
        .select('id')
        .eq('page_id', pageId)
        .eq('type', activePageId)
        .maybeSingle();
      activeModeId = data?.id ?? null;
    }
    if (!activeModeId) { toast.error(t('dashboard.noMode')); return; }
    const preset = BLOCK_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    try {
      const { data: existing, error: fErr } = await supabase
        .from('blocks')
        .select('id, type')
        .eq('mode_id', activeModeId);
      if (fErr) throw fErr;
      // Preserve the header social blocks; replace everything else.
      const removableIds = (existing || [])
        .filter((b) => b.type !== 'social_links' && b.type !== 'social_icon_row')
        .map((b) => b.id);
      if (removableIds.length) {
        const { error: iErr } = await supabase.from('block_items').delete().in('block_id', removableIds);
        if (iErr) throw iErr;
        const { error: bErr } = await supabase.from('blocks').delete().in('id', removableIds);
        if (bErr) throw bErr;
      }
      const inserts = preset.blocks.map((b, i) => ({
        mode_id: activeModeId,
        type: b.type as any,
        title: b.title,
        is_enabled: true,
        order_index: i,
      }));
      const { error: insErr } = await supabase.from('blocks').insert(inserts);
      if (insErr) throw insErr;
      toast.success(t('pages.resetDone'));
      onRefresh();
    } catch (e) {
      console.error('apply preset failed', e);
      toast.error(t('pages.resetFailed'));
    }
  };

  /**
   * Find the mode's block of a given type, creating it if this page has never
   * had one. Shared by the section rows and by the AIS.0b checklist routes so
   * both entries resolve a block the exact same way.
   */
  const resolveBlockId = async (
    blockType: NonNullable<DashboardRow['blockType']>,
    title: string,
  ): Promise<string | null> => {
    if (!modeId) return null;

    const { data: block, error } = await supabase
      .from('blocks')
      .select('id')
      .eq('mode_id', modeId)
      .eq('type', blockType)
      .maybeSingle();

    if (error) throw error;
    if (block) return block.id;

    const { data: newBlock, error: insertError } = await supabase
      .from('blocks')
      .insert({
        mode_id: modeId,
        type: blockType,
        title,
        is_enabled: true,
        order_index: 99,
      })
      .select('id')
      .single();

    if (insertError) throw insertError;
    onRefresh();
    return newBlock.id;
  };

  /**
   * AIS.0b — a guided-checklist row was tapped. Drives the SAME section
   * navigation the dashboard rows use (resolveBlockId → activeBlock* triple);
   * the wizard is only closed for block editors because it sits ABOVE
   * `activeBlockId` in the render chain and would otherwise keep winning.
   * The Video Profile menu sits above the wizard, so it needs no such dance.
   */
  const openChecklistTarget = async (route: ChecklistRoute) => {
    if (route.kind === 'none') return;

    if (route.kind === 'videoProfile') {
      setVideoProfileOpen(true);
      return;
    }

    if (!modeId) {
      toast.error(t('dashboard.noMode'));
      return;
    }

    try {
      const title = t(route.titleKey);
      const blockId = await resolveBlockId(route.blockType, title);
      if (!blockId) return;

      // Mark the return trip BEFORE swapping branches so the editor's close
      // lands back on the success step instead of the section list.
      wizardReturnRef.current = true;
      setPageSetupOpen(false);
      // WA.1: a link route carries the wa.me item, opening its detail view
      // (which renders the WhatsApp builder) rather than the links list.
      setDirectItemId(route.itemId ?? null);
      setDirectNew(false);
      setActiveBlockId(blockId);
      setActiveBlockType(route.blockType);
      setActiveBlockTitle(title);
    } catch (err) {
      console.error('Error opening checklist target:', err);
      toast.error(t('dashboard.failedOpen'));
    }
  };

  /** Pop back to the wizard's success step after a checklist round-trip. */
  const returnToWizardIfPending = (): boolean => {
    if (!wizardReturnRef.current) return false;
    wizardReturnRef.current = false;
    setPageSetupOpen(true);
    return true;
  };

  const handleRowTap = async (row: DashboardRow) => {
    // List-entry path always opens the batch list view, never direct item mode.
    setDirectItemId(null);
    setDirectNew(false);
    // TEXT.1: the Heading & Text Boxes row opens the standalone-text-blocks list
    // panel (add / toggle / edit / delete N blocks), not a single-block editor.
    if (row.blockType === 'text') {
      setTextEditingId(null);
      setTextBlocksOpen(true);
      return;
    }
    if (!row.blockType) {
      if (row.titleKey === 'dashboard.pageSetup') {
        setPageSetupOpen(true);
        return;
      }
      if (row.titleKey === 'dashboard.templateGallery') {
        setGalleryOpen(true);
        return;
      }
      if (row.toastKey === 'dashboard.openDesignTab') {
        setDesignOpen(true);
        return;
      }
      if (row.titleKey === 'dashboard.videoProfile') {
        setVideoProfileOpen(true);
        return;
      }
      if (row.titleKey === 'dashboard.nameEffects') {
        setNameFxOpen(true);
        return;
      }
      if (row.titleKey === 'dashboard.pages') {
        setPagesOpen(true);
        return;
      }
      if (row.titleKey === 'dashboard.trackingPixels') {
        // Pro gate: Free gets the upsell (lock pattern); Pro/Business opens it.
        if (!canTrackingPixels) {
          toast(t('pixels.proTitle'), { description: t('pixels.proDesc') });
          return;
        }
        setPixelsOpen(true);
        return;
      }
      if (row.titleKey === 'dashboard.snapshots') {
        // No row-level gate: Free opens the panel and gets its 1 snapshot; the
        // quota upsell lives inside the panel's Save action (SNAP.1b).
        setSnapshotsOpen(true);
        return;
      }
      toast(t(row.toastKey || 'dashboard.comingSoon'));
      return;
    }

    // Pro gate: a Pro-only row (carousel) is locked for Free — show an upsell.
    if (row.pro && !canCarousel) {
      toast(t('dashboard.carouselProTitle'), {
        description: t('dashboard.carouselProDesc'),
      });
      return;
    }

    if (!modeId) {
      toast.error(t('dashboard.noMode'));
      return;
    }

    try {
      const blockId = await resolveBlockId(row.blockType, t(row.titleKey));
      if (!blockId) return;

      setActiveBlockId(blockId);
      setActiveBlockType(row.blockType);
      setActiveBlockTitle(t(row.titleKey));
      // Featured Links opens a blank add-link detail (create-on-save),
      // matching the preview "+", instead of the legacy list view.
      if (row.blockType === 'links') setDirectNew(true);
    } catch (err) {
      console.error('Error finding block:', err);
      toast.error(t('dashboard.failedOpen'));
    }
  };

  const handleEditorClose = (editorOpen: boolean) => {
    if (!editorOpen) {
      // A Save just fired; swallow the editor's auto-close once and stay put.
      if (skipNextCloseRef.current) {
        skipNextCloseRef.current = false;
        return;
      }
      // In edit mode, closing the editor closes the whole panel (the user
      // came from the live preview, not from the section list).
      if (entryMode === 'edit') {
        handleClose();
        return;
      }
      setActiveBlockId(null);
      setActiveBlockType(null);
      setActiveBlockTitle('');
      setDirectItemId(null);
      setDirectNew(false);
      // AIS.0b: came here from a guided-checklist row → go back to the wizard.
      returnToWizardIfPending();
    }
  };

  const handleEditorSave = () => {
    onRefresh();
    // Save/Update only saves — it never closes the panel or returns to the list.
    // The editor calls onOpenChange(false) right after onSave(); swallow it once
    // so the editor stays open. The user leaves via the X / back arrow.
    skipNextCloseRef.current = true;
  };

  const renderEditor = () => {
    if (!activeBlockId || !activeBlockType) return null;

    const editorProps = {
      blockId: activeBlockId,
      open: true as const,
      onOpenChange: handleEditorClose,
      onSave: handleEditorSave,
      panelMode: true as const,
    };

    switch (activeBlockType) {
      case 'primary_cta':
        return <PrimaryCtaEditor {...editorProps} />;
      case 'social_links':
        return (
          <SocialLinksEditor
            {...editorProps}
            iconSize={(themeJson as any)?.headerConfig?.iconSize ?? 'medium'}
            onIconSizeChange={async (v) => {
              const existingTheme = (themeJson as any) || {};
              const existingHeader = existingTheme.headerConfig || {};
              const { error } = await supabase
                .from('pages')
                .update({ theme_json: { ...existingTheme, headerConfig: { ...existingHeader, iconSize: v } } })
                .eq('id', pageId);
              if (error) { toast.error(t('dashboard.couldNotSave')); return; }
              onRefresh();
            }}
            iconColorMode={(themeJson as any)?.headerConfig?.iconColorMode ?? 'color'}
            onIconColorModeChange={async (v) => {
              const existingTheme = (themeJson as any) || {};
              const existingHeader = existingTheme.headerConfig || {};
              const { error } = await supabase
                .from('pages')
                .update({ theme_json: { ...existingTheme, headerConfig: { ...existingHeader, iconColorMode: v } } })
                .eq('id', pageId);
              if (error) { toast.error(t('dashboard.couldNotSave')); return; }
              onRefresh();
            }}
            iconBgStyle={(themeJson as any)?.headerConfig?.iconBgStyle ?? 'default'}
            onIconBgStyleChange={async (v) => {
              const existingTheme = (themeJson as any) || {};
              const existingHeader = existingTheme.headerConfig || {};
              const { error } = await supabase
                .from('pages')
                .update({ theme_json: { ...existingTheme, headerConfig: { ...existingHeader, iconBgStyle: v } } })
                .eq('id', pageId);
              if (error) { toast.error(t('dashboard.couldNotSave')); return; }
              onRefresh();
            }}
          />
        );
      case 'links':
        return <LinksEditor {...editorProps} directItemId={directItemId} directNew={directNew} onDraftChange={onDraftChange} avatarUrl={avatarUrl} />;
      case 'product_cards':
        return <ProductCardsEditor {...editorProps} />;
      case 'email_subscribe':
        return <EmailSubscribeEditor {...editorProps} />;
      case 'gallery':
        return <GalleryEditor {...editorProps} />;
      case 'carousel':
        return <CarouselEditor {...editorProps} />;
      case 'bio':
        return <BioEditor {...editorProps} onTitleDraftChange={onTitleDraftChange} onDraftChange={onDraftChange} />;
      case 'featured_media':
        return <FeaturedMediaEditor {...editorProps} />;
      case 'video_feed':
        return <VideoFeedEditor {...editorProps} />;
      case 'hero_card':
        return <HeroCardEditor {...editorProps} />;
      case 'social_icon_row':
        return <SocialIconRowEditor {...editorProps} />;
      case 'content_section':
        return <ContentSectionEditor {...editorProps} />;
      case 'text':
        return <TextBlockEditor {...editorProps} onTitleDraftChange={onTitleDraftChange} />;
      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Panel — slides from right on all screen sizes. It stays open until
              the user closes it via the X (no outside-click / auto close). */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-16 sm:top-0 right-0 bottom-0 z-[120] w-full sm:w-[420px] bg-[#0e0c09] border-l border-white/10 flex flex-col overflow-x-clip"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
              {pagesOpen ? (
                <>
                  <button
                    onClick={() => setPagesOpen(false)}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <h2 className="text-lg font-bold text-white">{t('dashboard.pages')}</h2>
                </>
              ) : pixelsOpen ? (
                <>
                  <button
                    onClick={() => setPixelsOpen(false)}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <h2 className="text-lg font-bold text-white">{t('dashboard.trackingPixels')}</h2>
                </>
              ) : snapshotsOpen ? (
                <>
                  <button
                    onClick={() => setSnapshotsOpen(false)}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <h2 className="text-lg font-bold text-white">{t('dashboard.snapshots')}</h2>
                </>
              ) : nameFxOpen ? (
                <>
                  <button
                    onClick={() => setNameFxOpen(false)}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <h2 className="text-lg font-bold text-white">{t('dashboard.nameEffects')}</h2>
                </>
              ) : videoProfileOpen ? (
                <>
                  <button
                    onClick={() => setVideoProfileOpen(false)}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <h2 className="text-lg font-bold text-white">{t('dashboard.videoProfile')}</h2>
                </>
              ) : pageSetupOpen ? (
                <>
                  <button
                    onClick={() => {
                      // Leaving the wizard ends the run (AIS.0b resume state too).
                      setWizardResume(null);
                      wizardReturnRef.current = false;
                      setPageSetupOpen(false);
                    }}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <h2 className="text-lg font-bold text-white">{t('dashboard.pageSetup')}</h2>
                </>
              ) : galleryOpen ? (
                <>
                  <button
                    onClick={() => setGalleryOpen(false)}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <h2 className="text-lg font-bold text-white">{t('dashboard.templateGallery')}</h2>
                </>
              ) : designOpen ? (
                <>
                  <button
                    onClick={() => setDesignOpen(false)}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <h2 className="text-lg font-bold text-white">{t('dashLayout.design')}</h2>
                </>
              ) : textBlocksOpen ? (
                <>
                  <button
                    onClick={() => (textEditingId ? setTextEditingId(null) : setTextBlocksOpen(false))}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <h2 className="text-lg font-bold text-white">
                    {textEditingId ? t('textBlocks.editTitle') : t('textBlocks.panelTitle')}
                  </h2>
                </>
              ) : activeBlockId ? (
                <>
                  <button
                    onClick={() => {
                      // In edit mode, back closes the whole panel; in add mode
                      // it returns to the section list — or to the AIS.0b
                      // wizard, when a checklist row is what opened this editor.
                      if (entryMode === 'edit') {
                        handleClose();
                      } else {
                        setActiveBlockId(null);
                        setActiveBlockType(null);
                        setActiveBlockTitle('');
                        setDirectItemId(null);
                        setDirectNew(false);
                        returnToWizardIfPending();
                      }
                    }}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <h2 className="text-lg font-bold text-white">{activeBlockTitle}</h2>
                </>
              ) : (
                <h2 className="text-lg font-bold text-white">{t('dashboard.addContent')}</h2>
              )}
              <button
                onClick={handleClose}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable content. No pb here: a branch that anchors a footer
                needs to reach the true bottom edge, so bottom breathing room is
                each branch's own business (footer-less branches carry pb-8). */}
            <div className="flex-1 overflow-y-auto scrollbar-hide">
              {pagesOpen ? (
                <div className="dark text-foreground px-4 pt-5 pb-8 space-y-5">
                  {/* PAGES.STYLE.0/1: Hero / Full Screen switcher — writes the
                      ACTIVE page's style. Diverging from the profile default is
                      Pro, so the off-default option wears the lock. */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-white/70 text-xs font-semibold">{t('design.pageStyle')}</p>
                      {pagesEnabled && !canPerPageStyle && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#C9A55C]/15 text-[#C9A55C] text-[10px] font-bold px-2 py-0.5">
                          <Lock className="h-2.5 w-2.5" /> PRO
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { value: 'hero', label: t('design.styleHero'), desc: t('onboardingFlow.styleHeroDesc') },
                        { value: 'full_bleed', label: t('design.styleFullBleed'), desc: t('onboardingFlow.styleFullBleedDesc') },
                      ] as const).map((s) => {
                        const selected = currentPageStyle === s.value;
                        const gated = !canPerPageStyle && s.value !== profileDefaultStyle;
                        return (
                          <button
                            key={s.value}
                            type="button"
                            onClick={() => savePageStyle(s.value)}
                            aria-disabled={gated}
                            className={`flex flex-col items-start gap-1 rounded-xl border-2 px-3 py-3 text-left transition-all ${selected ? 'border-[#C9A55C] bg-[#C9A55C]/10' : 'border-white/10 hover:border-white/30'}`}
                          >
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${selected ? 'text-[#C9A55C]' : gated ? 'text-white/30' : 'text-white/80'}`}>
                              {gated && <Lock className="h-2.5 w-2.5 shrink-0" />}
                              {s.label}
                            </span>
                            <span className="text-[10px] leading-snug text-white/40">{s.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                    {pagesEnabled && (
                      <p className="text-white/40 text-[11px] mt-1.5">
                        {canPerPageStyle ? t('design.pageStylePerPage') : t('design.pageStyleProHint')}
                      </p>
                    )}
                  </div>

                  {/* Enable second page — Pro feature */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-white/70 text-xs font-semibold">{t('dashboard.pages.secondPage')}</p>
                      {!canTwoPages && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#C9A55C]/15 text-[#C9A55C] text-[10px] font-bold px-2 py-0.5">
                          <Lock className="h-2.5 w-2.5" /> PRO
                        </span>
                      )}
                    </div>
                    <div className="flex w-full rounded-xl bg-white/5 p-1 gap-1">
                      <button
                        onClick={() => setPageEnabled(false)}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${!pagesEnabled ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/70'}`}
                      >
                        {t('dashboard.off')}
                      </button>
                      <button
                        onClick={() =>
                          canTwoPages
                            ? setPageEnabled(true)
                            : toast(t('dashboard.pages.twoPagesProTitle'), {
                                description: t('dashboard.pages.twoPagesProDesc'),
                              })
                        }
                        aria-disabled={!canTwoPages}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1 ${pagesEnabled ? 'bg-[#C9A55C] text-[#0e0c09]' : canTwoPages ? 'text-white/70' : 'text-white/30'}`}
                      >
                        {!canTwoPages && <Lock className="h-3 w-3" />}
                        {t('dashboard.on')}
                      </button>
                    </div>
                    <p className="text-white/40 text-[11px] mt-1.5">
                      {canTwoPages
                        ? t('dashboard.pages.secondPageOnHint')
                        : t('dashboard.pages.secondPageOffHint')}
                    </p>
                  </div>

                  {pagesEnabled && (
                    <>
                      {/* Page labels */}
                      <div className="space-y-3">
                        <div>
                          <label className="text-white/40 text-[10px] block mb-1">{t('dashboard.pages.page1Label')}</label>
                          <input
                            type="text"
                            value={page1LabelDraft}
                            maxLength={24}
                            placeholder={t('dashboard.pages.page1Placeholder')}
                            onChange={(e) => setPage1LabelDraft(e.target.value)}
                            onBlur={() => setPageLabel('page1', page1LabelDraft)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#C9A55C]/50 truncate"
                          />
                        </div>
                        <div>
                          <label className="text-white/40 text-[10px] block mb-1">{t('dashboard.pages.page2Label')}</label>
                          <input
                            type="text"
                            value={page2LabelDraft}
                            maxLength={24}
                            placeholder={t('dashboard.pages.page2Placeholder')}
                            onChange={(e) => setPage2LabelDraft(e.target.value)}
                            onBlur={() => setPageLabel('page2', page2LabelDraft)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#C9A55C]/50 truncate"
                          />
                        </div>
                      </div>

                      {/* Page 2 hero source */}
                      <div>
                        <p className="text-white/70 text-xs font-semibold mb-2">{t('dashboard.pages.page2Hero')}</p>
                        <div className="flex w-full rounded-xl bg-white/5 p-1 gap-1">
                          <button
                            onClick={() => setHeroInherit(false)}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${!heroInherit ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/70'}`}
                          >
                            {t('dashboard.pages.heroOwn')}
                          </button>
                          <button
                            onClick={() => setHeroInherit(true)}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${heroInherit ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/70'}`}
                          >
                            {t('dashboard.pages.heroSame')}
                          </button>
                        </div>
                        <p className="text-white/40 text-[11px] mt-1.5">
                          {heroInherit
                            ? t('dashboard.pages.heroInheritOnHint')
                            : t('dashboard.pages.heroInheritOffHint')}
                        </p>
                      </div>
                    </>
                  )}

                  {/* FIX.P2: single reset action — the four alternate presets
                      were retired. Resets the active page to the Default block
                      set, preserving the header social blocks. */}
                  <div>
                    <p className="text-white/70 text-xs font-semibold mb-1">{t('pages.resetHeading')}</p>
                    <p className="text-white/40 text-[11px] mb-2">{t('pages.resetDesc')}</p>
                    {pendingPreset && (
                      <div className="rounded-xl border border-[#C9A55C]/40 bg-[#C9A55C]/10 p-3 mb-2 space-y-2">
                        <p className="text-white text-xs">{t('pages.resetConfirm')}</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPendingPreset(null)}
                            className="flex-1 py-2 rounded-lg text-xs font-semibold border border-white/15 text-white/80"
                          >
                            {t('pages.resetCancel')}
                          </button>
                          <button
                            onClick={() => applyPreset(DEFAULT_PRESET_KEY)}
                            className="flex-1 py-2 rounded-lg text-xs font-bold bg-[#C9A55C] text-[#0e0c09]"
                          >
                            {t('pages.resetConfirmYes')}
                          </button>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => setPendingPreset(DEFAULT_PRESET_KEY)}
                      className="w-full text-left bg-white/5 rounded-xl px-3 py-2.5 hover:bg-white/10 transition-colors"
                    >
                      <p className="text-sm font-semibold text-white truncate">{t('pages.resetAction')}</p>
                      <p className="text-[11px] text-white/50">{t('pages.resetActionDesc')}</p>
                    </button>
                  </div>
                </div>
              ) : pixelsOpen ? (
                <TrackingPixelsEditor />
              ) : snapshotsOpen ? (
                <SnapshotsEditor pageId={pageId} onRestored={onRefresh} />
              ) : nameFxOpen ? (
                // Fills the scrollport so the footer's mt-auto has room to push
                // against. gap-6 replaces space-y-6 deliberately: space-y sets
                // margin-top at (0,3,0) specificity and would out-rank mt-auto.
                <div className="dark text-foreground flex min-h-full flex-col gap-6 px-4 pt-4">
                  <div className="flex w-full rounded-xl bg-white/5 p-1 gap-1">
                    {TYPO_TABS.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setTypoTab(tab.key)}
                        className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${typoTab === tab.key ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/70'}`}
                      >
                        {t(tab.labelKey)}
                      </button>
                    ))}
                  </div>

                  {typoTab === 'name' && (
                    <div className="space-y-5">
                      <div>
                        <label className="text-white/40 text-[10px] block mb-1">{t('typoHub.displayName')}</label>
                        <input
                          type="text"
                          value={nameDraft}
                          maxLength={50}
                          onChange={(e) => setNameDraft(e.target.value)}
                          style={{ fontFamily: resolveFontFamily(fontDraft) }}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#C9A55C]/50 truncate"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-white/40 text-[10px]">{t('typoHub.nameSize')}</span>
                          <span className="text-white/40 text-[10px]">{nameSizeDraft}px</span>
                        </div>
                        <input
                          type="range" min={20} max={40} step={1} value={nameSizeDraft}
                          onChange={(e) => setNameSizeDraft(Number(e.target.value))}
                          className="w-full accent-[#C9A55C]"
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-white/40 text-[10px]">{t('typoHub.handleSize')}</span>
                          <span className="text-white/40 text-[10px]">{handleSizeDraft}px</span>
                        </div>
                        <input
                          type="range" min={10} max={20} step={1} value={handleSizeDraft}
                          onChange={(e) => setHandleSizeDraft(Number(e.target.value))}
                          className="w-full accent-[#C9A55C]"
                        />
                      </div>
                    </div>
                  )}

                  {typoTab === 'font' && (
                    <div className="space-y-2">
                      {FONT_OPTIONS.map((f) => {
                        const active = fontDraft === f.value;
                        return (
                          <button
                            key={f.value}
                            onClick={() => setFontDraft(f.value)}
                            className={`w-full text-left rounded-xl border-2 px-3 py-2.5 transition-all ${active ? 'border-[#C9A55C] bg-black/30' : 'border-white/10 hover:border-white/25'}`}
                          >
                            <span
                              className={`block truncate text-base ${active ? 'text-white' : 'text-white/60'}`}
                              style={{ fontFamily: f.fontFamily }}
                            >
                              {f.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {typoTab === 'color' && (
                    <div className="space-y-5">
                      {([
                        { key: 'nameColor', labelKey: 'typoHub.nameColor', draft: nameColorDraft, set: setNameColorDraft },
                        { key: 'handleColor', labelKey: 'typoHub.handleColor', draft: handleColorDraft, set: setHandleColorDraft },
                      ] as const).map((row) => (
                        <div key={row.key}>
                          <label className="text-white/40 text-[10px] block mb-1">{t(row.labelKey)}</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={swatchHex(row.draft)}
                              onChange={(e) => row.set(e.target.value)}
                              className="h-10 w-12 flex-shrink-0 rounded-lg bg-white/5 border border-white/10 cursor-pointer"
                            />
                            <input
                              type="text"
                              value={row.draft}
                              placeholder="#FFFFFF"
                              onChange={(e) => row.set(e.target.value)}
                              className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono uppercase placeholder:text-white/30 focus:outline-none focus:border-[#C9A55C]/50 truncate"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {typoTab === 'effects' && (() => {
                    const fx = fxDraft;
                    const fxType = fx.type || 'none';
                    // Draft-only: the single write lives in handleHubSave.
                    const patchFx = (patch: Partial<HubSeed['textEffect']>) =>
                      setFxDraft((prev) => ({ ...prev, ...patch }));
                    return (
                      <>
                        <div>
                          <p className="text-xs uppercase tracking-widest text-white/50 mb-2">{t('dashboard.style')}</p>
                          <div className="grid grid-cols-3 gap-2">
                            {(['none', 'shadow', 'outline'] as const).map((k) => (
                              <button key={k} onClick={() => patchFx({ type: k })}
                                className={`rounded-xl border-2 px-3 py-2.5 text-sm font-semibold capitalize transition-all ${fxType === k ? 'border-[#C9A55C] bg-black/30 text-white' : 'border-white/10 text-white/60 hover:border-white/25'}`}>
                                {t(`dashboard.textFx.effect${k.charAt(0).toUpperCase()}${k.slice(1)}`)}
                              </button>
                            ))}
                          </div>
                        </div>
                        {fxType === 'shadow' && (
                          <div>
                            <p className="text-xs uppercase tracking-widest text-white/50 mb-2">{t('dashboard.textFx.shadowStrength')}</p>
                            <input type="range" min={10} max={100} step={5}
                              value={typeof fx.intensity === 'number' ? fx.intensity : 60}
                              onChange={(e) => patchFx({ intensity: Number(e.target.value) })}
                              className="w-full accent-[#C9A55C]" />
                          </div>
                        )}
                        {fxType === 'outline' && (
                          <>
                            <div>
                              <p className="text-xs uppercase tracking-widest text-white/50 mb-2">{t('dashboard.textFx.outlineWidth')}</p>
                              <div className="grid grid-cols-3 gap-2">
                                {([['S', 1], ['M', 2], ['L', 3]] as const).map(([label, w]) => (
                                  <button key={label} onClick={() => patchFx({ width: w })}
                                    className={`rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-all ${(fx.width || 2) === w ? 'border-[#C9A55C] bg-black/30 text-white' : 'border-white/10 text-white/60 hover:border-white/25'}`}>
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-widest text-white/50 mb-2">{t('dashboard.textFx.outlineColor')}</p>
                              <div className="grid grid-cols-3 gap-2">
                                {([['Black', '#000000'], ['White', '#FFFFFF'], ['Gold', '#C9A55C']] as const).map(([label, c]) => (
                                  <button key={label} onClick={() => patchFx({ color: c })}
                                    className={`rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-all ${(fx.color || '#000000') === c ? 'border-[#C9A55C] bg-black/30 text-white' : 'border-white/10 text-white/60 hover:border-white/25'}`}>
                                    {t(`dashboard.textFx.color${label}`)}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                        <p className="text-xs text-white/40">{t('dashboard.textFx.appliesTo')}</p>
                      </>
                    );
                  })()}

                  {/* Every tab edits the draft; this is the only way to commit it.
                      mt-auto parks it on the bottom edge when a tab is short;
                      sticky keeps it reachable when a tab is long. */}
                  <div className="sticky bottom-0 z-10 mt-auto -mx-4 px-4 flex gap-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-[#0e0c09]">
                    <button
                      onClick={handleHubCancel}
                      className="flex-1 h-12 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 font-semibold text-sm"
                    >
                      {t('typoHub.cancel')}
                    </button>
                    <button
                      onClick={handleHubSave}
                      disabled={!hubDirty || hubSaving}
                      className="flex-1 h-12 rounded-xl bg-[#C9A55C] text-[#0e0c09] hover:bg-[#C9A55C]/90 font-semibold text-sm disabled:opacity-40"
                    >
                      {t('typoHub.save')}
                    </button>
                  </div>
                </div>
              ) : videoProfileOpen ? (
                <div className="dark text-foreground px-4 pt-4 pb-8 space-y-5">
                  {/* Pinned, hero-sized preview — stays in view while the sliders below scroll.
                      FIX.MEDIA.1: ONE frame, at the LIVE container aspect, empty or
                      populated — the shape must not jump when a video loads, and it
                      must be the shape that actually publishes. The whole frame is the
                      upload affordance; Change/Remove below stay for discoverability. */}
                  <div className="sticky top-0 z-10 -mx-4 px-4 pt-1 pb-3 bg-[#0e0c09]">
                    <button
                      type="button"
                      ref={heroPreviewRef}
                      data-testid="hero-video-frame"
                      onClick={() => videoInputRef.current?.click()}
                      aria-label={heroVideoUrl ? t('dashboard.hero.changeVideo') : t('dashboard.hero.addVideo')}
                      className={`relative block mx-auto rounded-2xl overflow-hidden bg-[#0e0c09] ${heroVideoUrl ? 'border border-white/10' : 'border border-dashed border-white/20 bg-white/5'}`}
                      style={{
                        aspectRatio: String(heroPreviewTargetAspect),
                        // Height-capped, then width follows the aspect — so the
                        // frame never overflows the narrow panel at either shape.
                        width: `min(100%, ${Math.round(heroPreviewTargetAspect * 340)}px)`,
                      }}
                    >
                      {heroVideoUrl ? (
                        <HeroVideo
                          src={heroVideoUrl}
                          fit="fill"
                          framing={heroVideoFramingDraft}
                          containerAspect={heroPreviewAspect}
                          playbackMode={heroPlaybackMode}
                          audioMode={heroAudioMode}
                          voiceoverUrl={heroCfg.voiceover || ''}
                        />
                      ) : (
                        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4">
                          <Camera className="h-8 w-8 text-white/25" />
                          <span className="text-white/40 text-xs text-center">{t('dashboard.hero.noVideo')}</span>
                        </span>
                      )}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => videoInputRef.current?.click()}
                      className="flex-1 py-3 rounded-xl bg-[#C9A55C] text-[#0e0c09] font-bold text-sm"
                    >
                      {heroVideoUrl ? t('dashboard.hero.changeVideo') : t('dashboard.hero.addVideo')}
                    </button>
                    {heroVideoUrl && (
                      <button
                        onClick={handleVideoRemove}
                        className="px-4 py-3 rounded-xl border border-white/15 text-white/80 font-semibold text-sm"
                      >
                        {t('dashboard.hero.remove')}
                      </button>
                    )}
                  </div>
                  <p className="text-white/40 text-[11px] -mt-3">
                    {t('dashboard.hero.bestResults')}
                  </p>
                  {/* FIX.MEDIA.1 supersedes PHOTO.ROUTE.1's photo button here:
                      a photo's home is the camera icon on the hero preview, and a
                      second door into the same flow from the video menu read as
                      redundant. The checklist's profileMedia row routes to this
                      menu; the camera takes it from here. */}
                  {heroVideoUrl && (
                    <>
                      <div>
                        <p className="text-white/70 text-xs font-semibold mb-2">{t('dashboard.hero.sound')}</p>
                        <div className="flex w-full rounded-xl bg-white/5 p-1 gap-1">
                          <button
                            onClick={() => saveHeroConfig({ audio: 'silent' })}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${heroAudioMode === 'silent' ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/70'}`}
                          >
                            {t('dashboard.hero.silent')}
                          </button>
                          <button
                            onClick={() => saveHeroConfig({ audio: 'clip' })}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${heroAudioMode === 'clip' ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/70'}`}
                          >
                            {t('dashboard.hero.clipSound')}
                          </button>
                        </div>
                        <p className="text-white/40 text-[11px] mt-1.5">
                          {heroAudioMode === 'clip'
                            ? t('dashboard.hero.soundClipHint')
                            : t('dashboard.hero.soundSilentHint')}
                        </p>
                      </div>
                      <div>
                        <p className="text-white/70 text-xs font-semibold mb-2">{t('dashboard.hero.playback')}</p>
                        <div className="flex w-full rounded-xl bg-white/5 p-1 gap-1">
                          <button
                            onClick={() => saveHeroConfig({ playback: 'once' })}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${heroPlaybackMode === 'once' ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/70'}`}
                          >
                            {t('dashboard.hero.once')}
                          </button>
                          <button
                            onClick={() => saveHeroConfig({ playback: 'loop' })}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${heroPlaybackMode === 'loop' ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/70'}`}
                          >
                            {t('dashboard.hero.loop')}
                          </button>
                          <button
                            onClick={() => saveHeroConfig({ playback: 'bounce' })}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${heroPlaybackMode === 'bounce' ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/70'}`}
                          >
                            {t('dashboard.hero.bounce')}
                          </button>
                        </div>
                        <p className="text-white/40 text-[11px] mt-1.5">
                          {heroPlaybackMode === 'once'
                            ? t('dashboard.hero.playbackOnceHint')
                            : heroPlaybackMode === 'loop'
                            ? t('dashboard.hero.playbackLoopHint')
                            : t('dashboard.hero.playbackBounceHint')}
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-white/70 text-xs font-semibold">{t('dashboard.hero.positionZoom')}</p>
                          <button
                            onClick={() => {
                              setVideoScale(1); setVideoPosX(50); setVideoPosY(50);
                              if (videoPosTimer.current) clearTimeout(videoPosTimer.current);
                              saveHeroConfig({ videoPos: { scale: 1, posX: 50, posY: 50 } });
                            }}
                            className="text-[#C9A55C] text-[11px] font-semibold"
                          >
                            {t('dashboard.hero.reset')}
                          </button>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-white/40 text-[10px]">{t('dashboard.hero.zoom')}</span>
                              <span className="text-white/40 text-[10px]">{videoScale === 1 ? t('dashboard.hero.zoomFill') : `${videoScale.toFixed(2)}×`}</span>
                            </div>
                            <input
                              type="range" min={0.5} max={2.5} step={0.01} value={videoScale}
                              onChange={(e) => { const raw = Number(e.target.value); const v = Math.abs(raw - 1) < 0.04 ? 1 : raw; setVideoScale(v); persistVideoPos({ scale: v, posX: videoPosX, posY: videoPosY }); }}
                              className="w-full accent-[#C9A55C]"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-white/40 text-[10px]">{t('dashboard.hero.left')}</span>
                              <span className="text-white/40 text-[10px]">{t('dashboard.hero.right')}</span>
                            </div>
                            <input
                              type="range" min={0} max={100} step={1} value={videoPosX}
                              onChange={(e) => { const v = Number(e.target.value); setVideoPosX(v); persistVideoPos({ scale: videoScale, posX: v, posY: videoPosY }); }}
                              className="w-full accent-[#C9A55C]"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-white/40 text-[10px]">{t('dashboard.hero.top')}</span>
                              <span className="text-white/40 text-[10px]">{t('dashboard.hero.bottom')}</span>
                            </div>
                            <input
                              type="range" min={0} max={100} step={1} value={videoPosY}
                              onChange={(e) => { const v = Number(e.target.value); setVideoPosY(v); persistVideoPos({ scale: videoScale, posX: videoPosX, posY: v }); }}
                              className="w-full accent-[#C9A55C]"
                            />
                          </div>
                        </div>
                        <p className="text-white/40 text-[11px] mt-1.5">{t('dashboard.hero.positionHint')}</p>
                      </div>
                    </>
                  )}
                </div>
              ) : pageSetupOpen ? (
                <div className="dark text-foreground flex min-h-full flex-col">
                  <PageSetupWizard
                    pageId={pageId}
                    modeId={modeId}
                    activePageId={activePageId}
                    themeJson={themeJson}
                    onApply={onRefresh}
                    onClose={() => {
                      // Done/Cancel ends the run — a later open starts at Q1.
                      setWizardResume(null);
                      wizardReturnRef.current = false;
                      setPageSetupOpen(false);
                    }}
                    resume={wizardResume}
                    onReachDone={setWizardResume}
                    onOpenChecklistTarget={openChecklistTarget}
                    avatarUrl={avatarUrl}
                    heroVideoUrl={heroVideoUrl}
                  />
                </div>
              ) : galleryOpen ? (
                <div className="dark text-foreground px-4 pb-8">
                  <TemplateGallery pageId={pageId} onApply={onRefresh} modeId={modeId} activePageId={activePageId} themeJson={themeJson} />
                </div>
              ) : designOpen ? (
                // Height-filling column: the editor inside claims the full
                // scrollport so its footer can sit on the true bottom edge.
                <div className="dark text-foreground flex min-h-full flex-col">
                  <DesignEditor
                    pageId={pageId}
                    themeJson={themeJson}
                    onUpdate={onRefresh}
                    displayName={displayName}
                    bio={bio}
                    avatarUrl={avatarUrl}
                    onThemeDraftChange={onThemeDraftChange}
                    onClose={() => setDesignOpen(false)}
                    activePageId={selectedMode}
                  />
                </div>
              ) : textBlocksOpen ? (
                // TEXT.1: two-level sub-panel. textEditingId set = the shared
                // TextBlockEditor for that block; null = the list of text blocks.
                // Save/Cancel/back returns to the list, which remounts and
                // refetches so add/edit/delete are reflected immediately.
                <div className="dark text-foreground flex min-h-full flex-col">
                  {textEditingId ? (
                    <TextBlockEditor
                      blockId={textEditingId}
                      open
                      onOpenChange={(o) => { if (!o) setTextEditingId(null); }}
                      onSave={onRefresh}
                      panelMode
                      onTitleDraftChange={onTitleDraftChange}
                    />
                  ) : (
                    <TextBlocksPanel
                      modeId={modeId}
                      onRefresh={onRefresh}
                      onEdit={(id) => setTextEditingId(id)}
                    />
                  )}
                </div>
              ) : activeBlockId ? (
                // Same height-filling column. Editors that don't yet anchor
                // their footer (FOOTER.2) are unaffected: an auto-height root
                // still flows and overflows exactly as it did.
                <div className="dark text-foreground flex min-h-full flex-col">{renderEditor()}</div>
              ) : (
                // Footer-less branch: carries the bottom breathing room the
                // scroller's pb-8 used to hand out.
                <div className="pb-8">
                  {sections.map((section) => (
                    <div key={section.labelKey}>
                      <p className="text-lg font-bold text-white px-4 pt-6 pb-3">
                        {t(section.labelKey)}
                      </p>
                      {section.rows.map((row) => (
                        <button
                          key={row.titleKey}
                          onClick={() => handleRowTap(row)}
                          className="w-full mx-4 mb-2 flex items-center gap-4 bg-white/5 rounded-2xl px-4 py-4 hover:bg-white/10 transition-colors"
                          style={{ width: 'calc(100% - 2rem)' }}
                        >
                          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                            {row.icon}
                          </div>
                          <div className="flex-1 text-left">
                            <p className="text-sm font-bold text-white flex items-center gap-1.5">
                              {t(row.titleKey)}
                              {row.pro && !rowUnlocked(row) && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#C9A55C]/15 text-[#C9A55C] text-[10px] font-bold px-1.5 py-0.5">
                                  <Lock className="h-2.5 w-2.5" /> PRO
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-white/50">{t(row.subtitleKey)}</p>
                          </div>
                          <Plus className="h-5 w-5 text-white/40 flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVideoUpload(f); e.target.value = ''; }}
          />
        </>
      )}
    </AnimatePresence>
  );
}
