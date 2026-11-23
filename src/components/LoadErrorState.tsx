import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/hooks/useLanguage';

/**
 * FRAGILE.ONB.1 — what a screen shows when a read it depends on FAILED (as
 * opposed to succeeding with "nothing there"). It never redirects: a failed
 * read is not an answer, so the user stays put and can Retry.
 *
 * FRAGILE.PUB.1a: `variant` picks who is reading. 'owner' (default) is the
 * signed-in creator — editor, ProtectedRoute — and talks about "your page".
 * 'visitor' is someone viewing a creator's public page, for whom "your page"
 * would be wrong.
 */
const COPY = {
  owner: { title: 'loadError.title', body: 'loadError.body' },
  visitor: { title: 'loadError.visitorTitle', body: 'loadError.visitorBody' },
} as const;

export function LoadErrorState({
  onRetry,
  retrying = false,
  className = 'min-h-screen',
  variant = 'owner',
}: {
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
  variant?: keyof typeof COPY;
}) {
  const { t } = useLanguage();
  const copy = COPY[variant];
  return (
    <div
      role="alert"
      data-testid="load-error-state"
      className={`${className} flex flex-col items-center justify-center gap-3 bg-background px-4 text-center`}
    >
      <p className="text-base font-semibold text-foreground">{t(copy.title)}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{t(copy.body)}</p>
      <Button onClick={onRetry} disabled={retrying} data-testid="load-error-retry" className="mt-1">
        {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {t('loadError.retry')}
      </Button>
    </div>
  );
}
