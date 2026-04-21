import { Outlet, useLocation } from "react-router-dom";
import { Group, Panel, Separator } from "react-resizable-panels";
import { NavigationDock } from "../components/Dock/NavigationDock";
import { SupportAssistantWidget } from "../components/SupportAssistantWidget";
import { StudioSpotlight } from "../components/StudioSpotlight";
import { DynamicBackground } from "../components/modes/today/DynamicBackground";

import { ZenLobby } from "../components/modes/today/ZenLobby";

import { InboxModeProvider } from "../components/modes/inbox/InboxModeContext";
import { InboxContextList } from "../components/modes/inbox/InboxContextList";
import { InboxWorkspace } from "../components/modes/inbox/InboxWorkspace";
import { InboxInspector } from "../components/modes/inbox/InboxInspector";
import { InboxUrlHydrator } from "../components/modes/inbox/InboxUrlHydrator";
import { InboxThreePaneShell } from "../components/modes/inbox/InboxThreePaneShell";

import { PipelineModeProvider } from "../components/modes/pipeline/PipelineModeContext";
import { PipelineWeddingProvider } from "../components/modes/pipeline/PipelineWeddingContext";
import { PipelineContextList } from "../components/modes/pipeline/PipelineContextList";
import { PipelineWorkspace } from "../components/modes/pipeline/PipelineWorkspace";
import { PipelineInspector } from "../components/modes/pipeline/PipelineInspector";

import { CalendarModeProvider } from "../components/modes/calendar/CalendarModeContext";
import { CalendarContextList } from "../components/modes/calendar/CalendarContextList";
import { CalendarGrid } from "../components/modes/calendar/CalendarGrid";
import { CalendarInspector } from "../components/modes/calendar/CalendarInspector";

import { WorkspaceModeProvider } from "../components/modes/workspace/WorkspaceModeContext";
import { WorkspaceContextList } from "../components/modes/workspace/WorkspaceContextList";
import { WorkspaceLedger } from "../components/modes/workspace/WorkspaceLedger";
import { WorkspaceInspector } from "../components/modes/workspace/WorkspaceInspector";

import { DirectoryModeProvider } from "../components/modes/directory/DirectoryModeContext";
import { DirectoryContextList } from "../components/modes/directory/DirectoryContextList";
import { DirectoryLedger } from "../components/modes/directory/DirectoryLedger";
import { DirectoryInspector } from "../components/modes/directory/DirectoryInspector";

import { InvoiceSetupProvider } from "../components/modes/settings/InvoiceSetupContext";
import { SettingsPreview } from "../components/modes/settings/SettingsPreview";

import { OfferBuilderSettingsProvider } from "../pages/settings/offerBuilderSettingsContext";
import { cn } from "@/lib/utils";
import { useCallback, type ReactNode } from "react";

type Mode =
  | "today"
  | "inbox"
  | "pipeline"
  | "calendar"
  | "workspace"
  | "directory"
  | "settings";

function detectMode(pathname: string): Mode {
  if (pathname.startsWith("/inbox")) return "inbox";
  if (pathname.startsWith("/pipeline")) return "pipeline";
  if (pathname.startsWith("/calendar")) return "calendar";
  if (pathname.startsWith("/workspace")) return "workspace";
  if (pathname.startsWith("/directory")) return "directory";
  if (pathname.startsWith("/settings")) return "settings";
  return "today";
}

const SEP_CLS =
  "w-[3px] shrink-0 cursor-col-resize bg-[var(--dashboard-pane-divider)] hover:bg-[var(--dashboard-pane-divider-hover)] transition-colors";

/* ------------------------------------------------------------------ */
/*  Layout persistence                                                */
/* ------------------------------------------------------------------ */

type Layout = Record<string, number>;

/** Panel ids shared by `ThreePaneShell` + `PipelineThreePaneShell` (`conceptzilla:3pane`). */
const THREE_PANE_IDS = ["ctx", "main", "insp"] as const;

function readLayout(key: string): Layout | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Layout) : undefined;
  } catch {
    return undefined;
  }
}

/** Rejects corrupted or ID-mismatched layouts (e.g. old `ctx-pipe` keys) so panels don’t collapse to 0 width. */
function readThreePaneLayout(key: string): Layout | undefined {
  const parsed = readLayout(key);
  if (!parsed || typeof parsed !== "object") return undefined;
  for (const id of THREE_PANE_IDS) {
    const v = parsed[id];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      return undefined;
    }
  }
  return parsed;
}

function writeLayout(key: string, layout: Layout) {
  try {
    localStorage.setItem(key, JSON.stringify(layout));
  } catch { /* storage full or unavailable */ }
}

