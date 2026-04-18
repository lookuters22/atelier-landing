import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { cn } from "@/lib/utils";
import { PANE_SECONDARY_ACTION } from "./paneClasses";

export type PaneSecondaryActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  children: ReactNode;
};

/** Outline / secondary CTA — same vertical rhythm as Compose. */
export function PaneSecondaryAction({ icon: Icon, children, className, type = "button", ...rest }: PaneSecondaryActionProps) {
  return (
    <button type={type} className={cn(PANE_SECONDARY_ACTION, className)} {...rest}>
      {Icon ? <Icon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden /> : null}
      {children}
    </button>
  );
}

export type PaneSecondaryActionLinkProps = LinkProps & {
  icon?: LucideIcon;
  children: ReactNode;
};

export function PaneSecondaryActionLink({ icon: Icon, children, className, ...rest }: PaneSecondaryActionLinkProps) {
  return (
    <Link className={cn(PANE_SECONDARY_ACTION, className)} {...rest}>
      {Icon ? <Icon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden /> : null}
      {children}
    </Link>
  );
}
