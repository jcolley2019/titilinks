import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { motion } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers';
import {
  Link as LinkIcon,
  ShoppingBag,
  Image as ImageIcon,
  ShieldAlert,
  GripVertical,
  ChevronLeft,
  ChevronRight,
  MousePointer,
  Share2,
  FileText,
  Mail,
  User,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getThemeWithDefaults, applyAutoContrast, type ThemeJson, type BlockStyleConfig, DEFAULT_BLOCK_STYLE } from '@/lib/theme-defaults';
import { LinkButton } from '@/components/LinkButton';
import { ThumbnailImage } from '@/components/ThumbnailImage';
import { SmoothImage } from '@/components/SmoothImage';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/hooks/useHapticFeedback';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';
import { translateContent } from '@/lib/content-i18n';
import type { Tables, Enums } from '@/integrations/supabase/types';

// ─── Types ───────────────────────────────────────────────────────────────────

type Block = Tables<'blocks'>;
type BlockItem = Tables<'block_items'>;

interface BlockWithItems extends Block {
  items: BlockItem[];
}

interface ThemedBlockProps {
  block: BlockWithItems;
  onOutboundClick: (blockType: string, blockId: string, itemId: string, url: string, isAdult?: boolean) => boolean;
  theme: ThemeJson;
}

interface EditableProfileViewProps {
  page: Tables<'pages'>;
  blocks: BlockWithItems[];
  editMode: boolean;
  onBlockEdit: (blockId: string) => void;
  onBlockToggle: (blockId: string, enabled: boolean) => void;
  onBlockReorder: (blockIds: string[]) => void;
  onRefresh: () => void;
  selectedMode: 'shop' | 'recruit';
  onModeChange: (mode: 'shop' | 'recruit') => void;
  onAddContent?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getFontFamily(theme: ThemeJson): string {
  switch (theme.typography.font) {
    case 'inter': return "'Inter', sans-serif";
    case 'system': return 'system-ui, sans-serif';
    case 'serif': return 'Georgia, serif';
    case 'mono': return 'monospace';
    case 'playfair': return "'Playfair Display', serif";
    case 'bebas': return "'Bebas Neue', cursive";
    case 'abril': return "'Abril Fatface', cursive";
    case 'pacifico': return "'Pacifico', cursive";
    case 'orbitron': return "'Orbitron', sans-serif";
    case 'caveat': return "'Caveat', cursive";
    case 'archivo': return "'Archivo Black', sans-serif";
    case 'lora': return "'Lora', serif";
    case 'patrick': return "'Patrick Hand', cursive";
    case 'space': return "'Space Grotesk', sans-serif";
    default: return "'Inter', sans-serif";
  }
}

// ─── SocialSvgIcon ───────────────────────────────────────────────────────────

function SocialSvgIcon({ label, size = 20, color = 'currentColor' }: { label: string; size?: number; color?: string }) {
  const lower = label.toLowerCase();
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: color, xmlns: 'http://www.w3.org/2000/svg' } as const;

  if (lower.includes('tiktok')) return (
    <svg {...props}><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V9.4a8.16 8.16 0 004.76 1.52V7.47a4.85 4.85 0 01-1-.78z"/></svg>
  );
  if (lower.includes('instagram')) return (
    <svg {...props}><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
  );
  if (lower.includes('youtube')) return (
    <svg {...props}><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
  );
  if (lower.includes('facebook')) return (
    <svg {...props}><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
  );
  if (lower.includes('twitter') || lower.includes(' x') || lower === 'x') return (
    <svg {...props}><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
  );
  if (lower.includes('linkedin')) return (
    <svg {...props}><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
  );
  if (lower.includes('threads')) return (
    <svg {...props}><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.17.408-2.265 1.33-3.084.88-.782 2.123-1.257 3.591-1.375.963-.078 1.858-.034 2.688.13-.043-.745-.207-1.332-.49-1.76-.388-.588-1.024-.893-1.912-.917-1.593-.042-2.651.434-3.158 1.073l-.027.038-1.63-1.274.038-.046c.833-1.029 2.39-1.676 4.763-1.6 1.404.036 2.513.548 3.298 1.524.672.833 1.05 1.96 1.127 3.358a9.6 9.6 0 011.094.672c1.126.808 1.952 1.786 2.389 2.826.755 1.797.795 4.568-1.37 6.694C18.028 23.182 15.59 23.96 12.186 24zm-1.248-7.498c-.052 0-.104.002-.157.004-1.476.082-2.417.856-2.375 1.653.043.788.842 1.417 2.127 1.417h.007c1.354-.074 2.927-.813 2.68-3.622-.564-.126-1.47-.252-2.282-.252v.8z"/></svg>
  );
  if (lower.includes('snapchat')) return (
    <svg {...props}><path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12.959-.289.089-.05.19-.078.292-.078a.68.68 0 01.689.675c0 .345-.263.594-.63.75-.525.22-1.065.36-1.395.465-.09.029-.176.06-.239.09a.96.96 0 00-.449.63c-.03.149-.015.299.045.449.12.3.72 1.545 1.725 2.535.735.72 1.485 1.2 2.175 1.44.105.03.195.06.285.09.36.12.585.225.585.585 0 .45-.435.585-.825.705-.525.165-1.215.27-1.755.345-.06.315-.12.63-.195.93-.06.24-.135.465-.27.465-.135.03-.3-.015-.525-.06a5.7 5.7 0 00-.96-.12c-.36 0-.705.06-1.05.195-.48.18-.93.51-1.41.855-.735.54-1.575 1.155-2.91 1.155-1.335 0-2.175-.615-2.91-1.155-.48-.345-.93-.675-1.41-.855a3.08 3.08 0 00-1.05-.195 5.58 5.58 0 00-.96.12c-.225.045-.39.09-.525.06-.135 0-.21-.225-.27-.465-.075-.3-.135-.615-.195-.93-.54-.075-1.23-.18-1.755-.345-.39-.12-.825-.255-.825-.705 0-.36.225-.465.585-.585.09-.03.18-.06.285-.09.69-.24 1.44-.72 2.175-1.44 1.005-.99 1.605-2.235 1.725-2.535.06-.15.075-.3.045-.449a.96.96 0 00-.449-.63c-.063-.03-.149-.061-.239-.09-.33-.105-.87-.245-1.395-.465-.367-.156-.63-.405-.63-.75a.68.68 0 01.689-.675c.103 0 .203.028.292.078.3.17.659.305.959.289.198 0 .326-.045.401-.09a14.4 14.4 0 01-.033-.57c-.104-1.628-.23-3.654.299-4.847C7.859 1.069 11.216.793 12.206.793z"/></svg>
  );
  if (lower.includes('pinterest')) return (
    <svg {...props}><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641 0 12.017 0z"/></svg>
  );
  if (lower.includes('telegram')) return (
    <svg {...props}><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
  );
  if (lower.includes('whatsapp')) return (
    <svg {...props}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
  );
  if (lower.includes('spotify')) return (
    <svg {...props}><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
  );
  if (lower.includes('discord')) return (
    <svg {...props}><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.8732.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/></svg>
  );
  if (lower.includes('twitch') || lower.includes('kick')) return (
    <svg {...props}><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>
  );
  // Default link icon
  return (
    <svg {...props} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
  );
}

// ─── Block Renderers ─────────────────────────────────────────────────────────

function BlockRenderer({ block, onOutboundClick, theme }: ThemedBlockProps) {
  const blockProps = { block, onOutboundClick, theme };

  switch (block.type) {
    case 'primary_cta':
      return <PrimaryCtaBlock {...blockProps} />;
    case 'social_links':
      return <SocialLinksBlock {...blockProps} />;
    case 'links':
      return <LinksBlock {...blockProps} />;
    case 'product_cards':
      return <ProductCardsBlock {...blockProps} />;
    case 'featured_media':
      return <FeaturedMediaBlock {...blockProps} />;
    case 'hero_card':
      return <HeroCardBlock block={block} theme={theme} />;
    case 'social_icon_row':
      return <SocialIconRowBlock {...blockProps} />;
    case 'email_subscribe':
      return <EmailSubscribeBlock block={block} theme={theme} />;
    case 'content_section':
      return <ContentSectionBlock {...blockProps} />;
    case 'gallery':
      return <GalleryBlock block={block} theme={theme} onEdit={() => {}} />;
    case 'bio':
      return <BioBlock block={block} theme={theme} />;
    default:
      return null;
  }
}

