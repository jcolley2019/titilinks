import { Switch } from '@/components/ui/switch';
import { ChevronRight, Camera } from 'lucide-react';
import { toast } from 'sonner';

const BLOCK_ICONS: Record<string, string> = {
  primary_cta: '🎯',
  social_links: '🔗',
  links: '🌐',
  product_cards: '🛍️',
  featured_media: '🎬',
  email_subscribe: '✉️',
  hero_card: '🖼️',
  social_icon_row: '💬',
  content_section: '📝',
};

const BLOCK_LABELS: Record<string, string> = {
  primary_cta: 'Primary CTA',
  social_links: 'Social Links',
  links: 'Custom Links',
  product_cards: 'Products',
  featured_media: 'Featured Media',
  email_subscribe: 'Email Capture',
  hero_card: 'Hero Card',
  social_icon_row: 'Social Icons',
  content_section: 'Content Section',
};

interface MobileBlock {
  id: string;
  type: string;
  title: string | null;
  is_enabled: boolean;
  order_index: number;
}

interface MobileInlineEditorProps {
  page: {
    handle: string;
    display_name: string | null;
    avatar_url: string | null;
    bio: string | null;
  };
  blocks: MobileBlock[];
  onEditBlock: (blockId: string) => void;
  onToggleBlock: (blockId: string, enabled: boolean) => void;
}

export function MobileInlineEditor({
  page,
  blocks,
  onEditBlock,
  onToggleBlock,
}: MobileInlineEditorProps) {
  const sorted = [...blocks].sort((a, b) => a.order_index - b.order_index);

  return (
    <div className="min-h-screen bg-[#0e0c09] flex flex-col">

      {/* PROFILE HERO */}
      <div className="flex flex-col items-center pt-8 pb-6 px-4">
        <div className="relative mb-4">
          {page.avatar_url ? (
            <img
              src={page.avatar_url}
              alt={page.display_name || 'Profile'}
              className="w-24 h-24 rounded-full object-cover border-2 border-[#C9A55C]"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-[#1a1a1a] border-2 border-[#C9A55C] flex items-center justify-center">
              <Camera className="h-8 w-8 text-[#C9A55C]" />
            </div>
          )}
        </div>

        <h1 className="text-xl font-semibold text-white text-center">
          {page.display_name || `@${page.handle}`}
        </h1>

        <p className="text-sm text-[#C9A55C] mt-1">@{page.handle}</p>

        <button
          type="button"
          onClick={() => toast.info('Photo upload coming soon')}
          className="text-xs text-[#666] mt-2 active:text-[#888]"
        >
          Change Profile Picture
        </button>

        {page.bio && (
          <p className="text-sm text-[#888] text-center mt-3 max-w-xs leading-relaxed">
            {page.bio}
          </p>
        )}

        <div className="w-16 h-px bg-[#C9A55C] mt-6 opacity-40" />
      </div>

      {/* BLOCKS SECTION */}
      <div className="flex-1 px-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-[#C9A55C] px-4 py-3">
          My Blocks
        </p>

        {sorted.length === 0 ? (
          <div className="text-center py-12 text-[#444]">
            <p className="text-sm">No blocks yet</p>
            <p className="text-xs mt-1">Tap Edit Profile to add content</p>
          </div>
        ) : (
          <div>
            {sorted.map((block) => (
              <div
                key={block.id}
                className={[
                  'w-full flex items-center gap-3 px-4 py-4',
                  'border-b border-[#1a1a1a]',
                  'transition-colors active:bg-[#1a1a1a]',
                  !block.is_enabled ? 'opacity-40' : '',
                ].join(' ')}
              >
                {/* Icon */}
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#1a1a1a] flex items-center justify-center text-lg">
                  {BLOCK_ICONS[block.type] || '🔗'}
                </div>

                {/* Text — tapping this area opens editor */}
                <button
                  type="button"
                  onClick={() => onEditBlock(block.id)}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="text-sm font-medium text-white truncate">
                    {BLOCK_LABELS[block.type] || block.type}
                  </p>
                  <p className="text-xs text-[#666] truncate">
                    Tap to edit
                  </p>
                </button>

                {/* Toggle */}
                <Switch
                  checked={block.is_enabled}
                  onCheckedChange={(checked) => onToggleBlock(block.id, checked)}
                  className="data-[state=checked]:bg-[#C9A55C]"
                />

                {/* Chevron — tapping opens editor */}
                <button
                  type="button"
                  onClick={() => onEditBlock(block.id)}
                  className="p-1"
                >
                  <ChevronRight className="h-4 w-4 text-[#444]" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="h-40" />
      </div>
    </div>
  );
}
