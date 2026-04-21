import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  Filter,
  Mail,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ListPageSkeleton } from "../components/DashboardSkeleton";
import { useUnfiledInbox, type UnfiledThread } from "../hooks/useUnfiledInbox";
import { isSuppressedInboxThread } from "../lib/inboxThreadBucket";

type FilterId =
  | "all"
  | "inquiries"
  | "active_weddings"
  | "past_weddings"
  | "needs_reply"
  | "unfiled"
  | "draft"
  | "planner";

type InboxRow = {
  id: string;
  wedding: string;
  weddingId: string | null;
  subject: string;
  snippet: string;
  sender: string;
  time: string;
  badges: string[];
  categories: FilterId[];
  suggestedWeddingId: string | null;
  suggestedCoupleName: string | null;
  suggestedReasoning: string | null;
  confidencePct: number;
};

const FOCUS_FILTERS: { id: FilterId; label: string; Icon: LucideIcon }[] = [
  { id: "inquiries", label: "Inquiries", Icon: Mail },
  { id: "active_weddings", label: "Active weddings", Icon: CalendarClock },
  { id: "past_weddings", label: "Past weddings", Icon: Archive },
];

const QUICK_FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All messages" },
  { id: "needs_reply", label: "Needs reply" },
  { id: "unfiled", label: "Unfiled" },
  { id: "draft", label: "Has draft" },
  { id: "planner", label: "Planner" },
];

function filterLabel(filter: FilterId): string {
  const focus = FOCUS_FILTERS.find((x) => x.id === filter);
  if (focus) return focus.label;
  const q = QUICK_FILTERS.find((x) => x.id === filter);
  return q?.label ?? "All messages";
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return "Last week";
}

function threadToRow(
  t: UnfiledThread,
  weddingLookup: Map<string, string>,
): InboxRow {
  const meta = t.ai_routing_metadata;
  const suggestedId = meta?.suggested_wedding_id ?? null;
  const suggestedName = suggestedId ? (weddingLookup.get(suggestedId) ?? null) : null;

  return {
    id: t.id,
    wedding: t.weddingId ? (weddingLookup.get(t.weddingId) ?? "Linked project") : "Unfiled",
    weddingId: t.weddingId,
    subject: t.title,
    snippet: t.snippet,
    sender: t.sender,
    time: formatTimeAgo(t.last_activity_at),
    badges: t.weddingId ? ["Linked"] : ["Unfiled"],
    categories: t.weddingId ? ["all"] : ["all", "unfiled"],
    suggestedWeddingId: suggestedId,
    suggestedCoupleName: suggestedName,
    suggestedReasoning: meta?.reasoning ?? null,
    confidencePct: meta?.confidence_score ?? 0,
  };
}