function PrimaryCtaBlock({ block, theme }: ThemedBlockProps) {
  const { t } = useLanguage();
  const tc = (text: string | null | undefined) => translateContent(text, t);
  const item = block.items[0];
  if (!item) return null;

  let blockStyle: Partial<BlockStyleConfig> = {};
  try {
    const parsed = JSON.parse(block.title || '{}');
    if (parsed.style) {
      blockStyle = parsed.style;
    }
  } catch {
    // Not JSON, ignore
  }

  return (
    <div data-block-type="primary_cta">
      <div className="block">
        <LinkButton theme={theme} blockStyle={blockStyle}>
          <div className="relative">
            {item.is_adult && (
              <div className="absolute -top-2 -right-2">
                <ShieldAlert className="h-4 w-4 opacity-70" />
              </div>
            )}
            <p className="font-semibold text-lg">{tc(item.label)}</p>
            {item.subtitle && (
              <p className="text-sm opacity-80 mt-1">{tc(item.subtitle)}</p>
            )}
          </div>
        </LinkButton>
      </div>
    </div>
  );
}

function SocialLinksBlock({ block, theme }: ThemedBlockProps) {
  if (block.items.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center gap-3">
      {block.items.map((item) => (
        <span
          key={item.id}
          className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full transition-colors relative overflow-hidden"
          title={item.label}
        >
          {item.image_url ? (
            <ThumbnailImage src={item.image_url} alt={item.label} />
          ) : (
            <SocialSvgIcon label={item.label} size={26} />
          )}
          {item.is_adult && (
            <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 flex items-center justify-center">
              <span className="text-[8px] font-bold text-white">18</span>
            </div>
          )}
        </span>
      ))}
    </div>
  );
}

function LinksBlock({ block, theme }: ThemedBlockProps) {
  const { t } = useLanguage();
  const tc = (text: string | null | undefined) => translateContent(text, t);
  if (block.items.length === 0) return null;

  let blockStyle: Partial<BlockStyleConfig> = {};
  try {
    const parsed = JSON.parse(block.title || '{}');
    if (parsed.style) {
      blockStyle = parsed.style;
    }
  } catch {
    // Not JSON, ignore
  }

  return (
    <div className="space-y-3">
      {block.items.map((item) => (
        <div key={item.id} className="block">
          <LinkButton
            theme={theme}
            blockStyle={blockStyle}
            leftThumbnail={item.image_url || undefined}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{tc(item.label)}</p>
                  {item.is_adult && (
                    <span className="text-[10px] font-semibold bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded flex items-center gap-0.5 flex-shrink-0">
                      <ShieldAlert className="h-3 w-3" />
                      18+
                    </span>
                  )}
                  {item.badge && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ backgroundColor: `${theme.buttons.fill_color}20`, color: theme.buttons.fill_color }}
                    >
                      {tc(item.badge)}
                    </span>
                  )}
                </div>
                {item.subtitle && (
                  <p className="text-xs truncate mt-0.5 opacity-60">{tc(item.subtitle)}</p>
                )}
              </div>
            </div>
          </LinkButton>
        </div>
      ))}
    </div>
  );
}

