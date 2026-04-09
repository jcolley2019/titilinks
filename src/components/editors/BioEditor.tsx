import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import type { Tables } from '@/integrations/supabase/types';

type BlockItem = Tables<'block_items'>;

interface BioEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
}

export function BioEditor({ blockId, open, onOpenChange, onSave, panelMode }: BioEditorProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bioText, setBioText] = useState('');
  const [existingItem, setExistingItem] = useState<BlockItem | null>(null);

  useEffect(() => {
    if (open) fetchBio();
  }, [open, blockId]);

  const fetchBio = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('block_items')
        .select('*')
        .eq('block_id', blockId)
        .order('order_index', { ascending: true })
        .limit(1);

      if (error) throw error;

      const item = data?.[0] || null;
      setExistingItem(item);
      setBioText(item?.label || '');
    } catch (error) {
      console.error('Error fetching bio:', error);
      toast.error('Failed to load bio');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (existingItem) {
        const { error } = await supabase
          .from('block_items')
          .update({ label: bioText.trim() })
          .eq('id', existingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('block_items')
          .insert({
            block_id: blockId,
            label: bioText.trim(),
            url: '',
            image_url: '',
            order_index: 0,
          });
        if (error) throw error;
      }

      toast.success('Bio saved');
      onSave?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving bio:', error);
      toast.error('Failed to save bio');
    } finally {
      setSaving(false);
    }
  };

  const innerContent = (
    <>
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      ) : (
        <div className="space-y-4">
          <textarea
            value={bioText}
            onChange={(e) => setBioText(e.target.value)}
            maxLength={300}
            rows={5}
            placeholder="Write something about yourself..."
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#C9A55C]/50 resize-none"
          />
          <p className="text-xs text-white/30 text-right">{bioText.length}/300</p>

          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-white/60 hover:text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#C9A55C] text-black hover:bg-[#C9A55C]/90"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </>
  );

  if (panelMode) {
    return (
      <div className="flex flex-col h-full bg-[#0e0c09] text-white overflow-y-auto px-4 py-4">
        {innerContent}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{t('blocks.bio.title')}</DialogTitle>
          <DialogDescription className="text-white/50">
            {t('blocks.bio.subtitle')}
          </DialogDescription>
        </DialogHeader>
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
