import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { LanguageToggle } from '@/components/LanguageToggle';
import { hreflangLinks, isEsPath, marketingUrl } from '@/lib/seo-marketing-html';
import { useAuth } from '@/hooks/useAuth';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { useLanguage } from '@/hooks/useLanguage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Mail, Lock, ArrowLeft, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { PENDING_TEMPLATE_KEY, TPL_PRESETS } from '@/lib/tpl-presets';
import { consumePendingCheckout, startCheckout } from '@/lib/billing';
import { claimPendingReferral } from '@/lib/referrals';
import { z } from 'zod';

/**
 * `page="signup"` (SEO.TITILINKS.MONEYPAGE.1) renders the signup MONEY page at
 * /signup (English) and /es/registro (Spanish): its own title, description,
 * canonical, h1 and single CTA, with the UI language pinned to the URL's
 * language so Google can serve each page on its own. Without the prop this is
 * the plain /login page, and /login?mode=signup keeps working as an alias.
 */
export default function Login({ page }: { page?: 'signup' } = {}) {
  const navigate = useNavigate();
  const { user, loading: authLoading, signIn, signUp, signInWithGoogle, resetPassword } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { onboardingComplete, isLoading: onboardingLoading } = useOnboardingStatus();
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();
  const moneyPage = page === 'signup';
  const pageLang = isEsPath(pathname) ? 'es' : 'en';
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(
    moneyPage || searchParams.get('mode') === 'signup' ? 'signup' : 'signin',
  );

  // The money page's copy is the URL's language, not the saved preference:
  // /signup is English and /es/registro is Spanish, each for its own index entry.
  useEffect(() => {
    if (moneyPage && language !== pageLang) setLanguage(pageLang);
  }, [moneyPage, pageLang, language, setLanguage]);
  const [showPassword, setShowPassword] = useState(false);
  const [offerSignup, setOfferSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const authSchema = z.object({
    email: z.string().email(t('login.validationEmail')),
    password: z.string().min(6, t('login.validationPassword')),
  });

  const emailSchema = z.object({
    email: z.string().email(t('login.validationEmail')),
  });

  // TPL.PAGE.1 — a ?template=<presetId> from the Templates page "Start with this
  // style" CTA is stashed for the post-signup Editor to apply. Validated against
  // the real preset ids so only a known template is ever queued.
  useEffect(() => {
    const id = searchParams.get('template');
    if (id && TPL_PRESETS.some((p) => p.id === id)) {
      try { localStorage.setItem(PENDING_TEMPLATE_KEY, id); } catch { /* storage disabled */ }
    }
  }, [searchParams]);

  // BILL.B1 — a checkout intent stashed by the pricing CTA before signup is
  // resumed HERE, at the auth boundary, so it survives the email-confirmation
  // round trip (the visitor lands back on /login and picks up where they left
  // off). One-shot: `consumePendingCheckout` clears the key as it reads it, and
  // this ref stops React's double-invoked effects from firing two sessions.
  const checkoutResumed = useRef(false);

  // BILL.B3 — offer any captured ?ref=<code> to claim_referral as soon as a
  // session exists. Fire-and-forget: the RPC is write-once (an established
  // account is a silent no-op) and attribution must never block or delay the
  // redirect. The server decides — it enforces the code's validity, the
  // no-self-referral rule and the fresh-signup window.
  const referralClaimed = useRef(false);

  useEffect(() => {
    if (!user || authLoading) return;
    if (referralClaimed.current) return;
    referralClaimed.current = true;
    void claimPendingReferral();
  }, [user, authLoading]);

  useEffect(() => {
    if (user && !authLoading && !onboardingLoading) {
      const resume = !checkoutResumed.current ? consumePendingCheckout() : null;
      if (resume) {
        checkoutResumed.current = true;
        void startCheckout(resume).then(({ error }) => {
          // Success navigates to Stripe and never gets here. On failure fall
          // through to the normal destination rather than trapping them on /login.
          if (error) navigate(onboardingComplete ? '/dashboard/editor' : '/onboarding');
        });
        return;
      }

      if (onboardingComplete) {
        // Existing account with a built page — a template browsed just now must
        // NOT overwrite it. Drop any pending handoff before entering the editor.
        try { localStorage.removeItem(PENDING_TEMPLATE_KEY); } catch { /* storage disabled */ }
        navigate('/dashboard/editor');
      } else {
        navigate('/onboarding');
      }
    }
  }, [user, authLoading, onboardingLoading, onboardingComplete, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = authSchema.safeParse({ email, password });
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error, confirmationRequired } = await signUp(email, password);
        if (error) {
          if (error.message.includes('already registered')) {
            setError(t('login.errorAlreadyRegistered'));
          } else {
            setError(error.message);
          }
        } else if (confirmationRequired) {
          setConfirmationSent(true);
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes('Invalid login credentials')) {
            setError(t('login.errorInvalidCredentials'));
            setOfferSignup(true);
          } else {
            setError(error.message);
            setOfferSignup(false);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = emailSchema.safeParse({ email });
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    setLoading(true);
    try {
      const { error } = await resetPassword(email);
      if (error) {
        setError(error.message);
      } else {
        setResetSent(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        setError(error.message);
      }
    } catch (err: any) {
      setError(err?.message || t('login.errorGoogleFailed'));
    } finally {
      setGoogleLoading(false);
    }
  };

  if (authLoading || (user && onboardingLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        {moneyPage && (
          <Helmet>
            <html lang={pageLang} />
            <title>{t('seo.signup.title')}</title>
            <meta name="description" content={t('seo.signup.desc')} />
            <link rel="canonical" href={marketingUrl('/signup', pageLang)} />
            {hreflangLinks('/signup').map((l) => (
              <link key={l.hreflang} rel="alternate" hrefLang={l.hreflang} href={l.href} />
            ))}
            <meta property="og:title" content={t('seo.signup.title')} />
            <meta property="og:description" content={t('seo.signup.desc')} />
            <meta property="og:url" content={marketingUrl('/signup', pageLang)} />
          </Helmet>
        )}
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link
            to={moneyPage && pageLang === 'es' ? '/es' : '/'}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('login.backToHome')}
          </Link>
          {moneyPage && <LanguageToggle />}
        </div>

        {moneyPage && (
          <header className="mb-6 text-center">
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
              {t('seo.signup.h1')}
            </h1>
            <p className="mt-3 text-base text-muted-foreground">{t('seo.signup.sub')}</p>
          </header>
        )}

        <Card className="border-border bg-card">
          {!moneyPage && (
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold gradient-text">
                {mode === 'forgot'
                  ? t('login.resetPassword')
                  : mode === 'signup'
                    ? t('login.createAccount')
                    : t('login.welcomeBack')}
              </CardTitle>
              <CardDescription>
                {mode === 'forgot'
                  ? t('login.resetSubtitle')
                  : mode === 'signup'
                    ? t('login.signUpSubtitle')
                    : t('login.signInSubtitle')}
              </CardDescription>
            </CardHeader>
          )}
          <CardContent className={moneyPage ? 'pt-6' : undefined}>
            {confirmationSent ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-4"
              >
                <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
                <p className="text-foreground font-medium mb-2">{t('login.checkYourEmail')}</p>
                <p className="text-sm text-muted-foreground mb-4">
                  {t('login.confirmationSent')} <span className="font-medium">{email}</span>.
                  {' '}{t('login.clickToActivate')}
                </p>
                <p className="text-xs text-muted-foreground mb-6">
                  {t('login.didntReceive')}
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      setLoading(true);
                      const { error } = await signUp(email, password);
                      setLoading(false);
                      if (error) {
                        setError(error.message);
                      }
                    }}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('login.resendConfirmation')}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setConfirmationSent(false);
                      setError(null);
                      // The money page never shows a sign-in form under its h1.
                      if (moneyPage) navigate('/login');
                      else setMode('signin');
                    }}
                  >
                    {t('login.backToSignIn')}
                  </Button>
                </div>
              </motion.div>
            ) : mode === 'forgot' ? (
              resetSent ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-4"
                >
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-foreground font-medium mb-2">{t('login.checkYourEmail')}</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t('login.resetSent')} <span className="font-medium">{email}</span>
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMode('signin');
                      setResetSent(false);
                      setEmail('');
                    }}
                  >
                    {t('login.backToSignIn')}
                  </Button>
                </motion.div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('login.emailLabel')}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder={t('login.emailPlaceholder')}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>

                  {error && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm text-destructive"
                    >
                      {error}
                    </motion.p>
                  )}

                  <Button
                    type="submit"
                    className="w-full gradient-primary text-primary-foreground"
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      t('login.sendResetLink')
                    )}
                  </Button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('signin');
                        setError(null);
                      }}
                      className="text-sm text-primary hover:underline font-medium"
                    >
                      {t('login.backToSignIn')}
                    </button>
                  </div>
                </form>
              )
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('login.emailLabel')}</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder={t('login.emailPlaceholder')}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">{t('login.passwordLabel')}</Label>
                      {mode === 'signin' && (
                        <button
                          type="button"
                          onClick={() => {
                            setMode('forgot');
                            setError(null);
                          }}
                          className="text-xs text-primary hover:underline"
                        >
                          {t('login.forgotPassword')}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder={t('login.passwordPlaceholder')}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm text-destructive"
                    >
                      {error}
                    </motion.p>
                  )}
                  {offerSignup && mode === 'signin' && (
                    <motion.button
                      type="button"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => {
                        setMode('signup');
                        setError(null);
                        setOfferSignup(false);
                      }}
                      className="text-sm text-primary hover:underline text-left"
                    >
                      {t('login.newHereCta')}
                    </motion.button>
                  )}

                  <Button
                    type="submit"
                    className="w-full gradient-primary text-primary-foreground"
                    disabled={loading || googleLoading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : mode === 'signup' ? (
                      moneyPage ? t('seo.signup.cta') : t('login.createAccount')
                    ) : (
                      t('login.signIn')
                    )}
                  </Button>

                  {moneyPage && (
                    // Trust strip: three claims the code backs (free tier in
                    // pricing.ts, no card at signup, bilingual pages). No stats.
                    <ul className="flex flex-col items-center gap-1.5 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-4">
                      {(['seo.signup.trust.free', 'seo.signup.trust.noCard', 'seo.signup.trust.bilingual'] as const).map((key) => (
                        <li key={key} className="inline-flex items-center gap-1.5">
                          <CheckCircle className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                          {t(key)}
                        </li>
                      ))}
                    </ul>
                  )}

                  {mode === 'signup' && (
                    <p className="text-center text-xs text-muted-foreground">
                      {t('login.legalPrefix')}
                      <Link to="/terms" className="text-primary hover:underline">
                        {t('footer.terms')}
                      </Link>
                      {t('login.legalConnector')}
                      <Link to="/privacy" className="text-primary hover:underline">
                        {t('footer.privacy')}
                      </Link>
                    </p>
                  )}
                </form>

                {!moneyPage && (
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">{t('login.orContinueWith')}</span>
                    </div>
                  </div>
                )}

                {/* On the money page the one primary CTA is the submit button
                    above; Google becomes a text link (variant="link"). */}
                <Button
                  type="button"
                  variant={moneyPage ? 'link' : 'outline'}
                  className={moneyPage ? 'mt-4 w-full text-foreground hover:text-primary' : 'w-full'}
                  onClick={handleGoogleSignIn}
                  disabled={loading || googleLoading}
                >
                  {googleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                        <path
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          fill="#4285F4"
                        />
                        <path
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          fill="#34A853"
                        />
                        <path
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                          fill="#FBBC05"
                        />
                        <path
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                          fill="#EA4335"
                        />
                      </svg>
                      {t('login.continueWithGoogle')}
                    </>
                  )}
                </Button>

                <div className="mt-6 text-center text-sm text-muted-foreground">
                  {mode === 'signup' ? (
                    <>
                      {t('login.alreadyHaveAccount')}{' '}
                      <button
                        type="button"
                        onClick={() => (moneyPage ? navigate('/login') : setMode('signin'))}
                        className="text-primary hover:underline font-medium"
                      >
                        {t('login.signIn')}
                      </button>
                    </>
                  ) : (
                    <>
                      {t('login.dontHaveAccount')}{' '}
                      <button
                        type="button"
                        onClick={() => setMode('signup')}
                        className="text-primary hover:underline font-medium"
                      >
                        {t('login.signUp')}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
