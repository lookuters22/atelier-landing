import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PANE_SECTION_TOGGLE } from "./paneClasses";

/** Inbox collapsible section control (Inquiries, Weddings, Labels). */
export function PaneSectionToggle({
  open,
  onOpenChange,
  children,
  className,
  /** When set, default pane padding/typography classes are omitted so callers can use rail-specific styles (e.g. Ana `.ctx-section-label-toggle`). */
  replaceBaseClassName = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
  replaceBaseClassName?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenChange(!open)}
      className={cn(!replaceBaseClassName && PANE_SECTION_TOGGLE, "text-left", className)}
      aria-expanded={open}
    >
      {open ? (
        <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      ) : (
        <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      )}
      {children}
    </button>
  );
}
