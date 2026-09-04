import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { LanguageProvider } from "@/hooks/useLanguage";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ReferralCapture } from "@/components/ReferralCapture";
import Index from "./pages/Index";
import Login from "./pages/Login";
import SlugRedirect from "./pages/SlugRedirect";
import BillingSuccess from "./pages/BillingSuccess";
import Goodbye from "./pages/Goodbye";
import AdultLinkHop from "./pages/AdultLinkHop";
import PublicProfile from "./pages/PublicProfile";
import NotFound from "./pages/NotFound";

// TL.BUNDLE.1 (AUDIT_rev6 #13): route-level code splitting. Every page used to
// ride in ONE 3.4 MB chunk, so a visitor to /:handle downloaded the editor, the
// dashboard, onboarding and the templates gallery to look at a link page. The
// public profile and the landing page stay eager — they ARE the first paint;
// everything behind a login, plus templates and the legal pages, loads on its
// first navigation. face-api left the eager graph the same night (see
// loadFaceApi in EditableProfileView.tsx).
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Editor = lazy(() => import("./pages/Editor"));
const Analytics = lazy(() => import("./pages/Analytics"));
const QRCodePage = lazy(() => import("./pages/QRCode"));
const ShortLinks = lazy(() => import("./pages/ShortLinks"));
const Settings = lazy(() => import("./pages/Settings"));
const Upgrade = lazy(() => import("./pages/Upgrade"));
const OnboardingFlow = lazy(() => import("./pages/OnboardingFlow"));
const Templates = lazy(() => import("./pages/Templates"));
const LegalPage = lazy(() => import("./pages/LegalPage"));

// Suspense fallback while a lazy route's chunk downloads: a neutral full-height
// block — no spinner, nothing to shift. It never shows on the public page or
// the landing page, which are eager.
const RouteFallback = () => <div className="min-h-screen" aria-busy="true" />;

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <AuthProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          {/* BILL.B3 — stashes ?ref=<code> on any route; renders nothing. */}
          <ReferralCapture />
          <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <OnboardingFlow />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/editor"
              element={
                <ProtectedRoute>
                  <Editor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/analytics"
              element={
                <ProtectedRoute>
                  <Analytics />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/qr"
              element={
                <ProtectedRoute>
                  <QRCodePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/short-links"
              element={
                <ProtectedRoute>
                  <ShortLinks />
                </ProtectedRoute>
              }
            />
            {/* UPGRADE.1 — in-app Pro pitch; paid plans get the portal handoff */}
            <Route
              path="/dashboard/upgrade"
              element={
                <ProtectedRoute>
                  <Upgrade />
                </ProtectedRoute>
              }
            />
            <Route path="/dashboard/setup" element={<Navigate to="/dashboard/editor" replace />} />
            <Route path="/dashboard/ai-setup" element={<Navigate to="/dashboard/editor" replace />} />
            <Route
              path="/dashboard/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/billing/success"
              element={
                <ProtectedRoute>
                  <BillingSuccess />
                </ProtectedRoute>
              }
            />
            {/* Public: the auth user is already gone by the time anyone lands here. */}
            <Route path="/goodbye" element={<Goodbye />} />
            <Route path="/s/:slug" element={<SlugRedirect />} />
            <Route path="/go/:itemId" element={<AdultLinkHop />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/terms" element={<LegalPage doc="terms" />} />
            <Route path="/privacy" element={<LegalPage doc="privacy" />} />
            <Route path="/:handle" element={<PublicProfile />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
      </ThemeProvider>
    </AuthProvider>
  </LanguageProvider>
  </QueryClientProvider>
);

export default App;
