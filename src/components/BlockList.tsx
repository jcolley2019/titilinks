import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { supabase } from '@/integrations/supabase/client';
import { BlockItem } from './BlockItem';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

type Block = Tables<'blocks'>;

interface BlockListProps {
  modeId: string;
  onEditBlock: (blockId: string) => void;
}

export function BlockList({ modeId, onEditBlock }: BlockListProps) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchBlocks = async () => {
    try {
      const { data, error } = await supabase
        .from('blocks')
        .select('*')
        .eq('mode_id', modeId)
        .order('order_index', { ascending: true });

      if (error) throw error;
      setBlocks(data || []);
    } catch (error) {
      console.error('Error fetching blocks:', error);
      toast.error('Failed to load blocks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchBlocks();
  }, [modeId]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((block) => block.id === active.id);
      const newIndex = blocks.findIndex((block) => block.id === over.id);

      const newBlocks = arrayMove(blocks, oldIndex, newIndex);
      setBlocks(newBlocks);

      // Update order_index for all affected blocks
      try {
        const updates = newBlocks.map((block, index) => ({
          id: block.id,
          order_index: index,
          mode_id: block.mode_id,
          type: block.type,
          is_enabled: block.is_enabled,
        }));

        for (const update of updates) {
          const { error } = await supabase
            .from('blocks')
            .update({ order_index: update.order_index })
            .eq('id', update.id);

          if (error) throw error;
        }

        toast.success('Block order updated');
      } catch (error) {
        console.error('Error updating block order:', error);
        toast.error('Failed to update block order');
        fetchBlocks(); // Revert to original order
      }
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    // Optimistic update
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === id ? { ...block, is_enabled: enabled } : block
      )
    );

    try {
      const { error } = await supabase
        .from('blocks')
        .update({ is_enabled: enabled })
        .eq('id', id);

      if (error) throw error;
      toast.success(enabled ? 'Block enabled' : 'Block disabled');
    } catch (error) {
      console.error('Error toggling block:', error);
      toast.error('Failed to update block');
      fetchBlocks(); // Revert
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-20 bg-secondary/50 rounded-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No blocks found for this mode.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {blocks.map((block) => (
            <BlockItem
              key={block.id}
              block={block}
              onToggle={handleToggle}
              onEdit={onEditBlock}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
