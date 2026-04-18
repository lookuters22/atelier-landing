import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PANE_INSPECTOR_SECTION_TITLE } from "./paneClasses";

/** Uppercase meta label inside inspector blocks (Sender, AI Suggestion, …). */
export function PaneInspectorSectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn(PANE_INSPECTOR_SECTION_TITLE, className)}>{children}</h3>;
}
