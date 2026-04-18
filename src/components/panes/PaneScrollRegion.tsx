import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Scrollable body under header — Inbox list area. */
export const PaneScrollRegion = forwardRef<
  HTMLDivElement,
  { children: ReactNode; className?: string }
>(function PaneScrollRegion({ children, className }, ref) {
  return (
    <div ref={ref} className={cn("min-h-0 flex-1 overflow-y-auto px-1.5 py-2", className)}>
      {children}
    </div>
  );
});

PaneScrollRegion.displayName = "PaneScrollRegion";