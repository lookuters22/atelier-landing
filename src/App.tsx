import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { FourPaneLayout } from "./layouts/FourPaneLayout";
import { LoginPage } from "./pages/LoginPage";

import { SettingsHubPage } from "./pages/settings/SettingsHubPage";
import { OnboardingBriefingPage } from "./pages/settings/OnboardingBriefingPage";
import { PricingCalculatorPage } from "./pages/settings/PricingCalculatorPage";

const OfferBuilderHubPage = lazy(() =>
  import("./pages/settings/OfferBuilderHubPage").then((m) => ({ default: m.OfferBuilderHubPage })),
);
const OfferBuilderEditorPage = lazy(() =>
  import("./pages/settings/OfferBuilderEditorPage").then((m) => ({ default: m.OfferBuilderEditorPage })),
);
const InvoiceSetupPage = lazy(() =>
  import("./pages/settings/InvoiceSetupPage").then((m) => ({ default: m.InvoiceSetupPage })),
);
const LandingPage = lazy(() =>
  import("./pages/LandingPage/LandingPage").then((m) => ({ default: m.LandingPage })),
);
const LandingPage2 = lazy(() =>
  import("./pages/LandingPage2/LandingPage2").then((m) => ({ default: m.LandingPage2 })),
);

function LazyFallback() {
  return (
    <div className="flex min-h-[30vh] items-center justify-center px-4">
      <span className="text-[13px] text-muted-foreground">Loading…</span>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Landing page is the public root */}
      <Route
        index
        element={
          <Suspense fallback={null}>
            <LandingPage />
          </Suspense>
        }
      />
      <Route
        path="landing"
        element={
          <Suspense fallback={null}>
            <LandingPage />
          </Suspense>
        }
      />
      <Route
        path="landing2"
        element={
          <Suspense fallback={null}>
            <LandingPage2 />
          </Suspense>
        }
      />
      <Route path="login" element={<LoginPage />} />

      {/* Canonical studio briefing shell (first-run and deep-link; same page as Settings revisit) */}
      <Route
        path="onboarding"
        element={
          <ProtectedRoute>
            {/* Full-route stage: shell paints cinematic field + briefing desk (see OnboardingBriefingShell) */}
            <div className="font-dashboard min-h-[100dvh] bg-black">
              <OnboardingBriefingPage />
            </div>
          </ProtectedRoute>
        }
      />

      {/* 4-Pane shell wraps all dashboard routes */}
      <Route
        element={
          <ProtectedRoute>
            <FourPaneLayout />
          </ProtectedRoute>
        }
      >
        {/* Today mode (default dashboard view) */}
        <Route path="today" element={null} />
        <Route path="today/:itemId" element={null} />

        {/* Inbox mode */}
        <Route path="inbox" element={null} />

        {/* Pipeline mode */}
        <Route path="pipeline" element={null} />
        <Route path="pipeline/:id" element={null} />

        {/* Calendar mode */}
        <Route path="calendar" element={null} />

        {/* Workspace mode */}
        <Route path="workspace" element={null} />
        <Route path="workspace/pricing-calculator" element={<PricingCalculatorPage />} />
        <Route
          path="workspace/invoices"
          element={
            <Suspense fallback={<LazyFallback />}>
              <InvoiceSetupPage />
            </Suspense>
          }
        />
        <Route
          path="workspace/offer-builder"
          element={
            <Suspense fallback={<LazyFallback />}>
              <OfferBuilderHubPage />
            </Suspense>
          }
        />
        <Route
          path="workspace/offer-builder/edit/:projectId"
          element={
            <Suspense fallback={<LazyFallback />}>
              <OfferBuilderEditorPage />
            </Suspense>
          }
        />

        {/* Directory mode (people only) */}
        <Route path="directory" element={null} />

        {/* Settings mode */}
        <Route path="settings/onboarding" element={<Navigate to="/onboarding" replace />} />
        <Route path="settings" element={<SettingsHubPage />} />
        <Route path="settings/ai" element={<Navigate to="/settings" replace />} />
      </Route>

      {/* Escalations are surfaced on Today only; keep bookmark compatibility */}
      <Route
        path="escalations"
        element={
          <ProtectedRoute>
            <Navigate to="/today" replace />
          </ProtectedRoute>
        }
      />

      {/* Legacy redirects */}
      <Route path="wedding/:weddingId" element={<RedirectToPipeline />} />
      <Route path="weddings" element={<Navigate to="/pipeline" replace />} />
      <Route path="approvals" element={<Navigate to="/today" replace />} />
      <Route path="tasks" element={<Navigate to="/today" replace />} />
      <Route path="financials" element={<Navigate to="/workspace" replace />} />
      <Route path="contacts" element={<Navigate to="/directory" replace />} />
      <Route path="settings/pricing-calculator" element={<Navigate to="/workspace/pricing-calculator" replace />} />
      <Route path="settings/invoices" element={<Navigate to="/workspace/invoices" replace />} />
      <Route path="settings/offer-builder" element={<Navigate to="/workspace/offer-builder" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RedirectToPipeline() {
  const weddingId = window.location.pathname.split("/wedding/")[1];
  return <Navigate to={`/pipeline/${weddingId}`} replace />;
}
