import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";

export default function ShortLinkRedirect() {
  const { code } = useParams<{ code: string }>();
  const { t } = useLanguage();
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setNotFound(true);
      return;
    }

    const resolveAndRedirect = async () => {
      try {
        const referrer = document.referrer || null;
        const userAgent = navigator.userAgent || null;

        const { data, error: rpcError } = await supabase.rpc("resolve_short_link", {
          p_code: code,
          p_referrer: referrer,
          p_user_agent: userAgent,
        });

        if (rpcError) {
          console.error("RPC error:", rpcError);
          setError(t('shortLink.failedResolve'));
          return;
        }

        // RPC returns an array of rows
        if (!data || data.length === 0) {
          setNotFound(true);
          return;
        }

        const destinationUrl = data[0].destination_url;
        if (destinationUrl) {
          // Perform 302-style redirect
          window.location.href = destinationUrl;
        } else {
          setNotFound(true);
        }
      } catch (err) {
        console.error("Unexpected error:", err);
        setError(t('shortLink.somethingWrong'));
      }
    };

    resolveAndRedirect();
  }, [code]);

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-foreground">404</h1>
          <p className="text-muted-foreground">{t('shortLink.notFound')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-foreground">{t('shortLink.error')}</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
        <p className="text-muted-foreground">{t('shortLink.redirecting')}</p>
      </div>
    </div>
  );
}
