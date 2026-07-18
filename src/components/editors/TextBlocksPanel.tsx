// TEXT.1 — standalone text blocks list panel.
//
// The dashboard "Heading & Text Boxes" row opens this list instead of a single
// editor. Each standalone text block is its own `blocks` row (type 'text'); the
// content lives in blocks.title as a TextConfig JSON (see text-block-config.ts).
// The list only manages the block rows (add / enable-toggle / delete); editing a
// block is delegated back up to the shared TextBlockEditor via onEdit(id), and
// public rendering + drag-reorder are already handled by EditableProfileView
// (each text block is an ordinary sortable block).

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Loader2, Type } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/hooks/useLanguage';
import { parseTextConfig, defaultTextConfig } from '@/lib/text-block-config';

interface TextBlockRow {
  id: string;
  title: string | null;
  is_enabled: boolean;
  order_index: number;
}

interface TextBlocksPanelProps {
  modeId: string | null;
  /** Refresh the live preview / parent block list after a mutation. */
  onRefresh: () => void;
  /** Open the shared TextBlockEditor for this block (two-level nav lives in the host). */
  onEdit: (blockId: string) => void;
}

export function TextBlocksPanel({ modeId, onRefresh, onEdit }: TextBlocksPanelProps) {
  const { t } = useLanguage();
  const [blocks, setBlocks] = useState<TextBlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchBlocks = useCallback(async () => {
    if (!modeId) { setBlocks([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('blocks')
        .select('id, title, is_enabled, order_index')
        .eq('mode_id', modeId)
        .eq('type', 'text')
        .order('order_index', { ascending: true });
      if (error) throw error;
      setBlocks((data as TextBlockRow[]) || []);
    } catch (err) {
      console.error('Error loading text blocks:', err);
      toast.error(t('textBlocks.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [modeId, t]);

  useEffect(() => { fetchBlocks(); }, [fetchBlocks]);

  // Preview label for a row: heading, else body, else the untitled placeholder.
  const rowLabel = (row: TextBlockRow) => {
    const cfg = parseTextConfig(row.title);
    const label = (cfg.heading || cfg.body).trim();
    return label || t('textBlocks.untitled');
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, is_enabled: enabled } : b)));
    const { error } = await supabase.from('blocks').update({ is_enabled: enabled }).eq('id', id);
    if (error) {
      setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, is_enabled: !enabled } : b)));
      toast.error(t('dashboard.couldNotSave'));
      return;
    }
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    try {
      // block_items is empty for text blocks, but clear it first for parity with
      // the app's other block-removal paths.
      await supabase.from('block_items').delete().eq('block_id', id);
      const { error } = await supabase.from('blocks').delete().eq('id', id);
      if (error) throw error;
      setConfirmDeleteId(null);
      setBlocks((prev) => prev.filter((b) => b.id !== id));
      onRefresh();
    } catch (err) {
      console.error('Error deleting text block:', err);
      toast.error(t('textBlocks.deleteFailed'));
    }
  };

  const handleAdd = async () => {
    if (!modeId || adding) return;
    setAdding(true);
    try {
      // Append after the last block of the mode (not just the last text block),
      // so a new text box lands at the end of the page's block order.
      const { data: all, error: fErr } = await supabase
        .from('blocks')
        .select('order_index')
        .eq('mode_id', modeId);
      if (fErr) throw fErr;
      const nextOrder = (all || []).reduce((max, b) => Math.max(max, b.order_index ?? 0), -1) + 1;
      const { data: created, error } = await supabase
        .from('blocks')
        .insert({
          mode_id: modeId,
          type: 'text',
          title: JSON.stringify(defaultTextConfig()),
          is_enabled: true,
          order_index: nextOrder,
        })
        .select('id')
        .single();
      if (error) throw error;
      onRefresh();
      onEdit(created.id);
    } catch (err) {
      console.error('Error adding text block:', err);
      toast.error(t('textBlocks.addFailed'));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col px-4 pt-4 pb-8">
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2">
          {blocks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/15 px-4 py-8 text-center">
              <Type className="h-6 w-6 text-white/30" />
              <p className="text-sm text-white/50">{t('textBlocks.empty')}</p>
            </div>
          ) : (
            blocks.map((row) => (
              <div key={row.id} className="rounded-2xl bg-white/5">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onEdit(row.id)}
                    className="flex flex-1 min-w-0 items-center gap-3 text-left"
                  >
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
                      <Type className="h-4 w-4 text-white/70" />
                    </div>
                    <p className={`min-w-0 flex-1 truncate text-sm font-semibold ${row.is_enabled ? 'text-white' : 'text-white/40'}`}>
                      {rowLabel(row)}
                    </p>
                  </button>
                  <Switch
                    checked={row.is_enabled}
                    onCheckedChange={(v) => handleToggle(row.id, v)}
                    aria-label={t('textBlocks.enabledLabel')}
                  />
                  <button
                    type="button"
                    onClick={() => onEdit(row.id)}
                    title={t('textBlocks.editTitle')}
                    className="flex-shrink-0 text-white/50 hover:text-white transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(confirmDeleteId === row.id ? null : row.id)}
                    title={t('textBlocks.delete')}
                    className="flex-shrink-0 text-destructive/80 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {confirmDeleteId === row.id && (
                  <div className="mx-3 mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                    <p className="mb-2 text-xs text-white/80">{t('textBlocks.deleteConfirm')}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="flex-1 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20"
                      >
                        {t('blockEditor.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row.id)}
                        className="flex-1 rounded-lg bg-destructive px-3 py-2 text-xs font-semibold text-white hover:bg-destructive/90"
                      >
                        {t('textBlocks.delete')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}

          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || !modeId}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 px-4 py-3 text-sm font-semibold text-white/80 transition-colors hover:bg-white/5 disabled:opacity-40"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t('textBlocks.add')}
          </button>
        </div>
      )}
    </div>
  );
}
