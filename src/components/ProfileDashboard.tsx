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
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';
import { PrimaryCtaEditor } from '@/components/editors/PrimaryCtaEditor';
import { SocialLinksEditor } from '@/components/editors/SocialLinksEditor';
import { LinksEditor } from '@/components/editors/LinksEditor';
import type { LinkItem } from '@/components/editors/LinksEditor';
import { ProductCardsEditor } from '@/components/editors/ProductCardsEditor';
import { EmailSubscribeEditor } from '@/components/editors/EmailSubscribeEditor';
import { GalleryEditor } from '@/components/editors/GalleryEditor';
import { BioEditor } from '@/components/editors/BioEditor';
import { FeaturedMediaEditor } from '@/components/editors/FeaturedMediaEditor';
import { VideoFeedEditor } from '@/components/editors/VideoFeedEditor';
import { HeroCardEditor } from '@/components/editors/HeroCardEditor';
import { SocialIconRowEditor } from '@/components/editors/SocialIconRowEditor';
import { ContentSectionEditor } from '@/components/editors/ContentSectionEditor';
import { TextBlockEditor } from '@/components/editors/TextBlockEditor';
import { DesignEditor } from '@/components/editors/DesignEditor';
import { TemplateGallery } from '@/components/editors/TemplateGallery';
import type { BlockWithItems } from '@/components/blocks/types';

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
  /**
   * When set together with `open`, the panel skips the section-list view and
   * opens directly into the editor for this block. Pressing back closes the
   * whole panel rather than falling back to the section list — the user came
   * from tapping a live block, not from the add-content menu.
   */
  editingBlock?: EditingBlockTarget | null;
  /** Live-mirror channel (L2): forwarded to LinksEditor so the in-progress
   *  draft reaches the preview before Save. */
  onDraftChange?: (item: LinkItem | null) => void;
  /** Live-mirror channel (L3): forwarded to Text/Bio editors so the in-progress
   *  block.title config reaches the preview before Save. */
  onTitleDraftChange?: (title: string | null) => void;
  themeJson: unknown;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
}

interface DashboardRow {
  icon: React.ReactNode;
  titleKey: string;
  subtitleKey: string;
  blockType: BlockWithItems['type'] | null;
  toastKey?: string;
}

interface DashboardSection {
  labelKey: string;
  rows: DashboardRow[];
}

