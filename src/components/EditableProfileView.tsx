import { useState, useRef, useEffect } from 'react';
import * as faceapi from '@vladmandic/face-api';
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
  Camera,
  Pencil,
  Trash2,
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
import type { ClickHandler } from '@/components/blocks/types';
import { PrimaryCtaBlock } from '@/components/blocks/PrimaryCtaBlock';
import { LinksBlock } from '@/components/blocks/LinksBlock';
import { SocialLinksBlock } from '@/components/blocks/SocialLinksBlock';
import { ProductCardsBlock } from '@/components/blocks/ProductCardsBlock';
import { FeaturedMediaBlock } from '@/components/blocks/FeaturedMediaBlock';
import { HeroCardBlock } from '@/components/blocks/HeroCardBlock';
import { SocialIconRowBlock } from '@/components/blocks/SocialIconRowBlock';
import { EmailSubscribeBlock } from '@/components/blocks/EmailSubscribeBlock';
import { ContentSectionBlock } from '@/components/blocks/ContentSectionBlock';

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
  onOutboundClick?: ClickHandler;
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

function BlockRenderer({ block, onOutboundClick, theme, pageId }: ThemedBlockProps & { pageId?: string }) {
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
      return <HeroCardBlock block={block} />;
    case 'social_icon_row':
      return <SocialIconRowBlock {...blockProps} />;
    case 'email_subscribe':
      return <EmailSubscribeBlock block={block} theme={theme} pageId={pageId} />;
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

function GalleryBlock({ block, theme, onEdit, onDelete }: Omit<ThemedBlockProps, 'onOutboundClick'> & { onEdit?: () => void; onDelete?: (itemId: string) => void }) {
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
              className="relative flex-shrink-0 w-full rounded-xl overflow-hidden snap-start"
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
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                  className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-red-400 hover:bg-black/80 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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

// ─── Name/Handle Sortable Card ──────────────────────────────────────────────

function NameHandleCard({
  page,
  expanded,
  onToggleExpand,
  localNameSize, setLocalNameSize,
  localHandleSize, setLocalHandleSize,
  localNameColor, setLocalNameColor,
  localHandleColor, setLocalHandleColor,
  localNamePadTop, setLocalNamePadTop,
  localNamePadBottom, setLocalNamePadBottom,
  localNameHandleGap, setLocalNameHandleGap,
  nameCardY, onNameCardYChange, onDragEnd,
  onSave,
}: {
  page: any;
  expanded: boolean;
  onToggleExpand: () => void;
  localNameSize: number; setLocalNameSize: (v: number) => void;
  localHandleSize: number; setLocalHandleSize: (v: number) => void;
  localNameColor: string; setLocalNameColor: (v: string) => void;
  localHandleColor: string; setLocalHandleColor: (v: string) => void;
  localNamePadTop: number; setLocalNamePadTop: (v: number) => void;
  localNamePadBottom: number; setLocalNamePadBottom: (v: number) => void;
  localNameHandleGap: number; setLocalNameHandleGap: (v: number) => void;
  nameCardY: number; onNameCardYChange: (v: number) => void; onDragEnd: () => void;
  onSave: () => void;
  onDisplayNameChange: (name: string) => void;
}) {
  const { t } = useLanguage();
  const dragStart = useRef({ y: 0, cardY: 0 });
  const [localDisplayName, setLocalDisplayName] = useState(page.display_name || '');

  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const debouncedSave = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(onSave, 500);
  };

  const nameSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const debouncedNameSave = (name: string) => {
    clearTimeout(nameSaveTimer.current);
    nameSaveTimer.current = setTimeout(() => onDisplayNameChange(name), 500);
  };

  return (
    <div
      style={{ transform: `translateY(${nameCardY}px)`, position: 'relative', zIndex: 20, borderLeft: '2px solid rgba(201,165,92,0.19)' }}
      className="mx-4 mb-2 relative"
    >
      {/* Grip handle — free drag */}
      <button
        className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing text-white/50 touch-none z-10"
        onPointerDown={(e) => {
          dragStart.current = { y: e.clientY, cardY: nameCardY };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
          onNameCardYChange(dragStart.current.cardY + (e.clientY - dragStart.current.y));
        }}
        onPointerUp={(e) => {
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
          onDragEnd();
        }}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Content — tap name to edit inline, tap handle area to expand settings */}
      <div
        className="relative"
        style={{ paddingTop: localNamePadTop, paddingBottom: localNamePadBottom, textAlign: 'center' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <input
            type="text"
            value={localDisplayName}
            onChange={(e) => {
              setLocalDisplayName(e.target.value);
              debouncedNameSave(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
                onDisplayNameChange(localDisplayName);
              }
            }}
            onBlur={() => onDisplayNameChange(localDisplayName)}
            placeholder={`@${page.handle}`}
            className="font-bold mb-0 bg-transparent border-0 outline-none text-center w-full"
            style={{
              fontSize: localNameSize,
              color: localNameColor,
              textShadow: '0 2px 20px rgba(0,0,0,0.8)',
              caretColor: '#C9A55C',
            }}
          />
          <p style={{ fontSize: localHandleSize, color: localHandleColor, textShadow: '0 1px 4px rgba(0,0,0,0.4)', margin: 0, marginTop: localNameHandleGap }}>
            @{page.handle}
          </p>
        </div>
        <button
          onClick={onToggleExpand}
          className="absolute right-2 top-1/2 -translate-y-1/2"
        >
          <ChevronRight className={cn(
            "h-4 w-4 text-white/30 transition-transform duration-200",
            expanded && "rotate-90"
          )} />
        </button>
      </div>

      {/* Compact settings row */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200 ease-out',
          expanded ? 'max-h-[120px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="px-6 pb-2 space-y-1.5">
          <div className="flex gap-3 items-center">
            <label className="text-[10px] text-white/40 w-12 flex-shrink-0">Name</label>
            <input type="range" min={16} max={48} step={1} value={localNameSize}
              onChange={(e) => { setLocalNameSize(Number(e.target.value)); debouncedSave(); }}
              className="flex-1 accent-[#C9A55C] h-1" />
            <input type="color" value={localNameColor}
              onChange={(e) => { setLocalNameColor(e.target.value); debouncedSave(); }}
              className="w-6 h-6 rounded cursor-pointer bg-transparent border border-white/20 flex-shrink-0" />
          </div>
          <div className="flex gap-3 items-center">
            <label className="text-[10px] text-white/40 w-12 flex-shrink-0">Handle</label>
            <input type="range" min={10} max={24} step={1} value={localHandleSize}
              onChange={(e) => { setLocalHandleSize(Number(e.target.value)); debouncedSave(); }}
              className="flex-1 accent-[#C9A55C] h-1" />
            <input type="color" value={localHandleColor.slice(0, 7)}
              onChange={(e) => { setLocalHandleColor(e.target.value); debouncedSave(); }}
              className="w-6 h-6 rounded cursor-pointer bg-transparent border border-white/20 flex-shrink-0" />
          </div>
          <div className="flex gap-3 items-center">
            <label className="text-[10px] text-white/40 w-12 flex-shrink-0">Gap</label>
            <input type="range" min={-10} max={20} step={1} value={localNameHandleGap}
              onChange={(e) => { setLocalNameHandleGap(Number(e.target.value)); debouncedSave(); }}
              className="flex-1 accent-[#C9A55C] h-1" />
          </div>
          <div className="flex gap-3 items-center">
            <label className="text-[10px] text-white/40 w-12 flex-shrink-0">Top</label>
            <input type="range" min={0} max={60} step={2} value={localNamePadTop}
              onChange={(e) => { setLocalNamePadTop(Number(e.target.value)); debouncedSave(); }}
              className="flex-1 accent-[#C9A55C] h-1" />
          </div>
          <div className="flex gap-3 items-center">
            <label className="text-[10px] text-white/40 w-12 flex-shrink-0">Bottom</label>
            <input type="range" min={0} max={60} step={2} value={localNamePadBottom}
              onChange={(e) => { setLocalNamePadBottom(Number(e.target.value)); debouncedSave(); }}
              className="flex-1 accent-[#C9A55C] h-1" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Social Icons Sortable Card ─────────────────────────────────────────────

function SocialIconsCard({
  socialItems,
  expanded,
  onToggleExpand,
  localIconsPaddingY, setLocalIconsPaddingY,
  localIconSize, setLocalIconSize,
  iconsCardY, onIconsCardYChange, onDragEnd,
  contentStartY, setContentStartY,
  onEditSocial,
  onSave,
}: {
  socialItems: any[];
  expanded: boolean;
  onToggleExpand: () => void;
  localIconsPaddingY: number; setLocalIconsPaddingY: (v: number) => void;
  localIconSize: 'small'|'medium'|'large'; setLocalIconSize: (v: 'small'|'medium'|'large') => void;
  iconsCardY: number; onIconsCardYChange: (v: number) => void; onDragEnd: () => void;
  contentStartY: number; setContentStartY: (v: number) => void;
  onEditSocial: () => void;
  onSave: () => void;
}) {
  const { t } = useLanguage();
  const dragStart = useRef({ y: 0, cardY: 0 });

  const iconSizeMap = { small: 14, medium: 18, large: 24 };
  const iconContainerMap = { small: 'h-8 w-8', medium: 'h-10 w-10', large: 'h-12 w-12' };

  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const debouncedSave = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(onSave, 500);
  };

  return (
    <div
      style={{ transform: `translateY(${iconsCardY}px)`, position: 'relative', zIndex: 20, borderLeft: '2px solid rgba(201,165,92,0.19)' }}
      className="mx-4 mb-2 relative"
    >
      {/* Grip handle — free drag */}
      <button
        className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing text-white/50 touch-none z-10"
        onPointerDown={(e) => {
          dragStart.current = { y: e.clientY, cardY: iconsCardY };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
          onIconsCardYChange(dragStart.current.cardY + (e.clientY - dragStart.current.y));
        }}
        onPointerUp={(e) => {
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
          onDragEnd();
        }}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Content — matches profile display */}
      <div
        className="cursor-pointer relative"
        style={{ paddingTop: localIconsPaddingY, paddingBottom: localIconsPaddingY }}
        onClick={onToggleExpand}
      >
        <div className="flex flex-wrap justify-center gap-3 px-4">
          {socialItems.map((item) => (
            <span
              key={item.id}
              className={cn('flex items-center justify-center rounded-full', iconContainerMap[localIconSize])}
              style={{ background: '#ffffff20' }}
              title={item.label}
            >
              <SocialSvgIcon label={item.label} size={iconSizeMap[localIconSize]} color="#ffffff" />
            </span>
          ))}
          {socialItems.length === 0 && (
            <p className="text-xs text-white/30">{t('editor.editSocial')}</p>
          )}
        </div>
        <ChevronRight className={cn(
          "absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 transition-transform duration-200",
          expanded && "rotate-90"
        )} />
      </div>

      {/* Compact settings row */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200 ease-out',
          expanded ? 'max-h-[160px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="px-6 pb-2 space-y-1.5">
          <div className="flex gap-3 items-center">
            <label className="text-[10px] text-white/40 w-12 flex-shrink-0">Pad</label>
            <input type="range" min={0} max={60} step={2} value={localIconsPaddingY}
              onChange={(e) => { setLocalIconsPaddingY(Number(e.target.value)); debouncedSave(); }}
              className="flex-1 accent-[#C9A55C] h-1" />
          </div>
          <div className="flex gap-3 items-center">
            <label className="text-[10px] text-white/40 w-12 flex-shrink-0">Size</label>
            <div className="flex gap-1 flex-1">
              {(['small', 'medium', 'large'] as const).map((sz) => (
                <button
                  key={sz}
                  onClick={() => { setLocalIconSize(sz); debouncedSave(); }}
                  className={cn(
                    'flex-1 py-1 rounded text-[10px] font-semibold transition-colors',
                    localIconSize === sz
                      ? 'bg-[#C9A55C] text-[#0e0c09]'
                      : 'bg-white/10 text-white/50'
                  )}
                >
                  {sz.charAt(0).toUpperCase() + sz.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <label className="text-[10px] text-white/40 w-12 flex-shrink-0">Gap</label>
            <input type="range" min={-100} max={200} step={4} value={contentStartY}
              onChange={(e) => { setContentStartY(Number(e.target.value)); debouncedSave(); }}
              className="flex-1 accent-[#C9A55C] h-1" />
          </div>
          <button
            onClick={onEditSocial}
            className="w-full text-[10px] text-white/40 hover:text-white/60 flex items-center gap-1 justify-center py-1"
          >
            <Share2 className="h-3 w-3" />
            {t('editor.editSocial')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Preview Block Card (edit mode) ─────────────────────────────────────────

function SortablePreviewCard({
  block,
  onEdit,
  onToggle,
  onGalleryAdd,
  onGalleryDelete,
  isDragActive,
  theme,
}: {
  block: BlockWithItems;
  onEdit: () => void;
  onToggle: (enabled: boolean) => void;
  onGalleryAdd: (blockId: string) => void;
  onGalleryDelete: (itemId: string) => void;
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
            <GalleryBlock block={block} theme={theme} onEdit={() => onGalleryAdd(block.id)} onDelete={onGalleryDelete} />
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
  onOutboundClick,
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
  const [localHeroImages, setLocalHeroImages] = useState<{ shop: string | null; recruit: string | null }>({ shop: null, recruit: null });
  const [photoStep, setPhotoStep] = useState<'idle' | 'choose' | 'manual' | 'ai' | 'ai-preview' | 'preview'>('idle');
  const [aiPreviewData, setAiPreviewData] = useState<string | null>(null); // holds AI-cropped+enhanced data URL
  const [aiPreviewEnhanced, setAiPreviewEnhanced] = useState(false); // true = AI ran, false = crop only fallback
  const [photoOffset, setPhotoOffset] = useState({ x: 50, y: 30 });
  const [photoScale, setPhotoScale] = useState(1);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 }); // image pan offset
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const cropImgRef = useRef<HTMLImageElement>(null);
  const cropFrameRef = useRef<HTMLDivElement>(null);
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const [, setCropImgLoaded] = useState(0); // triggers re-render on img load

  // Lock body + inner container scroll when photo overlay is open
  useEffect(() => {
    if (photoStep !== 'idle' && photoPreview) {
      document.body.style.overflow = 'hidden';
      // Also lock all scrollable containers inside the device frame
      const scrollables = document.querySelectorAll<HTMLElement>('.overflow-y-auto, .overflow-auto');
      scrollables.forEach(el => { el.style.overflow = 'hidden'; });
      return () => {
        document.body.style.overflow = '';
        scrollables.forEach(el => { el.style.overflow = ''; });
      };
    }
  }, [photoStep, photoPreview]);

  // Header config (must be before state that depends on it)
  const headerConfig = (page.theme_json as any)?.headerConfig || {
    nameSize: 28,
    handleSize: 14,
    nameColor: '#ffffff',
    handleColor: '#ffffff99',
    nameOffset: 0,
    iconsOffset: 0,
    namePadTop: 16,
    namePadBottom: 16,
    iconsPaddingY: 8,
    iconSize: 'medium' as 'small'|'medium'|'large',
    nameHandleGap: 2,
  };

  // Header card sortable state
  const [headerCardOrder, setHeaderCardOrder] = useState<string[]>(() => {
    const saved = (page.theme_json as any)?.headerCardOrder;
    if (saved && Array.isArray(saved)) {
      // Ensure both cards exist and name comes first
      const hasName = saved.includes('__name_handle__');
      const hasIcons = saved.includes('__social_icons__');
      if (hasName && hasIcons) {
        // Sort: name always before icons
        return ['__name_handle__', '__social_icons__'];
      }
    }
    return ['__name_handle__', '__social_icons__'];
  });
  const [expandedHeaderCard, setExpandedHeaderCard] = useState<string | null>(null);
  const [localNameSize, setLocalNameSize] = useState(headerConfig.nameSize ?? 28);
  const [localHandleSize, setLocalHandleSize] = useState(headerConfig.handleSize ?? 14);
  const [localNameColor, setLocalNameColor] = useState(headerConfig.nameColor ?? '#ffffff');
  const [localHandleColor, setLocalHandleColor] = useState(headerConfig.handleColor ?? '#ffffff99');
  const [localNamePadTop, setLocalNamePadTop] = useState(headerConfig.namePadTop ?? headerConfig.namePaddingY ?? 16);
  const [localNamePadBottom, setLocalNamePadBottom] = useState(headerConfig.namePadBottom ?? headerConfig.namePaddingY ?? 16);
  const [localIconsPaddingY, setLocalIconsPaddingY] = useState(headerConfig.iconsPaddingY ?? 8);
  const [localIconSize, setLocalIconSize] = useState<'small'|'medium'|'large'>(headerConfig.iconSize ?? 'medium');
  const [localNameHandleGap, setLocalNameHandleGap] = useState(headerConfig.nameHandleGap ?? 2);
  const [nameCardY, setNameCardY] = useState(
    (page.theme_json as any)?.headerConfig?.nameCardY ?? 0
  );
  const [iconsCardY, setIconsCardY] = useState(
    (page.theme_json as any)?.headerConfig?.iconsCardY ?? 0
  );
  const [contentStartY, setContentStartY] = useState(
    (page.theme_json as any)?.headerConfig?.contentStartY ?? 0
  );

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

  const handleGalleryDelete = async (itemId: string) => {
    const { error } = await supabase.from('block_items').delete().eq('id', itemId);
    if (error) {
      console.error('Delete error:', error);
      toast.error('Failed to delete photo');
      return;
    }
    toast.success('Photo removed');
    onRefresh();
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
    };
    reader.readAsDataURL(file);
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  // Compute crop frame size (fixed 3:4 aspect, fits within container with padding)
  const getCropFrameSize = () => {
    const container = cropContainerRef.current;
    if (!container) return { fw: 300, fh: 400 };
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const padding = 24;
    const availW = cw - padding * 2;
    const availH = ch - padding * 2;
    const ratio = 1 / 1; // square — matches the visible hero display area
    let fw = availW;
    let fh = fw / ratio;
    if (fh > availH) { fh = availH; fw = fh * ratio; }
    return { fw, fh };
  };

  // Compute min zoom so the image always covers the frame (no gaps)
  const getCropMinZoom = () => {
    const img = cropImgRef.current;
    const container = cropContainerRef.current;
    if (!img || !container || !img.naturalWidth) return 1;
    const { fw, fh } = getCropFrameSize();
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    // fitScale: image fits within the frame (the "zoomed out" size)
    const scaleW = fw / nw;
    const scaleH = fh / nh;
    // We need the image to COVER the frame, so use the LARGER scale
    const coverScale = Math.max(scaleW, scaleH);
    // Also need the image to at least fit within the container at zoom=1
    // minZoom is relative to the "base" size (image fit in container)
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const baseScale = Math.min(cw / nw, ch / nh);
    return coverScale / baseScale;
  };

  // Clamp pan position so image edges never go inside the frame
  const clampCropPosition = (panX: number, panY: number, zoom: number) => {
    const img = cropImgRef.current;
    const container = cropContainerRef.current;
    if (!img || !container || !img.naturalWidth) return { x: panX, y: panY };
    const { fw, fh } = getCropFrameSize();
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    // Image display size at current zoom
    const baseScale = Math.min(cw / nw, ch / nh);
    const dispW = nw * baseScale * zoom;
    const dispH = nh * baseScale * zoom;
    // Frame is centered in container
    const frameCX = cw / 2;
    const frameCY = ch / 2;
    const frameL = frameCX - fw / 2;
    const frameR = frameCX + fw / 2;
    const frameT = frameCY - fh / 2;
    const frameB = frameCY + fh / 2;
    // Image center = container center + pan
    // Image left = (cw/2 + panX) - dispW/2, must be <= frameL
    // Image right = (cw/2 + panX) + dispW/2, must be >= frameR
    const maxPanX = frameL - (cw / 2 - dispW / 2);   // image left <= frame left
    const minPanX = frameR - (cw / 2 + dispW / 2);    // image right >= frame right
    const maxPanY = frameT - (ch / 2 - dispH / 2);
    const minPanY = frameB - (ch / 2 + dispH / 2);
    return {
      x: Math.min(maxPanX, Math.max(minPanX, panX)),
      y: Math.min(maxPanY, Math.max(minPanY, panY)),
    };
  };

  const getCroppedCanvas = (): string => {
    const img = cropImgRef.current;
    const container = cropContainerRef.current;
    if (!img || !container || !photoPreview) return photoPreview || '';
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return photoPreview || '';

    const { fw, fh } = getCropFrameSize();
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    // Image display size
    const baseScale = Math.min(cw / nw, ch / nh);
    const dispW = nw * baseScale * cropZoom;
    const dispH = nh * baseScale * cropZoom;

    // Image position (center of container + pan offset)
    const imgCX = cw / 2 + cropPosition.x;
    const imgCY = ch / 2 + cropPosition.y;
    const imgL = imgCX - dispW / 2;
    const imgT = imgCY - dispH / 2;

    // Frame is centered
    const frameL = cw / 2 - fw / 2;
    const frameT = ch / 2 - fh / 2;

    // Frame position relative to image, in display pixels
    const relX = frameL - imgL;
    const relY = frameT - imgT;

    // Convert to natural pixels
    const scale = nw / dispW;
    const srcX = Math.max(0, Math.round(relX * scale));
    const srcY = Math.max(0, Math.round(relY * scale));
    const srcW = Math.min(Math.round(fw * scale), nw - srcX);
    const srcH = Math.min(Math.round(fh * scale), nh - srcY);

    const canvas = document.createElement('canvas');
    canvas.width = srcW;
    canvas.height = srcH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return photoPreview || '';
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
    return canvas.toDataURL('image/jpeg', 0.95);
  };

  const handlePhotoSave = async (overrideFile?: File) => {
    let fileToUpload = overrideFile || photoFile;
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
      if (selectedMode === 'recruit') {
        // Save page 2 avatar into theme_json
        const existingTheme = (page.theme_json as any) || {};
        await supabase
          .from('pages')
          .update({ theme_json: { ...existingTheme, avatar_url_page2: urlData.publicUrl } })
          .eq('id', page.id);
      } else {
        await supabase
          .from('pages')
          .update({ avatar_url: urlData.publicUrl })
          .eq('id', page.id);
      }
      toast.success('Profile photo updated!');
      setLocalHeroImages(prev => ({ ...prev, [selectedMode]: urlData.publicUrl }));
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

  // Detect face using face-api.js TinyFaceDetector (works in all browsers, 190KB model)
  const detectFace = async (img: HTMLImageElement): Promise<{ x: number; y: number; w: number; h: number } | null> => {
    try {
      // Load model on first use (cached after that)
      if (!faceapi.nets.tinyFaceDetector.isLoaded) {
        console.log('[AI CROP] Loading face detection model...');
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        console.log('[AI CROP] Model loaded successfully');
      }

      // Draw image to canvas first — ensures pixels are fully decoded
      // (data URL images may not be decoded when passed directly)
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas context');
      ctx.drawImage(img, 0, 0);

      console.log('[AI CROP] Running detection on', img.naturalWidth, 'x', img.naturalHeight, 'image...');

      // Try multiple input sizes for best results (larger = more accurate but slower)
      for (const inputSize of [512, 416, 320] as const) {
        const detection = await faceapi.detectSingleFace(
          canvas as any,
          new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.15 })
        );

        if (detection) {
          const { x, y, width, height } = detection.box;
          console.log('[AI CROP] Face detected (inputSize=%d, score=%.2f):', inputSize, detection.score, {
            x: Math.round(x), y: Math.round(y), w: Math.round(width), h: Math.round(height)
          });
          return { x, y, w: width, h: height };
        }
        console.log('[AI CROP] No face at inputSize', inputSize, '— trying next...');
      }

      console.log('[AI CROP] No face detected at any input size');
    } catch (e) {
      console.error('[AI CROP] face-api.js error:', e);
    }

    return null; // no face detected
  };

  const handleAiCrop = async (mode: 'headshot' | 'shoulders' | 'fullbody') => {
    if (!photoPreview) return;
    setAiProcessing(true);
    setPhotoStep('ai');
    try {
      // Load image
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = photoPreview;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image load failed'));
      });

      const natW = img.naturalWidth;
      const natH = img.naturalHeight;

      // Detect face
      const face = await detectFace(img);
      if (!face) {
        toast.error('No face detected — try manual crop');
        setPhotoStep('manual');
        return;
      }

      // Face bounding box (exact pixels from FaceDetector)
      const faceX = face.x;           // face left edge
      const faceY = face.y;           // face top edge
      const faceW = face.w;           // face width
      const faceH = face.h;           // face height
      const faceCX = faceX + faceW / 2; // face center X
      const faceCY = faceY + faceH / 2; // face center Y

      // --- CROP SIZING BY FACE OCCUPANCY ---
      // Target: face takes up X% of crop width. More stable than padding multipliers.
      // headshot: face = ~58% of width
      // shoulders: face = ~40% of width
      // fullbody: face = ~18% of width
      const targetFaceRatio = mode === 'headshot' ? 0.50 : mode === 'shoulders' ? 0.40 : 0.18;
      let cropSize = faceW / targetFaceRatio;
      cropSize = Math.min(cropSize, natW, natH);

      // Center horizontally on face
      let sx = faceCX - cropSize / 2;

      // Vertical placement: face higher in frame for portraits
      const faceTopRatio = mode === 'headshot' ? 0.42 : mode === 'shoulders' ? 0.30 : 0.22;
      let sy = faceCY - cropSize * faceTopRatio;

      // Clamp to image bounds
      sx = Math.max(0, Math.min(sx, natW - cropSize));
      sy = Math.max(0, Math.min(sy, natH - cropSize));

      console.log(`[AI Crop] Face: ${Math.round(faceW)}px wide @ (${Math.round(faceCX)}, ${Math.round(faceCY)}). Crop: ${Math.round(cropSize)}px square @ (${Math.round(sx)}, ${Math.round(sy)})`);

      // Crop the headshot square
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(cropSize);
      canvas.height = Math.round(cropSize);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No canvas context');
      ctx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, canvas.width, canvas.height);

      // JPEG at high quality — much smaller payload than PNG (avoids 6MB request limit)
      const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      console.log(`[AI Crop] Cropped data URL size: ${(croppedDataUrl.length / 1024).toFixed(0)}KB`);

      // --- AI ENHANCEMENT — crystal-upscaler (portrait-optimized, no plastic skin) ---
      let finalDataUrl = croppedDataUrl;
      let aiSucceeded = false;
      let aiErrorMsg = '';

      try {
        const [hdr, b64] = croppedDataUrl.split(',');
        const mt = hdr.match(/data:(.*?);/)?.[1] || 'image/jpeg';
        console.log(`[AI Enhance] Sending ${(b64.length / 1024).toFixed(0)}KB to crystal-upscaler...`);

        const { data: enhData, error: enhErr } = await supabase.functions.invoke('ai-enhance', {
          body: { base64: b64, mediaType: mt },
        });

        if (enhErr) {
          // Try to get the raw response from the FunctionsHttpError
          let extra = '';
          try {
            // @ts-ignore - context is on FunctionsHttpError
            const ctx = (enhErr as any).context;
            if (ctx && typeof ctx.json === 'function') {
              const body = await ctx.json();
              extra = ` — ${JSON.stringify(body)}`;
            } else if (ctx && typeof ctx.text === 'function') {
              extra = ` — ${await ctx.text()}`;
            }
          } catch (_) { /* ignore */ }
          aiErrorMsg = `${enhErr.message || enhErr.name || 'unknown'}${extra}`;
          console.error('[AI Enhance] Supabase function error:', enhErr, 'extra:', extra);
          throw new Error(aiErrorMsg);
        }
        if (!enhData?.output) {
          aiErrorMsg = `Empty output (response: ${JSON.stringify(enhData)})`;
          console.error('[AI Enhance] No output:', enhData);
          throw new Error(aiErrorMsg);
        }

        // Fetch the enhanced image — crystal-upscaler returns natural-looking
        // results, no client-side sharpening needed.
        const enhResp = await fetch(enhData.output);
        if (!enhResp.ok) {
          aiErrorMsg = `Fetch enhanced image failed: ${enhResp.status}`;
          throw new Error(aiErrorMsg);
        }
        const enhBlob = await enhResp.blob();
        finalDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(enhBlob);
        });
        aiSucceeded = true;
        console.log('[AI Enhance] ✓ Success');
      } catch (enhanceErr) {
        console.error('[AI Enhance] FAILED — showing crop-only fallback:', enhanceErr);
        toast.error(`AI enhancement failed${aiErrorMsg ? `: ${aiErrorMsg.slice(0, 80)}` : ''}`, { duration: 5000 });
      }

      // Show preview for user to accept or go back — with badge if AI didn't run
      setAiPreviewData(finalDataUrl);
      setAiPreviewEnhanced(aiSucceeded);
      setPhotoStep('ai-preview');
      return;
    } catch (err) {
      console.error('AI crop error:', err);
      toast.error(t('editor.aiCropFailed'));
      setPhotoStep('manual');
    } finally {
      setAiProcessing(false);
    }
  };

  const handleAiEnhance = async (mode: 'upscale' | 'face_restore', fromCrop?: boolean) => {
    setAiProcessing(true);
    setPhotoStep('ai');
    try {
      let sourceDataUrl = photoPreview;

      // If called from manual crop, crop first then enhance
      if (fromCrop && sourceDataUrl) {
        sourceDataUrl = getCroppedCanvas();
      }

      if (!sourceDataUrl) throw new Error('No image');

      const [header, base64] = sourceDataUrl.split(',');
      const mediaType = header.match(/data:(.*?);/)?.[1] || 'image/jpeg';
      console.log(`[AI Enhance] Sending ${(base64.length / 1024).toFixed(0)}KB to crystal-upscaler...`);

      const { data, error } = await supabase.functions.invoke('ai-enhance', {
        body: { base64, mediaType },
      });

      if (error || !data?.output) throw new Error(error?.message || 'Enhancement failed');

      // Fetch enhanced image from Replicate's URL
      const response = await fetch(data.output);
      const blob = await response.blob();
      const enhancedDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      setPhotoPreview(enhancedDataUrl);
      const file = new File([blob], 'enhanced.jpg', { type: 'image/jpeg' });
      setPhotoFile(file);

      if (fromCrop) {
        // Crop + enhance → save directly
        await handlePhotoSave(file);
      } else {
        // Enhance before crop → go back to choose so user can crop or save
        setPhotoStep('choose');
        toast.success(mode === 'upscale' ? 'Photo upscaled!' : 'Face enhanced!');
      }
    } catch (err) {
      console.error('AI enhance error:', err);
      toast.error('Enhancement failed — try again');
      setPhotoStep('choose');
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

  const saveHeaderConfig = async (config: Record<string, unknown>) => {
    const existingTheme = (page.theme_json as any) || {};
    await supabase
      .from('pages')
      .update({
        theme_json: {
          ...existingTheme,
          headerConfig: {
            ...(existingTheme.headerConfig || {}),
            ...config,
          },
          headerCardOrder,
        },
      })
      .eq('id', page.id);
    onRefresh();
  };

  // Hero image — per-page avatar support (no cross-page fallback)
  const page2AvatarUrl = (page.theme_json as any)?.avatar_url_page2 || null;
  const heroImage = selectedMode === 'recruit'
    ? (localHeroImages.recruit || page2AvatarUrl || '')
    : (localHeroImages.shop || (theme.header?.image_url) || page.avatar_url || '');

  // Page labels from theme
  const themePages = (page.theme_json as any)?.pages;
  const page1Label = themePages?.page1?.label || 'Page 1';
  const page2Label = themePages?.page2?.label || 'Page 2';

  // No-op click handler for edit mode
  const noOpClick: ClickHandler = () => false;
  const viewModeClick: ClickHandler = onOutboundClick ?? noOpClick;

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

  // Filter blocks for display (cinematic hides social in header)
  const displayBlocks = blocks.filter(
    (b) => b.type !== 'social_links' && b.type !== 'social_icon_row'
  );
  const socialBlocks = blocks.filter(
    (b) => b.type === 'social_links' || b.type === 'social_icon_row'
  );

  const allSortableItems = displayBlocks.map(b => b.id);

  const handleDragEnd = (event: DragEndEvent) => {
    setIsDragActive(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = allSortableItems.indexOf(active.id as string);
    const newIndex = allSortableItems.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(allSortableItems, oldIndex, newIndex);
    onBlockReorder(newOrder);
  };

  return (
    <div
      className="relative max-w-[640px] mx-auto"
      style={{ fontFamily, color: theme.typography.text_color }}
    >
      {/* Fixed hero image — stays pinned while content scrolls over it */}
      <div className="relative w-full" style={{ position: 'sticky', top: 0, height: '81dvh', maxHeight: '710px', overflow: 'hidden', zIndex: 1 }}>
        {heroImage ? (
          <SmoothImage
            src={heroImage}
            alt={page.display_name || page.handle}
            className="object-contain object-top brightness-110"
            containerClassName="h-full w-full"
            skeletonClassName="bg-neutral-900"
          />
        ) : (
          <div className="h-full w-full bg-[#0e0c09] flex flex-col items-center justify-center gap-3">
            {editMode && selectedMode === 'recruit' && (
              <>
                <Camera className="h-12 w-12 text-white/20" />
                <p className="text-white/40 text-sm font-medium text-center px-6">
                  {t('editor.choosePage2Photo')}
                </p>
                <button
                  onClick={() => photoInputRef.current?.click()}
                  className="mt-1 px-5 py-2 rounded-full bg-[#C9A55C] text-[#0e0c09] font-bold text-xs"
                >
                  {t('editor.uploadPhoto')}
                </button>
              </>
            )}
          </div>
        )}
        {editMode && photoStep === 'idle' && heroImage && (
          <div className="absolute top-3 right-3 z-[15] flex flex-col gap-2">
            <button
              onClick={() => {
                setPhotoPreview(heroImage);
                setPhotoFile(null);
                setCropZoom(1);
                setCropPosition({ x: 0, y: 0 });
                setPhotoStep('choose');
              }}
              className="bg-black/40 backdrop-blur-sm rounded-full p-3"
              title={t('editor.editCurrentPhoto')}
            >
              <Pencil className="h-10 w-10 text-white opacity-80 hover:opacity-100" />
            </button>
            <button
              onClick={() => photoInputRef.current?.click()}
              className="bg-black/40 backdrop-blur-sm rounded-full p-3"
              title={t('editor.newPhoto')}
            >
              <Camera className="h-10 w-10 text-white opacity-80 hover:opacity-100" />
            </button>
          </div>
        )}
      </div>

      {/* Content panel */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          backgroundColor: '#0e0c09',
          minHeight: '60vh',
          marginTop: '-21rem',
          paddingTop: '0',
        }}
      >
        {/* Gradient fade — scrolls over the sticky hero photo */}
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            left: 0,
            right: 0,
            height: '60px',
            background: 'linear-gradient(to bottom, transparent 0%, #0e0c09 100%)',
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
            marginTop: `${headerConfig.nameOffset ?? 0}px`,
            paddingBottom: '1rem',
          }}
        >
          {/* In edit mode, name/handle render as sortable cards below */}
          {!editMode && headerCardOrder.map(id => {
            if (id === '__name_handle__') return (
              <div key={id} style={{ paddingTop: headerConfig.namePadTop ?? headerConfig.namePaddingY ?? 16, paddingBottom: headerConfig.namePadBottom ?? headerConfig.namePaddingY ?? 16, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', transform: `translateY(${headerConfig.nameCardY ?? 0}px)` }}>
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
                  style={{
                    fontSize: `${headerConfig.handleSize}px`,
                    color: headerConfig.handleColor,
                    textShadow: '0 1px 4px rgba(0,0,0,0.4)',
                    margin: 0,
                    marginTop: headerConfig.nameHandleGap ?? 2,
                  }}
                >
                  @{page.handle}
                </p>
              </div>
            );
            if (id === '__social_icons__') {
              const allSocialItems = socialBlocks.flatMap(b => b.items);
              const seenLabels = new Set<string>();
              const dedupedItems = allSocialItems.filter(item => {
                const key = item.label.toLowerCase();
                if (seenLabels.has(key)) return false;
                seenLabels.add(key);
                return true;
              });
              if (dedupedItems.length === 0) return null;
              const iSize = headerConfig.iconSize ?? 'medium';
              const sizeMap: Record<string, number> = { small: 14, medium: 18, large: 24 };
              const containerMap: Record<string, string> = { small: 'h-8 w-8', medium: 'h-10 w-10', large: 'h-12 w-12' };
              return (
                <div key={id} style={{ paddingTop: headerConfig.iconsPaddingY ?? 8, paddingBottom: headerConfig.iconsPaddingY ?? 8, transform: `translateY(${headerConfig.iconsCardY ?? 0}px)` }} className="flex flex-wrap justify-center gap-3">
                  {dedupedItems.map((item) => (
                    <span
                      key={item.id}
                      className={cn('flex items-center justify-center rounded-full', containerMap[iSize])}
                      style={{ background: '#ffffff20' }}
                      title={item.label}
                    >
                      <SocialSvgIcon label={item.label} size={sizeMap[iSize]} color="#ffffff" />
                    </span>
                  ))}
                </div>
              );
            }
            return null;
          })}
          {editMode && (
            <>

              {photoPreview && photoStep !== 'idle' && (
                <div
                  className="fixed inset-0 z-[100] flex flex-col bg-black/95"
                  style={{ overflow: 'hidden', touchAction: 'none', overscrollBehavior: 'none' }}
                  onTouchMove={(e) => {
                    // Prevent background scroll on touch devices
                    // (manual crop step handles its own touch events)
                    if (photoStep !== 'manual') e.preventDefault();
                  }}
                  onWheel={(e) => {
                    // Prevent background scroll on mouse wheel
                    if (photoStep !== 'manual') e.preventDefault();
                  }}
                >

                  {/* CHOOSE STEP — simplified, just preview + Crop Image */}
                  {photoStep === 'choose' && (
                    <div className="flex flex-col items-center justify-center flex-1 p-6 gap-6">
                      <p className="text-white font-bold text-xl">
                        {t('editor.editPhoto')}
                      </p>
                      <div className="w-48 h-48 rounded-2xl overflow-hidden border-2 border-white/20">
                        <img src={photoPreview} alt="Selected" className="w-full h-full object-cover object-top" />
                      </div>
                      <button
                        onClick={() => setPhotoStep('manual')}
                        className="w-full max-w-xs py-4 rounded-2xl bg-[#C9A55C] text-[#0e0c09] font-bold flex items-center justify-center gap-2 text-sm"
                      >
                        {t('editor.cropImage')}
                      </button>
                      <button onClick={resetPhoto} className="text-white/40 text-xs">
                        {t('editor.cancel')}
                      </button>
                    </div>
                  )}

                  {/* AI PROCESSING STEP */}
                  {photoStep === 'ai' && (
                    <div className="flex flex-col items-center justify-center flex-1 gap-4">
                      <div className="w-12 h-12 border-2 border-[#C9A55C] border-t-transparent rounded-full animate-spin" />
                      <p className="text-white font-semibold">AI processing...</p>
                      <p className="text-white/40 text-xs">Detecting face, cropping & enhancing</p>
                    </div>
                  )}

                  {/* AI PREVIEW STEP — shows result, accept or go back */}
                  {photoStep === 'ai-preview' && aiPreviewData && (
                    <div className="flex flex-col items-center justify-center flex-1 p-6 gap-5">
                      <p className="text-white font-bold text-lg">
                        {aiPreviewEnhanced ? 'AI Result' : 'Crop Preview'}
                      </p>
                      <div className="relative">
                        <div className={`w-64 h-64 rounded-2xl overflow-hidden border-2 ${aiPreviewEnhanced ? 'border-[#C9A55C]/50' : 'border-amber-500/40'}`}>
                          <img src={aiPreviewData} alt="AI Preview" className="w-full h-full object-cover" />
                        </div>
                        {/* Status badge */}
                        <div className={`absolute top-2 left-2 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide backdrop-blur-md ${
                          aiPreviewEnhanced
                            ? 'bg-[#C9A55C]/90 text-[#0e0c09]'
                            : 'bg-amber-500/90 text-[#0e0c09]'
                        }`}>
                          {aiPreviewEnhanced ? '✓ AI ENHANCED' : '⚠ CROP ONLY — AI FAILED'}
                        </div>
                      </div>
                      <div className="flex gap-3 w-full max-w-xs">
                        <button
                          onClick={() => {
                            setAiPreviewData(null);
                            setPhotoStep('manual');
                          }}
                          className="flex-1 py-3 rounded-2xl border border-white/20 text-white font-semibold text-sm"
                        >
                          ← Back
                        </button>
                        <button
                          onClick={async () => {
                            if (!aiPreviewData) return;
                            setPhotoPreview(aiPreviewData);
                            const res = await fetch(aiPreviewData);
                            const blob = await res.blob();
                            const file = new File([blob], 'ai-enhanced.jpg', { type: 'image/jpeg' });
                            setPhotoFile(file);
                            setAiPreviewData(null);
                            await handlePhotoSave(file);
                          }}
                          className="flex-1 py-3 rounded-2xl bg-[#C9A55C] text-[#0e0c09] font-bold text-sm"
                        >
                          Accept ✓
                        </button>
                      </div>
                    </div>
                  )}

                  {/* MANUAL CROP STEP — fixed 1:1 frame, user moves image */}
                  {photoStep === 'manual' && (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column', backgroundColor: '#0e0c09' }}>

                      {/* Header */}
                      <div className="flex items-center justify-between px-3 border-b border-white/10" style={{ height: '44px', flexShrink: 0 }}>
                        <div className="w-8" />
                        <p className="text-white font-semibold text-sm">{t('editor.cropImage')}</p>
                        <button
                          onClick={() => setPhotoStep('choose')}
                          className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Zoom slider */}
                      <div className="flex items-center gap-2 px-3" style={{ height: '36px', flexShrink: 0 }}>
                        <span className="text-white/50 text-[10px] font-medium flex-shrink-0">Zoom</span>
                        <input
                          type="range"
                          min={getCropMinZoom()}
                          max={Math.max(getCropMinZoom() * 4, 3)}
                          step={0.01}
                          value={Math.max(cropZoom, getCropMinZoom())}
                          onChange={(e) => {
                            const newZoom = Number(e.target.value);
                            setCropZoom(newZoom);
                            setCropPosition(prev => clampCropPosition(prev.x, prev.y, newZoom));
                          }}
                          className="flex-1 accent-[#C9A55C] h-1"
                        />
                        <span className="text-white/70 text-[10px] font-mono w-8 text-right flex-shrink-0">
                          {Math.max(cropZoom, getCropMinZoom()).toFixed(1)}x
                        </span>
                      </div>

                      {/* Crop area — user drags image behind fixed frame */}
                      <div
                        ref={cropContainerRef}
                        style={{ flexGrow: 1, flexShrink: 1, minHeight: 0, overflow: 'hidden', position: 'relative', backgroundColor: '#000', touchAction: 'none', cursor: 'grab' }}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          setIsDraggingCrop(true);
                          setDragStart({ x: e.clientX - cropPosition.x, y: e.clientY - cropPosition.y });
                          e.currentTarget.setPointerCapture(e.pointerId);
                          e.currentTarget.style.cursor = 'grabbing';
                        }}
                        onPointerMove={(e) => {
                          if (!isDraggingCrop) return;
                          e.preventDefault();
                          const rawX = e.clientX - dragStart.x;
                          const rawY = e.clientY - dragStart.y;
                          const clamped = clampCropPosition(rawX, rawY, Math.max(cropZoom, getCropMinZoom()));
                          setCropPosition(clamped);
                        }}
                        onPointerUp={(e) => {
                          e.preventDefault();
                          setIsDraggingCrop(false);
                          e.currentTarget.style.cursor = 'grab';
                        }}
                      >
                        {/* Image — explicitly positioned, no object-fit, no CSS transform */}
                        {photoPreview && (() => {
                          const img = cropImgRef.current;
                          const container = cropContainerRef.current;
                          const nw = img?.naturalWidth || 1;
                          const nh = img?.naturalHeight || 1;
                          const cw = container?.clientWidth || 430;
                          const ch = container?.clientHeight || 600;
                          const baseScale = Math.min(cw / nw, ch / nh);
                          const effectiveZoom = Math.max(cropZoom, getCropMinZoom());
                          const dispW = nw * baseScale * effectiveZoom;
                          const dispH = nh * baseScale * effectiveZoom;
                          const imgL = (cw / 2 + cropPosition.x) - dispW / 2;
                          const imgT = (ch / 2 + cropPosition.y) - dispH / 2;
                          return (
                            <img
                              ref={cropImgRef}
                              src={photoPreview}
                              alt="Crop"
                              draggable={false}
                              className="max-w-none select-none pointer-events-none"
                              onLoad={() => {
                                setCropImgLoaded(n => n + 1);
                                // Auto-set zoom to min on load
                                const minZ = getCropMinZoom();
                                if (cropZoom < minZ) setCropZoom(minZ);
                                setCropPosition({ x: 0, y: 0 });
                              }}
                              style={{
                                position: 'absolute',
                                left: imgL,
                                top: imgT,
                                width: dispW,
                                height: dispH,
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                              }}
                            />
                          );
                        })()}

                        {/* Fixed 3:4 crop frame — centered, non-interactive */}
                        {(() => {
                          const { fw, fh } = getCropFrameSize();
                          return (
                            <div
                              ref={cropFrameRef}
                              className="absolute pointer-events-none"
                              style={{
                                width: fw,
                                height: fh,
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                border: '2px solid #C9A55C',
                                boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
                                zIndex: 10,
                              }}
                            >
                              {/* Rule of thirds grid lines */}
                              <div className="absolute inset-0">
                                <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/20" />
                                <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/20" />
                                <div className="absolute top-1/3 left-0 right-0 h-px bg-white/20" />
                                <div className="absolute top-2/3 left-0 right-0 h-px bg-white/20" />
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* AI Auto-Crop row */}
                      <div className="px-3 border-t border-white/10" style={{ flexShrink: 0, paddingTop: '6px' }}>
                        <p className="text-white/40 text-[9px] font-semibold uppercase tracking-wider mb-1 text-center">AI Auto-Crop + Enhance</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            onClick={() => handleAiCrop('headshot')}
                            className="py-1.5 rounded-lg bg-[#C9A55C]/10 border border-[#C9A55C]/30 text-[#C9A55C] font-semibold text-[10px] flex flex-col items-center gap-0 hover:bg-[#C9A55C]/20 transition-colors"
                          >
                            <span className="text-xs leading-tight">👤</span>
                            Headshot
                          </button>
                          <button
                            onClick={() => handleAiCrop('shoulders')}
                            className="py-1.5 rounded-lg bg-[#C9A55C]/10 border border-[#C9A55C]/30 text-[#C9A55C] font-semibold text-[10px] flex flex-col items-center gap-0 hover:bg-[#C9A55C]/20 transition-colors"
                          >
                            <span className="text-xs leading-tight">🧑</span>
                            Shoulders
                          </button>
                          <button
                            onClick={() => handleAiCrop('fullbody')}
                            className="py-1.5 rounded-lg bg-[#C9A55C]/10 border border-[#C9A55C]/30 text-[#C9A55C] font-semibold text-[10px] flex flex-col items-center gap-0 hover:bg-[#C9A55C]/20 transition-colors"
                          >
                            <span className="text-xs leading-tight">🧍</span>
                            Full Body
                          </button>
                        </div>
                      </div>

                      {/* Bottom buttons */}
                      <div className="flex gap-2 px-3" style={{ flexShrink: 0, paddingTop: '6px', paddingBottom: '12px' }}>
                        <button
                          onClick={() => setPhotoStep('choose')}
                          className="flex-1 py-2.5 rounded-xl border border-white/20 text-white font-semibold text-xs"
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
                            await handlePhotoSave(file);
                          }}
                          className="flex-1 py-2.5 rounded-xl bg-[#C9A55C] text-[#0e0c09] font-bold text-xs"
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

          {/* Social icons in non-edit mode are rendered via headerCardOrder above */}
        </div>


        {/* Blocks */}
        {editMode ? (
          /* Preview block cards for edit mode */
          <div
            className="pb-32 flex flex-col gap-[6px]"
            style={{ paddingTop: `${contentStartY ?? 0}px` }}
          >
            <div className="flex items-center justify-between px-4 pt-1 pb-2 relative z-[5]">
            </div>
            {/* Free-drag header cards (outside DndContext) — hidden during photo crop/edit */}
            {photoStep === 'idle' && (() => {
              const allItems = socialBlocks.flatMap(b => b.items);
              const seen = new Set<string>();
              const dedupedSocialItems = allItems.filter(item => {
                const key = item.label.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
              return headerCardOrder.map(cardId => {
                if (cardId === '__name_handle__') return (
                  <NameHandleCard
                    key={cardId}
                    page={page}
                    expanded={expandedHeaderCard === '__name_handle__'}
                    onToggleExpand={() => setExpandedHeaderCard(expandedHeaderCard === '__name_handle__' ? null : '__name_handle__')}
                    localNameSize={localNameSize} setLocalNameSize={setLocalNameSize}
                    localHandleSize={localHandleSize} setLocalHandleSize={setLocalHandleSize}
                    localNameColor={localNameColor} setLocalNameColor={setLocalNameColor}
                    localHandleColor={localHandleColor} setLocalHandleColor={setLocalHandleColor}
                    localNamePadTop={localNamePadTop} setLocalNamePadTop={setLocalNamePadTop}
                    localNamePadBottom={localNamePadBottom} setLocalNamePadBottom={setLocalNamePadBottom}
                    localNameHandleGap={localNameHandleGap} setLocalNameHandleGap={setLocalNameHandleGap}
                    nameCardY={nameCardY} onNameCardYChange={setNameCardY}
                    onDragEnd={() => saveHeaderConfig({ nameCardY })}
                    onSave={() => saveHeaderConfig({
                      nameSize: localNameSize,
                      handleSize: localHandleSize,
                      nameColor: localNameColor,
                      handleColor: localHandleColor,
                      namePadTop: localNamePadTop,
                      namePadBottom: localNamePadBottom,
                      nameHandleGap: localNameHandleGap,
                    })}
                    onDisplayNameChange={async (name) => {
                      await supabase.from('pages').update({ display_name: name }).eq('id', page.id);
                      onRefresh();
                    }}
                  />
                );
                if (cardId === '__social_icons__') return (
                  <SocialIconsCard
                    key={cardId}
                    socialItems={dedupedSocialItems}
                    expanded={expandedHeaderCard === '__social_icons__'}
                    onToggleExpand={() => setExpandedHeaderCard(expandedHeaderCard === '__social_icons__' ? null : '__social_icons__')}
                    localIconsPaddingY={localIconsPaddingY} setLocalIconsPaddingY={setLocalIconsPaddingY}
                    localIconSize={localIconSize} setLocalIconSize={setLocalIconSize}
                    iconsCardY={iconsCardY} onIconsCardYChange={setIconsCardY}
                    onDragEnd={() => saveHeaderConfig({ iconsCardY })}
                    contentStartY={contentStartY} setContentStartY={setContentStartY}
                    onEditSocial={() => {
                      const socialBlock = socialBlocks[0];
                      if (socialBlock) onBlockEdit(socialBlock.id);
                    }}
                    onSave={() => saveHeaderConfig({
                      iconsPaddingY: localIconsPaddingY,
                      iconSize: localIconSize,
                      contentStartY,
                    })}
                  />
                );
                return null;
              });
            })()}
            {/* Block cards (sortable via DndContext) */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}>
              <SortableContext items={allSortableItems} strategy={verticalListSortingStrategy}>
                {allSortableItems.map((itemId) => {
                  const block = displayBlocks.find(b => b.id === itemId);
                  if (!block) return null;
                  return (
                    <SortablePreviewCard
                      key={block.id}
                      block={block}
                      onEdit={() => onBlockEdit(block.id)}
                      onToggle={(enabled) => onBlockToggle(block.id, enabled)}
                      onGalleryAdd={openGalleryPicker}
                      onGalleryDelete={handleGalleryDelete}
                      isDragActive={isDragActive}
                      theme={theme}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
          </div>
        ) : (
          /* Full block content for view mode */
          <div
            className="px-4 pb-20 flex flex-col gap-[6px]"
            style={{ paddingTop: `${contentStartY ?? 0}px` }}
          >
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
                  <BlockRenderer block={block} onOutboundClick={viewModeClick} theme={theme} pageId={page.id} />
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
