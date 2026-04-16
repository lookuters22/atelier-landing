import { Search, Users, Heart, Briefcase, Building } from "lucide-react";
import { useDirectoryMode, type DirectoryCategory } from "./DirectoryModeContext";

const CATEGORIES: { id: DirectoryCategory; label: string; icon: typeof Users }[] = [
  { id: "all", label: "All Contacts", icon: Users },
  { id: "clients", label: "Clients", icon: Heart },
  { id: "vendors", label: "Vendors", icon: Briefcase },
  { id: "venues", label: "Venues", icon: Building },
];

export function DirectoryContextList() {
  const { searchQuery, setSearchQuery, activeCategory, setActiveCategory, categoryCounts } =
    useDirectoryMode();

  return (
    <div className="dashboard-context-pane flex h-full min-h-0 flex-col border-r border-border text-[13px] text-foreground">
      <div className="shrink-0 p-2 pb-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.75}
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts\u2026"
            className="w-full rounded-md border border-border bg-background pl-8 pr-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Search contacts"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        <div className="mb-1 px-2 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Categories
        </div>
        <div className="flex flex-col gap-0.5">
          {CATEGORIES.map(({ id, label, icon: Icon }) => {
            const isActive = activeCategory === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveCategory(id)}
                className={
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors " +
                  (isActive
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground")
                }
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span
                  className={
                    "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums " +
                    (isActive
                      ? "bg-foreground/10 font-medium text-foreground"
                      : "text-muted-foreground")
                  }
                >
                  {categoryCounts[id]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