function ProductCardsBlock({ block, theme }: ThemedBlockProps) {
  const { t } = useLanguage();
  const tc = (text: string | null | undefined) => translateContent(text, t);
  if (block.items.length === 0) return null;

  let layout: 'stacked' | 'split' = 'stacked';
  try {
    const parsed = JSON.parse(block.title || '{}');
    if (parsed.layout === 'split') layout = 'split';
  } catch {
    // Not JSON, ignore
  }

  const getButtonRadius = () => {
    switch (theme.buttons.shape) {
      case 'pill': return '9999px';
      case 'rounded': return '16px';
      case 'square': return '6px';
      default: return '16px';
    }
  };

  const formatPrice = (price: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(price);
  };

  const getDiscountPercent = (price: number, compareAt: number) => {
    return Math.round(((compareAt - price) / compareAt) * 100);
  };

  const renderStackedCard = (item: BlockItem) => (
    <div key={item.id} className="block group">
      <div
        className="overflow-hidden"
        style={{
          backgroundColor: `${theme.buttons.fill_color}08`,
          borderRadius: getButtonRadius(),
          border: `1px solid ${theme.buttons.fill_color}15`,
        }}
      >
        <div className="aspect-square flex items-center justify-center overflow-hidden relative" style={{ backgroundColor: `${theme.buttons.fill_color}05` }}>
          {item.image_url ? (
            <ThumbnailImage
              src={item.image_url}
              alt={item.label}
            />
          ) : (
            <ShoppingBag className="h-8 w-8 opacity-40" style={{ color: theme.typography.text_color }} />
          )}
          {item.is_adult && (
            <div className="absolute top-2 right-2 bg-red-500/90 text-white px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-0.5">
              <ShieldAlert className="h-3 w-3" />
              18+
            </div>
          )}
          {item.badge && (
            <span
              className="absolute top-2 left-2 text-[10px] font-bold px-2 py-1 rounded"
              style={{ backgroundColor: theme.buttons.fill_color, color: theme.buttons.text_color }}
            >
              {tc(item.badge)}
            </span>
          )}
          {item.compare_at_price && item.price && item.compare_at_price > item.price && (
            <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-1 rounded bg-red-500 text-white">
              -{getDiscountPercent(item.price, item.compare_at_price)}%
            </span>
          )}
        </div>
        <div className="p-3 space-y-2">
          <p className="font-semibold text-sm line-clamp-2" style={{ color: theme.typography.text_color }}>{tc(item.label)}</p>
          {item.price && (
            <div className="flex items-center gap-2">
              <span className="font-bold text-base" style={{ color: theme.buttons.fill_color }}>
                {formatPrice(item.price, item.currency || 'USD')}
              </span>
              {item.compare_at_price && item.compare_at_price > item.price && (
                <span className="text-xs line-through opacity-50" style={{ color: theme.typography.text_color }}>
                  {formatPrice(item.compare_at_price, item.currency || 'USD')}
                </span>
              )}
            </div>
          )}
          {!item.price && item.subtitle && (
            <p className="text-xs opacity-60" style={{ color: theme.typography.text_color }}>{tc(item.subtitle)}</p>
          )}
          {item.cta_label && (
            <div
              className="w-full text-center py-2 text-xs font-semibold"
              style={{
                backgroundColor: theme.buttons.fill_color,
                color: theme.buttons.text_color,
                borderRadius: theme.buttons.shape === 'pill' ? '9999px' : theme.buttons.shape === 'square' ? '6px' : '8px',
              }}
            >
              {item.cta_label}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderSplitCard = (item: BlockItem) => (
    <div key={item.id} className="block group">
      <div
        className="flex overflow-hidden"
        style={{
          backgroundColor: `${theme.buttons.fill_color}08`,
          borderRadius: getButtonRadius(),
          border: `1px solid ${theme.buttons.fill_color}15`,
        }}
      >
        <div className="w-28 h-28 flex-shrink-0 flex items-center justify-center overflow-hidden relative" style={{ backgroundColor: `${theme.buttons.fill_color}05` }}>
          {item.image_url ? (
            <ThumbnailImage src={item.image_url} alt={item.label} />
          ) : (
            <ShoppingBag className="h-6 w-6 opacity-40" style={{ color: theme.typography.text_color }} />
          )}
          {item.is_adult && (
            <div className="absolute top-1 right-1 bg-red-500/90 text-white px-1 py-0.5 rounded text-[8px] font-semibold flex items-center gap-0.5">
              <ShieldAlert className="h-2.5 w-2.5" />
              18+
            </div>
          )}
        </div>
        <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
          <div>
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-sm line-clamp-2" style={{ color: theme.typography.text_color }}>{tc(item.label)}</p>
              {item.badge && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ backgroundColor: `${theme.buttons.fill_color}20`, color: theme.buttons.fill_color }}
                >
                  {tc(item.badge)}
                </span>
              )}
            </div>
            {item.subtitle && (
              <p className="text-xs mt-1 opacity-60 line-clamp-1" style={{ color: theme.typography.text_color }}>{tc(item.subtitle)}</p>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 mt-2">
            {item.price ? (
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm" style={{ color: theme.buttons.fill_color }}>
                  {formatPrice(item.price, item.currency || 'USD')}
                </span>
                {item.compare_at_price && item.compare_at_price > item.price && (
                  <>
                    <span className="text-[10px] line-through opacity-50" style={{ color: theme.typography.text_color }}>
                      {formatPrice(item.compare_at_price, item.currency || 'USD')}
                    </span>
                    <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-500 text-white">
                      -{getDiscountPercent(item.price, item.compare_at_price)}%
                    </span>
                  </>
                )}
              </div>
            ) : (
              <div />
            )}
            {item.cta_label && (
              <span
                className="text-[10px] font-semibold px-3 py-1.5 flex-shrink-0"
                style={{
                  backgroundColor: theme.buttons.fill_color,
                  color: theme.buttons.text_color,
                  borderRadius: theme.buttons.shape === 'pill' ? '9999px' : theme.buttons.shape === 'square' ? '4px' : '6px',
                }}
              >
                {item.cta_label}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {layout === 'stacked' ? (
        <div className="grid grid-cols-2 gap-3">
          {block.items.map(renderStackedCard)}
        </div>
      ) : (
        <div className="space-y-3">
          {block.items.map(renderSplitCard)}
        </div>
      )}
    </div>
  );
}

function FeaturedMediaBlock({ block, theme }: ThemedBlockProps) {
  const { t } = useLanguage();
  const tc = (text: string | null | undefined) => translateContent(text, t);
  if (block.items.length === 0) return null;

  const getButtonRadius = () => {
    switch (theme.buttons.shape) {
      case 'pill': return '9999px';
      case 'rounded': return '16px';
      case 'square': return '6px';
      default: return '16px';
    }
  };

  return (
    <div className="space-y-3">
      {block.title && (() => {
        try { JSON.parse(block.title); return null; } catch { return null; }
      })()}
      <div className="space-y-3">
        {block.items.map((item) => (
          <div key={item.id} className="block group">
            <div
              className="relative overflow-hidden"
              style={{
                borderRadius: getButtonRadius(),
                border: `1px solid ${theme.buttons.fill_color}20`,
              }}
            >
              {item.image_url ? (
                <div className="aspect-video">
                  <ThumbnailImage
                    src={item.image_url}
                    alt={item.label}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  {item.is_adult && (
                    <div className="absolute top-2 right-2 bg-red-500/90 text-white px-2 py-1 rounded text-xs font-semibold flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" />
                      18+
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <p className="font-semibold text-white">{tc(item.label)}</p>
                  </div>
                </div>
              ) : (
                <div className="aspect-video flex items-center justify-center relative" style={{ backgroundColor: `${theme.buttons.fill_color}10` }}>
                  <ImageIcon className="h-10 w-10 opacity-40" style={{ color: theme.typography.text_color }} />
                  {item.is_adult && (
                    <div className="absolute top-2 right-2 bg-red-500/90 text-white px-2 py-1 rounded text-xs font-semibold flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" />
                      18+
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroCardBlock({ block, theme }: { block: BlockWithItems; theme: ThemeJson }) {
  const item = block.items[0];
  if (!item || !item.image_url) return null;

  let config = {
    card_radius: 'lg' as 'sm' | 'md' | 'lg',
    show_profile_avatar: true,
    text_alignment: 'center' as 'left' | 'center' | 'right',
    text_color: '#ffffff',
    overlay_opacity: 0.4,
  };

  if (item.badge) {
    try {
      const parsed = JSON.parse(item.badge);
      config = { ...config, ...parsed };
    } catch {
      // Use defaults
    }
  }

  const getRadius = () => {
    switch (config.card_radius) {
      case 'sm': return '12px';
      case 'md': return '20px';
      case 'lg': return '28px';
      default: return '20px';
    }
  };

  return (
    <div
      className="relative overflow-hidden w-full"
      style={{ borderRadius: getRadius() }}
    >
      <div className="aspect-[16/9] relative">
        <img
          src={item.image_url}
          alt={item.label || 'Hero'}
          className="w-full h-full object-cover"
          loading="eager"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent"
          style={{ opacity: config.overlay_opacity + 0.4 }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 p-5 sm:p-6"
          style={{ color: config.text_color, textAlign: config.text_alignment }}
        >
          {item.label && item.label !== 'Hero Card' && (
            <h2 className="text-xl sm:text-2xl font-bold drop-shadow-lg mb-1">
              {item.label}
            </h2>
          )}
          {item.subtitle && (
            <p className="text-sm sm:text-base opacity-90 drop-shadow">
              {item.subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SocialIconRowBlock({ block, theme }: ThemedBlockProps) {
  if (block.items.length === 0) return null;

  let config = {
    icon_size: 'md' as 'sm' | 'md' | 'lg',
    spacing: 'normal' as 'tight' | 'normal' | 'loose',
    use_theme_color: true,
    custom_color: '#ffffff',
  };

  if (block.title) {
    try {
      const parsed = JSON.parse(block.title);
      config = { ...config, ...parsed };
    } catch {
      // Use defaults
    }
  }

  const getIconSize = () => {
    switch (config.icon_size) {
      case 'sm': return 18;
      case 'md': return 22;
      case 'lg': return 26;
    }
  };

  const getSize = () => {
    switch (config.icon_size) {
      case 'sm': return 'h-11 w-11';
      case 'md': return 'h-12 w-12';
      case 'lg': return 'h-14 w-14';
    }
  };

  const getGap = () => {
    switch (config.spacing) {
      case 'tight': return 'gap-2';
      case 'normal': return 'gap-3';
      case 'loose': return 'gap-4';
    }
  };

  const sizeClass = getSize();
  const bgColor = config.use_theme_color
    ? `${theme.buttons.fill_color}20`
    : `${config.custom_color}20`;

  return (
    <div className={`flex flex-wrap justify-center ${getGap()}`}>
      {block.items.map((item) => (
        <span
          key={item.id}
          className={`${sizeClass} rounded-full flex items-center justify-center`}
          style={{ backgroundColor: bgColor }}
          title={item.label}
        >
          {item.image_url ? (
            <ThumbnailImage src={item.image_url} alt={item.label} />
          ) : (
            <SocialSvgIcon label={item.label} size={getIconSize()} />
          )}
        </span>
      ))}
    </div>
  );
}

function EmailSubscribeBlock({ block, theme }: { block: BlockWithItems; theme: ThemeJson }) {
  const { t } = useLanguage();
  const item = block.items[0];
  if (!item) return null;

  let config = {
    title: t('emailSubscribe.defaultTitle'),
    placeholder: t('emailSubscribe.defaultPlaceholder'),
    button_label: t('emailSubscribe.defaultButton'),
    success_message: t('emailSubscribe.defaultSuccess'),
    redirect_url: '',
    collect_name: false,
    name_placeholder: t('emailSubscribe.defaultName'),
  };

  if (item.badge) {
    try {
      const parsed = JSON.parse(item.badge);
      config = { ...config, ...parsed };
    } catch {
      // Use defaults
    }
  }

  const getButtonRadius = () => {
    switch (theme.buttons.shape) {
      case 'pill': return '9999px';
      case 'rounded': return '12px';
      case 'square': return '4px';
      default: return '12px';
    }
  };

  return (
    <div className="space-y-3">
      {config.title && (
        <p
          className="text-sm font-medium text-center"
          style={{ color: theme.typography.text_color }}
        >
          {config.title}
        </p>
      )}
      <div className="space-y-2">
        {config.collect_name && (
          <input
            type="text"
            placeholder={config.name_placeholder}
            disabled
            className="w-full h-11 px-4 rounded-lg bg-white/10 border border-white/20 text-inherit placeholder:opacity-50 focus:outline-none"
            style={{
              color: theme.typography.text_color,
              borderRadius: getButtonRadius(),
            }}
          />
        )}
        <div className="flex gap-2">
          <input
            type="email"
            placeholder={config.placeholder}
            disabled
            className="flex-1 h-11 px-4 rounded-lg bg-white/10 border border-white/20 text-inherit placeholder:opacity-50 focus:outline-none min-w-0"
            style={{
              color: theme.typography.text_color,
              borderRadius: getButtonRadius(),
            }}
          />
          <button
            type="button"
            disabled
            className="h-11 px-5 font-medium flex items-center gap-2 flex-shrink-0"
            style={{
              backgroundColor: theme.buttons.fill_color,
              color: theme.buttons.text_color,
              borderRadius: getButtonRadius(),
            }}
          >
            {config.button_label}
          </button>
        </div>
      </div>
    </div>
  );
}

function ContentSectionBlock({ block, theme }: ThemedBlockProps) {
  const { t } = useLanguage();
  const tc = (text: string | null | undefined) => translateContent(text, t);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  if (block.items.length === 0) return null;

  let config = {
    section_title: '',
    view_all_url: '',
    view_all_label: 'View all',
    layout: 'carousel' as 'list' | 'grid' | 'carousel',
  };

  if (block.title) {
    try {
      const parsed = JSON.parse(block.title);
      config = { ...config, ...parsed };
    } catch {
      config.section_title = block.title;
    }
  }

  const getRadius = () => {
    switch (theme.buttons.shape) {
      case 'pill': return '24px';
      case 'rounded': return '16px';
      case 'square': return '8px';
      default: return '16px';
    }
  };

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const scrollLeft = container.scrollLeft;
      const itemWidth = container.firstElementChild?.clientWidth || 200;
      const gap = 12;
      const newIndex = Math.round(scrollLeft / (itemWidth + gap));
      setActiveIndex(Math.min(newIndex, block.items.length - 1));
    }
  };

  const scrollToIndex = (index: number) => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const itemWidth = container.firstElementChild?.clientWidth || 200;
      const gap = 12;
      container.scrollTo({
        left: index * (itemWidth + gap),
        behavior: 'smooth',
      });
    }
  };

  const renderItem = (item: BlockItem, isCarousel = false) => (
    <div
      key={item.id}
      className={cn(
        'block group',
        isCarousel && 'flex-shrink-0 w-[200px] snap-start'
      )}
    >
      <div
        className="overflow-hidden"
        style={{ borderRadius: getRadius() }}
      >
        <div
          className="aspect-[4/3] relative overflow-hidden"
          style={{ backgroundColor: `${theme.buttons.fill_color}10` }}
        >
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.label}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="h-8 w-8 opacity-30" style={{ color: theme.typography.text_color }} />
            </div>
          )}
        </div>
        <div
          className="p-3"
          style={{ backgroundColor: `${theme.buttons.fill_color}08` }}
        >
          <p
            className="font-medium text-sm line-clamp-2"
            style={{ color: theme.typography.text_color }}
          >
            {tc(item.label)}
          </p>
          {item.subtitle && (
            <p
              className="text-xs mt-1 opacity-60"
              style={{ color: theme.typography.text_color }}
            >
              {tc(item.subtitle)}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: `${theme.buttons.fill_color}08`,
        borderRadius: getRadius(),
      }}
    >
      {(config.section_title || config.view_all_url) && (
        <div className="flex items-center justify-between px-4 py-3">
          {config.section_title && (
            <h3
              className="font-semibold"
              style={{ color: theme.typography.text_color }}
            >
              {config.section_title}
            </h3>
          )}
          {config.view_all_url && (
            <span
              className="text-sm font-medium opacity-70"
              style={{ color: theme.buttons.fill_color }}
            >
              {config.view_all_label} &rarr;
            </span>
          )}
        </div>
      )}

      <div className="px-4 pb-4">
        {config.layout === 'carousel' && (
          <>
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-3"
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              {block.items.map((item) => renderItem(item, true))}
            </div>
            {block.items.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-2">
                {block.items.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => scrollToIndex(index)}
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-200',
                      index === activeIndex ? 'w-4' : 'w-1.5 opacity-40'
                    )}
                    style={{
                      backgroundColor: index === activeIndex
                        ? theme.buttons.fill_color
                        : theme.typography.text_color,
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {config.layout === 'grid' && (
          <div className="grid grid-cols-2 gap-3">
            {block.items.map((item) => renderItem(item))}
          </div>
        )}

        {config.layout === 'list' && (
          <div className="space-y-3">
            {block.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 group">
                <div
                  className="w-16 h-12 rounded-lg overflow-hidden flex-shrink-0"
                  style={{ backgroundColor: `${theme.buttons.fill_color}10` }}
                >
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.label}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 opacity-30" style={{ color: theme.typography.text_color }} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className="font-medium text-sm truncate"
                    style={{ color: theme.typography.text_color }}
                  >
                    {item.label}
                  </p>
                  {item.subtitle && (
                    <p
                      className="text-xs opacity-60 truncate"
                      style={{ color: theme.typography.text_color }}
                    >
                      {item.subtitle}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BioBlock({ block, theme }: Omit<ThemedBlockProps, 'onOutboundClick'>) {
  const bioText = block.items[0]?.label || '';
  if (!bioText) return null;

  return (
    <div className="px-1">
      <p
        className="text-sm leading-relaxed whitespace-pre-wrap"
        style={{ color: theme.typography.text_color, opacity: 0.85 }}
      >
        {bioText}
      </p>
    </div>
  );
}

function GalleryBlock({ block, theme, onEdit }: Omit<ThemedBlockProps, 'onOutboundClick'> & { onEdit?: () => void }) {
  const { t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = block.items.length;

  const scroll = (dir: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({
      left: dir === 'right' ? scrollRef.current.clientWidth : -scrollRef.current.clientWidth,
      behavior: 'smooth',
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold" style={{ color: theme.typography.text_color }}>
        {t('gallery.label')} ({count} {count === 1 ? t('gallery.photo') : t('gallery.photos')})
      </p>

      <div className="relative">
        {count > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); scroll('left'); }}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors -ml-2"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        <div
          ref={scrollRef}
          className="flex overflow-x-auto snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {block.items.map((item) => (
            <div
              key={item.id}
              className="flex-shrink-0 w-full rounded-xl overflow-hidden snap-start"
              style={{ minWidth: '100%', aspectRatio: '1/1', backgroundColor: `${theme.buttons.fill_color}10` }}
            >
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.label || 'Gallery photo'}
                  className="w-full h-full object-contain"
                  style={{ backgroundColor: '#000000' }}
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 opacity-30" style={{ color: theme.typography.text_color }} />
                </div>
              )}
            </div>
          ))}

          <button
            onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
            className="flex-shrink-0 rounded-xl flex items-center justify-center snap-start transition-colors"
            style={{
              minWidth: '100%',
              aspectRatio: '1/1',
              backgroundColor: `${theme.buttons.fill_color}08`,
              border: `2px dashed ${theme.buttons.fill_color}30`,
            }}
          >
            <span className="text-4xl font-light opacity-30" style={{ color: theme.typography.text_color }}>+</span>
          </button>
        </div>

        {count > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); scroll('right'); }}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors -mr-2"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ textColor }: { textColor: string }) {
  const { t } = useLanguage();
  return (
    <div className="text-center py-12">
      <div className="rounded-full bg-white/10 p-4 w-fit mx-auto mb-4">
        <LinkIcon className="h-8 w-8" style={{ color: textColor, opacity: 0.6 }} />
      </div>
      <p style={{ color: textColor, opacity: 0.6 }}>{t('emptyState.noContent')}</p>
    </div>
  );
}

// ─── Preview Block Card (edit mode) ─────────────────────────────────────────

function SortablePreviewCard({
  block,
  onEdit,
  onToggle,
  onGalleryAdd,
  isDragActive,
  theme,
}: {
  block: BlockWithItems;
  onEdit: () => void;
  onToggle: (enabled: boolean) => void;
  onGalleryAdd: (blockId: string) => void;
  isDragActive: boolean;
  theme: ThemeJson;
}) {
  const { t } = useLanguage();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'mx-4 mb-4 rounded-2xl overflow-hidden border border-white/10',
        'bg-white/[0.03] transition-all duration-200 ease-out',
        isDragging && 'shadow-2xl ring-1 ring-[#C9A55C]/60 scale-[1.01] z-50',
        isDragActive && !isDragging && 'opacity-50',
        !block.is_enabled && 'opacity-40',
      )}
    >
      {/* Control bar */}
      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white/10 bg-white/5">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-white/30 hover:text-white/60 touch-none"
        >
          <GripVertical className="h-5 w-5" />
        </button>
        <span className="flex-1 text-xs font-semibold text-white/60 uppercase tracking-wider">
          {t(`blocks.${block.type}.title`) || block.type}
        </span>
        {/* Toggle */}
        <button
          onClick={() => onToggle(!block.is_enabled)}
          className={cn(
            'w-11 h-6 rounded-full flex-shrink-0 p-[2px] transition-colors',
            block.is_enabled ? 'bg-[#C9A55C]' : 'bg-white/20'
          )}
        >
          <div
            className={cn(
              'h-5 w-5 rounded-full bg-white shadow-md transition-transform',
              block.is_enabled ? 'translate-x-[20px]' : 'translate-x-0'
            )}
          />
        </button>
        <button onClick={onEdit} className="text-white/30 hover:text-white/80">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Full-size block content preview — smooth collapse during drag */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200 ease-out cursor-pointer',
          isDragActive ? 'max-h-0' : 'max-h-[2000px]'
        )}
        onClick={!isDragActive ? onEdit : undefined}
      >
        <div className="p-4">
          {block.type === 'gallery' ? (
            <GalleryBlock block={block} theme={theme} onEdit={() => onGalleryAdd(block.id)} />
          ) : block.items.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-xs text-white/30">{t(`blocks.${block.type}.subtitle`)}</p>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="mt-3 text-xs font-semibold text-[#C9A55C] border border-[#C9A55C]/40 rounded-full px-4 py-1.5 hover:bg-[#C9A55C]/10 transition-colors"
              >
                + {t('editor.addContent')}
              </button>
            </div>
          ) : (
            <BlockRenderer block={block} onOutboundClick={() => false} theme={theme} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function EditableProfileView({
  page,
  blocks,
  editMode,
  onBlockEdit,
  onBlockToggle,
  onBlockReorder,
  onRefresh,
  selectedMode,
  onModeChange,
  onAddContent,
}: EditableProfileViewProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const galleryFileInputRef = useRef<HTMLInputElement>(null);
  const [activeGalleryBlockId, setActiveGalleryBlockId] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [localHeroImage, setLocalHeroImage] = useState<string | null>(null);
  const [photoStep, setPhotoStep] = useState<'idle' | 'choose' | 'manual' | 'ai' | 'preview'>('idle');
  const [photoOffset, setPhotoOffset] = useState({ x: 50, y: 30 });
  const [photoScale, setPhotoScale] = useState(1);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropAspect, setCropAspect] = useState<'preferred'|'free'|'square'|'16:9'|'4:3'|'3:2'>('preferred');
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const cropImgRef = useRef<HTMLImageElement>(null);
  const cropFrameRef = useRef<HTMLDivElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const [cropFrameSize, setCropFrameSize] = useState({ w: 280, h: 280 });
  const [isResizingCrop, setIsResizingCrop] = useState(false);
  const [resizeCorner, setResizeCorner] = useState<'tl'|'tr'|'bl'|'br'|null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0 });

  // Drag handle state for name/handle and icons vertical repositioning
  const [nameHandleDragY, setNameHandleDragY] = useState(0);
  const [iconsDragY, setIconsDragY] = useState(0);
  const [isDraggingNameHandle, setIsDraggingNameHandle] = useState(false);
  const [isDraggingIcons, setIsDraggingIcons] = useState(false);
  const [nameDragStart, setNameDragStart] = useState(0);
  const [iconsDragStart, setIconsDragStart] = useState(0);

  const handleGalleryFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !activeGalleryBlockId || !user) return;

    const filesToAdd = Array.from(files).slice(0, 20);

    for (const file of filesToAdd) {
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${crypto.randomUUID()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('products')
          .upload(fileName, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('products')
          .getPublicUrl(fileName);

        await supabase.from('block_items').insert({
          block_id: activeGalleryBlockId,
          label: 'Photo',
          url: '',
          image_url: urlData.publicUrl,
          order_index: 999,
        });
      } catch (err) {
        console.error('Upload error:', err);
        toast.error(t('gallery.uploadFailed'));
      }
    }

    onRefresh();
    if (galleryFileInputRef.current) galleryFileInputRef.current.value = '';
    setActiveGalleryBlockId(null);
  };

  const openGalleryPicker = (blockId: string) => {
    setActiveGalleryBlockId(blockId);
    setTimeout(() => galleryFileInputRef.current?.click(), 50);
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(reader.result as string);
      setPhotoFile(file);
      setPhotoStep('choose');
      setPhotoOffset({ x: 50, y: 30 });
      setPhotoScale(1);
      setCropZoom(1);
      setCropPosition({ x: 0, y: 0 });
      setCropAspect('preferred');
    };
    reader.readAsDataURL(file);
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const getCroppedCanvas = (): string => {
    const img = cropImgRef.current;
    const frame = cropFrameRef.current;
    if (!img || !frame || !photoPreview) return photoPreview || '';

    const frameRect = frame.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();

    const scaleX = img.naturalWidth / imgRect.width;
    const scaleY = img.naturalHeight / imgRect.height;

    const sx = (frameRect.left - imgRect.left) * scaleX;
    const sy = (frameRect.top - imgRect.top) * scaleY;
    const sw = frameRect.width * scaleX;
    const sh = frameRect.height * scaleY;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    const ctx = canvas.getContext('2d');
    if (!ctx) return photoPreview || '';

    ctx.drawImage(
      img,
      Math.max(0, Math.round(sx)), Math.max(0, Math.round(sy)),
      Math.round(Math.min(sw, img.naturalWidth - Math.max(0, sx))),
      Math.round(Math.min(sh, img.naturalHeight - Math.max(0, sy))),
      0, 0,
      canvas.width, canvas.height,
    );

    return canvas.toDataURL('image/jpeg', 0.95);
  };

  const handlePhotoSave = async () => {
    let fileToUpload = photoFile;
    if (!fileToUpload && photoPreview) {
      const res = await fetch(photoPreview);
      const blob = await res.blob();
      fileToUpload = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
    }
    if (!fileToUpload || !user) return;
    setPhotoSaving(true);
    try {
      const fileExt = fileToUpload.name.split('.').pop();
      const fileName = `${user.id}/${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, fileToUpload, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);
      await supabase
        .from('pages')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', page.id);
      toast.success('Profile photo updated!');
      setLocalHeroImage(urlData.publicUrl);
      setPhotoStep('idle');
      setPhotoPreview(null);
      setPhotoFile(null);
      setPhotoOffset({ x: 50, y: 30 });
      setPhotoScale(1);
      onRefresh();
    } catch (err) {
      console.error('Photo upload error:', err);
      toast.error('Failed to upload photo');
    } finally {
      setPhotoSaving(false);
    }
  };

  const handleAiCrop = async () => {
    if (!photoPreview) return;
    setAiProcessing(true);
    setPhotoStep('ai');
    try {
      const base64 = photoPreview.split(',')[1];
      const mediaType = photoPreview.split(';')[0].split(':')[1] || 'image/jpeg';
      const { data, error } = await supabase.functions.invoke('ai-crop', {
        body: { base64, mediaType },
      });
      if (error) throw error;
      const xPercent = Math.round((data.faceLeft ?? 0.5) * 100);
      const yPercent = Math.round((data.faceTop ?? 0.3) * 100);
      setPhotoOffset({ x: xPercent, y: yPercent });
      setPhotoScale(1.2);
      setPhotoStep('preview');
    } catch (err) {
      console.error('AI crop error:', err);
      toast.error(t('editor.aiCropFailed'));
      setPhotoStep('manual');
    } finally {
      setAiProcessing(false);
    }
  };

  const resetPhoto = () => {
    setPhotoPreview(null);
    setPhotoFile(null);
    setPhotoStep('idle');
    setPhotoOffset({ x: 50, y: 30 });
    setPhotoScale(1);
  };

  // Get theme
  const rawTheme = getThemeWithDefaults(page.theme_json);
  const theme = rawTheme.auto_contrast ? applyAutoContrast(rawTheme) : rawTheme;
  const fontFamily = getFontFamily(theme);

  // Header config
  const headerConfig = (page.theme_json as any)?.headerConfig || {
    nameSize: 28,
    handleSize: 14,
    nameColor: '#ffffff',
    handleColor: '#ffffff99',
    nameOffset: 0,
    iconsOffset: 0,
  };

  // Initialize drag offsets from headerConfig
  useEffect(() => {
    setNameHandleDragY(headerConfig.nameOffset || 0);
    setIconsDragY(headerConfig.iconsOffset || 0);
  }, [page.theme_json]);

  const saveDragPosition = async (nameOffset: number, iconsOffset: number) => {
    const existingTheme = (page.theme_json as any) || {};
    await supabase
      .from('pages')
      .update({
        theme_json: {
          ...existingTheme,
          headerConfig: {
            ...(existingTheme.headerConfig || {}),
            nameOffset,
            iconsOffset,
          },
        },
      })
      .eq('id', page.id);
    onRefresh();
  };

  // Hero image
  const heroImage = localHeroImage || (theme.header?.image_url) || page.avatar_url || '';

  // Page labels from theme
  const themePages = (page.theme_json as any)?.pages;
  const page1Label = themePages?.page1?.label || 'Page 1';
  const page2Label = themePages?.page2?.label || 'Page 2';

  // No-op click handler for edit mode
  const noOpClick = () => false;

  // Drag state
  const [isDragActive, setIsDragActive] = useState(false);

  // Drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8, delay: 100, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = () => {
    setIsDragActive(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setIsDragActive(false);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      const newOrder = arrayMove(blocks, oldIndex, newIndex);
      onBlockReorder(newOrder.map((b) => b.id));
    }
  };

  // Filter blocks for display (cinematic hides social in header)
  const displayBlocks = blocks.filter(
    (b) => b.type !== 'social_links' && b.type !== 'social_icon_row'
  );
  const socialBlocks = blocks.filter(
    (b) => b.type === 'social_links' || b.type === 'social_icon_row'
  );

  return (
    <div
      className="relative max-w-[640px] mx-auto"
      style={{ fontFamily, color: theme.typography.text_color }}
    >
      {/* Fixed hero image */}
      <div className="relative w-full" style={{ height: '50vh', overflow: 'hidden' }}>
        {heroImage ? (
          <SmoothImage
            src={heroImage}
            alt={page.display_name || page.handle}
            className="object-cover object-top brightness-110"
            containerClassName="h-full w-full"
            skeletonClassName="bg-neutral-900"
          />
        ) : (
          <div className="h-full w-full bg-[#0e0c09]" />
        )}
      </div>

      {/* Content panel */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          backgroundColor: '#000000',
          minHeight: '60vh',
          paddingTop: '1rem',
        }}
      >
        {/* Gradient fade */}
        <div
          style={{
            position: 'absolute',
            top: '-150px',
            left: 0,
            right: 0,
            height: '150px',
            background: 'linear-gradient(to bottom, transparent 0%, #000000 100%)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />

        {/* Name, handle, social icons */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            textAlign: 'center',
            paddingLeft: '1.5rem',
            paddingRight: '1.5rem',
            marginTop: `calc(-6rem + ${editMode ? nameHandleDragY : headerConfig.nameOffset}px)`,
            paddingBottom: '1rem',
          }}
        >
          {editMode && (
            <div
              className="absolute left-2 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing text-white/40 hover:text-white/80 touch-none select-none z-10"
              onPointerDown={(e) => {
                setIsDraggingNameHandle(true);
                setNameDragStart(e.clientY - nameHandleDragY);
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!isDraggingNameHandle) return;
                const newY = e.clientY - nameDragStart;
                setNameHandleDragY(Math.max(-150, Math.min(150, newY)));
              }}
              onPointerUp={() => {
                setIsDraggingNameHandle(false);
                saveDragPosition(nameHandleDragY, iconsDragY);
              }}
            >
              <GripVertical className="h-6 w-6" />
            </div>
          )}
          <h1
            className="font-bold mb-0"
            style={{
              fontSize: `${headerConfig.nameSize}px`,
              color: headerConfig.nameColor,
              textShadow: '0 2px 20px rgba(0,0,0,0.8)',
            }}
          >
            {page.display_name || `@${page.handle}`}
          </h1>
          <p
            className="mt-0"
            style={{
              fontSize: `${headerConfig.handleSize}px`,
              color: headerConfig.handleColor,
              textShadow: '0 1px 4px rgba(0,0,0,0.4)',
            }}
          >
            @{page.handle}
          </p>
          {editMode && (
            <>
              <button
                onClick={() => photoInputRef.current?.click()}
                className="text-xs text-[#C9A55C] mt-0.5 underline underline-offset-2 opacity-80 hover:opacity-100"
              >
                {t('editor.changePhoto')}
              </button>
              {photoPreview && photoStep !== 'idle' && (
                <div className="fixed inset-0 z-[100] flex flex-col bg-black/95">

                  {/* CHOOSE STEP */}
                  {photoStep === 'choose' && (
                    <div className="flex flex-col items-center justify-center flex-1 p-6 gap-6">
                      <p className="text-white font-bold text-xl">
                        {t('editor.editPhoto')}
                      </p>
                      <div className="w-48 h-48 rounded-2xl overflow-hidden border-2 border-white/20">
                        <img src={photoPreview} alt="Selected" className="w-full h-full object-cover object-top" />
                      </div>
                      <p className="text-white/60 text-sm text-center">
                        {t('editor.chooseEditMethod')}
                      </p>
                      <div className="flex flex-col gap-3 w-full max-w-xs">
                        <button
                          onClick={() => setPhotoStep('manual')}
                          className="w-full py-4 rounded-2xl bg-white/10 border border-white/20 text-white font-semibold flex items-center justify-center gap-2"
                        >
                          {t('editor.cropImage')}
                        </button>
                        <button
                          onClick={handleAiCrop}
                          className="w-full py-4 rounded-2xl bg-[#C9A55C] text-[#0e0c09] font-bold flex items-center justify-center gap-2"
                        >
                          {t('editor.useAiCrop')}
                        </button>
                        <button
                          onClick={handlePhotoSave}
                          disabled={photoSaving}
                          className="w-full py-4 rounded-2xl bg-white/10 border border-white/20 text-white/70 font-medium flex items-center justify-center gap-2 text-sm"
                        >
                          {t('editor.useOriginal')}
                        </button>
                      </div>
                      <button onClick={resetPhoto} className="text-white/40 text-sm">
                        {t('editor.cancel')}
                      </button>
                    </div>
                  )}

                  {/* AI PROCESSING STEP */}
                  {photoStep === 'ai' && (
                    <div className="flex flex-col items-center justify-center flex-1 gap-4">
                      <div className="w-12 h-12 border-2 border-[#C9A55C] border-t-transparent rounded-full animate-spin" />
                      <p className="text-white font-semibold">{t('editor.aiAnalyzing')}</p>
                    </div>
                  )}

                  {/* MANUAL CROP STEP */}
                  {photoStep === 'manual' && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column', backgroundColor: '#0e0c09' }}>

                      {/* Header */}
                      <div className="flex items-center justify-between px-4 border-b border-white/10" style={{ height: '56px', flexShrink: 0 }}>
                        <div className="w-10" />
                        <p className="text-white font-semibold text-base">{t('editor.cropImage')}</p>
                        <button
                          onClick={() => setPhotoStep('choose')}
                          className="w-10 h-10 flex items-center justify-center text-white/60 hover:text-white"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Aspect ratio pills */}
                      <div className="grid grid-cols-6 gap-1.5 px-3" style={{ height: '48px', flexShrink: 0, alignItems: 'center' }}>
                        {(['preferred','free','square','16:9','4:3','3:2'] as const).map((asp) => (
                          <button
                            key={asp}
                            onClick={() => {
                              setCropAspect(asp);
                              setCropPosition({ x: 0, y: 0 });
                              if (asp === 'free') setCropFrameSize({ w: 280, h: 280 });
                            }}
                            className={`py-1.5 rounded-full text-[11px] font-semibold transition-colors text-center truncate px-1 ${
                              cropAspect === asp
                                ? 'bg-[#C9A55C] text-[#0e0c09]'
                                : 'bg-white/10 text-white border border-white/20'
                            }`}
                          >
                            {asp === 'preferred' ? 'Preferred' :
                             asp === 'free' ? 'Free' :
                             asp === 'square' ? 'Square' : asp}
                          </button>
                        ))}
                      </div>

                      {/* Zoom slider */}
                      <div className="flex items-center gap-3 px-4" style={{ height: '44px', flexShrink: 0 }}>
                        <span className="text-white/50 text-xs font-medium flex-shrink-0">Zoom:</span>
                        <input
                          type="range"
                          min={0.5}
                          max={3}
                          step={0.01}
                          value={cropZoom}
                          onChange={(e) => setCropZoom(Number(e.target.value))}
                          className="flex-1 accent-[#C9A55C] h-1.5"
                        />
                        <span className="text-white/70 text-xs font-mono w-10 text-right flex-shrink-0">
                          {cropZoom.toFixed(1)}x
                        </span>
                      </div>

                      {/* Crop area */}
                      <div
                        ref={cropContainerRef}
                        className="flex items-center justify-center"
                        style={{ flexGrow: 1, flexShrink: 1, minHeight: 0, overflow: 'hidden', position: 'relative', backgroundColor: '#000', touchAction: 'none' }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          if (isResizingCrop) return;
                          setIsDraggingCrop(true);
                          setDragStart({ x: e.clientX - cropPosition.x, y: e.clientY - cropPosition.y });
                          e.currentTarget.setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                          e.preventDefault();
                          if (isResizingCrop && resizeCorner) {
                            const dx = e.clientX - resizeStart.x;
                            const dy = e.clientY - resizeStart.y;
                            const minSize = 80;
                            let newW = resizeStart.w;
                            let newH = resizeStart.h;
                            if (resizeCorner === 'tr' || resizeCorner === 'br') newW = Math.max(minSize, resizeStart.w + dx);
                            if (resizeCorner === 'tl' || resizeCorner === 'bl') newW = Math.max(minSize, resizeStart.w - dx);
                            if (resizeCorner === 'bl' || resizeCorner === 'br') newH = Math.max(minSize, resizeStart.h + dy);
                            if (resizeCorner === 'tl' || resizeCorner === 'tr') newH = Math.max(minSize, resizeStart.h - dy);
                            setCropFrameSize({ w: newW, h: newH });
                            return;
                          }
                          if (!isDraggingCrop) return;
                          setCropPosition({
                            x: e.clientX - dragStart.x,
                            y: e.clientY - dragStart.y,
                          });
                        }}
                        onPointerUp={(e) => {
                          e.preventDefault();
                          setIsDraggingCrop(false);
                          setIsResizingCrop(false);
                          setResizeCorner(null);
                        }}
                      >
                        {/* Panning + zooming image */}
                        {photoPreview && (
                          <img
                            ref={cropImgRef}
                            src={photoPreview}
                            alt="Crop"
                            draggable={false}
                            className="absolute max-w-none select-none pointer-events-none"
                            style={{
                              transform: `translate(${cropPosition.x}px, ${cropPosition.y}px) scale(${cropZoom})`,
                              transformOrigin: 'center center',
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain',
                              userSelect: 'none',
                              WebkitUserSelect: 'none',
                            }}
                          />
                        )}

                        {/* Crop frame */}
                        {(() => {
                          const isFree = cropAspect === 'free';
                          let fw: number;
                          let fh: number;

                          if (isFree) {
                            fw = cropFrameSize.w;
                            fh = cropFrameSize.h;
                          } else {
                            const containerW = cropContainerRef.current?.clientWidth || 300;
                            const containerH = cropContainerRef.current?.clientHeight || 400;
                            const padding = 32;
                            const availW = containerW - padding * 2;
                            const availH = containerH - padding * 2;

                            const aspectMap: Record<string, number> = {
                              preferred: 3 / 4,
                              square: 1,
                              '16:9': 16 / 9,
                              '4:3': 4 / 3,
                              '3:2': 3 / 2,
                            };
                            const ratio = aspectMap[cropAspect] ?? 3 / 4;

                            if (ratio >= 1) {
                              fw = availW;
                              fh = fw / ratio;
                              if (fh > availH) { fh = availH; fw = fh * ratio; }
                            } else {
                              fh = availH;
                              fw = fh * ratio;
                              if (fw > availW) { fw = availW; fh = fw / ratio; }
                            }
                          }

                          const cornerKeys = ['tl', 'tr', 'bl', 'br'] as const;
                          const corners: Array<{ key: typeof cornerKeys[number]; style: React.CSSProperties }> = [
                            { key: 'tl', style: { top: 0, left: 0, transform: 'translate(-50%,-50%)', cursor: 'nwse-resize' } },
                            { key: 'tr', style: { top: 0, right: 0, transform: 'translate(50%,-50%)', cursor: 'nesw-resize' } },
                            { key: 'bl', style: { bottom: 0, left: 0, transform: 'translate(-50%,50%)', cursor: 'nesw-resize' } },
                            { key: 'br', style: { bottom: 0, right: 0, transform: 'translate(50%,50%)', cursor: 'nwse-resize' } },
                          ];
                          const midpoints: Array<{ style: React.CSSProperties }> = [
                            { style: { top: 0, left: '50%', transform: 'translate(-50%,-50%)' } },
                            { style: { bottom: 0, left: '50%', transform: 'translate(-50%,50%)' } },
                            { style: { top: '50%', left: 0, transform: 'translate(-50%,-50%)' } },
                            { style: { top: '50%', right: 0, transform: 'translate(50%,-50%)' } },
                          ];

                          return (
                            <div
                              ref={cropFrameRef}
                              className="absolute"
                              style={{
                                width: fw,
                                height: fh,
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                border: '2px solid #C9A55C',
                                boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
                                zIndex: 10,
                                pointerEvents: 'none',
                              }}
                            >
                              {/* Corner handles */}
                              {corners.map(({ key, style }) => (
                                <div
                                  key={key}
                                  className="absolute w-5 h-5 bg-white border-2 border-[#C9A55C] rounded-sm"
                                  style={{
                                    ...style,
                                    pointerEvents: isFree ? 'auto' : 'none',
                                    touchAction: 'none',
                                  }}
                                  onPointerDown={isFree ? (e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setIsResizingCrop(true);
                                    setResizeCorner(key);
                                    setResizeStart({ x: e.clientX, y: e.clientY, w: cropFrameSize.w, h: cropFrameSize.h });
                                    e.currentTarget.setPointerCapture(e.pointerId);
                                  } : undefined}
                                />
                              ))}
                              {/* Midpoint handles (decorative) */}
                              {midpoints.map(({ style }, i) => (
                                <div
                                  key={`mid-${i}`}
                                  className="absolute w-4 h-4 bg-white border-2 border-[#C9A55C] rounded-sm pointer-events-none"
                                  style={style}
                                />
                              ))}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Bottom buttons */}
                      <div className="flex gap-3 px-4 items-center border-t border-white/10" style={{ minHeight: '72px', flexShrink: 0, paddingBottom: '80px' }}>
                        <button
                          onClick={() => setPhotoStep('choose')}
                          className="flex-1 py-3 rounded-2xl border border-white/20 text-white font-semibold text-sm"
                        >
                          Back
                        </button>
                        <button
                          onClick={async () => {
                            const dataUrl = getCroppedCanvas();
                            setPhotoPreview(dataUrl);
                            setCropZoom(1);
                            setCropPosition({ x: 0, y: 0 });
                            const res = await fetch(dataUrl);
                            const blob = await res.blob();
                            const file = new File([blob], 'cropped.jpg', { type: 'image/jpeg' });
                            setPhotoFile(file);
                            await handlePhotoSave();
                          }}
                          className="flex-1 py-3 rounded-2xl bg-[#C9A55C] text-[#0e0c09] font-bold text-sm"
                        >
                          Apply Crop
                        </button>
                      </div>

                    </div>
                  )}

                  {/* PREVIEW STEP */}
                  {photoStep === 'preview' && (
                    <div className="flex flex-col items-center justify-center flex-1 p-6 gap-6">
                      <p className="text-white font-semibold text-lg">
                        {t('editor.previewPhoto')}
                      </p>
                      <div className="w-full rounded-2xl overflow-hidden border-2 border-[#C9A55C]/50 aspect-video">
                        <img
                          src={photoPreview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                          style={{
                            objectPosition: `${photoOffset.x}% ${photoOffset.y}%`,
                            transform: `scale(${photoScale})`,
                            transformOrigin: 'center',
                          }}
                        />
                      </div>
                      <div className="flex gap-3 w-full max-w-xs">
                        <button
                          onClick={() => setPhotoStep('choose')}
                          className="flex-1 py-3 rounded-2xl border border-white/20 text-white font-semibold"
                          disabled={photoSaving}
                        >
                          {t('editor.cancel')}
                        </button>
                        <button
                          onClick={handlePhotoSave}
                          disabled={photoSaving}
                          className="flex-1 py-3 rounded-2xl bg-[#C9A55C] text-[#0e0c09] font-semibold"
                        >
                          {photoSaving ? '...' : t('editor.savePhoto')}
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </>
          )}
          {page.bio && (
            <p className="text-sm mt-2 max-w-xs mx-auto text-white/80" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
              {page.bio}
            </p>
          )}

          {/* Social icons in header — deduplicated by label */}
          {socialBlocks.length > 0 && (() => {
            const allSocialItems = socialBlocks.flatMap(b => b.items);
            const seenLabels = new Set<string>();
            const dedupedSocialItems = allSocialItems.filter(item => {
              const key = item.label.toLowerCase();
              if (seenLabels.has(key)) return false;
              seenLabels.add(key);
              return true;
            });
            return (
              <>
                {editMode && (
                  <div className="flex items-center justify-center mt-1 mb-1">
                    <div
                      className="cursor-grab active:cursor-grabbing text-white/40 hover:text-white/80 touch-none select-none"
                      onPointerDown={(e) => {
                        setIsDraggingIcons(true);
                        setIconsDragStart(e.clientY - iconsDragY);
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={(e) => {
                        if (!isDraggingIcons) return;
                        const newY = e.clientY - iconsDragStart;
                        setIconsDragY(Math.max(-100, Math.min(100, newY)));
                      }}
                      onPointerUp={() => {
                        setIsDraggingIcons(false);
                        saveDragPosition(nameHandleDragY, iconsDragY);
                      }}
                    >
                      <GripVertical className="h-5 w-5" />
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap justify-center gap-3" style={{ marginTop: `${8 + (editMode ? iconsDragY : headerConfig.iconsOffset)}px` }}>
                  {dedupedSocialItems.map((item) => (
                    <span
                      key={item.id}
                      className="flex items-center justify-center h-10 w-10 rounded-full"
                      style={{ background: '#ffffff20' }}
                      title={item.label}
                    >
                      <SocialSvgIcon label={item.label} size={18} color="#ffffff" />
                    </span>
                  ))}
                </div>
                {editMode && (
                  <button
                    onClick={() => {
                      const socialBlock = socialBlocks[0];
                      if (socialBlock) onBlockEdit(socialBlock.id);
                    }}
                    className="text-xs text-white/40 hover:text-white/70 mt-1 flex items-center gap-1 mx-auto"
                  >
                    <Share2 className="h-3 w-3" />
                    {t('editor.editSocial')}
                  </button>
                )}
              </>
            );
          })()}
        </div>

        {/* Page 1 / Page 2 tabs — only show when NOT in edit mode */}
        {!editMode && (
          <div className="flex justify-center gap-2 px-4 pb-4">
            <button
              onClick={() => onModeChange('shop')}
              className={cn(
                'px-4 py-1.5 rounded-full text-xs font-medium transition-colors',
                selectedMode === 'shop'
                  ? 'bg-[#C9A55C] text-[#0e0c09]'
                  : 'bg-white/10 text-white/60 hover:text-white'
              )}
            >
              {page1Label}
            </button>
            <button
              onClick={() => onModeChange('recruit')}
              className={cn(
                'px-4 py-1.5 rounded-full text-xs font-medium transition-colors',
                selectedMode === 'recruit'
                  ? 'bg-[#C9A55C] text-[#0e0c09]'
                  : 'bg-white/10 text-white/60 hover:text-white'
              )}
            >
              {page2Label}
            </button>
          </div>
        )}

        {/* Blocks */}
        {editMode ? (
          /* Preview block cards for edit mode */
          <div className="pb-32 pt-0">
            <div className="flex items-center justify-between px-4 pt-1 pb-2">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40">
                {t('editor.blocksLabel')}
              </p>
              {onAddContent && (
                <button
                  onClick={onAddContent}
                  className="text-xs font-bold px-4 py-1.5 rounded-full bg-[#C9A55C] text-[#0e0c09] active:scale-95 transition-transform"
                >
                  {t('editor.addContent')}
                </button>
              )}
            </div>
            {displayBlocks.length === 0 ? (
              <EmptyState textColor={theme.typography.text_color} />
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}>
                <SortableContext items={displayBlocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                  {displayBlocks.map((block) => (
                    <SortablePreviewCard
                      key={block.id}
                      block={block}
                      onEdit={() => onBlockEdit(block.id)}
                      onToggle={(enabled) => onBlockToggle(block.id, enabled)}
                      onGalleryAdd={openGalleryPicker}
                      isDragActive={isDragActive}
                      theme={theme}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        ) : (
          /* Full block content for view mode */
          <div className="px-4 space-y-6 pb-20">
            {displayBlocks.length === 0 ? (
              <EmptyState textColor={theme.typography.text_color} />
            ) : (
              displayBlocks.map((block, index) => (
                <motion.section
                  key={block.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <BlockRenderer block={block} onOutboundClick={noOpClick} theme={theme} />
                </motion.section>
              ))
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 pb-8 text-center">
          <p className="text-xs opacity-60" style={{ color: theme.typography.text_color }}>
            Powered by <span className="font-bold"><span style={{ color: '#F5F3EE' }}>Titi</span><span style={{ color: '#C9A55C', fontStyle: 'italic' }}>Links</span></span>
          </p>
        </footer>
      </div>

      {/* Hidden file input for gallery instant upload */}
      <input
        ref={galleryFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={handleGalleryFileSelect}
      />

      {/* Hidden file input for profile photo upload */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={handlePhotoSelect}
      />
    </div>
  );
}
