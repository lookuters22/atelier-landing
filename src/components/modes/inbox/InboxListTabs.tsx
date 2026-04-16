import { cn } from "@/lib/utils";
import type { InboxListTab } from "../../../lib/inboxVisibleThreads";

const TABS: { id: InboxListTab; label: string }[] = [
  { id: "all", label: "All Mail" },
  { id: "inquiries", label: "Inquiries" },
  { id: "unassigned", label: "Unassigned" },
];

export function InboxListTabs({
  listTab,
  onChange,
  disabled,
}: {
  listTab: InboxListTab;
  onChange: (t: InboxListTab) => void;
  /** When project filter is active, tabs are visually disabled — project filter overrides tab semantics. */
  disabled?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="Inbox filters"
      className="flex shrink-0 gap-1 border-b border-border bg-background px-3 py-2"
    >
      {TABS.map((tab) => {
        const selected = listTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            onClick={() => onChange(tab.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
              disabled && "cursor-not-allowed opacity-50",
              selected && !disabled
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
