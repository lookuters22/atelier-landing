import { Outlet, useLocation } from "react-router-dom";
import { Group, Panel, Separator } from "react-resizable-panels";
import { AnimatePresence } from "framer-motion";
import { NavigationDock } from "../components/Dock/NavigationDock";
import { SupportAssistantWidget } from "../components/SupportAssistantWidget";
import { StudioSpotlight } from "../components/StudioSpotlight";
import { PageTransition } from "../components/PageTransition";
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
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

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

const SEP_CLS = "w-[3px] bg-border/50 hover:bg-ring/40 transition-colors cursor-col-resize";

/* ------------------------------------------------------------------ */
/*  Layout persistence                                                */
/* ------------------------------------------------------------------ */

type Layout = Record<string, number>;

function readLayout(key: string): Layout | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Layout) : undefined;
  } catch {
    return undefined;
  }
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
  const saved = readLayout("conceptzilla:3pane");
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
        <ThreePaneShell
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

  /**
   * Route updates `mode` to "today" immediately, but AnimatePresence still shows the
   * previous shell exiting. That shell used to sit on `bg-background`; without this,
   * the wrapper drops bg-background at the same instant and the dark DynamicBackground
   * shows through the fading UI — panel rails read as black.
   */
  const [holdShellBg, setHoldShellBg] = useState(false);
  const prevModeRef = useRef<Mode | null>(null);

  /** True when this navigation involves Today (either end) — use cinematic transition. */
  const transitionInvolvesToday =
    mode === "today" || prevModeRef.current === "today";

  useEffect(() => {
    const prev = prevModeRef.current;
    if (mode !== "today") {
      setHoldShellBg(false);
    } else if (prev !== null && prev !== "today" && mode === "today") {
      setHoldShellBg(true);
    }
    prevModeRef.current = mode;
  }, [mode]);

  const showShellBg = mode !== "today" || holdShellBg;

  const handlePresenceExitComplete = useCallback(() => {
    setHoldShellBg(false);
  }, []);

  if (isOfferBuilderEditor) {
    return (
      <div className="font-dashboard flex h-[100dvh] w-full overflow-hidden bg-background">
        <WorkspaceMode />
      </div>
    );
  }

  return (
    <div className="font-dashboard relative flex h-[100dvh] w-full overflow-hidden bg-background">
      <DynamicBackground />

      <div className={`relative z-10 min-w-0 flex-1 h-full ${showShellBg ? "bg-background" : ""}`}>
        <AnimatePresence mode="wait" onExitComplete={handlePresenceExitComplete}>
          <PageTransition
            key={mode}
            variant={transitionInvolvesToday ? "cinematic" : "quick"}
            longTodayEntrance={mode === "today"}
          >
            <ModeSwitch mode={mode} />
          </PageTransition>
        </AnimatePresence>
      </div>

      <NavigationDock />
      <SupportAssistantWidget />
      <StudioSpotlight />
    </div>
  );
}
