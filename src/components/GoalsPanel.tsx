import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Target, Loader2, Save } from 'lucide-react';
import { LinkTools } from '@/components/LinkTools';
import { useLanguage } from '@/hooks/useLanguage';
import type { Tables } from '@/integrations/supabase/types';

type BlockItem = Tables<'block_items'>;
type Page = Tables<'pages'>;

interface GoalsPanelProps {
  page: Page;
  onUpdate: () => void;
}

export function GoalsPanel({ page, onUpdate }: GoalsPanelProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<BlockItem[]>([]);
  const [primaryOfferId, setPrimaryOfferId] = useState<string | null>(page.goal_primary_offer_item_id);
  const [recruitId, setRecruitId] = useState<string | null>(page.goal_recruit_item_id);

  const baseUrl = `${window.location.protocol}//${window.location.host}`;

  const primaryOfferItem = useMemo(
    () => items.find((item) => item.id === primaryOfferId),
    [items, primaryOfferId]
  );

  const recruitItem = useMemo(
    () => items.find((item) => item.id === recruitId),
    [items, recruitId]
  );

  useEffect(() => {
    fetchItems();
  }, [page.id]);

  useEffect(() => {
    setPrimaryOfferId(page.goal_primary_offer_item_id);
    setRecruitId(page.goal_recruit_item_id);
  }, [page.goal_primary_offer_item_id, page.goal_recruit_item_id]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data: modes, error: modesError } = await supabase
        .from('modes')
        .select('id')
        .eq('page_id', page.id);

      if (modesError) throw modesError;

      if (!modes || modes.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const modeIds = modes.map((m) => m.id);

      const { data: blocks, error: blocksError } = await supabase
        .from('blocks')
        .select('id')
        .in('mode_id', modeIds);

      if (blocksError) throw blocksError;

      if (!blocks || blocks.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const blockIds = blocks.map((b) => b.id);

      const { data: itemsData, error: itemsError } = await supabase
        .from('block_items')
        .select('*')
        .in('block_id', blockIds)
        .order('label', { ascending: true });

      if (itemsError) throw itemsError;

      setItems(itemsData || []);
    } catch (error) {
      console.error('Error fetching items:', error);
      toast.error(t('goals.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('pages')
        .update({
          goal_primary_offer_item_id: primaryOfferId,
          goal_recruit_item_id: recruitId,
        })
        .eq('id', page.id);

      if (error) throw error;

      toast.success(t('goals.saved'));
      onUpdate();
    } catch (error: any) {
      console.error('Error saving goals:', error);
      toast.error(error.message || t('goals.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    primaryOfferId !== page.goal_primary_offer_item_id ||
    recruitId !== page.goal_recruit_item_id;

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-lg font-medium text-foreground flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          {t('goals.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="primary-offer" className="text-sm font-medium">
                {t('goals.primaryOffer')}
              </Label>
              <Select
                value={primaryOfferId || 'none'}
                onValueChange={(v) => setPrimaryOfferId(v === 'none' ? null : v)}
              >
                <SelectTrigger id="primary-offer" className="w-full">
                  <SelectValue placeholder={t('goals.selectItem')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('goals.noGoalSet')}</SelectItem>
                  {items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('goals.trackPrimary')}
              </p>
              {primaryOfferItem && (
                <div className="mt-2">
                  <LinkTools
                    baseUrl={baseUrl}
                    pageId={page.id}
                    destinationUrl={primaryOfferItem.url}
                    blockItemId={primaryOfferItem.id}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="recruit-goal" className="text-sm font-medium">
                {t('goals.page2Goal')}
              </Label>
              <Select
                value={recruitId || 'none'}
                onValueChange={(v) => setRecruitId(v === 'none' ? null : v)}
              >
                <SelectTrigger id="recruit-goal" className="w-full">
                  <SelectValue placeholder={t('goals.selectItem')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('goals.noGoalSet')}</SelectItem>
                  {items.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('goals.trackPage2')}
              </p>
              {recruitItem && (
                <div className="mt-2">
                  <LinkTools
                    baseUrl={baseUrl}
                    pageId={page.id}
                    destinationUrl={recruitItem.url}
                    blockItemId={recruitItem.id}
                  />
                </div>
              )}
            </div>

            {items.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">
                {t('goals.addItemsFirst')}
              </p>
            )}

            <div className="pt-2">
              <Button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                size="sm"
                className="gap-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t('goals.save')}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
