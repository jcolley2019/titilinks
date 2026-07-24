import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/useLanguage';
import { Button } from '@/components/ui/button';

/** SHORT.1 — /s/:slug custom short-link redirect (v1, client-side).
 *
 *  Resolves the slug through the `resolve_short_link_by_slug` security-definer
 *  RPC (which atomically counts the click and returns the destination), then
 *  replaces the history entry with the target so Back skips this hop.
 *
 *  v2 will serve a real 301 from an edge function (ships with the BILL infra
 *  work) for SEO + speed; this client redirect is the interim. */
export default function SlugRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useLanguage();
  const [state, setState] = useState<'loading' | 'notfound' | 'error'>('loading');

  useEffect(() => {
    if (!slug) {
      setState('notfound');
      return;
    }
    let active = true;
    (async () => {
      const { data, error } = await supabase.rpc('resolve_short_link_by_slug', { p_slug: slug });
      if (!active) return;
      if (error) {
        console.error('resolve_short_link_by_slug error:', error);
        setState('error');
        return;
      }
      const target = typeof data === 'string' && data ? data : null;
      if (target) {
        window.location.replace(target);
      } else {
        setState('notfound');
      }
    })();
    return () => {
      active = false;
    };
  }, [slug]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground">{t('slugRedirect.redirecting')}</p>
        </div>
      </div>
    );
  }

  // Miss or error → friendly 404 with a signup CTA.
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="text-center space-y-4 max-w-sm">
        <h1 className="text-5xl font-bold text-foreground">404</h1>
        <p className="text-muted-foreground">
          {state === 'error' ? t('slugRedirect.error') : t('slugRedirect.notFound')}
        </p>
        <Button asChild className="mt-2">
          <Link to="/login">{t('slugRedirect.cta')}</Link>
        </Button>
        <p className="text-xs text-muted-foreground">{t('slugRedirect.ctaSub')}</p>
      </div>
    </div>
  );
}
