import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PANE_COUNT_BADGE } from "./paneClasses";

export function PaneCountBadge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn(PANE_COUNT_BADGE, className)}>{children}</span>;
}
