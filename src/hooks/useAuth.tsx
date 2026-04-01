import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null; confirmationRequired: boolean }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));

    // Detect OAuth callback — PKCE uses ?code= in query params,
    // implicit uses #access_token= in hash
    const isOAuthCallback =
      hashParams.has('access_token') ||
      params.has('code');

    // Detect OAuth error redirect from Supabase
    const oauthError = params.get('error') || hashParams.get('error');
    if (oauthError) {
      console.error('OAuth error:', oauthError, params.get('error_description') || hashParams.get('error_description'));
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[Auth]', event, session ? 'session exists' : 'no session');
        if (isOAuthCallback && !session && event === 'INITIAL_SESSION') {
          // OAuth tokens are still being exchanged — keep loading
          return;
        }
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // For OAuth callbacks, let onAuthStateChange handle everything.
    // For normal page loads, also call getSession as a fallback.
    if (!isOAuthCallback) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      });
    }

    // Fallback: if OAuth token exchange fails, stop loading after 8s
    // and try getSession as a last resort
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (isOAuthCallback) {
      timeout = setTimeout(() => {
        console.warn('[Auth] OAuth callback timeout — falling back to getSession');
        supabase.auth.getSession().then(({ data: { session } }) => {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
        });
      }, 8000);
    }

    return () => {
      subscription.unsubscribe();
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`
      }
    });
    // When email confirmations are enabled in Supabase, signUp returns
    // a user but no session. The user must click the email link first.
    const confirmationRequired = !error && !!data.user && !data.session;
    return { error: error as Error | null, confirmationRequired };
  };

  const signInWithGoogle = async () => {
    // Redirect to /login (unprotected) so ProtectedRoute won't interfere
    // with the PKCE code exchange. Login page auto-redirects to /dashboard
    // once the session is established.
    const redirectTo = window.location.origin + '/login';

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          prompt: 'select_account',
        },
      }
    });

    return { error: error as Error | null };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login?reset=true`,
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signInWithGoogle, resetPassword, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}