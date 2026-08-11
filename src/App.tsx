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
import Editor from "./pages/Editor";
import Analytics from "./pages/Analytics";
import QRCodePage from "./pages/QRCode";
import Settings from "./pages/Settings";
import ShortLinkRedirect from "./pages/ShortLinkRedirect";
import SlugRedirect from "./pages/SlugRedirect";
import ShortLinks from "./pages/ShortLinks";
import Upgrade from "./pages/Upgrade";
import BillingSuccess from "./pages/BillingSuccess";
import Goodbye from "./pages/Goodbye";
import AdultLinkHop from "./pages/AdultLinkHop";
import PublicProfile from "./pages/PublicProfile";
import LegalPage from "./pages/LegalPage";
import Templates from "./pages/Templates";
import OnboardingFlow from "./pages/OnboardingFlow";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";

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
            <Route path="/l/:code" element={<ShortLinkRedirect />} />
            <Route path="/s/:slug" element={<SlugRedirect />} />
            <Route path="/go/:itemId" element={<AdultLinkHop />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/terms" element={<LegalPage doc="terms" />} />
            <Route path="/privacy" element={<LegalPage doc="privacy" />} />
            <Route path="/:handle" element={<PublicProfile />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </ThemeProvider>
    </AuthProvider>
  </LanguageProvider>
  </QueryClientProvider>
);

export default App;
