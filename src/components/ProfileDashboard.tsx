import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Link as LinkIcon,
  Share2,
  MousePointer,
  ShoppingBag,
  Image as ImageIcon,
  Mail,
  Sparkles,
  FileText,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  title: string;
  subtitle: string;
  blockType: string | null;
  action?: () => void;
}

const sections: { label: string; rows: DashboardRow[] }[] = [
  {
    label: 'My Links',
    rows: [
      {
        icon: <Share2 className="h-5 w-5 text-white/70" />,
        title: 'Manage Platforms',
        subtitle: 'Add your social media profiles',
        blockType: 'social_links',
      },
      {
        icon: <LinkIcon className="h-5 w-5 text-white/70" />,
        title: 'Featured Links',
        subtitle: 'Custom link buttons on your page',
        blockType: 'links',
      },
      {
        icon: <MousePointer className="h-5 w-5 text-white/70" />,
        title: 'Primary CTA',
        subtitle: 'Your main call-to-action button',
        blockType: 'primary_cta',
      },
    ],
  },
  {
    label: 'Media',
    rows: [
      {
        icon: <ImageIcon className="h-5 w-5 text-white/70" />,
        title: 'Featured Media',
        subtitle: 'Photos and video links',
        blockType: 'featured_media',
      },
      {
        icon: <ShoppingBag className="h-5 w-5 text-white/70" />,
        title: 'Products',
        subtitle: 'Showcase your products',
        blockType: 'product_cards',
      },
    ],
  },
  {
    label: 'Content',
    rows: [
      {
        icon: <FileText className="h-5 w-5 text-white/70" />,
        title: 'Content Section',
        subtitle: 'Text and content blocks',
        blockType: 'content_section',
      },
    ],
  },
  {
    label: 'Forms',
    rows: [
      {
        icon: <Mail className="h-5 w-5 text-white/70" />,
        title: 'Email Capture',
        subtitle: 'Collect visitor emails',
        blockType: 'email_subscribe',
      },
    ],
  },
  {
    label: 'Coming Soon',
    rows: [
      {
        icon: <Sparkles className="h-5 w-5 text-white/70" />,
        title: 'Tracking Pixels',
        subtitle: 'Analytics and retargeting',
        blockType: null,
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
  const handleRowTap = async (blockType: string | null) => {
    if (!blockType) {
      toast('Coming soon!');
      return;
    }

    if (!modeId) {
      toast.error('No mode found');
      return;
    }

    try {
      const { data: block, error } = await supabase
        .from('blocks')
        .select('id')
        .eq('mode_id', modeId)
        .eq('type', blockType)
        .maybeSingle();

      if (error) throw error;

      if (!block) {
        toast.error("This block hasn't been created yet.");
        return;
      }

      onClose();
      onBlockEdit(block.id);
    } catch (err) {
      console.error('Error finding block:', err);
      toast.error('Failed to open editor');
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
            onClick={onClose}
          />

          {/* Panel — mobile: slides up, desktop: slides from right */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 lg:left-auto lg:top-0 lg:w-[420px] lg:bottom-0 bg-[#0e0c09] border-t border-white/10 lg:border-t-0 lg:border-l rounded-t-3xl lg:rounded-t-none max-h-[85vh] lg:max-h-none overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10 flex-shrink-0">
              <h2 className="text-lg font-bold text-white">Profile Dashboard</h2>
              <button
                onClick={onClose}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto pb-8">
              {sections.map((section) => (
                <div key={section.label}>
                  <p className="px-4 pt-5 pb-2 text-xs font-bold uppercase tracking-widest text-white/40">
                    {section.label}
                  </p>
                  {section.rows.map((row) => (
                    <button
                      key={row.title}
                      onClick={() => handleRowTap(row.blockType)}
                      className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-white/5 transition-colors border-b border-white/5"
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                        {row.icon}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-semibold text-white">{row.title}</p>
                        <p className="text-xs text-white/50">{row.subtitle}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-white/30" />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
