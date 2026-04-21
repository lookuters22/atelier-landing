import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  PANE_INBOX_CTX_LABEL_ACTIVE,
  PANE_INBOX_CTX_LABEL_BASE,
  PANE_INBOX_CTX_LABEL_INACTIVE,
  PANE_INBOX_CTX_NESTED_ACTIVE,
  PANE_INBOX_CTX_NESTED_BASE,
  PANE_INBOX_CTX_NESTED_INACTIVE,
  PANE_INBOX_CTX_ROW_ACTIVE,
  PANE_INBOX_CTX_ROW_BASE,
  PANE_INBOX_CTX_ROW_INACTIVE,
  PANE_INBOX_CTX_SUB_ACTIVE,
  PANE_INBOX_CTX_SUB_BASE,
  PANE_INBOX_CTX_SUB_INACTIVE,
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
  /** `ana` matches Ana HTML `.ctx-item` / `.ctx-label` (Slice 3 inbox rail). */
  surfaceStyle?: "pill" | "ana";
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
  surfaceStyle = "pill",
  variant = "default",
  children,
  className,
  type = "button",
  ...rest
}: PaneNavRowProps) {
  let base: string;
  let on: string;
  let off: string;
  const ana = surfaceStyle === "ana";

  if (variant === "sub") {
    base = ana ? PANE_INBOX_CTX_SUB_BASE : PANE_NAV_ROW_SUB_BASE;
    on = ana ? PANE_INBOX_CTX_SUB_ACTIVE : PANE_NAV_ROW_SUB_ACTIVE;
    off = ana ? PANE_INBOX_CTX_SUB_INACTIVE : PANE_NAV_ROW_SUB_INACTIVE;
  } else if (variant === "nested") {
    base = ana ? PANE_INBOX_CTX_NESTED_BASE : PANE_NAV_ROW_NESTED_BASE;
    on = ana ? PANE_INBOX_CTX_NESTED_ACTIVE : PANE_NAV_ROW_NESTED_ACTIVE;
    off = ana ? PANE_INBOX_CTX_NESTED_INACTIVE : PANE_NAV_ROW_NESTED_INACTIVE;
  } else if (variant === "label") {
    base = ana ? PANE_INBOX_CTX_LABEL_BASE : PANE_NAV_ROW_LABEL_BASE;
    on = ana ? PANE_INBOX_CTX_LABEL_ACTIVE : PANE_NAV_ROW_LABEL_ACTIVE;
    off = ana ? PANE_INBOX_CTX_LABEL_INACTIVE : PANE_NAV_ROW_LABEL_INACTIVE;
  } else {
    base = ana ? PANE_INBOX_CTX_ROW_BASE : PANE_NAV_ROW_BASE;
    on = ana ? PANE_INBOX_CTX_ROW_ACTIVE : PANE_NAV_ROW_ACTIVE;
    off = ana ? PANE_INBOX_CTX_ROW_INACTIVE : PANE_NAV_ROW_INACTIVE;
  }

  const iconCls =
    variant === "label"
      ? ana
        ? "h-3.5 w-3.5 shrink-0 opacity-80"
        : "h-3.5 w-3.5 shrink-0 opacity-70"
      : ana
        ? "h-[14px] w-[14px] shrink-0 opacity-80"
        : "h-4 w-4 shrink-0 opacity-80";

  return (
    <button type={type} className={cn(base, active ? on : off, className)} {...rest}>
      {Icon ? <Icon className={iconCls} strokeWidth={1.75} aria-hidden /> : null}
      <span className={cn("min-w-0 flex-1 text-left", variant === "nested" && "truncate")}>{children}</span>
      {endAdornment}
    </button>
  );
}
