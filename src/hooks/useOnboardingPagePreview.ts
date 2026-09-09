import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { BlockWithItems } from '@/components/blocks/types';
import type { Tables } from '@/integrations/supabase/types';

/**
 * TL.ONB.STAGE.2 — READ-ONLY page loader for onboarding's desktop preview.
 *
 * Once step 3 has created the page, the phone should show the REAL rows rather
 * than the in-memory projection. This hook reads them and nothing else: no
 * inserts, no ensureDefaultBlocks, no autoPopulatePlaceholders. Those are the
 * editor's write paths and must never run from onboarding — the wizard's own
 * step handlers own every write it makes.
 *
 * `refreshKey` re-runs the read (onboarding passes the current step, so
 * advancing past a save picks up what that save wrote).
 */
export function useOnboardingPagePreview(pageId: string | null, refreshKey: number) {
  const [page, setPage] = useState<Tables<'pages'> | null>(null);
  const [blocks, setBlocks] = useState<BlockWithItems[]>([]);

  useEffect(() => {
    if (!pageId) {
      setPage(null);
      setBlocks([]);
      return;
    }
    let cancelled = false;

    const load = async () => {
      const { data: pageRow } = await supabase
        .from('pages')
        .select('*')
        .eq('id', pageId)
        .maybeSingle();

      if (cancelled) return;
      if (!pageRow) {
        setPage(null);
        setBlocks([]);
        return;
      }
      setPage(pageRow);

      const { data: modes } = await supabase
        .from('modes')
        .select('id')
        .eq('page_id', pageId)
        .eq('type', 'page1');

      if (cancelled) return;
      if (!modes || modes.length === 0) {
        setBlocks([]);
        return;
      }

      const { data: blockRows } = await supabase
        .from('blocks')
        .select('*')
        .eq('mode_id', modes[0].id)
        .order('order_index');

      if (cancelled) return;
      if (!blockRows || blockRows.length === 0) {
        setBlocks([]);
        return;
      }

      const { data: itemRows } = await supabase
        .from('block_items')
        .select('*')
        .in('block_id', blockRows.map((b) => b.id))
        .order('order_index');

      if (cancelled) return;
      setBlocks(blockRows.map((b) => ({
        ...b,
        items: (itemRows ?? []).filter((i) => i.block_id === b.id),
      })));
    };

    load();
    return () => { cancelled = true; };
  }, [pageId, refreshKey]);

  return { page, blocks };
}
