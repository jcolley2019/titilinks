import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

export default function CanvaConnect() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      navigate('/login?redirect=/api/canva/connect');
      return;
    }

    // Initiate Canva OAuth flow
    const initiateCanvaConnect = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('canva-connect');

        if (error) {
          console.error('Canva connect error:', error);
          setError(error.message || 'Failed to connect to Canva');
          return;
        }

        if (data?.authUrl) {
          // Redirect to Canva OAuth
          window.location.href = data.authUrl;
        } else {
          setError('No authorization URL received');
        }
      } catch (err) {
        console.error('Error initiating Canva connect:', err);
        setError('Failed to initiate Canva connection');
      }
    };

    initiateCanvaConnect();
  }, [user, authLoading, navigate]);

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-muted-foreground">Connecting to Canva...</p>
      </div>
    </div>
  );
}
