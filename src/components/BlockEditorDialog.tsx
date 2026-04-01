import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PrimaryCtaEditor } from '@/components/editors/PrimaryCtaEditor';
import { SocialLinksEditor } from '@/components/editors/SocialLinksEditor';
import { LinksEditor } from '@/components/editors/LinksEditor';
import { ProductCardsEditor } from '@/components/editors/ProductCardsEditor';
import { FeaturedMediaEditor } from '@/components/editors/FeaturedMediaEditor';
import { HeroCardEditor } from '@/components/editors/HeroCardEditor';
import { SocialIconRowEditor } from '@/components/editors/SocialIconRowEditor';
import { EmailSubscribeEditor } from '@/components/editors/EmailSubscribeEditor';
import { ContentSectionEditor } from '@/components/editors/ContentSectionEditor';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';
import type { Tables } from '@/integrations/supabase/types';

type Block = Tables<'blocks'>;

interface BlockEditorDialogProps {
  blockId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

export function BlockEditorDialog({ blockId, open, onOpenChange, onSave }: BlockEditorDialogProps) {
  const { t } = useLanguage();
  const [block, setBlock] = useState<Block | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && blockId) {
      fetchBlock();
    }
  }, [open, blockId]);

  const fetchBlock = async () => {
    if (!blockId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('blocks')
        .select('*')
        .eq('id', blockId)
        .single();

      if (error) throw error;
      setBlock(data);
    } catch (error) {
      console.error('Error fetching block:', error);
      toast.error(t('blockEditor.failedToLoad'));
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  if (!blockId || loading || !block) {
    return null;
  }

  // Render appropriate editor based on block type
  switch (block.type) {
    case 'primary_cta':
      return (
        <PrimaryCtaEditor
          blockId={blockId}
          open={open}
          onOpenChange={onOpenChange}
          onSave={onSave}
        />
      );
    
    case 'social_links':
      return (
        <SocialLinksEditor
          blockId={blockId}
          open={open}
          onOpenChange={onOpenChange}
          onSave={onSave}
        />
      );
    
    case 'links':
      return (
        <LinksEditor
          blockId={blockId}
          open={open}
          onOpenChange={onOpenChange}
          onSave={onSave}
        />
      );
    
    case 'product_cards':
      return (
        <ProductCardsEditor
          blockId={blockId}
          open={open}
          onOpenChange={onOpenChange}
          onSave={onSave}
        />
      );
    
    case 'featured_media':
      return (
        <FeaturedMediaEditor
          blockId={blockId}
          open={open}
          onOpenChange={onOpenChange}
          onSave={onSave}
        />
      );

    case 'hero_card':
      return (
        <HeroCardEditor
          blockId={blockId}
          open={open}
          onOpenChange={onOpenChange}
          onSave={onSave}
        />
      );

    case 'social_icon_row':
      return (
        <SocialIconRowEditor
          blockId={blockId}
          open={open}
          onOpenChange={onOpenChange}
          onSave={onSave}
        />
      );

    case 'email_subscribe':
      return (
        <EmailSubscribeEditor
          blockId={blockId}
          open={open}
          onOpenChange={onOpenChange}
          onSave={onSave}
        />
      );

    case 'content_section':
      return (
        <ContentSectionEditor
          blockId={blockId}
          open={open}
          onOpenChange={onOpenChange}
          onSave={onSave}
        />
      );

    default:
      toast.error(t('blockEditor.unknownType'));
      onOpenChange(false);
      return null;
  }
}
