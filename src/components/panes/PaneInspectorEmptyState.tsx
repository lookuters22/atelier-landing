import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PANE_INSPECTOR_EMPTY_MESSAGE } from "./paneClasses";

/** Inbox inspector idle — icon + muted message, centered. */
export function PaneInspectorEmptyState({
  icon,
  message,
  className,
}: {
  icon: ReactNode;
  message: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[200px] flex-col items-center justify-center px-8 text-center",
        className,
      )}
    >
      {icon}
      <p className={cn("mt-3 max-w-[220px]", PANE_INSPECTOR_EMPTY_MESSAGE)}>{message}</p>
    </div>
  );
}
