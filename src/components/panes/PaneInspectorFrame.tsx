import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PANE_INSPECTOR_BODY } from "./paneClasses";

/** Right inspector content column — typography baseline (shared pane token). */
export function PaneInspectorFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex h-full min-h-0 flex-col", PANE_INSPECTOR_BODY, className)}>{children}</div>;
}
