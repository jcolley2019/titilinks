import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  Share2,
  Link,
  MousePointer,
  Palette,
  LayoutTemplate,
  Image,
  ShoppingBag,
  Mail,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BlockEditorDialog } from '@/components/BlockEditorDialog';

interface MobileDashboardProps {
  pageId: string;
  modeId: string | null;
  onSave: () => void;
}

interface DashboardRow {
  type: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action: 'block' | 'navigate';
  navigateTo?: string;
}

const CATEGORIES: { label: string; rows: DashboardRow[] }[] = [
  {
    label: 'MY LINKS',
    rows: [
      {
        type: 'social_links',
        icon: <Share2 className="h-5 w-5 text-[#C9A55C]" />,
        title: 'Social Links',
        subtitle: 'Add your social platforms',
        action: 'block',
      },
      {
        type: 'links',
        icon: <Link className="h-5 w-5 text-[#C9A55C]" />,
        title: 'Custom Links',
        subtitle: 'Add custom link buttons',
        action: 'block',
      },
      {
        type: 'primary_cta',
        icon: <MousePointer className="h-5 w-5 text-[#C9A55C]" />,
        title: 'Primary CTA',
        subtitle: 'Your main call-to-action button',
        action: 'block',
      },
    ],
  },
  {
    label: 'APPEARANCE',
    rows: [
      {
        type: '_design',
        icon: <Palette className="h-5 w-5 text-[#C9A55C]" />,
        title: 'Design & Theme',
        subtitle: 'Colors, fonts, background',
        action: 'navigate',
        navigateTo: '/dashboard/editor?tab=design',
      },
      {
        type: '_page_style',
        icon: <LayoutTemplate className="h-5 w-5 text-[#C9A55C]" />,
        title: 'Page Style',
        subtitle: 'Classic, Hero, or Cinematic layout',
        action: 'navigate',
        navigateTo: '/dashboard/editor?tab=design',
      },
    ],
  },
  {
    label: 'MEDIA',
    rows: [
      {
        type: 'featured_media',
        icon: <Image className="h-5 w-5 text-[#C9A55C]" />,
        title: 'Featured Media',
        subtitle: 'Photos and video links',
        action: 'block',
      },
      {
        type: 'product_cards',
        icon: <ShoppingBag className="h-5 w-5 text-[#C9A55C]" />,
        title: 'Products',
        subtitle: 'Product cards for your shop',
        action: 'block',
      },
    ],
  },
  {
    label: 'MORE',
    rows: [
      {
        type: 'email_subscribe',
        icon: <Mail className="h-5 w-5 text-[#C9A55C]" />,
        title: 'Email Capture',
        subtitle: 'Collect visitor emails',
        action: 'block',
      },
    ],
  },
];

export function MobileDashboard({ pageId, modeId, onSave }: MobileDashboardProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [blockMap, setBlockMap] = useState<Record<string, string>>({});
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // Fetch blocks for current mode
  useEffect(() => {
    if (!modeId) {
      setBlockMap({});
      return;
    }

    const fetchBlocks = async () => {
      const { data } = await supabase
        .from('blocks')
        .select('id, type')
        .eq('mode_id', modeId);

      if (data) {
        const map: Record<string, string> = {};
        for (const block of data) {
          map[block.type] = block.id;
        }
        setBlockMap(map);
      }
    };

    fetchBlocks();
  }, [modeId]);

  const handleRowTap = (row: DashboardRow) => {
    if (row.action === 'navigate' && row.navigateTo) {
      setOpen(false);
      navigate(row.navigateTo);
      return;
    }

    // Block action
    const blockId = blockMap[row.type];
    if (!blockId) return;

    setEditingBlockId(blockId);
    setEditorOpen(true);
  };

  const handleEditorClose = (isOpen: boolean) => {
    setEditorOpen(isOpen);
    if (!isOpen) {
      setEditingBlockId(null);
      onSave();
    }
  };

  return (
    <>
      {/* Trigger Button — fixed above bottom nav, mobile only */}
      <div className="lg:hidden fixed bottom-[72px] left-0 right-0 z-50 px-4 pb-2 pointer-events-none">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto w-full py-3 rounded-full bg-[#C9A55C] text-black font-semibold text-sm shadow-lg active:scale-[0.98] transition-transform"
        >
          ✏️ Edit Profile
        </button>
      </div>

      {/* Slide-in Panel */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-[60] bg-black/50"
              onClick={() => setOpen(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="lg:hidden fixed inset-0 z-[60] bg-[#0e0c09] overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center px-4 py-4 border-b border-[#1a1a1a] flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1 -ml-1 text-white"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <h2 className="flex-1 text-center text-base font-semibold text-white pr-6">
                  Profile Dashboard
                </h2>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {CATEGORIES.map((category) => (
                  <div key={category.label} className="mb-6">
                    {/* Category Label */}
                    <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A55C] mb-3">
                      {category.label}
                    </p>

                    {/* Rows */}
                    <div>
                      {category.rows.map((row) => {
                        const isBlockRow = row.action === 'block';
                        const hasBlock = !isBlockRow || !!blockMap[row.type];
                        const disabled = isBlockRow && !hasBlock;

                        return (
                          <button
                            key={row.type}
                            type="button"
                            onClick={() => !disabled && handleRowTap(row)}
                            disabled={disabled}
                            className={`w-full flex items-center gap-3 py-3 border-b border-[#1a1a1a] text-left transition-colors ${
                              disabled ? 'opacity-50' : 'active:bg-[#1a1a1a]'
                            }`}
                          >
                            {/* Icon */}
                            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#1a1a1a] flex items-center justify-center">
                              {row.icon}
                            </div>

                            {/* Text */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white">{row.title}</p>
                              <p className="text-xs text-[#666666]">
                                {disabled ? 'Not set up yet' : row.subtitle}
                              </p>
                            </div>

                            {/* Chevron */}
                            <ChevronRight className="h-4 w-4 text-[#444444] flex-shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Block Editor Dialog — reuses existing component */}
      <BlockEditorDialog
        blockId={editingBlockId}
        open={editorOpen}
        onOpenChange={handleEditorClose}
        onSave={onSave}
      />
    </>
  );
}
