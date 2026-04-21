import { cn } from "@/lib/utils";

/**
 * Ana dashboard dock — dark frosted pill, labeled icons, Fin underline on active.
 * Matches export/redesign/Ana Dashboard.html (no cursor-magnify; labels replace tooltips).
 */
export type DockItem = {
  title: string;
  icon: React.ReactNode;
  href: string;
  onClick?: () => void;
  active?: boolean;
  /** Optional count pill (export/redesign/Ana Dashboard.html `.unread`) */
  badge?: number;
  /** Vertical rule before this item (e.g. before Workspace) */
  separatorBefore?: boolean;
};

/** Glass values live in index.css (`nav.ana-floating-dock`) — literal Ana Dashboard.html `.dock` */

export function FloatingDock({
  items,
  desktopClassName,
  density = "default",
}: {
  items: DockItem[];
  desktopClassName?: string;
  /** Inbox: slightly more opaque bar (Ana HTML prototype). */
  density?: "default" | "inbox";
}) {
  return (
    <FloatingDockDesktop items={items} className={desktopClassName} density={density} />
  );
}

function FloatingDockDesktop({
  items,
  className,
  density,
}: {
  items: DockItem[];
  className?: string;
  density: "default" | "inbox";
}) {
  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        "pointer-events-auto ana-floating-dock relative mx-auto flex max-w-[calc(100vw-1.5rem)] items-center",
        density === "inbox" && "ana-floating-dock--inbox",
        className,
      )}
    >
      <div className="mr-1 flex h-[38px] shrink-0 items-center gap-2 border-r border-white/10 py-1 pl-1 pr-3">
        <span
          className="grid size-[22px] place-items-center rounded-md bg-[#ff5600] font-serif text-[14px] italic leading-none text-white shadow-[0_0_14px_rgba(255,86,0,0.55)]"
          aria-hidden
        >
          a
        </span>
        <span className="text-[12.5px] font-medium tracking-tight text-white">Ana</span>
      </div>

      {items.map((item) => (
        <DockItemButton key={`${item.href}-${item.title}`} {...item} />
      ))}
    </nav>
  );
}

function DockItemButton({
  title,
  icon,
  onClick,
  active = false,
  badge,
  separatorBefore,
}: DockItem) {
  const showBadge = typeof badge === "number" && badge > 0;
  return (
    <>
      {separatorBefore ? (
        <div
          className="mx-1 h-5 w-px shrink-0 bg-white/10"
          aria-hidden
        />
      ) : null}
      <button
        type="button"
        onClick={onClick}
        data-active={active ? "true" : "false"}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex h-[38px] min-w-[48px] shrink-0 flex-col items-center justify-center gap-[3px] rounded-[10px] px-2.5 text-left transition-[color,background-color] duration-[160ms] ease-[cubic-bezier(0.2,0,0,1)]",
          active
            ? "bg-white/10 text-white"
            : "text-white/[0.72] hover:bg-white/[0.06] hover:text-white",
        )}
      >
        <span className="relative flex items-center justify-center [&_svg]:size-[17px] [&_svg]:shrink-0 [&_svg]:stroke-[1.7]">
          {icon}
          {showBadge ? (
            <span className="absolute -right-2 -top-1.5 flex h-3 min-w-3 place-items-center rounded-full bg-[#ff5600] px-0.5 text-[9px] font-normal leading-none text-white tabular-nums">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </span>
        <span className="dock-label text-[10.5px] font-light leading-none tracking-[0.2px] opacity-90">
          {title}
        </span>
        {active ? (
          <span
            className="pointer-events-none absolute -bottom-[5px] left-1/2 h-0.5 w-[18px] -translate-x-1/2 rounded-sm bg-[#ff5600] shadow-[0_0_10px_rgba(255,86,0,0.7)]"
            aria-hidden
          />
        ) : null}
      </button>
    </>
  );
}
