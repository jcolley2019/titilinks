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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Mail, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmailSubscribeConfig {
  title: string;
  placeholder: string;
  button_label: string;
  success_message: string;
  redirect_url: string;
  collect_name: boolean;
  name_placeholder: string;
}

const DEFAULT_CONFIG: EmailSubscribeConfig = {
  title: 'Stay up to date',
  placeholder: 'your@email.com',
  button_label: 'Subscribe',
  success_message: 'Thanks for subscribing! 🎉',
  redirect_url: '',
  collect_name: false,
  name_placeholder: 'Your name',
};

interface EmailSubscribeEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

export function EmailSubscribeEditor({ blockId, open, onOpenChange, onSave }: EmailSubscribeEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<EmailSubscribeConfig>(DEFAULT_CONFIG);
  const [existingItemId, setExistingItemId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, blockId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('block_items')
        .select('*')
        .eq('block_id', blockId)
        .order('order_index', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setExistingItemId(data.id);
        // Parse config from badge field
        if (data.badge) {
          try {
            const parsed = JSON.parse(data.badge);
            setConfig({ ...DEFAULT_CONFIG, ...parsed });
          } catch {
            setConfig(DEFAULT_CONFIG);
          }
        }
      } else {
        setExistingItemId(null);
        setConfig(DEFAULT_CONFIG);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const itemData = {
        block_id: blockId,
        label: config.title || 'Email Subscribe',
        subtitle: config.success_message,
        url: config.redirect_url || '#',
        badge: JSON.stringify(config),
        order_index: 0,
      };

      if (existingItemId) {
        const { error } = await supabase
          .from('block_items')
          .update(itemData)
          .eq('id', existingItemId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('block_items')
          .insert(itemData);
        if (error) throw error;
      }

      toast.success('Email subscribe block saved');
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving:', error);
      toast.error(error.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Edit Email Subscribe
          </DialogTitle>
          <DialogDescription>
            Collect email subscribers from your page visitors.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-5 py-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={config.title}
                onChange={(e) => setConfig({ ...config, title: e.target.value })}
                placeholder="Stay up to date"
                maxLength={100}
              />
            </div>

            {/* Collect Name Toggle */}
            <div className="flex items-center justify-between py-2 px-3 rounded-lg border border-border bg-muted/30">
              <div>
                <Label htmlFor="collect-name">Collect Name</Label>
                <p className="text-xs text-muted-foreground">
                  Add a name field before email
                </p>
              </div>
              <Switch
                id="collect-name"
                checked={config.collect_name}
                onCheckedChange={(checked) => setConfig({ ...config, collect_name: checked })}
              />
            </div>

            {/* Name Placeholder (if enabled) */}
            {config.collect_name && (
              <div className="space-y-2">
                <Label htmlFor="name-placeholder">Name Placeholder</Label>
                <Input
                  id="name-placeholder"
                  value={config.name_placeholder}
                  onChange={(e) => setConfig({ ...config, name_placeholder: e.target.value })}
                  placeholder="Your name"
                  maxLength={50}
                />
              </div>
            )}

            {/* Email Placeholder */}
            <div className="space-y-2">
              <Label htmlFor="placeholder">Email Placeholder</Label>
              <Input
                id="placeholder"
                value={config.placeholder}
                onChange={(e) => setConfig({ ...config, placeholder: e.target.value })}
                placeholder="your@email.com"
                maxLength={50}
              />
            </div>

            {/* Button Label */}
            <div className="space-y-2">
              <Label htmlFor="button-label">Button Label</Label>
              <Input
                id="button-label"
                value={config.button_label}
                onChange={(e) => setConfig({ ...config, button_label: e.target.value })}
                placeholder="Subscribe"
                maxLength={30}
              />
            </div>

            {/* Success Message */}
            <div className="space-y-2">
              <Label htmlFor="success-message">Success Message</Label>
              <Textarea
                id="success-message"
                value={config.success_message}
                onChange={(e) => setConfig({ ...config, success_message: e.target.value })}
                placeholder="Thanks for subscribing! 🎉"
                maxLength={200}
                rows={2}
              />
            </div>

            {/* Redirect URL */}
            <div className="space-y-2">
              <Label htmlFor="redirect-url">Redirect URL (optional)</Label>
              <Input
                id="redirect-url"
                value={config.redirect_url}
                onChange={(e) => setConfig({ ...config, redirect_url: e.target.value })}
                placeholder="https://..."
                type="url"
              />
              <p className="text-xs text-muted-foreground">
                Redirect to this URL after successful subscription
              </p>
            </div>

            {/* Live Preview */}
            <div className="space-y-2 pt-4 border-t border-border">
              <Label>Preview</Label>
              <div className="p-4 rounded-xl bg-muted/50 border border-border">
                {config.title && (
                  <p className="text-sm font-medium text-center mb-3">{config.title}</p>
                )}
                <div className={cn(
                  'flex gap-2',
                  config.collect_name ? 'flex-col' : 'flex-row'
                )}>
                  {config.collect_name && (
                    <Input
                      placeholder={config.name_placeholder}
                      className="h-10"
                      disabled
                    />
                  )}
                  <div className="flex gap-2 flex-1">
                    <Input
                      placeholder={config.placeholder}
                      className="h-10 flex-1"
                      disabled
                    />
                    <Button className="h-10 px-4" disabled>
                      {config.button_label}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Success State Preview */}
              <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30">
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <Check className="h-5 w-5" />
                  <p className="text-sm font-medium">{config.success_message}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
