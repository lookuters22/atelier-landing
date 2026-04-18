import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Left context pane inner root — matches InboxContextList outer shell. Parent usually provides `dashboard-context-pane`. */
export function ContextPaneRoot({
  children,
  className,
  withRightBorder = true,
}: {
  children: ReactNode;
  className?: string;
  /** Pipeline / Directory historically set border-r on the list; Inbox gets it from InboxThreePaneShell. */
  withRightBorder?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col text-[13px] text-foreground",
        withRightBorder && "border-r border-border",
        className,
      )}
    >
      {children}
    </div>
  );
}
