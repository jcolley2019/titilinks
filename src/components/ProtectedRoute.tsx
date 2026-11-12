import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { LoadErrorState } from '@/components/LoadErrorState';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { status, isRetrying, retry } = useOnboardingStatus();

  if (loading || (user && status === 'loading')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // FRAGILE.ONB.1 — a failed read is not "not onboarded". Stay here with Retry.
  if (status === 'error') {
    return <LoadErrorState onRetry={retry} retrying={isRetrying} />;
  }

  // Only a SUCCESSFUL read saying onboarding is incomplete may redirect.
  if (status === 'incomplete' && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
