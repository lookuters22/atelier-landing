import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const ITEMS = [
  { label: "General", to: "/settings" },
  { label: "AI & Tone", to: "/settings/ai" },
] as const;

export function SettingsContextList() {
  return (
    <nav className="dashboard-context-pane flex h-full min-h-0 flex-col border-r border-border text-[13px] text-foreground">
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {ITEMS.map(({ label, to }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === "/settings"}
              className={({ isActive }) =>
                cn(
                  "block rounded-md px-3 py-2 transition-colors",
                  isActive ? "bg-accent text-foreground" : "text-foreground hover:bg-accent/50",
                )
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
