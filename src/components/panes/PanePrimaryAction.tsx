import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PANE_PRIMARY_ACTION } from "./paneClasses";

export type PanePrimaryActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  children: ReactNode;
};

/** Inbox Compose — black pill, semibold. */
export function PanePrimaryAction({ icon: Icon, children, className, type = "button", ...rest }: PanePrimaryActionProps) {
  return (
    <button type={type} className={cn(PANE_PRIMARY_ACTION, className)} {...rest}>
      {Icon ? <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden /> : null}
      {children}
    </button>
  );
}
