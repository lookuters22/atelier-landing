import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

const modes = [
  { value: "light" as const, icon: Sun, label: "Light" },
  { value: "dark" as const, icon: Moon, label: "Dark" },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
      {modes.map(({ value, icon: Icon, label }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setTheme(value);
            }}
            aria-label={label}
            title={label}
            className={
              "flex h-6 w-6 items-center justify-center rounded-sm transition-colors " +
              (active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}
