import { BlockEditorDialog } from '@/components/BlockEditorDialog';

interface BlockEditorContentProps {
  blockId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

/**
 * Phase 1: Thin wrapper around BlockEditorDialog.
 * Phase 2 will render editor content inline in a slide-out panel
 * instead of a dialog overlay.
 */
export function BlockEditorContent({ blockId, open, onOpenChange, onSave }: BlockEditorContentProps) {
  return (
    <BlockEditorDialog
      blockId={blockId}
      open={open}
      onOpenChange={onOpenChange}
      onSave={onSave}
    />
  );
}