const sections: DashboardSection[] = [
  {
    labelKey: 'dashboard.myLinks',
    rows: [
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
        icon: <Youtube className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.videoFeeds',
        subtitleKey: 'dashboard.videoFeedsDesc',
        blockType: 'video_feed',
      },
      {
        icon: <MousePointer className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.primaryCta',
        subtitleKey: 'dashboard.primaryCtaDesc',
        blockType: 'primary_cta',
      },
      {
        icon: <User className="h-6 w-6 text-white" />,
        titleKey: 'blocks.bio.title',
        subtitleKey: 'blocks.bio.subtitle',
        blockType: 'bio',
      },
    ],
  },
  {
    labelKey: 'dashboard.appearance',
    rows: [
      {
        icon: <Type className="h-6 w-6 text-white" />,
        titleKey: 'blocks.text.title',
        subtitleKey: 'blocks.text.subtitle',
        blockType: 'text',
      },
      {
        icon: <Palette className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.profileCustomization',
        subtitleKey: 'dashboard.profileCustomizationDesc',
        blockType: null,
        toastKey: 'dashboard.openDesignTab',
      },
      {
        icon: <LayoutGrid className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.templateGallery',
        subtitleKey: 'dashboard.templateGalleryDesc',
        blockType: null,
        toastKey: 'dashboard.openDesignTab',
      },
      {
        icon: <Video className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.videoProfile',
        subtitleKey: 'dashboard.videoProfileDesc',
        blockType: null,
        toastKey: 'dashboard.comingSoon',
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
        icon: <ImageIcon className="h-6 w-6 text-white" />,
        titleKey: 'blocks.gallery.title',
        subtitleKey: 'blocks.gallery.subtitle',
        blockType: 'gallery',
      },
    ],
  },
  {
    labelKey: 'dashboard.products',
    rows: [
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
    labelKey: 'dashboard.events',
    rows: [
      {
        icon: <Calendar className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.createEvent',
        subtitleKey: 'dashboard.createEventDesc',
        blockType: null,
        toastKey: 'dashboard.comingSoon',
      },
    ],
  },
  {
    labelKey: 'dashboard.forms',
    rows: [
      {
        icon: <FileText className="h-6 w-6 text-white" />,
        titleKey: 'dashboard.createForm',
        subtitleKey: 'dashboard.createFormDesc',
        blockType: 'email_subscribe',
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
        toastKey: 'dashboard.comingSoon',
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
  onDraftChange,
  onTitleDraftChange,
  themeJson,
  displayName,
  bio,
  avatarUrl,
}: ProfileDashboardProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [designOpen, setDesignOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [videoProfileOpen, setVideoProfileOpen] = useState(false);
  const heroCfg = (themeJson as any)?.heroConfig || {};
  const heroVideoUrl: string = heroCfg.video || '';
  const heroAudioMode: 'silent' | 'clip' | 'voiceover' =
    heroCfg.audio === 'clip' || heroCfg.audio === 'voiceover' ? heroCfg.audio : 'silent';
  const heroPlaybackMode: 'once' | 'loop' | 'bounce' =
    heroCfg.playback === 'loop' || heroCfg.playback === 'bounce' ? heroCfg.playback : 'once';
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [activeBlockType, setActiveBlockType] = useState<string | null>(null);
  const [activeBlockTitle, setActiveBlockTitle] = useState<string>('');
  // G2 direct single-item entry (links only). Null/false => normal list view.
  const [directItemId, setDirectItemId] = useState<string | null>(null);
  const [directNew, setDirectNew] = useState<boolean>(false);
  // 'add' = entered via section list. 'edit' = opened directly via editingBlock prop.
  // Drives whether back-button / save closes the panel or returns to the list.
  const [entryMode, setEntryMode] = useState<'add' | 'edit'>('add');

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
    setVideoProfileOpen(false);
    onClose();
  };

  const handleVideoUpload = async (file: File) => {
    if (!user) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Video is too large (max 50MB). Try a shorter clip.');
      return;
    }
    toast('Uploading video…');
    try {
      const fileExt = file.name.split('.').pop() || 'mp4';
      const fileName = `${user.id}/hero-video-${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);
      const existingTheme = (themeJson as any) || {};
      const existingHero = existingTheme.heroConfig || {};
      const { error } = await supabase
        .from('pages')
        .update({ theme_json: { ...existingTheme, heroConfig: { ...existingHero, video: urlData.publicUrl } } })
        .eq('id', pageId);
      if (error) throw error;
      toast.success('Hero video added!');
      onRefresh();
    } catch (err) {
      console.error('Video upload error:', err);
      toast.error('Failed to upload video');
    }
  };

  const saveHeroConfig = async (patch: Record<string, unknown>) => {
    const existingTheme = (themeJson as any) || {};
    const existingHero = existingTheme.heroConfig || {};
    const { error } = await supabase
      .from('pages')
      .update({ theme_json: { ...existingTheme, heroConfig: { ...existingHero, ...patch } } })
      .eq('id', pageId);
    if (error) { toast.error('Could not save'); return; }
    onRefresh();
  };

  const handleVideoRemove = async () => {
    const existingTheme = (themeJson as any) || {};
    const existingHero = { ...(existingTheme.heroConfig || {}) };
    delete existingHero.video;
    const { error } = await supabase
      .from('pages')
      .update({ theme_json: { ...existingTheme, heroConfig: existingHero } })
      .eq('id', pageId);
    if (error) { toast.error('Could not remove video'); return; }
    toast.success('Hero video removed');
    onRefresh();
    setVideoProfileOpen(false);
  };

  const handleRowTap = async (row: DashboardRow) => {
    // List-entry path always opens the batch list view, never direct item mode.
    setDirectItemId(null);
    setDirectNew(false);
    if (!row.blockType) {
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
      toast(t(row.toastKey || 'dashboard.comingSoon'));
      return;
    }

    if (!modeId) {
      toast.error(t('dashboard.noMode'));
      return;
    }

    try {
      const { data: block, error } = await supabase
        .from('blocks')
        .select('id')
        .eq('mode_id', modeId)
        .eq('type', row.blockType)
        .maybeSingle();

      if (error) throw error;

      if (!block) {
        const { data: newBlock, error: insertError } = await supabase
          .from('blocks')
          .insert({
            mode_id: modeId,
            type: row.blockType,
            title: t(row.titleKey),
            is_enabled: true,
            order_index: 99,
          })
          .select('id')
          .single();

        if (insertError) throw insertError;
        onRefresh();
        setActiveBlockId(newBlock.id);
        setActiveBlockType(row.blockType);
        setActiveBlockTitle(t(row.titleKey));
        // Featured Links opens a blank add-link detail (create-on-save),
        // matching the preview "+", instead of the legacy list view.
        if (row.blockType === 'links') setDirectNew(true);
        return;
      }

      setActiveBlockId(block.id);
      setActiveBlockType(row.blockType);
      setActiveBlockTitle(t(row.titleKey));
      if (row.blockType === 'links') setDirectNew(true);
    } catch (err) {
      console.error('Error finding block:', err);
      toast.error(t('dashboard.failedOpen'));
    }
  };

  const handleEditorClose = (editorOpen: boolean) => {
    if (!editorOpen) {
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
    }
  };

  const handleEditorSave = () => {
    onRefresh();
    if (entryMode === 'edit') {
      handleClose();
      return;
    }
    setActiveBlockId(null);
    setActiveBlockType(null);
    setActiveBlockTitle('');
    setDirectItemId(null);
    setDirectNew(false);
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
              if (error) { toast.error('Could not save'); return; }
              onRefresh();
            }}
          />
        );
      case 'links':
        return <LinksEditor {...editorProps} directItemId={directItemId} directNew={directNew} onDraftChange={onDraftChange} />;
      case 'product_cards':
        return <ProductCardsEditor {...editorProps} />;
      case 'email_subscribe':
        return <EmailSubscribeEditor {...editorProps} />;
      case 'gallery':
        return <GalleryEditor {...editorProps} />;
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
          {/* Dim overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            onClick={handleClose}
          />

          {/* Panel — slides from right on all screen sizes */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-16 sm:top-0 right-0 bottom-0 z-[120] w-full sm:w-[420px] bg-[#0e0c09] border-l border-white/10 flex flex-col overflow-x-clip"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10 flex-shrink-0">
              {videoProfileOpen ? (
                <>
                  <button
                    onClick={() => setVideoProfileOpen(false)}
                    className="text-white/60 hover:text-white transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <h2 className="text-lg font-bold text-white">{t('dashboard.videoProfile')}</h2>
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
              ) : activeBlockId ? (
                <>
                  <button
                    onClick={() => {
                      // In edit mode, back closes the whole panel; in add mode
                      // it returns to the section list.
                      if (entryMode === 'edit') {
                        handleClose();
                      } else {
                        setActiveBlockId(null);
                        setActiveBlockType(null);
                        setActiveBlockTitle('');
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

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto pb-8">
              {videoProfileOpen ? (
                <div className="dark text-foreground px-4 pt-4 space-y-5">
                  {heroVideoUrl ? (
                    <div className="rounded-2xl overflow-hidden border border-white/10 bg-black">
                      <video src={heroVideoUrl} muted loop playsInline autoPlay className="w-full h-48 object-cover" />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 h-40 flex items-center justify-center">
                      <p className="text-white/40 text-xs">No hero video yet</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => videoInputRef.current?.click()}
                      className="flex-1 py-3 rounded-xl bg-[#C9A55C] text-[#0e0c09] font-bold text-sm"
                    >
                      {heroVideoUrl ? 'Change video' : 'Add a video'}
                    </button>
                    {heroVideoUrl && (
                      <button
                        onClick={handleVideoRemove}
                        className="px-4 py-3 rounded-xl border border-white/15 text-white/80 font-semibold text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {heroVideoUrl && (
                    <>
                      <div>
                        <p className="text-white/70 text-xs font-semibold mb-2">Sound</p>
                        <div className="flex w-full rounded-xl bg-white/5 p-1 gap-1">
                          <button
                            onClick={() => saveHeroConfig({ audio: 'silent' })}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${heroAudioMode === 'silent' ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/70'}`}
                          >
                            Silent
                          </button>
                          <button
                            onClick={() => saveHeroConfig({ audio: 'clip' })}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${heroAudioMode === 'clip' ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/70'}`}
                          >
                            Clip sound
                          </button>
                        </div>
                        <p className="text-white/40 text-[11px] mt-1.5">
                          {heroAudioMode === 'clip'
                            ? "Plays muted; visitors tap to hear the clip's sound."
                            : 'Hero plays silently.'}
                        </p>
                      </div>
                      <div>
                        <p className="text-white/70 text-xs font-semibold mb-2">Playback</p>
                        <div className="flex w-full rounded-xl bg-white/5 p-1 gap-1">
                          <button
                            onClick={() => saveHeroConfig({ playback: 'once' })}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${heroPlaybackMode === 'once' ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/70'}`}
                          >
                            Once
                          </button>
                          <button
                            onClick={() => saveHeroConfig({ playback: 'loop' })}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${heroPlaybackMode === 'loop' ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/70'}`}
                          >
                            Loop
                          </button>
                          <button
                            onClick={() => saveHeroConfig({ playback: 'bounce' })}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${heroPlaybackMode === 'bounce' ? 'bg-[#C9A55C] text-[#0e0c09]' : 'text-white/70'}`}
                          >
                            Bounce
                          </button>
                        </div>
                        <p className="text-white/40 text-[11px] mt-1.5">
                          {heroPlaybackMode === 'once'
                            ? 'Plays once, then shows a replay arrow.'
                            : heroPlaybackMode === 'loop'
                            ? 'Loops continuously.'
                            : 'Plays forward then reverses, like a Live Photo.'}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              ) : galleryOpen ? (
                <div className="dark text-foreground">
                  <TemplateGallery pageId={pageId} onApply={onRefresh} />
                </div>
              ) : designOpen ? (
                <div className="dark text-foreground">
                  <DesignEditor
                    pageId={pageId}
                    themeJson={themeJson}
                    onUpdate={onRefresh}
                    displayName={displayName}
                    bio={bio}
                    avatarUrl={avatarUrl}
                  />
                </div>
              ) : activeBlockId ? (
                <div className="dark text-foreground">{renderEditor()}</div>
              ) : (
                sections.map((section) => (
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
                          <p className="text-sm font-bold text-white">{t(row.titleKey)}</p>
                          <p className="text-xs text-white/50">{t(row.subtitleKey)}</p>
                        </div>
                        <Plus className="h-5 w-5 text-white/40 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                ))
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
