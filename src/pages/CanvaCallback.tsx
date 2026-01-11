import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function CanvaCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // This page handles the redirect from Canva OAuth
    // The actual token exchange happens in the edge function
    // This page just shows a loading state while the edge function processes

    const canvaStatus = searchParams.get('canva');
    const message = searchParams.get('message');

    if (canvaStatus === 'connected') {
      navigate('/dashboard/editor?tab=design&canva=connected');
    } else if (canvaStatus === 'error') {
      navigate(`/dashboard/editor?tab=design&canva=error&message=${encodeURIComponent(message || 'Unknown error')}`);
    }
    
    // If we're here without status params, the edge function will redirect us
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="text-muted-foreground">Completing Canva connection...</p>
      </div>
    </div>
  );
}
