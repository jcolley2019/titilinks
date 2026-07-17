// ADULT.2b — the /go interstitial.
//
// Why this exists: a gated destination must be unreachable by anything that
// reads rather than clicks. ADULT.2a already keeps the URL out of the page's
// DOM; this keeps it out of the LINK ITSELF. The gate's Continue sends the
// visitor to /go/:itemId — an opaque id, never the destination in a path,
// query, or hash — and the URL is resolved client-side only after the page
// has loaded and run JS.
//
// Deliberately NOT a server-side 30x: a redirect would put the adult URL in a
// Location header, which is exactly the artifact a crawler follows and logs
// without executing a line of JS. The forward happens in the browser via
// location.replace, so the hop leaves no history entry — Back from the
// destination returns to the profile, not to a redirect loop.
//
// The app ships as an SPA shell with no prerender step, so the served HTML for
// /go/:itemId is the same shell every route gets: it contains no destination.
// robots.txt disallows /go/ and this page mounts <meta name="robots"
// noindex> while it lives, removing it on unmount so no other route inherits it.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/hooks/useLanguage';
import { readHopDestination, clearHopDestination } from '@/lib/adult-gate';

// A beat long enough for the neutral frame to paint, so the hop reads as a
// deliberate step rather than a flash of unstyled nothing.
const HOP_DELAY_MS = 400;

export default function AdultLinkHop() {
  const { itemId } = useParams<{ itemId: string }>();
  const { t } = useLanguage();
  const [failed, setFailed] = useState(false);

  // noindex for as long as this route is mounted.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  useEffect(() => {
    if (!itemId) {
      setFailed(true);
      return;
    }
    let cancelled = false;

    const resolveAndForward = async () => {
      // The gate stashes the destination on its way out, which covers ids that
      // are not block_items (a section's view_all_url lives in block config).
      let url = readHopDestination(itemId);

      if (!url) {
        // Anon SELECT on block_items is USING (true) — the same read that lets
        // a public page render its links at all — so a real item id resolves
        // client-side. This is also the path a pasted /go link takes, where no
        // handoff exists.
        const { data, error } = await supabase
          .from('block_items')
          .select('url')
          .eq('id', itemId)
          .maybeSingle();
        if (!error && data?.url) url = data.url;
      }

      if (cancelled) return;
      if (!url) {
        setFailed(true);
        return;
      }
      clearHopDestination(itemId);
      // replace, not assign: the hop must not sit in the back stack.
      window.location.replace(url);
    };

    const timer = window.setTimeout(resolveAndForward, HOP_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [itemId]);

  return (
    <div className="dark flex min-h-screen items-center justify-center bg-[#0e0c09] px-6">
      <div className="flex flex-col items-center text-center">
        {!failed && (
          <div
            className="mb-5 h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-[#C9A55C]"
            aria-hidden="true"
          />
        )}
        <p className="text-sm font-medium tracking-wide text-white/80">
          {failed ? t('adultGate.hopFailed') : t('adultGate.hopTitle')}
        </p>
      </div>
    </div>
  );
}
