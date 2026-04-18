import { Users, Heart, Briefcase, Building } from "lucide-react";
import {
  ContextPaneRoot,
  PaneCountBadge,
  PaneHeaderStrip,
  PaneNavRow,
  PaneScrollRegion,
  PaneSearchInput,
  PaneSectionLabel,
} from "@/components/panes";
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
    <ContextPaneRoot>
      <PaneHeaderStrip>
        <PaneSearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search contacts…"
          aria-label="Search contacts"
        />
      </PaneHeaderStrip>

      <PaneScrollRegion>
        <PaneSectionLabel>Categories</PaneSectionLabel>
        <div className="flex flex-col gap-0.5">
          {CATEGORIES.map(({ id, label, icon: Icon }) => {
            const isActive = activeCategory === id;
            return (
              <PaneNavRow
                key={id}
                active={isActive}
                icon={Icon}
                onClick={() => setActiveCategory(id)}
                endAdornment={<PaneCountBadge>{categoryCounts[id]}</PaneCountBadge>}
              >
                {label}
              </PaneNavRow>
            );
          })}
        </div>
      </PaneScrollRegion>
    </ContextPaneRoot>
  );
}
