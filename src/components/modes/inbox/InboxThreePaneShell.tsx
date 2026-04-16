import { useCallback, useState, type ReactNode } from "react";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
import { InboxLayoutProvider } from "./InboxLayoutContext";

const SEP_CLS = "w-[3px] bg-border/50 hover:bg-ring/40 transition-colors cursor-col-resize";

type Layout = Record<string, number>;

const LAYOUT_KEY = "conceptzilla:3pane-inbox";

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
  } catch {
    /* storage full or unavailable */
  }
}

export function InboxThreePaneShell({
  pane2,
  pane3,
  pane4,
}: {
  pane2: ReactNode;
  pane3: ReactNode;
  pane4: ReactNode;
}) {
  const saved = readLayout(LAYOUT_KEY);
  const handleChanged = useCallback((layout: Layout) => writeLayout(LAYOUT_KEY, layout), []);

  const inspectorPanelRef = usePanelRef();
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);

  const collapseInspector = useCallback(() => {
    inspectorPanelRef.current?.collapse();
  }, [inspectorPanelRef]);

  const expandInspector = useCallback(() => {
    inspectorPanelRef.current?.expand();
  }, [inspectorPanelRef]);

  return (
    <InboxLayoutProvider
      value={{
        inspectorPanelRef,
        inspectorCollapsed,
        collapseInspector,
        expandInspector,
      }}
    >
      <Group orientation="horizontal" defaultLayout={saved} onLayoutChanged={handleChanged}>
        <Panel id="inbox-ctx" defaultSize="22%" minSize="16%" maxSize="32%">
          <div className="dashboard-context-pane flex h-full min-h-0 flex-col overflow-y-auto border-r border-border">
            {pane2}
          </div>
        </Panel>
        <Separator className={SEP_CLS} />
        <Panel id="inbox-main" defaultSize="50%" minSize="30%">
          <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">{pane3}</div>
        </Panel>
        <Separator className={SEP_CLS} />
        <Panel
          id="inbox-insp"
          defaultSize="28%"
          minSize="16%"
          maxSize="42%"
          collapsible
          collapsedSize="3%"
          panelRef={inspectorPanelRef}
          onResize={(panelSize) => setInspectorCollapsed(panelSize.asPercentage < 6)}
        >
          <div className="dashboard-inspector-pane flex h-full min-h-0 flex-col overflow-hidden">{pane4}</div>
        </Panel>
      </Group>
    </InboxLayoutProvider>
  );
}
