import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Switch } from '@/components/ui/switch';
import { GripVertical, ShoppingBag, Link, Share2, Image, MousePointer, Mail, User, FileText, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import type { Tables } from '@/integrations/supabase/types';

type Block = Tables<'blocks'>;

const BLOCK_TYPE_ICONS: Record<string, React.ReactNode> = {
  primary_cta: <MousePointer className="h-4 w-4" />,
  product_cards: <ShoppingBag className="h-4 w-4" />,
  featured_media: <Image className="h-4 w-4" />,
  social_links: <Share2 className="h-4 w-4" />,
  links: <Link className="h-4 w-4" />,
  email_subscribe: <Mail className="h-4 w-4" />,
  social_icon_row: <Share2 className="h-4 w-4" />,
  hero_card: <User className="h-4 w-4" />,
  content_section: <FileText className="h-4 w-4" />,
  gallery: <Image className="h-4 w-4" />,
};

interface BlockItemProps {
  block: Block;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (id: string) => void;
}

export function BlockItem({ block, onToggle, onEdit }: BlockItemProps) {
  const { t } = useLanguage();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'flex items-center gap-3 px-4 py-3 bg-card border rounded-lg',
        // Base transition
        'transition-all duration-150 ease-out',
        // Reduced motion support
        'motion-reduce:transition-none motion-reduce:transform-none',
        // Dragging state: lift + shadow
        isDragging
          ? 'opacity-90 shadow-lg scale-[1.01] border-primary/50 z-10 relative'
          : 'border-border',
        // Drop target highlight
        isOver && !isDragging
          ? 'border-primary/40 bg-primary/5'
          : '',
        // Disabled state
        !block.is_enabled ? 'opacity-60' : '',
      ].filter(Boolean).join(' ')}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        <GripVertical className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-2 text-primary bg-primary/10 p-2 rounded-lg">
        {BLOCK_TYPE_ICONS[block.type] || <Link className="h-4 w-4" />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{t(`blocks.${block.type}.title`) || block.title || block.type}</p>
        <p className="text-xs text-muted-foreground">{t(`blocks.${block.type}.subtitle`) || ''}</p>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          checked={block.is_enabled}
          onCheckedChange={(checked) => onToggle(block.id, checked)}
        />
        <button
          onClick={() => onEdit(block.id)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