export function InboxPage() {
  const [searchParams] = useSearchParams();
  const initialFilter = (searchParams.get("filter") as FilterId) || "all";

  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterId>(initialFilter);
  const panelRef = useRef<HTMLDivElement>(null);
  const [linkSelections, setLinkSelections] = useState<Record<string, string>>({});

  const { inboxThreads, activeWeddings, isLoading, loadError, linkThread, deleteThread } =
    useUnfiledInbox();
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setFilterOpen(false);
    }
    if (filterOpen) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [filterOpen]);

  useEffect(() => {
    function closeMenu(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenId(null);
    }
    if (menuOpenId) document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, [menuOpenId]);

  const weddingLookup = useMemo(
    () => new Map(activeWeddings.map((w) => [w.id, w.couple_names])),
    [activeWeddings],
  );

  const rows = useMemo(
    () =>
      inboxThreads
        .filter((t) => !isSuppressedInboxThread(t))
        .map((t) => threadToRow(t, weddingLookup)),
    [inboxThreads, weddingLookup],
  );

  const visible = useMemo(() => {
    if (activeFilter === "unfiled" || activeFilter === "all") return rows;
    return [];
  }, [activeFilter, rows]);

  const selectFilter = (id: FilterId) => {
    setActiveFilter(id);
    setFilterOpen(false);
  };

  function getDefaultSelection(row: InboxRow): string {
    if (linkSelections[row.id] !== undefined) return linkSelections[row.id];
    return row.suggestedWeddingId ?? "";
  }

  function handleLinkThread(threadId: string, fallbackSuggestion: string | null) {
    const weddingId = linkSelections[threadId] ?? fallbackSuggestion;
    if (!weddingId) return;
    linkThread(threadId, weddingId);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-display-m text-ink">Inbox</h1>
          <p className="mt-2 max-w-2xl type-small text-ink-muted">
            Triage across every wedding. Link stray threads once—Atelier keeps the timeline unified.
          </p>
          {loadError ? (
            <div
              className="mt-3 max-w-2xl rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 type-small text-red-700 dark:text-red-300/95"
              role="alert"
            >
              <span className="font-semibold">Could not load Inbox data. </span>
              <span className="font-mono text-[12px]">{loadError}</span>
            </div>
          ) : null}
        </div>
        <div className="relative" ref={panelRef}>
          <button
            type="button"
            aria-expanded={filterOpen}
            aria-haspopup="listbox"
            className={
              "inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-2 type-small transition " +
              (activeFilter !== "all"
                ? "border-ink/10 text-ink"
                : "border-border text-ink-muted hover:border-ink/15 hover:text-ink")
            }
            onClick={() => setFilterOpen((o) => !o)}
          >
            <Filter className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span>
              {activeFilter === "all" ? "Filters" : filterLabel(activeFilter)}
            </span>
            {activeFilter !== "all" ? (
              <span className="rounded-full bg-border/50 px-2 py-0.5 text-[12px] font-semibold text-ink-muted">
                Active
              </span>
            ) : null}
            <ChevronDown
              className={"h-4 w-4 shrink-0 opacity-60 transition " + (filterOpen ? "rotate-180" : "")}
              strokeWidth={1.75}
            />
          </button>

          {filterOpen ? (
            <div
              className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(100vw-2rem,20rem)] rounded-lg border border-border/90 bg-surface py-2"
              role="listbox"
            >
              <div className="border-b border-border/70 px-3 pb-2 pt-1">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Focus
                </p>
                <div className="flex flex-col gap-1">
                  {FOCUS_FILTERS.map(({ id, label, Icon }) => {
                    const on = activeFilter === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="option"
                        aria-selected={on}
                        className={
                          "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left type-small font-semibold transition " +
                          (on
                            ? "bg-canvas text-ink ring-1 ring-ink/10"
                            : "text-ink-muted hover:bg-canvas/80 hover:text-ink")
                        }
                        onClick={() => selectFilter(id)}
                      >
                        <span
                          className={
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " +
                            (on ? "bg-surface text-link" : "bg-canvas/90 text-ink-faint")
                          }
                        >
                          <Icon className="h-4 w-4" strokeWidth={1.75} />
                        </span>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="px-2 pt-2">
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Quick filters
                </p>
                {QUICK_FILTERS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={activeFilter === o.id}
                    className={
                      "flex w-full rounded-lg px-2 py-2 text-left type-small transition " +
                      (activeFilter === o.id
                        ? "bg-canvas font-semibold text-ink ring-1 ring-ink/8"
                        : "text-ink-muted hover:bg-canvas/70 hover:text-ink")
                    }
                    onClick={() => selectFilter(o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <ListPageSkeleton />
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-canvas/40 px-6 py-12 text-center">
          <p className="type-body font-semibold text-ink">No threads in this view</p>
          <p className="mt-2 type-small text-ink-muted">
            Try another filter, or switch back to <strong className="text-ink">All messages</strong>.
          </p>
          <button
            type="button"
            className="mt-4 rounded-md border border-border bg-surface px-4 py-2 type-small font-semibold text-ink transition hover:border-white/[0.12]"
            onClick={() => setActiveFilter("all")}
          >
            Show all messages
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((row) => (
            <div
              key={row.id}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="type-small font-semibold text-ink">{row.wedding}</p>
                    {row.badges.map((b) => (
                      <span
                        key={b}
                        className={
                          "rounded-full px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wide " +
                          (b === "Inquiry"
                            ? "bg-link/15 text-link"
                            : "bg-border/50 text-ink-muted")
                        }
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 type-body font-semibold text-ink">{row.subject}</p>
                  <p className="mt-1 type-small text-ink-muted">{row.snippet}</p>

                  {row.suggestedCoupleName ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-canvas px-3 py-2 type-small text-ink-muted">
                      <span className="font-semibold text-ink">{row.confidencePct}% match</span>
                      <span>· AI Suggests: {row.suggestedCoupleName}</span>
                      {row.suggestedReasoning ? (
                        <span className="text-ink-faint">— {row.suggestedReasoning}</span>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-lg border border-border bg-canvas px-2 py-1.5 type-small text-ink"
                      value={getDefaultSelection(row)}
                      onChange={(e) =>
                        setLinkSelections((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                    >
                      <option value="">Choose wedding…</option>
                      {activeWeddings.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.couple_names}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!getDefaultSelection(row)}
                      onClick={() => handleLinkThread(row.id, row.suggestedWeddingId)}
                      className="rounded-md border border-border bg-surface px-3 py-1.5 type-small font-semibold text-ink transition hover:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Link Thread
                    </button>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="type-small text-ink-faint">{row.time}</span>
                  <div className="relative" ref={menuOpenId === row.id ? menuRef : undefined}>
                    <button
                      type="button"
                      aria-label="Thread options"
                      className="rounded-lg p-1.5 text-ink-faint transition hover:bg-canvas hover:text-ink"
                      onClick={() => setMenuOpenId(menuOpenId === row.id ? null : row.id)}
                    >
                      <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                    {menuOpenId === row.id && (
                      <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-xl border border-border bg-surface py-1 shadow-[0_8px_24px_rgba(26,28,30,0.12)]">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 type-small text-red-400 transition hover:bg-canvas"
                          onClick={() => {
                            setMenuOpenId(null);
                            if (window.confirm("Are you sure you want to delete this thread? All messages will be permanently removed.")) {
                              deleteThread(row.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Delete thread
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
