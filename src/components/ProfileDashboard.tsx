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
  toastMessage?: string;
}

const sections: { label: string; rows: DashboardRow[] }[] = [
  {
    label: 'My Links',
    rows: [
      {
        icon: <Heart className="h-6 w-6 text-white" />,
        title: 'Manage Platforms',
        subtitle: 'Add or edit platform links',
        blockType: 'social_links',
      },
      {
        icon: <LinkIcon className="h-6 w-6 text-white" />,
        title: 'Featured Links',
        subtitle: 'Add link',
        blockType: 'links',
      },
      {
        icon: <MousePointer className="h-6 w-6 text-white" />,
        title: 'Primary CTA',
        subtitle: 'Your main call-to-action button',
        blockType: 'primary_cta',
      },
    ],
  },
  {
    label: 'Appearance',
    rows: [
      {
        icon: <Type className="h-6 w-6 text-white" />,
        title: 'Add a Header',
        subtitle: 'Add custom titles above your links',
        blockType: null,
        toastMessage: 'Coming soon!',
      },
      {
        icon: <Palette className="h-6 w-6 text-white" />,
        title: 'Profile Customization',
        subtitle: 'Choose fonts, background and text colors',
        blockType: null,
        toastMessage: 'Open the Design tab',
      },
      {
        icon: <Video className="h-6 w-6 text-white" />,
        title: 'Video Profile',
        subtitle: 'Add video to your profile image',
        blockType: null,
        toastMessage: 'Coming soon!',
      },
    ],
  },
  {
    label: 'E-Commerce',
    rows: [
      {
        icon: <ShoppingBag className="h-6 w-6 text-white" />,
        title: 'New Merch',
        subtitle: 'Add merch',
        blockType: 'product_cards',
      },
    ],
  },
  {
    label: 'Products',
    rows: [
      {
        icon: <Download className="h-6 w-6 text-white" />,
        title: 'Digital Products',
        subtitle: 'Manage Digital Products',
        blockType: null,
        toastMessage: 'Coming soon!',
      },
      {
        icon: <Lock className="h-6 w-6 text-white" />,
        title: 'Locked Products',
        subtitle: 'Manage Locked Products',
        blockType: null,
        toastMessage: 'Coming soon!',
      },
    ],
  },
  {
    label: 'Events',
    rows: [
      {
        icon: <Calendar className="h-6 w-6 text-white" />,
        title: 'Create Custom Event',
        subtitle: 'Add custom event',
        blockType: null,
        toastMessage: 'Coming soon!',
      },
    ],
  },
  {
    label: 'Forms',
    rows: [
      {
        icon: <FileText className="h-6 w-6 text-white" />,
        title: 'Create Form',
        subtitle: 'Add custom form',
        blockType: 'email_subscribe',
      },
    ],
  },
  {
    label: 'Analytics',
    rows: [
      {
        icon: <BarChart2 className="h-6 w-6 text-white" />,
        title: 'Tracking Pixels',
        subtitle: 'Add Meta, TikTok, or GA tags',
        blockType: null,
        toastMessage: 'Coming soon!',
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
  const handleRowTap = async (row: DashboardRow) => {
    if (!row.blockType) {
      toast(row.toastMessage || 'Coming soon!');
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
        .eq('type', row.blockType)
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
              <h2 className="text-lg font-bold text-white">Add Content</h2>
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
                  <p className="text-lg font-bold text-white px-4 pt-6 pb-3">
                    {section.label}
                  </p>
                  {section.rows.map((row) => (
                    <button
                      key={row.title}
                      onClick={() => handleRowTap(row)}
                      className="w-full mx-4 mb-2 flex items-center gap-4 bg-white/5 rounded-2xl px-4 py-4 hover:bg-white/10 transition-colors"
                      style={{ width: 'calc(100% - 2rem)' }}
                    >
                      <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                        {row.icon}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-bold text-white">{row.title}</p>
                        <p className="text-xs text-white/50">{row.subtitle}</p>
                      </div>
                      <Plus className="h-5 w-5 text-white/40 flex-shrink-0" />
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
