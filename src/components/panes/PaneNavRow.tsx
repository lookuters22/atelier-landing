import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  PANE_NAV_ROW_ACTIVE,
  PANE_NAV_ROW_BASE,
  PANE_NAV_ROW_INACTIVE,
  PANE_NAV_ROW_LABEL_ACTIVE,
  PANE_NAV_ROW_LABEL_BASE,
  PANE_NAV_ROW_LABEL_INACTIVE,
  PANE_NAV_ROW_NESTED_ACTIVE,
  PANE_NAV_ROW_NESTED_BASE,
  PANE_NAV_ROW_NESTED_INACTIVE,
  PANE_NAV_ROW_SUB_ACTIVE,
  PANE_NAV_ROW_SUB_BASE,
  PANE_NAV_ROW_SUB_INACTIVE,
} from "./paneClasses";

export type PaneNavRowProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
  icon?: LucideIcon;
  endAdornment?: ReactNode;
  /**
   * default — top folder row (Inbox, Starred)
   * sub — full-width secondary row (“All inquiries”)
   * nested — flex-1 row beside external link in a split row
   * label — Gmail label list density
   */
  variant?: "default" | "sub" | "nested" | "label";
  children: ReactNode;
};

/** Inbox folder row — pill, foreground/10 active, muted hover. */
export function PaneNavRow({
  active,
  icon: Icon,
  endAdornment,
  variant = "default",
  children,
  className,
  type = "button",
  ...rest
}: PaneNavRowProps) {
  let base: string;
  let on: string;
  let off: string;
  if (variant === "sub") {
    base = PANE_NAV_ROW_SUB_BASE;
    on = PANE_NAV_ROW_SUB_ACTIVE;
    off = PANE_NAV_ROW_SUB_INACTIVE;
  } else if (variant === "nested") {
    base = PANE_NAV_ROW_NESTED_BASE;
    on = PANE_NAV_ROW_NESTED_ACTIVE;
    off = PANE_NAV_ROW_NESTED_INACTIVE;
  } else if (variant === "label") {
    base = PANE_NAV_ROW_LABEL_BASE;
    on = PANE_NAV_ROW_LABEL_ACTIVE;
    off = PANE_NAV_ROW_LABEL_INACTIVE;
  } else {
    base = PANE_NAV_ROW_BASE;
    on = PANE_NAV_ROW_ACTIVE;
    off = PANE_NAV_ROW_INACTIVE;
  }

  const iconCls =
    variant === "label" ? "h-3.5 w-3.5 shrink-0 opacity-70" : "h-4 w-4 shrink-0 opacity-80";

  return (
    <button type={type} className={cn(base, active ? on : off, className)} {...rest}>
      {Icon ? <Icon className={iconCls} strokeWidth={1.75} aria-hidden /> : null}
      <span className={cn("min-w-0 flex-1 text-left", variant === "nested" && "truncate")}>{children}</span>
      {endAdornment}
    </button>
  );
}
