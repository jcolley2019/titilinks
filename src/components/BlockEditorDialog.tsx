import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PrimaryCtaEditor } from '@/components/editors/PrimaryCtaEditor';
import { SocialLinksEditor } from '@/components/editors/SocialLinksEditor';
import { LinksEditor } from '@/components/editors/LinksEditor';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type Block = Tables<'blocks'>;

interface BlockEditorDialogProps {
  blockId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

export function BlockEditorDialog({ blockId, open, onOpenChange, onSave }: BlockEditorDialogProps) {
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
      toast.error('Failed to load block');
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
    
    // Other block types will be added here
    case 'product_cards':
    case 'featured_media':
      // Show coming soon message for unimplemented editors
      toast.info(`${block.type.replace('_', ' ')} editor coming soon!`);
      onOpenChange(false);
      return null;

    default:
      toast.error('Unknown block type');
      onOpenChange(false);
      return null;
  }
}
