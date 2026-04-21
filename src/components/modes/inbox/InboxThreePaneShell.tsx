import type { ReactNode } from "react";

/** Inbox layout per `export/redesign/Ana Dashboard.html` `.inbox` — fixed columns, not resizable panels. */
export function InboxThreePaneShell({
  pane2,
  pane3,
  pane4,
}: {
  pane2: ReactNode;
  pane3: ReactNode;
  pane4: ReactNode;
}) {
  return (
    <div className="ana-inbox-port ana-inbox-shell-layout ana-inbox-shell-root">
      <div className="ana-inbox-shell-cell">{pane2}</div>
      <div className="pane ana-inbox-shell-middle">{pane3}</div>
      <div className="ana-inbox-shell-cell">{pane4}</div>
    </div>
  );
}
