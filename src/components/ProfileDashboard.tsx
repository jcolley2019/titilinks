import { useState } from 'react';
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
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';
import { PrimaryCtaEditor } from '@/components/editors/PrimaryCtaEditor';
import { SocialLinksEditor } from '@/components/editors/SocialLinksEditor';
import { LinksEditor } from '@/components/editors/LinksEditor';
import { ProductCardsEditor } from '@/components/editors/ProductCardsEditor';
import { EmailSubscribeEditor } from '@/components/editors/EmailSubscribeEditor';
import { GalleryEditor } from '@/components/editors/GalleryEditor';
import { BioEditor } from '@/components/editors/BioEditor';

interface ProfileDashboardProps {
  open: boolean;
  onClose: () => void;
  pageId: string;
  modeId: string | null;
  onBlockEdit: (blockId: string) => void;
  onRefresh: () => void;
}

interface DashboardRow {
  icon: React.ReactNode;
  titleKey: string;
  subtitleKey: string;
  blockType: string | null;
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
        titleKey: 'dashboard.addHeader',
        subtitleKey: 'dashboard.addHeaderDesc',
        blockType: null,
        toastKey: 'dashboard.comingSoon',
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
}: ProfileDashboardProps) {
  const { t } = useLanguage();
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [activeBlockType, setActiveBlockType] = useState<string | null>(null);
  const [activeBlockTitle, setActiveBlockTitle] = useState<string>('');

  const handleClose = () => {
    setActiveBlockId(null);
    setActiveBlockType(null);
    setActiveBlockTitle('');
    onClose();
  };

  const handleRowTap = async (row: DashboardRow) => {
    if (!row.blockType) {
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
        return;
      }

      setActiveBlockId(block.id);
      setActiveBlockType(row.blockType);
      setActiveBlockTitle(t(row.titleKey));
    } catch (err) {
      console.error('Error finding block:', err);
      toast.error(t('dashboard.failedOpen'));
    }
  };

  const handleEditorClose = (editorOpen: boolean) => {
    if (!editorOpen) {
      setActiveBlockId(null);
      setActiveBlockType(null);
      setActiveBlockTitle('');
    }
  };

  const handleEditorSave = () => {
    setActiveBlockId(null);
    setActiveBlockType(null);
    setActiveBlockTitle('');
    onRefresh();
  };

  const renderEditor = () => {
    if (!activeBlockId || !activeBlockType) return null;

    const editorProps = {
      blockId: activeBlockId,
      open: true as const,
      onOpenChange: handleEditorClose,
      onSave: handleEditorSave,
    };

    switch (activeBlockType) {
      case 'primary_cta':
        return <PrimaryCtaEditor {...editorProps} />;
      case 'social_links':
        return <SocialLinksEditor {...editorProps} />;
      case 'links':
        return <LinksEditor {...editorProps} />;
      case 'product_cards':
        return <ProductCardsEditor {...editorProps} />;
      case 'email_subscribe':
        return <EmailSubscribeEditor {...editorProps} />;
      case 'gallery':
        return <GalleryEditor {...editorProps} />;
      case 'bio':
        return <BioEditor {...editorProps} />;
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
            className="fixed inset-0 bg-black/50 z-40"
            onClick={handleClose}
          />

          {/* Panel — slides from right on all screen sizes */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[420px] bg-[#0e0c09] border-l border-white/10 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10 flex-shrink-0">
              {activeBlockId ? (
                <>
                  <button
                    onClick={() => { setActiveBlockId(null); setActiveBlockType(null); setActiveBlockTitle(''); }}
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
              {activeBlockId ? (
                renderEditor()
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
        </>
      )}
    </AnimatePresence>
  );
}
