import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

function getIsInIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export default function CanvaConnect() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);

  const isInIframe = useMemo(() => getIsInIframe(), []);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      navigate('/login?redirect=/api/canva/connect');
      return;
    }

    // Initiate Canva OAuth flow
    const initiateCanvaConnect = async () => {
      try {
        // Pass the current origin so the callback knows where to redirect
        const { data, error } = await supabase.functions.invoke('canva-connect', {
          body: { redirectOrigin: window.location.origin }
        });

        if (error) {
          console.error('Canva connect error:', error);
          setError(error.message || 'Failed to connect to Canva');
          return;
        }

        if (data?.authUrl) {
          // In the Lovable preview, the app runs inside an iframe.
          // Canva blocks being embedded and the iframe is not allowed to navigate the top frame.
          // So we show a button that opens Canva in a new tab.
          if (isInIframe) {
            setAuthUrl(data.authUrl);
            return;
          }

          // Normal (non-iframe) navigation
          window.location.assign(data.authUrl);
        } else {
          setError('No authorization URL received');
        }
      } catch (err) {
        console.error('Error initiating Canva connect:', err);
        setError('Failed to initiate Canva connection');
      }
    };

    initiateCanvaConnect();
  }, [user, authLoading, navigate, isInIframe]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md px-4">
          <h1 className="text-xl font-semibold text-destructive">Connection Failed</h1>
          <p className="text-muted-foreground">{error}</p>
          <button
            onClick={() => navigate('/dashboard/editor?tab=design')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Return to Editor
          </button>
        </div>
      </div>
    );
  }

  if (authUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md px-4">
          <h1 className="text-xl font-semibold">Continue to Canva</h1>
          <p className="text-muted-foreground">
            Your preview runs inside an embedded frame, so Canva must be opened in a new tab.
          </p>
          <a
            href={authUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          >
            Open Canva Authorization
          </a>
          <div>
            <button
              onClick={() => navigate('/dashboard/editor?tab=design')}
              className="text-sm text-muted-foreground underline underline-offset-4"
            >
              Back to Editor
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-muted-foreground">Connecting to Canva...</p>
      </div>
    </div>
  );
}
