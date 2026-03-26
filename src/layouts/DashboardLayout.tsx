import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Bell,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  CircleUser,
  Columns3,
  GalleryHorizontal,
  HelpCircle,
  Inbox,
  LayoutGrid,
  ListTodo,
  Wallet,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import { SupportAssistantWidget } from "../components/SupportAssistantWidget";

const nav = [
  { to: "/", label: "Today", icon: LayoutGrid, end: true },
  { to: "/weddings", label: "Weddings", icon: GalleryHorizontal },
  { to: "/inbox", label: "Inbox", icon: Inbox, badge: 3 },
  { to: "/approvals", label: "Approvals", icon: CheckSquare, badge: 2 },
  { to: "/pipeline", label: "Pipeline", icon: Columns3 },
  { to: "/financials", label: "Financials", icon: Wallet },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/tasks", label: "Tasks", icon: ListTodo },
];

const notificationsSeed = [
  { id: "1", title: "Draft awaiting approval", body: "Sofia & Marco — timeline v3 response", time: "12 min ago", href: "/approvals", unread: true },
  { id: "2", title: "Unfiled thread", body: "Insurance certificate — Castello Brown", time: "32 min ago", href: "/inbox", unread: true },
  { id: "3", title: "Task due today", body: "Questionnaire reminder — Villa Cetinale", time: "Today", href: "/tasks", unread: false },
];

export function DashboardLayout() {
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notifs, setNotifs] = useState(notificationsSeed);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    if (notifOpen) document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [notifOpen]);

  const unreadCount = notifs.filter((n) => n.unread).length;
  const markAllRead = () => setNotifs((prev) => prev.map((n) => ({ ...n, unread: false })));
  const openNotification = (href: string, id: string) => {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)));
    setNotifOpen(false);
    navigate(href);
  };

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="flex w-[260px] shrink-0 flex-col bg-sidebar text-white/90">
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-sm font-semibold tracking-tight">A</div>
          <div>
            <p className="text-[13px] font-semibold tracking-wide text-white">Atelier</p>
            <p className="text-[11px] text-white/45">Studio OS</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3 pb-4">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                ["group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors", isActive ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/[0.06] hover:text-white"].join(" ")
              }
            >
              <item.icon className="h-[18px] w-[18px] shrink-0 opacity-90" strokeWidth={1.75} />
              <span className="flex-1">{item.label}</span>
              {item.badge ? <span className="rounded-full bg-[#e01e5a] px-1.5 py-0.5 text-[10px] font-semibold text-white">{item.badge}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/[0.06] px-3 py-4 space-y-1">
          <NavLink to="/settings" className={({ isActive }) => ["flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors", isActive ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/[0.06] hover:text-white"].join(" ")}>
            <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} />
            Settings
          </NavLink>
        </div>
        <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">ED</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-white">Elena Duarte</p>
            <p className="truncate text-[11px] text-white/45">elena@atelier.studio</p>
          </div>
          <ChevronDown className="h-4 w-4 text-white/35" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-6 border-b border-border bg-canvas/90 px-8 py-4 backdrop-blur-md">
          <div className="relative max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input type="search" placeholder="Search weddings, people, or messages" className="w-full rounded-full border border-border bg-surface py-2.5 pl-11 pr-4 text-[13px] text-ink shadow-[0_8px_24px_rgba(26,28,30,0.06)] placeholder:text-ink-faint focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/20" onKeyDown={(e) => { if (e.key === "Enter") navigate("/inbox"); }} />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-full p-2.5 text-ink-muted transition hover:bg-surface hover:text-ink" aria-label="Help" onClick={() => setHelpOpen(true)}><HelpCircle className="h-5 w-5" strokeWidth={1.5} /></button>
            <div className="relative" ref={notifRef}>
              <button type="button" className="relative rounded-full p-2.5 text-ink-muted transition hover:bg-surface hover:text-ink" aria-label="Notifications" aria-expanded={notifOpen} onClick={() => setNotifOpen((o) => !o)}><Bell className="h-5 w-5" strokeWidth={1.5} />{unreadCount > 0 ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#e01e5a] ring-2 ring-canvas" /> : null}</button>
              {notifOpen ? (
                <div className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] rounded-2xl border border-border bg-surface py-2 shadow-[0_8px_32px_rgba(26,28,30,0.12)]">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2">
                    <p className="text-[13px] font-semibold text-ink">Notifications</p>
                    <button type="button" className="text-[12px] font-semibold text-accent hover:text-accent-hover" onClick={markAllRead}>Mark all read</button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifs.map((n) => (
                      <button key={n.id} type="button" onClick={() => openNotification(n.href, n.id)} className={"flex w-full flex-col gap-0.5 border-b border-border/80 px-4 py-3 text-left last:border-0 " + (n.unread ? "bg-accent/5" : "hover:bg-canvas/80")}>
                        <div className="flex items-center justify-between gap-2"><span className="text-[13px] font-semibold text-ink">{n.title}</span>{n.unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-accent" /> : null}</div>
                        <span className="text-[12px] text-ink-muted">{n.body}</span>
                        <span className="text-[11px] text-ink-faint">{n.time}</span>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-border px-4 py-2">
                    <button type="button" className="text-[12px] font-semibold text-accent hover:text-accent-hover" onClick={() => { setNotifOpen(false); navigate("/inbox"); }}>Open inbox</button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="ml-2 flex items-center gap-2 rounded-full border border-border bg-surface px-2 py-1.5 pl-2 shadow-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar text-[11px] font-semibold text-white">ED</div>
              <div className="hidden pr-2 sm:block"><p className="text-[12px] font-medium text-ink">Elena Duarte</p><p className="text-[11px] text-ink-faint">Owner</p></div>
              <CircleUser className="hidden h-4 w-4 text-ink-faint sm:block" />
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1 px-8 py-8"><Outlet /></main>
      </div>
      <SupportAssistantWidget />
      {helpOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="help-title">
          <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <button type="button" className="absolute right-4 top-4 rounded-full p-1 text-ink-faint hover:bg-canvas hover:text-ink" aria-label="Close" onClick={() => setHelpOpen(false)}><X className="h-5 w-5" /></button>
            <h2 id="help-title" className="text-lg font-semibold text-ink">Help</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">Use <strong className="text-ink">Today</strong> for priorities, <strong className="text-ink">Inbox</strong> to triage threads, and <strong className="text-ink">Approvals</strong> before anything is sent to clients.</p>
            <ul className="mt-4 list-inside list-disc space-y-2 text-[13px] text-ink-muted"><li>Notifications surface drafts and unfiled mail.</li><li>Search + Enter jumps to Inbox (demo).</li><li>WhatsApp mirrors the same queue when connected.</li></ul>
            <button type="button" className="mt-6 w-full rounded-full bg-ink py-2.5 text-[13px] font-semibold text-canvas" onClick={() => setHelpOpen(false)}>Got it</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
