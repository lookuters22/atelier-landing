import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PANE_SECTION_LABEL } from "./paneClasses";

/** Static uppercase section title (Categories, Event Types, …). */
export function PaneSectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(PANE_SECTION_LABEL, className)}>{children}</div>;
}
