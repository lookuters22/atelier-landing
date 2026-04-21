import { useState, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FloatingDock, type DockItem } from "./FloatingDock";
import {
  DockIconToday,
  DockIconInbox,
  DockIconPipeline,
  DockIconCalendar,
  DockIconWorkspace,
  DockIconDirectory,
  DockIconSettings,
} from "./dockIcons";
import { useTodayActions } from "../../hooks/useTodayActions";

const NAV_ITEMS = [
  { to: "/today", label: "Today", match: (p: string) => p.startsWith("/today") || p === "/" },
  { to: "/inbox", label: "Inbox", match: (p: string) => p.startsWith("/inbox") },
  { to: "/pipeline", label: "Pipeline", match: (p: string) => p.startsWith("/pipeline") },
  { to: "/calendar", label: "Calendar", match: (p: string) => p.startsWith("/calendar") },
  { to: "/workspace", label: "Projects", match: (p: string) => p.startsWith("/workspace"), separatorBefore: true },
  { to: "/directory", label: "People", match: (p: string) => p.startsWith("/directory") },
  { to: "/settings", label: "Settings", match: (p: string) => p.startsWith("/settings") },
];

function iconFor(to: string) {
  switch (to) {
    case "/today":
      return <DockIconToday />;
    case "/inbox":
      return <DockIconInbox />;
    case "/pipeline":
      return <DockIconPipeline />;
    case "/calendar":
      return <DockIconCalendar />;
    case "/workspace":
      return <DockIconWorkspace />;
    case "/directory":
      return <DockIconDirectory />;
    case "/settings":
      return <DockIconSettings />;
    default:
      return <DockIconToday />;
  }
}

function EphemeralHint() {
  const [phase, setPhase] = useState<"waiting" | "visible" | "gone">("waiting");
  useEffect(() => {
    const show = setTimeout(() => setPhase("visible"), 3_000);
    const hide = setTimeout(() => setPhase("gone"), 8_000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);
  if (phase !== "visible") return null;
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("studio-spotlight:open"));
        setPhase("gone");
      }}
      className="px-3 py-1 opacity-70 transition-opacity duration-150 ease-out hover:opacity-90"
    >
      <span className="font-mono text-[10px] text-foreground/45">⌘K to search</span>
    </button>
  );
}

export function NavigationDock() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [isHovering, setIsHovering] = useState(false);
  const { allActions, counts } = useTodayActions();

  const isFocusMode = !pathname.startsWith("/today") && pathname !== "/";

  const handleMouseEnterTrigger = useCallback(() => setIsHovering(true), []);
  const handleMouseLeaveDock = useCallback(() => setIsHovering(false), []);

  const dockItems: DockItem[] = NAV_ITEMS.map((item) => {
    let badge: number | undefined;
    if (item.to === "/today") {
      badge = allActions.length;
    } else if (item.to === "/inbox") {
      badge = counts.unfiled;
    }
    return {
      title: item.label,
      icon: iconFor(item.to),
      href: item.to,
      active: item.match(pathname),
      onClick: () => navigate(item.to),
      separatorBefore: item.separatorBefore,
      badge,
    };
  });

  const isVisible = !isFocusMode || isHovering;

  return (
    <>
      {isFocusMode && (
        <div className="fixed bottom-0 left-0 z-[49] h-[30px] w-full" onMouseEnter={handleMouseEnterTrigger} />
      )}

      <div
        className={`dock-wrap pointer-events-none fixed bottom-[18px] left-1/2 z-[50] flex -translate-x-1/2 flex-col items-center transition-[transform,opacity] duration-150 ease-out ${
          isVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[150%] opacity-0"
        }`}
        onMouseLeave={handleMouseLeaveDock}
      >
        <div className="pointer-events-auto flex flex-col items-center gap-2">
          <EphemeralHint />
          <FloatingDock items={dockItems} density={pathname.startsWith("/inbox") ? "inbox" : "default"} />
        </div>
      </div>
    </>
  );
}
