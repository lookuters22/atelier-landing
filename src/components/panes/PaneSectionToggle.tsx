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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenChange(!open)}
      className={cn(PANE_SECTION_TOGGLE, className)}
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
