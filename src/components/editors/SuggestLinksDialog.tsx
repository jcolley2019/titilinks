import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Sparkles, Plus, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';

interface SuggestedLink {
  label: string;
  subtitle: string;
  url: string;
}

interface SuggestLinksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modeId: string;
  onLinksAdded?: () => void;
}

export function SuggestLinksDialog({ open, onOpenChange, modeId, onLinksAdded }: SuggestLinksDialogProps) {
  const { t } = useLanguage();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedLink[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error(t('suggestLinks.describePrompt'));
      return;
    }

    setLoading(true);
    setSuggestions([]);
    setSelected(new Set());

    try {
      const { data, error } = await supabase.functions.invoke('suggest-links', {
        body: { prompt: prompt.trim() },
      });

      if (error) throw error;

      if (data?.links && Array.isArray(data.links)) {
        setSuggestions(data.links);
        // Select all by default
        setSelected(new Set(data.links.map((_: SuggestedLink, i: number) => i)));
      } else {
        toast.error(t('suggestLinks.unexpectedFormat'));
      }
    } catch (err: any) {
      console.error('Suggest links error:', err);
      toast.error(err.message || t('suggestLinks.failedGenerate'));
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (index: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleAddSelected = async () => {
    const selectedLinks = suggestions.filter((_, i) => selected.has(i));
    if (selectedLinks.length === 0) {
      toast.error(t('suggestLinks.selectAtLeastOne'));
      return;
    }

    setAdding(true);
    try {
      // Find or create a links block for this mode
      const { data: existingBlocks, error: blocksError } = await supabase
        .from('blocks')
        .select('id, order_index')
        .eq('mode_id', modeId)
        .eq('type', 'links')
        .limit(1)
        .maybeSingle();

      if (blocksError) throw blocksError;

      let linksBlockId: string;

      if (existingBlocks) {
        linksBlockId = existingBlocks.id;
      } else {
        // Get max order_index to add at end
        const { data: allBlocks } = await supabase
          .from('blocks')
          .select('order_index')
          .eq('mode_id', modeId)
          .order('order_index', { ascending: false })
          .limit(1)
          .maybeSingle();

        const nextOrder = (allBlocks?.order_index ?? -1) + 1;

        const { data: newBlock, error: createError } = await supabase
          .from('blocks')
          .insert({
            mode_id: modeId,
            type: 'links' as const,
            title: 'Links',
            order_index: nextOrder,
            is_enabled: true,
          })
          .select('id')
          .single();

        if (createError) throw createError;
        linksBlockId = newBlock.id;
      }

      // Get current max order_index for items in this block
      const { data: existingItems } = await supabase
        .from('block_items')
        .select('order_index')
        .eq('block_id', linksBlockId)
        .order('order_index', { ascending: false })
        .limit(1)
        .maybeSingle();

      const startOrder = (existingItems?.order_index ?? -1) + 1;

      // Insert selected links as block_items
      const items = selectedLinks.map((link, i) => ({
        block_id: linksBlockId,
        label: link.label,
        subtitle: link.subtitle,
        url: link.url,
        order_index: startOrder + i,
      }));

      const { error: insertError } = await supabase
        .from('block_items')
        .insert(items);

      if (insertError) throw insertError;

      toast.success(`${t('suggestLinks.addedLinks')} ${selectedLinks.length} ${selectedLinks.length > 1 ? t('suggestLinks.links') : t('suggestLinks.link')}`);
      onLinksAdded?.();
      onOpenChange(false);
      // Reset state
      setPrompt('');
      setSuggestions([]);
      setSelected(new Set());
    } catch (err: any) {
      console.error('Error adding links:', err);
      toast.error(err.message || t('suggestLinks.failedAdd'));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {t('suggestLinks.title')}
          </DialogTitle>
          <DialogDescription>
            {t('suggestLinks.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Prompt Input */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t('suggestLinks.placeholder')}
                maxLength={500}
                onKeyDown={(e) => e.key === 'Enter' && !loading && handleGenerate()}
                className="flex-1"
              />
              <Button
                onClick={handleGenerate}
                disabled={loading || !prompt.trim()}
                className="gap-2 flex-shrink-0"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {loading ? t('suggestLinks.thinking') : t('suggestLinks.suggest')}
              </Button>
            </div>
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  {selected.size} / {suggestions.length} {t('suggestLinks.selected')}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    if (selected.size === suggestions.length) {
                      setSelected(new Set());
                    } else {
                      setSelected(new Set(suggestions.map((_, i) => i)));
                    }
                  }}
                >
                  {selected.size === suggestions.length ? t('suggestLinks.deselectAll') : t('suggestLinks.selectAll')}
                </Button>
              </div>

              {suggestions.map((link, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.06 }}
                >
                  <button
                    type="button"
                    className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                      selected.has(index)
                        ? 'border-primary bg-primary/10 shadow-[0_0_12px_-3px_hsl(var(--primary)/0.3)]'
                        : 'border-border bg-card hover:border-primary/40'
                    }`}
                    onClick={() => toggleSelection(index)}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selected.has(index)}
                        className="mt-0.5 border-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        onCheckedChange={() => toggleSelection(index)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{link.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{link.subtitle}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <ExternalLink className="h-3 w-3 text-muted-foreground/50" />
                          <p className="text-[10px] text-muted-foreground/50 truncate">{link.url}</p>
                        </div>
                      </div>
                    </div>
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {suggestions.length > 0 && (
          <div className="flex justify-end gap-2 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('suggestLinks.cancel')}
            </Button>
            <Button
              onClick={handleAddSelected}
              disabled={adding || selected.size === 0}
              className="gap-2"
            >
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {t('suggestLinks.addSelected')} ({selected.size})
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
