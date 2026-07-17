// ADULT.2a — the 18+ confirmation modal.
//
// This is the generic gate for every public surface EXCEPT link cards, which
// carry their own in-card disclaimer (the Link.me pattern). The destination
// URL lives only in the caller's state and opens via window.open on confirm —
// it is never rendered as an href, so a crawler reading the DOM never sees it.
//
// Styling follows the canonical footer aesthetic: brand dark surface, gold
// primary, a muted secondary.

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { EyeOff } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';

interface AdultGateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AdultGateModal({ open, onOpenChange, onConfirm, onCancel }: AdultGateModalProps) {
  const { t } = useLanguage();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="dark max-w-[340px] rounded-2xl border border-white/10 bg-[#0e0c09] p-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#C9A55C]/15 border border-[#C9A55C]/30">
            <EyeOff className="h-7 w-7 text-[#C9A55C]" />
          </div>

          <AlertDialogTitle className="text-lg font-bold text-white">
            {t('adultGate.modalTitle')}
          </AlertDialogTitle>

          <AlertDialogDescription className="mt-2 text-sm leading-snug text-white/70">
            {t('adultGate.modalBody')}
          </AlertDialogDescription>

          <div className="mt-6 flex w-full flex-col gap-3">
            <Button
              onClick={onConfirm}
              className="h-12 w-full rounded-xl bg-[#C9A55C] font-semibold tracking-wide text-[#0e0c09] hover:bg-[#C9A55C]/90"
            >
              {t('adultGate.continue')}
            </Button>
            <Button
              type="button"
              onClick={onCancel}
              className="h-12 w-full rounded-xl border border-white/20 bg-white/10 font-semibold text-white hover:bg-white/20"
            >
              {t('adultGate.dismiss')}
            </Button>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
