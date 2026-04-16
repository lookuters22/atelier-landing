import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Prominent Settings entry for the studio briefing shell (canonical route: `/onboarding`).
 */
export function StudioBriefingEntryCard() {
  return (
    <Link
      to="/onboarding"
      className={cn(
        "mt-6 flex w-full max-w-xl items-center justify-between gap-4 rounded-xl border border-border bg-muted/35 px-4 py-4 text-left shadow-sm ring-1 ring-border/40 transition-colors",
        "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="min-w-0">
        <p className="text-[14px] font-semibold tracking-tight text-foreground">Edit Studio Briefing</p>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
          Scope, voice, approvals, and vault rules — saved as a draft in your settings until you finalize later.
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
