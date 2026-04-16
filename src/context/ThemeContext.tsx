import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "dark" | "light" | "system";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolved: "dark" | "light";
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "atelier-theme";

function getSystemPreference(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeToDOM(resolved: "dark" | "light", animate: boolean) {
  if (window.location.pathname === "/" || window.location.pathname === "/landing") return;

  const root = document.documentElement;

  if (animate) {
    root.classList.add("theme-transitioning");
    const cleanup = () => {
      root.classList.remove("theme-transitioning");
      root.removeEventListener("transitionend", cleanup);
    };
    root.addEventListener("transitionend", cleanup);
    setTimeout(cleanup, 600);
  }

  root.classList.toggle("light", resolved === "light");
  root.style.colorScheme = resolved;
  root.style.background = resolved === "light" ? "#f2f2f7" : "#0a0a0a";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === "dark" || stored === "light" || stored === "system") return stored;
    } catch {}
    return "dark";
  });

  const resolved = theme === "system" ? getSystemPreference() : theme;
  const [mounted, setMounted] = useState(false);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}
    const next = t === "system" ? getSystemPreference() : t;
    applyThemeToDOM(next, true);
  }, []);

  useEffect(() => {
    applyThemeToDOM(resolved, false);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyThemeToDOM(resolved, false);
  }, [resolved, mounted]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setThemeState((prev) => (prev === "system" ? "system" : prev));
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolved }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
