import { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, MousePointer } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type BlockItem = Tables<'block_items'>;

const formSchema = z.object({
  label: z.string().min(1, 'Label is required').max(50, 'Label must be less than 50 characters'),
  url: z.string()
    .min(1, 'URL is required')
    .refine(
      (val) => val.startsWith('http://') || val.startsWith('https://'),
      'URL must include protocol (http:// or https://)'
    )
    .refine(
      (val) => {
        try {
          new URL(val);
          return true;
        } catch {
          return false;
        }
      },
      'Please enter a valid URL'
    ),
  subtitle: z.string().max(100, 'Subtitle must be less than 100 characters').optional(),
  badge: z.string().max(20, 'Badge must be less than 20 characters').optional(),
});

type FormData = z.infer<typeof formSchema>;

interface PrimaryCtaEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

export function PrimaryCtaEditor({ blockId, open, onOpenChange, onSave }: PrimaryCtaEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingItem, setExistingItem] = useState<BlockItem | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      label: '',
      url: '',
      subtitle: '',
      badge: '',
    },
  });

  useEffect(() => {
    if (open) {
      fetchBlockItem();
    }
  }, [open, blockId]);

  const fetchBlockItem = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('block_items')
        .select('*')
        .eq('block_id', blockId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setExistingItem(data);
        form.reset({
          label: data.label,
          url: data.url,
          subtitle: data.subtitle || '',
          badge: data.badge || '',
        });
      } else {
        setExistingItem(null);
        form.reset({
          label: '',
          url: '',
          subtitle: '',
          badge: '',
        });
      }
    } catch (error) {
      console.error('Error fetching block item:', error);
      toast.error('Failed to load block data');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      if (existingItem) {
        // Update existing item
        const { error } = await supabase
          .from('block_items')
          .update({
            label: data.label,
            url: data.url,
            subtitle: data.subtitle || null,
            badge: data.badge || null,
          })
          .eq('id', existingItem.id);

        if (error) throw error;
      } else {
        // Create new item
        const { error } = await supabase
          .from('block_items')
          .insert({
            block_id: blockId,
            label: data.label,
            url: data.url,
            subtitle: data.subtitle || null,
            badge: data.badge || null,
            order_index: 0,
          });

        if (error) throw error;
      }

      toast.success('Primary CTA saved');
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving block item:', error);
      toast.error(error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MousePointer className="h-5 w-5 text-primary" />
            Edit Primary CTA
          </DialogTitle>
          <DialogDescription>
            Configure your main call-to-action button that appears prominently on your page.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="label">
                Button Label <span className="text-destructive">*</span>
              </Label>
              <Input
                id="label"
                placeholder="Shop Now"
                {...form.register('label')}
              />
              {form.formState.errors.label && (
                <p className="text-sm text-destructive">{form.formState.errors.label.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="url">
                URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="url"
                placeholder="https://example.com/shop"
                {...form.register('url')}
              />
              {form.formState.errors.url && (
                <p className="text-sm text-destructive">{form.formState.errors.url.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="subtitle">Subtitle (optional)</Label>
              <Input
                id="subtitle"
                placeholder="Free shipping on orders over $50"
                {...form.register('subtitle')}
              />
              {form.formState.errors.subtitle && (
                <p className="text-sm text-destructive">{form.formState.errors.subtitle.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="badge">Badge (optional)</Label>
              <Input
                id="badge"
                placeholder="NEW"
                {...form.register('badge')}
              />
              {form.formState.errors.badge && (
                <p className="text-sm text-destructive">{form.formState.errors.badge.message}</p>
              )}
            </div>

            {/* Preview */}
            {form.watch('label') && (
              <div className="p-4 rounded-lg border border-border bg-secondary/30">
                <p className="text-xs text-muted-foreground mb-2">Preview</p>
                <div className="flex flex-col items-center gap-1">
                  {form.watch('badge') && (
                    <span className="text-xs font-medium text-primary">{form.watch('badge')}</span>
                  )}
                  <div className="px-6 py-2 rounded-full bg-primary text-primary-foreground font-medium">
                    {form.watch('label')}
                  </div>
                  {form.watch('subtitle') && (
                    <span className="text-xs text-muted-foreground">{form.watch('subtitle')}</span>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="flex-1 gradient-primary text-primary-foreground"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