/* ------------------------------------------------------------------ */
/*  Persistent panel shells                                           */
/* ------------------------------------------------------------------ */

function ThreePaneShell({
  pane2,
  pane3,
  pane4,
}: {
  pane2: ReactNode;
  pane3: ReactNode;
  pane4: ReactNode;
}) {
  const saved = readThreePaneLayout("conceptzilla:3pane");
  const handleChanged = useCallback(
    (layout: Layout) => writeLayout("conceptzilla:3pane", layout),
    [],
  );

  return (
    <Group
      orientation="horizontal"
      defaultLayout={saved}
      onLayoutChanged={handleChanged}
    >
      <Panel id="ctx" defaultSize="22%" minSize="16%" maxSize="32%">
        <div className="dashboard-context-pane flex h-full flex-col overflow-y-auto">{pane2}</div>
      </Panel>
      <Separator className={SEP_CLS} />
      <Panel id="main" defaultSize="50%" minSize="30%">
        <div className="flex h-full flex-col overflow-y-auto bg-background">{pane3}</div>
      </Panel>
      <Separator className={SEP_CLS} />
      <Panel id="insp" defaultSize="28%" minSize="18%" maxSize="38%">
        <div className="dashboard-inspector-pane flex h-full flex-col overflow-y-auto">{pane4}</div>
      </Panel>
    </Group>
  );
}

/** Pipeline Ana port: inner panes manage scroll; shell stays overflow-hidden for the two-column workspace grid. */
function PipelineThreePaneShell({
  pane2,
  pane3,
  pane4,
}: {
  pane2: ReactNode;
  pane3: ReactNode;
  pane4: ReactNode;
}) {
  /** Must use the same panel ids as `ThreePaneShell` — layout is persisted under `conceptzilla:3pane`. */
  const saved = readThreePaneLayout("conceptzilla:3pane");
  const handleChanged = useCallback(
    (layout: Layout) => writeLayout("conceptzilla:3pane", layout),
    [],
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Group
        className="h-full min-h-0 w-full flex-1"
        orientation="horizontal"
        defaultLayout={saved}
        onLayoutChanged={handleChanged}
      >
        <Panel id="ctx" defaultSize="22%" minSize="16%" maxSize="32%">
          <div className="dashboard-context-pane flex h-full min-h-0 flex-col overflow-hidden bg-[var(--color-surface-sunken)]">
            {pane2}
          </div>
        </Panel>
        <Separator className={SEP_CLS} />
        <Panel id="main" defaultSize="50%" minSize="30%">
          <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-canvas)]">{pane3}</div>
        </Panel>
        <Separator className={SEP_CLS} />
        <Panel id="insp" defaultSize="28%" minSize="18%" maxSize="38%">
          <div className="dashboard-inspector-pane flex h-full min-h-0 flex-col overflow-hidden bg-[var(--color-surface-sunken)]">
            {pane4}
          </div>
        </Panel>
      </Group>
    </div>
  );
}

function TwoPaneShell({ pane2, pane3 }: { pane2: ReactNode; pane3: ReactNode }) {
  const saved = readLayout("conceptzilla:2pane");
  const handleChanged = useCallback(
    (layout: Layout) => writeLayout("conceptzilla:2pane", layout),
    [],
  );

  return (
    <Group
      orientation="horizontal"
      defaultLayout={saved}
      onLayoutChanged={handleChanged}
    >
      <Panel id="ctx-2p" defaultSize="22%" minSize="16%" maxSize="32%">
        <div className="dashboard-context-pane flex h-full flex-col overflow-y-auto">{pane2}</div>
      </Panel>
      <Separator className={SEP_CLS} />
      <Panel id="main-2p" defaultSize="78%" minSize="50%">
        <div className="flex h-full flex-col overflow-y-auto bg-background">{pane3}</div>
      </Panel>
    </Group>
  );
}

/* ------------------------------------------------------------------ */
/*  Mode components                                                   */
/* ------------------------------------------------------------------ */

/** Operator attention hub: Priority Actions feed + escalation deep-link overlay (`ZenLobby`). */
function TodayMode() {
  return <ZenLobby />;
}

function InboxMode() {
  return (
    <InboxModeProvider>
      <InboxUrlHydrator />
      <InboxThreePaneShell
        pane2={<InboxContextList />}
        pane3={<InboxWorkspace />}
        pane4={<InboxInspector />}
      />
    </InboxModeProvider>
  );
}

