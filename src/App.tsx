import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { ManagerLayout } from "./layouts/ManagerLayout";
import { TodayPage } from "./pages/TodayPage";
import { InboxPage } from "./pages/InboxPage";
import { WeddingDetailPage } from "./pages/WeddingDetailPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { PipelinePage } from "./pages/PipelinePage";
import { CalendarPage } from "./pages/CalendarPage";
import { ContactsPage } from "./pages/ContactsPage";
import { TasksPage } from "./pages/TasksPage";
import { FinancialsPage } from "./pages/FinancialsPage";
import { SettingsLayout } from "./layouts/SettingsLayout";
import { SettingsHubPage } from "./pages/settings/SettingsHubPage";
import { PricingCalculatorPage } from "./pages/settings/PricingCalculatorPage";
import { WeddingsPage } from "./pages/WeddingsPage";
import { AddWeddingPage } from "./pages/AddWeddingPage";
import { ManagerTodayPage } from "./pages/manager/ManagerTodayPage";
import { ManagerPhotographersPage } from "./pages/manager/ManagerPhotographersPage";
import { ManagerWeddingsPage } from "./pages/manager/ManagerWeddingsPage";
import { ManagerInboxPage } from "./pages/manager/ManagerInboxPage";
import { ManagerApprovalsPage } from "./pages/manager/ManagerApprovalsPage";
import { ManagerPipelinePage } from "./pages/manager/ManagerPipelinePage";
import { ManagerCalendarPage } from "./pages/manager/ManagerCalendarPage";
import { ManagerContactsPage } from "./pages/manager/ManagerContactsPage";
import { ManagerTasksPage } from "./pages/manager/ManagerTasksPage";
import { ManagerSettingsPage } from "./pages/manager/ManagerSettingsPage";

/** Code-split: Puck + offer export must not block initial app load. */
const OfferBuilderHubPage = lazy(() =>
  import("./pages/settings/OfferBuilderHubPage").then((m) => ({ default: m.OfferBuilderHubPage })),
);
const OfferBuilderEditorPage = lazy(() =>
  import("./pages/settings/OfferBuilderEditorPage").then((m) => ({ default: m.OfferBuilderEditorPage })),
);

/** Code-split: @react-pdf/renderer is heavy and can fail independently of the dashboard shell. */
const InvoiceSetupPage = lazy(() =>
  import("./pages/settings/InvoiceSetupPage").then((m) => ({ default: m.InvoiceSetupPage })),
);

function SettingsRouteFallback() {
  return (
    <div className="flex min-h-[30vh] items-center justify-center px-4 text-[13px] text-ink-muted">
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route index element={<TodayPage />} />
        <Route path="weddings" element={<WeddingsPage />} />
        <Route path="weddings/new" element={<AddWeddingPage />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="wedding/:weddingId" element={<WeddingDetailPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="financials" element={<FinancialsPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="settings" element={<SettingsLayout />}>
          <Route index element={<SettingsHubPage />} />
          <Route path="pricing-calculator" element={<PricingCalculatorPage />} />
          <Route
            path="invoices"
            element={
              <Suspense fallback={<SettingsRouteFallback />}>
                <InvoiceSetupPage />
              </Suspense>
            }
          />
          <Route
            path="offer-builder"
            element={
              <Suspense fallback={<SettingsRouteFallback />}>
                <OfferBuilderHubPage />
              </Suspense>
            }
          />
          <Route
            path="offer-builder/edit/:projectId"
            element={
              <Suspense fallback={<SettingsRouteFallback />}>
                <OfferBuilderEditorPage />
              </Suspense>
            }
          />
        </Route>
      </Route>
      <Route path="manager" element={<ManagerLayout />}>
        <Route index element={<Navigate to="today" replace />} />
        <Route path="today" element={<ManagerTodayPage />} />
        <Route path="photographers" element={<ManagerPhotographersPage />} />
        <Route path="weddings" element={<ManagerWeddingsPage />} />
        <Route path="inbox" element={<ManagerInboxPage />} />
        <Route path="approvals" element={<ManagerApprovalsPage />} />
        <Route path="pipeline" element={<ManagerPipelinePage />} />
        <Route path="calendar" element={<ManagerCalendarPage />} />
        <Route path="contacts" element={<ManagerContactsPage />} />
        <Route path="tasks" element={<ManagerTasksPage />} />
        <Route path="settings" element={<ManagerSettingsPage />} />
        <Route path="wedding/:weddingId" element={<WeddingDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
