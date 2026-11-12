import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/hooks/useLanguage';

/**
 * FRAGILE.ONB.1 — what a signed-in screen shows when a read it depends on
 * FAILED (as opposed to succeeding with "nothing there"). It never redirects:
 * a failed read is not an answer, so the user stays put and can Retry.
 */
export function LoadErrorState({
  onRetry,
  retrying = false,
  className = 'min-h-screen',
}: {
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}) {
  const { t } = useLanguage();
  return (
    <div
      role="alert"
      data-testid="load-error-state"
      className={`${className} flex flex-col items-center justify-center gap-3 bg-background px-4 text-center`}
    >
      <p className="text-base font-semibold text-foreground">{t('loadError.title')}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{t('loadError.body')}</p>
      <Button onClick={onRetry} disabled={retrying} data-testid="load-error-retry" className="mt-1">
        {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {t('loadError.retry')}
      </Button>
    </div>
  );
}
