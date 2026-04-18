import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PANE_INSPECTOR_SCROLL_BODY } from "./paneClasses";

export function PaneInspectorScrollBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(PANE_INSPECTOR_SCROLL_BODY, className)}>{children}</div>;
}