function PipelineMode() {
  return (
    <PipelineModeProvider>
      <PipelineWeddingProvider>
        <PipelineThreePaneShell
          pane2={<PipelineContextList />}
          pane3={<PipelineWorkspace />}
          pane4={<PipelineInspector />}
        />
      </PipelineWeddingProvider>
    </PipelineModeProvider>
  );
}

function CalendarMode() {
  return (
    <CalendarModeProvider>
      <ThreePaneShell
        pane2={<CalendarContextList />}
        pane3={<CalendarGrid />}
        pane4={<CalendarInspector />}
      />
    </CalendarModeProvider>
  );
}

function WorkspaceMode() {
  const { pathname } = useLocation();

  if (pathname.startsWith("/workspace/offer-builder/edit")) {
    return (
      <OfferBuilderSettingsProvider value={{ paletteMountVersion: 0 }}>
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <div id="offer-builder-palette-root" className="hidden" />
          <Outlet />
        </div>
      </OfferBuilderSettingsProvider>
    );
  }

  if (pathname === "/workspace/invoices") {
    return (
      <WorkspaceModeProvider>
        <InvoiceSetupProvider>
          <ThreePaneShell
            pane2={<WorkspaceContextList />}
            pane3={<WorkspaceLedger />}
            pane4={<SettingsPreview />}
          />
        </InvoiceSetupProvider>
      </WorkspaceModeProvider>
    );
  }

  if (
    pathname.startsWith("/workspace/pricing-calculator") ||
    pathname.startsWith("/workspace/offer-builder")
  ) {
    return (
      <WorkspaceModeProvider>
        <TwoPaneShell
          pane2={<WorkspaceContextList />}
          pane3={<WorkspaceLedger />}
        />
      </WorkspaceModeProvider>
    );
  }

  return (
    <WorkspaceModeProvider>
      <ThreePaneShell
        pane2={<WorkspaceContextList />}
        pane3={<WorkspaceLedger />}
        pane4={<WorkspaceInspector />}
      />
    </WorkspaceModeProvider>
  );
}

function DirectoryMode() {
  return (
    <DirectoryModeProvider>
      <ThreePaneShell
        pane2={<DirectoryContextList />}
        pane3={<DirectoryLedger />}
        pane4={<DirectoryInspector />}
      />
    </DirectoryModeProvider>
  );
}

function SettingsMode() {
  const { pathname } = useLocation();
  const isOnboardingBriefing = pathname.startsWith("/settings/onboarding");

  if (isOnboardingBriefing) {
    return (
      <div className="relative h-full min-h-0 flex-1 overflow-hidden bg-background">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-2xl px-8 py-8">
        <Outlet />
      </div>
    </div>
  );
}

function ModeSwitch({ mode }: { mode: Mode }) {
  switch (mode) {
    case "today": return <TodayMode />;
    case "inbox": return <InboxMode />;
    case "pipeline": return <PipelineMode />;
    case "calendar": return <CalendarMode />;
    case "workspace": return <WorkspaceMode />;
    case "directory": return <DirectoryMode />;
    case "settings": return <SettingsMode />;
  }
}

export function FourPaneLayout() {
  const { pathname } = useLocation();
  const mode = detectMode(pathname);
  const isOfferBuilderEditor = pathname.startsWith("/workspace/offer-builder/edit");

  /** Opaque shell over `DynamicBackground` for every mode except Today (Zen lobby uses the live backdrop). */
  const showShellBg = mode !== "today";

  /** Ana redesign shell tokens — only /today, /inbox, /pipeline, /calendar (not manager/workspace/settings/directory). */
  const anaMainDashboardShell =
    mode === "today" || mode === "inbox" || mode === "pipeline" || mode === "calendar";

  const fourPaneRootClassName = cn(
    "font-dashboard relative flex h-[100dvh] w-full overflow-hidden bg-background",
    anaMainDashboardShell && "ana-main-dashboard",
  );

  if (isOfferBuilderEditor) {
    return (
      <div className="font-dashboard flex h-[100dvh] w-full overflow-hidden bg-background">
        <WorkspaceMode />
      </div>
    );
  }

  return (
    <div className={fourPaneRootClassName} data-route={mode}>
      <DynamicBackground />

      <div
        className={`relative z-10 flex min-h-0 min-w-0 flex-1 flex-col h-full ${showShellBg ? "bg-background" : ""}`}
      >
        <div key={mode} className="dashboard-page-shell flex min-h-0 flex-1 flex-col">
          <ModeSwitch mode={mode} />
        </div>
      </div>

      <NavigationDock />
      <SupportAssistantWidget />
      <StudioSpotlight />
    </div>
  );
}
