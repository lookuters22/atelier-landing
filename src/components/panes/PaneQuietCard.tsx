import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PANE_QUIET_CARD } from "./paneClasses";

export function PaneQuietCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(PANE_QUIET_CARD, className)}>{children}</div>;
}
