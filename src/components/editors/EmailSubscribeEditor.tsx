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
import { Loader2, Mail, Check, Lock } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { useEntitlements } from '@/hooks/useEntitlements';
import { translateContent } from '@/lib/content-i18n';
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
  title: '',
  placeholder: '',
  button_label: '',
  success_message: '',
  redirect_url: '',
  collect_name: false,
  name_placeholder: '',
};

interface EmailSubscribeEditorProps {
  blockId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  panelMode?: boolean;
}

export function EmailSubscribeEditor({ blockId, open, onOpenChange, onSave, panelMode }: EmailSubscribeEditorProps) {
  const { t } = useLanguage();
  // ES.FIX.1 STEP 3: the live preview mirrors EmailSubscribeBlock — each stored
  // config value routes through content-i18n. Input fields keep raw values.
  const tc = (text: string | null | undefined) => translateContent(text, t);
  const { can } = useEntitlements();
  const canEmailSubscribe = can('emailSubscribe');
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
      toast.error(t('emailSubscribeEditor.loadFailed'));
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

      toast.success(t('emailSubscribeEditor.saveSuccess'));
      onSave?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving:', error);
      toast.error(error.message || t('emailSubscribeEditor.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const innerContent = (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-5 py-4">
          {!canEmailSubscribe && (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-primary" />
              <span>{t('emailSubscribeEditor.freeNotice')}</span>
            </div>
          )}
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">{t('emailSubscribeEditor.titleLabel')}</Label>
            <Input
              id="title"
              value={config.title}
              onChange={(e) => setConfig({ ...config, title: e.target.value })}
              placeholder={t('emailSubscribeEditor.titlePlaceholder')}
              maxLength={100}
            />
          </div>

          {/* Collect Name Toggle */}
          <div className="flex items-center justify-between py-2 px-3 rounded-lg border border-border bg-muted/30">
            <div>
              <Label htmlFor="collect-name">{t('emailSubscribeEditor.collectName')}</Label>
              <p className="text-xs text-muted-foreground">
                {t('emailSubscribeEditor.collectNameHint')}
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
              <Label htmlFor="name-placeholder">{t('emailSubscribeEditor.namePlaceholderLabel')}</Label>
              <Input
                id="name-placeholder"
                value={config.name_placeholder}
                onChange={(e) => setConfig({ ...config, name_placeholder: e.target.value })}
                placeholder={t('emailSubscribeEditor.namePlaceholder')}
                maxLength={50}
              />
            </div>
          )}

          {/* Email Placeholder */}
          <div className="space-y-2">
            <Label htmlFor="placeholder">{t('emailSubscribeEditor.emailPlaceholderLabel')}</Label>
            <Input
              id="placeholder"
              value={config.placeholder}
              onChange={(e) => setConfig({ ...config, placeholder: e.target.value })}
              placeholder={t('emailSubscribeEditor.emailPlaceholder')}
              maxLength={50}
            />
          </div>

          {/* Button Label */}
          <div className="space-y-2">
            <Label htmlFor="button-label">{t('emailSubscribeEditor.buttonLabel')}</Label>
            <Input
              id="button-label"
              value={config.button_label}
              onChange={(e) => setConfig({ ...config, button_label: e.target.value })}
              placeholder={t('emailSubscribeEditor.subscribe')}
              maxLength={30}
            />
          </div>

          {/* Success Message */}
          <div className="space-y-2">
            <Label htmlFor="success-message">{t('emailSubscribeEditor.successMessageLabel')}</Label>
            <Textarea
              id="success-message"
              value={config.success_message}
              onChange={(e) => setConfig({ ...config, success_message: e.target.value })}
              placeholder={t('emailSubscribeEditor.successMessagePlaceholder')}
              maxLength={200}
              rows={2}
            />
          </div>

          {/* Redirect URL */}
          <div className="space-y-2">
            <Label htmlFor="redirect-url">{t('emailSubscribeEditor.redirectUrl')}</Label>
            <Input
              id="redirect-url"
              value={config.redirect_url}
              onChange={(e) => setConfig({ ...config, redirect_url: e.target.value })}
              placeholder="https://..."
              type="url"
            />
            <p className="text-xs text-muted-foreground">
              {t('emailSubscribeEditor.redirectUrlHint')}
            </p>
          </div>

          {/* Live Preview */}
          <div className="space-y-2 pt-4 border-t border-border">
            <Label>{t('emailSubscribeEditor.preview')}</Label>
            <div className="p-4 rounded-xl bg-muted/50 border border-border">
              {config.title && (
                <p className="text-sm font-medium text-center mb-3">{tc(config.title)}</p>
              )}
              <div className={cn(
                'flex gap-2',
                config.collect_name ? 'flex-col' : 'flex-row'
              )}>
                {config.collect_name && (
                  <Input
                    placeholder={tc(config.name_placeholder) || t('emailSubscribeEditor.namePlaceholder')}
                    className="h-10"
                    disabled
                  />
                )}
                <div className="flex gap-2 flex-1">
                  <Input
                    placeholder={tc(config.placeholder) || t('emailSubscribeEditor.emailPlaceholder')}
                    className="h-10 flex-1"
                    disabled
                  />
                  <Button className="h-10 px-4" disabled>
                    {tc(config.button_label) || t('emailSubscribeEditor.subscribe')}
                  </Button>
                </div>
              </div>
            </div>

            {/* Success State Preview */}
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30">
              <div className="flex items-center justify-center gap-2 text-green-600">
                <Check className="h-5 w-5" />
                <p className="text-sm font-medium">{tc(config.success_message) || t('emailSubscribeEditor.successMessagePlaceholder')}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer — pinned to the bottom of the panel while content scrolls. */}
      <div className="sticky bottom-0 z-10 mt-auto flex gap-3 -mx-4 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/10 bg-[#0e0c09]">
        <Button
          onClick={() => onOpenChange(false)}
          className="flex-1 h-12 rounded-xl bg-white/10 text-white border border-white/20 hover:bg-white/20"
        >
          {t('blockEditor.cancel')}
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex-1 h-12 rounded-xl bg-[#C9A55C] text-black font-semibold hover:bg-[#C9A55C]/90 disabled:opacity-40"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('blockEditor.saving')}
            </>
          ) : (
            t('blockEditor.save')
          )}
        </Button>
      </div>
    </>
  );

  if (panelMode) {
    return (
      <div className="flex flex-1 flex-col bg-[#0e0c09] text-white px-4 pt-4">
        {innerContent}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            {t('emailSubscribeEditor.dialogTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('emailSubscribeEditor.dialogDescription')}
          </DialogDescription>
        </DialogHeader>
        {innerContent}
      </DialogContent>
    </Dialog>
  );
}
