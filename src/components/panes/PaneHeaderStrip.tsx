import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Top block for compose + search (Inbox header strip). */
export function PaneHeaderStrip({
  children,
  className,
  variant: _variant = "inbox",
}: {
  children: ReactNode;
  className?: string;
  /** inbox | padded — same strip rhythm as Inbox (search + actions align across modes). */
  variant?: "inbox" | "padded";
}) {
  return (
    <div
      className={cn(
        "shrink-0 space-y-2 border-b border-transparent p-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
