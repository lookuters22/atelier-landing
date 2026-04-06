import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sun,
  MessageSquare,
  Columns3,
  CalendarDays,
  Briefcase,
  Users,
  Settings,
  AlertCircle,
} from "lucide-react";
import { FloatingDock, type DockItem } from "./FloatingDock";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

const NAV_ITEMS = [
  { to: "/today", icon: Sun, label: "Home", match: (p: string) => p.startsWith("/today") || p === "/" },
  { to: "/inbox", icon: MessageSquare, label: "Inbox", match: (p: string) => p.startsWith("/inbox") },
  { to: "/pipeline", icon: Columns3, label: "Pipeline", match: (p: string) => p.startsWith("/pipeline") },
  { to: "/calendar", icon: CalendarDays, label: "Calendar", match: (p: string) => p.startsWith("/calendar") },
  { to: "/workspace", icon: Briefcase, label: "Workspace", match: (p: string) => p.startsWith("/workspace") },
  { to: "/directory", icon: Users, label: "Directory", match: (p: string) => p.startsWith("/directory") },
  { to: "/settings", icon: Settings, label: "Settings", match: (p: string) => p.startsWith("/settings") },
];

function EphemeralHint() {
  const [phase, setPhase] = useState<"waiting" | "visible" | "gone">("waiting");
  useEffect(() => {
    const show = setTimeout(() => setPhase("visible"), 3_000);
    const hide = setTimeout(() => setPhase("gone"), 8_000);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, []);
  return (
    <AnimatePresence>
      {phase === "visible" && (
        <motion.button
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("studio-spotlight:open"));
            setPhase("gone");
          }}
          className="px-3 py-1"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 0.7, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 1.2 }}
        >
          <span className="font-mono text-[10px] text-white/50">⌘K to search</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export function NavigationDock() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { photographerId } = useAuth();
  const [isHovering, setIsHovering] = useState(false);
  const [openEscalationsCount, setOpenEscalationsCount] = useState<number | null>(null);

  useEffect(() => {
    if (!photographerId) {
      setOpenEscalationsCount(null);
      return;
    }
    let cancelled = false;
    async function loadOpenEscalations() {
      const { count, error } = await supabase
        .from("escalation_requests")
        .select("*", { count: "exact", head: true })
        .eq("photographer_id", photographerId)
        .eq("status", "open");
      if (cancelled || error) return;
      setOpenEscalationsCount(count ?? 0);
    }
    void loadOpenEscalations();
    const interval = setInterval(() => void loadOpenEscalations(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [photographerId]);

  const isFocusMode = !pathname.startsWith("/today") && pathname !== "/";

  const handleMouseEnterTrigger = useCallback(() => setIsHovering(true), []);
  const handleMouseLeaveDock = useCallback(() => setIsHovering(false), []);

  const dockItems: DockItem[] = useMemo(() => {
    const mapItem = (item: (typeof NAV_ITEMS)[number]): DockItem => ({
      title: item.label,
      icon: <item.icon className="size-[1em] shrink-0" strokeWidth={1.35} aria-hidden />,
      href: item.to,
      active: item.match(pathname),
      onClick: () => navigate(item.to),
    });

    const escalationIcon = (
      <span className="relative inline-flex items-center justify-center" aria-hidden>
        <AlertCircle className="size-[1em] shrink-0" strokeWidth={1.35} />
        {openEscalationsCount != null && openEscalationsCount > 0 ? (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white tabular-nums shadow-sm">
            {openEscalationsCount > 99 ? "99+" : openEscalationsCount}
          </span>
        ) : null}
      </span>
    );

    const escalationsItem: DockItem = {
      title: "Escalations",
      icon: escalationIcon,
      href: "/escalations",
      active: pathname.startsWith("/escalations"),
      onClick: () => navigate("/escalations"),
    };

    return [...NAV_ITEMS.slice(0, 2).map(mapItem), escalationsItem, ...NAV_ITEMS.slice(2).map(mapItem)];
  }, [navigate, pathname, openEscalationsCount]);

  const isVisible = !isFocusMode || isHovering;

  return (
    <>
      {isFocusMode && (
        <div
          className="fixed bottom-0 left-0 z-[49] h-[30px] w-full"
          onMouseEnter={handleMouseEnterTrigger}
        />
      )}

      <div
        className={`fixed bottom-6 left-1/2 z-[50] flex -translate-x-1/2 flex-col items-center gap-2 transition-all duration-300 ease-out ${
          isVisible
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-[150%] opacity-0"
        }`}
        onMouseLeave={handleMouseLeaveDock}
      >
        <EphemeralHint />
        <FloatingDock items={dockItems} />
      </div>
    </>
  );
}
