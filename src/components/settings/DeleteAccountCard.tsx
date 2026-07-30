// BILL.B4 / DELETE.1 — the danger zone.
//
// Its own component rather than more JSX in Settings.tsx: this is a self-contained
// irreversible flow with its own state machine, and mixing it into a page of
// toggles is how a destructive action ends up one stray click away.
//
// The gate is type-your-handle, not a yes/no confirm — a confirm dialog is
// muscle memory, typing your own handle is not. The handle is also re-checked by
// the edge function, so this is the ergonomics, not the safeguard.
//
// A modal Dialog is used (not AlertDialog) because the confirmation needs a text
// input. Deliberately NOT window.confirm: a native dialog would block the
// Playwright session outright.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/hooks/useLanguage';
import { supabase } from '@/integrations/supabase/client';
import { deleteAccount } from '@/lib/account';
import { toast } from '@/hooks/use-toast';

export function DeleteAccountCard() {
  const { t } = useLanguage();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [handle, setHandle] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);

  // One handle per account (pages.handle) — same source the QR tool and the
  // dashboard public link use.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('pages')
        .select('handle')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!cancelled) setHandle(data?.handle ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // An account with no page has no handle to type; the server accepts the literal
  // 'delete' in that case, so the UI must ask for exactly that.
  const expected = handle ?? 'delete';
  const matches = typed.trim().toLowerCase() === expected.toLowerCase();

  const handleDelete = async () => {
    if (!matches) return;
    setDeleting(true);

    const { deleted, warnings, error } = await deleteAccount(typed.trim());

    if (!deleted) {
      setDeleting(false);
      toast({
        title: t('danger.failed'),
        description: error ?? undefined,
        variant: 'destructive',
      });
      return;
    }

    if (warnings.length) console.warn('[delete-account] leftovers:', warnings);

    // The auth user is gone, so the session is already void — sign out to clear
    // the local copy, then land on a page that does not require one.
    await signOut().catch(() => {
      /* nothing left to sign out of */
    });
    navigate('/goodbye', { replace: true });
  };

  return (
    <>
      <Card className="border-destructive/40 bg-card" data-testid="danger-zone">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {t('danger.title')}
          </CardTitle>
          <CardDescription>{t('danger.desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t('danger.itemPage')}</li>
            <li>{t('danger.itemData')}</li>
            <li>{t('danger.itemSubscription')}</li>
            <li>{t('danger.itemHandle')}</li>
          </ul>
          <Button
            variant="destructive"
            onClick={() => {
              setTyped('');
              setOpen(true);
            }}
            data-testid="danger-open"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t('danger.button')}
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Never let the modal close mid-request.
          if (deleting) return;
          setOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-md" data-testid="danger-dialog">
          <DialogHeader>
            <DialogTitle className="text-destructive">{t('danger.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('danger.dialogBody')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="confirm-handle">
              {t('danger.confirmLabel')} <span className="font-mono font-semibold">{expected}</span>
            </Label>
            <Input
              id="confirm-handle"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={expected}
              autoComplete="off"
              spellCheck={false}
              disabled={deleting}
              data-testid="danger-confirm-input"
            />
            {typed.length > 0 && !matches && (
              <p className="text-xs text-destructive" data-testid="danger-mismatch">
                {t('danger.mismatch')}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={deleting}
              data-testid="danger-cancel"
            >
              {t('danger.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!matches || deleting}
              data-testid="danger-confirm"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleting ? t('danger.deleting') : t('danger.confirmButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
