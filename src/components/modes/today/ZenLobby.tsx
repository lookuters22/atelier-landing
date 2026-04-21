import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EscalationResolutionPanel } from "../../escalations/EscalationResolutionPanel";
import { openSpotlight } from "../../StudioSpotlight";
import { useTodayActions } from "../../../hooks/useTodayActions";
import { useTodayMetrics } from "../../../hooks/useTodayMetrics";
import { useAuth } from "../../../context/AuthContext";
import { cn } from "@/lib/utils";
import { scrollPipelineWeddingRowIntoView } from "@/lib/pipelineWeddingListNavigation";
import { isEditableKeyboardTarget } from "@/lib/timelineThreadNavigation";
import {
  ZEN_LOBBY_ESCALATION_ROW_BADGE,
  zenLobbyPriorityKindFromAction,
} from "@/lib/zenLobbyPriorityFeed";
import {
  ZEN_TODAY_TAB_LABELS,
  ZEN_TODAY_TAB_ORDER,
  zenTodayTabForAction,
  type ZenTodayTabId,
} from "@/lib/todayActionFeed";
import type { User } from "@supabase/supabase-js";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * **Six** full `.prow` rows in the default list viewport (sixth = tail / same opacity as `.prow.done`,
 * Ana Dashboard.html L492). `max-height` must clip **exactly** under the 6th row—summing row heights +
 * gap can drift from flex layout and show half of row 7/8. We anchor the cut to the **bottom edge of
 * the 6th row** via `getBoundingClientRect`, then trim a few px (do not add `.pri-list` padding-bottom).
 */
const PRI_LIST_VISIBLE_ROW_CAP = 6;
/** Trim below the 6th row’s bottom edge. Kept small so the last visible row’s border isn’t clipped. */
const PRI_LIST_MAX_HEIGHT_FUDGE_PX = 1;
/** Extra height below the measured cut so the last row’s border doesn’t sit flush on the clip. */
const PRI_LIST_VIEWPORT_BOTTOM_BREATHING_ROOM_PX = 3;

type ActionItem = {
  id: string;
  kind: "message" | "draft" | "task" | "escalation";
  label: string;
  detail: string;
  status: string;
  createdAt?: string;
  routeTo: string;
  /** From Today unfiled actions — replaces generic "Inquiry" for message rows. */
  zenPriorityTag?: string;
  /** `null` when the action is not part of a Zen tab (e.g. open tasks — see pulse / sidebar). */
  zenTab: ZenTodayTabId | null;
};

type PriTab = ZenTodayTabId;

/** Ana Dashboard.html `.prow.done` — only the explicit Done row; no substring/heuristic fade. */
function isDoneStatusLabel(status: string): boolean {
  return status.trim().toLowerCase() === "done";
}

function firstNameFromUser(user: User | null): string {
  if (!user) return "there";
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const full = (meta?.full_name ?? meta?.name ?? meta?.studio_name) as string | undefined;
  if (full && typeof full === "string") {
    const part = full.trim().split(/\s+/)[0];
    if (part) return part.replace(/^[^a-zA-Z]+/, "");
  }
  const email = user.email;
  if (email) {
    const local = email.split("@")[0] ?? "";
    if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return "there";
}

function formatGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning,";
  if (h < 18) return "Good afternoon,";
  return "Good evening,";
}

function formatMetaDate(now: Date): string {
  return now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function formatTimeHHMM(now = new Date()): string {
  return now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Same quadratic as export/redesign/Ana Dashboard.html meta sun: `M 4 16 Q 45 -4 86 16` (viewBox 0 0 90 20). */
function quadBezierPoint(
  t: number,
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
): { x: number; y: number } {
  const u = 1 - t;
  const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
  const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
  return { x, y };
}

const SUN_ARC_P0: [number, number] = [4, 16];
const SUN_ARC_P1: [number, number] = [45, -4];
const SUN_ARC_P2: [number, number] = [86, 16];

/** Local day progress 0..1 from midnight → current instant (updates with `now`). */
function dayProgressT(now: Date): number {
  const ms =
    ((now.getHours() * 60 + now.getMinutes()) * 60 + now.getSeconds()) * 1000 + now.getMilliseconds();
  return ms / 86_400_000;
}

function MetaSunArc({ now }: { now: Date }) {
  const t = dayProgressT(now);
  const { x, y } = quadBezierPoint(t, SUN_ARC_P0, SUN_ARC_P1, SUN_ARC_P2);
  return (
    <span className="sun" aria-hidden>
      <svg viewBox="0 0 90 20" preserveAspectRatio="none">
        <path className="arc" d="M 4 16 Q 45 -4 86 16" pathLength={1} />
        <circle className="dot" cx={x} cy={y} r={3.2} />
      </svg>
    </span>
  );
}

function buildPulseLines(
  zenTab: {
    review: number;
    drafts: number;
    leads: number;
    needs_filing: number;
  },
  tasksDueToday: number,
  featuredNames: string | null,
): string[] {
  const lines: string[] = [];
  if (zenTab.review > 0) {
    lines.push(
      zenTab.review === 1
        ? "needs your review on one blocked decision or operator thread."
        : `needs your review on ${zenTab.review} blocked decisions or operator threads.`,
    );
  }
  if (zenTab.drafts > 0) {
    lines.push(
      zenTab.drafts === 1
        ? "has one draft ready for your review."
        : `has ${zenTab.drafts} drafts ready for your review.`,
    );
  }
  if (zenTab.leads > 0) {
    lines.push(
      zenTab.leads === 1
        ? "is watching one lead (inbox or pre-booking project)."
        : `is watching ${zenTab.leads} leads (inbox or pre-booking projects).`,
    );
  }
  if (zenTab.needs_filing > 0) {
    lines.push(
      zenTab.needs_filing === 1
        ? "has one thread that still needs filing."
        : `has ${zenTab.needs_filing} threads that still need filing.`,
    );
  }
  if (tasksDueToday > 0) {
    lines.push(
      tasksDueToday === 1
        ? "counts one task due today on your list."
        : `counts ${tasksDueToday} tasks due today on your list.`,
    );
  }
  if (featuredNames) {
    lines.push(`notes the next wedding on your calendar: ${featuredNames}.`);
  }
  if (lines.length === 0) {
    lines.push("will surface new work here as it arrives — you're caught up for now.");
  }
  return lines.slice(0, 6);
}

function AnaPulse({ lines }: { lines: string[] }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (lines.length <= 1) return;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % lines.length), 6_000);
    return () => window.clearInterval(id);
  }, [lines.length]);
  const text = lines[idx] ?? "";
  return (
    <p className="pulse">
      <span className="fin">Ana</span> {text}
    </p>
  );
}

function useLiveClock() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const now = new Date();
  return { metaDate: formatMetaDate(now), timeHHMM: formatTimeHHMM(now), now };
}

function useIdle(timeout: number): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), timeout);
    const reset = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), timeout);
    };
    window.addEventListener("mousemove", reset);
    window.addEventListener("keydown", reset);
    window.addEventListener("pointerdown", reset);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", reset);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("pointerdown", reset);
    };
  }, [timeout]);
  return idle;
}

function formatRelativeTime(iso?: string): string {
  if (!iso) return "just now";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Matches redesign list row age: `· 42m` / `· 1h` (no trailing "ago"). */
function formatAgeShort(iso?: string): string {
  if (!iso) return "now";
  const full = formatRelativeTime(iso);
  return full.replace(/\s*ago$/, "").replace(/^just now$/, "now");
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function heroWho(item: ActionItem): string {
  if (item.detail?.trim()) return item.detail.trim();
  return item.label.slice(0, 80);
}

function HeroMetaRow({ item }: { item: ActionItem }) {
  const who = heroWho(item);
  const segments: string[] = [];
  segments.push(item.status);
  if (item.detail?.trim() && item.detail.trim() !== who) {
    segments.push(item.detail.trim());
  }
  const clip = item.label.trim();
  if (clip.length > 0) {
    segments.push(clip.length > 48 ? `${clip.slice(0, 48)}…` : clip);
  }
  const show = segments.slice(0, 3);
  return (
    <div className="pri-hero-meta">
      {show.map((seg, i) => (
        <Fragment key={`${i}-${seg.slice(0, 8)}`}>
          {i > 0 ? <span className="sep" aria-hidden /> : null}
          <span>{seg}</span>
        </Fragment>
      ))}
    </div>
  );
}

function heroTagFromItem(item: ActionItem): string {
  switch (item.kind) {
    case "escalation":
      return "Escalation · needs your call";
    case "draft":
      return "Draft · review";
    case "task":
      return "Task · due";
    case "message":
      return item.zenPriorityTag?.trim() || "Inbox";
    default:
      return "Action";
  }
}

export function ZenLobby() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlEscalationId = searchParams.get("escalationId");
  const { user } = useAuth();
  const { allActions, counts, isLoading: actionsLoading } = useTodayActions();
  const zenTab = counts.zenTabCounts;
  const { featuredWedding, isLoading: metricsLoading } = useTodayMetrics();
  const { metaDate, timeHHMM, now } = useLiveClock();
  const isIdle = useIdle(IDLE_TIMEOUT_MS);
  const [priTab, setPriTab] = useState<PriTab>("review");

  const firstName = useMemo(() => firstNameFromUser(user), [user]);

  const actionItems = useMemo<ActionItem[]>(() => {
    return allActions.map((a) => ({
      id: a.id,
      kind: zenLobbyPriorityKindFromAction(a),
      label: a.title,
      detail: a.subtitle,
      status: a.status_label,
      createdAt: a.created_at,
      routeTo: a.route_to,
      zenPriorityTag: a.zen_priority_tag,
      zenTab: zenTodayTabForAction(a),
    }));
  }, [allActions]);

  const filteredActionItems = useMemo(
    () => actionItems.filter((a) => a.zenTab != null && a.zenTab === priTab),
    [actionItems, priTab],
  );

  useEffect(() => {
    if (zenTab[priTab] > 0) return;
    const next = ZEN_TODAY_TAB_ORDER.find((id) => zenTab[id] > 0);
    if (next) setPriTab(next);
  }, [priTab, zenTab]);

  const heroItem = filteredActionItems[0];
  const listItems = filteredActionItems.slice(1);

  const taskDueTodayCount = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return allActions.filter((a) => {
      if (a.action_type !== "open_task" || !a.due_at) return false;
      return new Date(a.due_at) <= end;
    }).length;
  }, [allActions]);

  const pulseLinesFixed = useMemo(
    () => buildPulseLines(zenTab, taskDueTodayCount, featuredWedding?.couple_names ?? null),
    [zenTab, taskDueTodayCount, featuredWedding],
  );

  const firstReviewDetail = useMemo(() => {
    const a = allActions.find((x) => zenTodayTabForAction(x) === "review");
    return a?.subtitle?.trim() ?? null;
  }, [allActions]);

  /** Literal copy from Ana Dashboard.html `.ticker` (line ~2539); static demo text for visual parity. */
  const tickerItems = useMemo(
    () => [
      { bold: "Filed", rest: " invoice #1042" },
      { bold: "Auto-filed", rest: " 2 vendor emails" },
      { bold: "Scheduled", rest: " consultation · Beckett" },
      { bold: "Synced", rest: " Gmail · 14s ago" },
    ],
    [],
  );

  const [priorityRovingIndex, setPriorityRovingIndex] = useState<number | null>(null);
  const [priListScrollTop, setPriListScrollTop] = useState(0);
  const priorityRowActionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const priorityRegionRef = useRef<HTMLDivElement>(null);
  const priListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (filteredActionItems.length === 0) {
      setPriorityRovingIndex(null);
      return;
    }
    setPriorityRovingIndex((prev) => {
      if (prev === null) return null;
      return Math.min(prev, filteredActionItems.length - 1);
    });
  }, [filteredActionItems.length]);

  useEffect(() => {
    setPriListScrollTop(0);
    queueMicrotask(() => {
      const el = priListRef.current;
      if (el) el.scrollTop = 0;
    });
  }, [filteredActionItems]);

  const handlePriorityRegionKeyDownCapture = useCallback(
    (e: React.KeyboardEvent) => {
      if (filteredActionItems.length === 0) return;
      if (isEditableKeyboardTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      const key = e.key;
      const keyLower = key.length === 1 ? key.toLowerCase() : key;
      const isDown = key === "ArrowDown" || keyLower === "j";
      const isUp = key === "ArrowUp" || keyLower === "k";

      if (key === "Escape") {
        if (priorityRovingIndex !== null) {
          e.preventDefault();
          setPriorityRovingIndex(null);
          requestAnimationFrame(() => priorityRegionRef.current?.focus());
        }
        return;
      }

      if (!isDown && !isUp) return;

      e.preventDefault();
      if (isDown) {
        setPriorityRovingIndex((prev) => {
          if (prev === null) return 0;
          return Math.min(prev + 1, filteredActionItems.length - 1);
        });
      } else {
        setPriorityRovingIndex((prev) => {
          if (prev === null) return filteredActionItems.length - 1;
          return Math.max(prev - 1, 0);
        });
      }
    },
    [filteredActionItems.length, priorityRovingIndex],
  );

  const activePriorityRowId =
    priorityRovingIndex !== null ? filteredActionItems[priorityRovingIndex]?.id : undefined;

  useLayoutEffect(() => {
    if (priorityRovingIndex === null || !activePriorityRowId) return;
    const wrap = document.querySelector(`[data-zen-priority-row="${CSS.escape(activePriorityRowId)}"]`);
    if (wrap instanceof HTMLElement) scrollPipelineWeddingRowIntoView(wrap);
    const btn = priorityRowActionRefs.current[priorityRovingIndex];
    btn?.focus({ preventScroll: true });
  }, [priorityRovingIndex, activePriorityRowId]);

  /** Cap `.pri-list` scrollport height so the default view matches the redesign’s full-row stack (no half-visible row under the last full row). */
  useLayoutEffect(() => {
    const listEl = priListRef.current;
    const panelEl = priorityRegionRef.current;
    if (!listEl || !panelEl || listItems.length === 0) {
      if (listEl) listEl.style.maxHeight = "";
      return;
    }

    let raf = 0;
    const apply = () => {
      const rows = listEl.querySelectorAll<HTMLElement>(".prow");
      if (rows.length === 0) {
        listEl.style.maxHeight = "";
        return;
      }

      const k = Math.min(listItems.length, PRI_LIST_VISIBLE_ROW_CAP);
      const lastIdx = Math.min(k, rows.length) - 1;
      const lastVis = rows[lastIdx];
      if (!lastVis) {
        listEl.style.maxHeight = "";
        return;
      }

      const listBox = listEl.getBoundingClientRect();
      const lastBox = lastVis.getBoundingClientRect();

      /**
       * Border-box span from list top through the bottom of the k-th row (padding + rows; no manual gap).
       * Do **not** add `padding-bottom` (Ana’s `90px`) here—that space sits *below* the last row in the
       * scroll region and was inflating the viewport by ~90px, showing most of the next card.
       */
      const topBorderToLastRowBottom = lastBox.bottom - listBox.top;
      let h =
        topBorderToLastRowBottom -
        PRI_LIST_MAX_HEIGHT_FUDGE_PX +
        PRI_LIST_VIEWPORT_BOTTOM_BREATHING_ROOM_PX;
      h = Math.max(0, Math.floor(h));
      listEl.style.maxHeight = `${h}px`;
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        requestAnimationFrame(apply);
      });
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(panelEl);
    ro.observe(listEl);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      listEl.style.maxHeight = "";
    };
  }, [filteredActionItems, listItems.length]);

  const loadingShell = actionsLoading || metricsLoading;

  const leadsSubtitle = useMemo(() => {
    if (featuredWedding?.couple_names) {
      return `Next · ${featuredWedding.couple_names}`;
    }
    if (counts.leads > 0) {
      return `${counts.leads} lead${counts.leads === 1 ? "" : "s"}`;
    }
    if (counts.unfiled > 0) {
      return `${counts.unfiled} in inbox queue`;
    }
    return "inbox clear";
  }, [featuredWedding, counts.leads, counts.unfiled]);

  /** Bottom of the first capped viewport (Ana redesign’s “quiet” row — same opacity as `.prow.done` L492). */
  const priStackTailIndex =
    listItems.length > 0 ? Math.min(listItems.length, PRI_LIST_VISIBLE_ROW_CAP) - 1 : -1;

  return (
    <div
      className={cn(
        "zen-today zen-today-port relative flex h-full min-h-0 w-full flex-col overflow-hidden text-white",
        isIdle && "zen-soft-focus",
        loadingShell && "opacity-95",
      )}
      onDoubleClick={openSpotlight}
    >
      <section className="today" aria-label="Today">
        <div className={cn("today-left", isIdle && "zen-soft-target")}>
          <div className="left-top">
            <div className="meta">
              <span>{metaDate}</span>
              <span className="dot-sep" aria-hidden />
              <span>14°C · Belgrade</span>
              <span className="dot-sep" aria-hidden />
              <MetaSunArc now={now} />
              <span>{timeHHMM}</span>
            </div>

            <h1 className="greet">
              <span className="muted">{formatGreeting()}</span>
              <br />
              <span className="name">{firstName}</span>
            </h1>

            <AnaPulse lines={pulseLinesFixed} />
          </div>

          <div className="left-bottom">
            <div className="stat-row">
              <div className={cn("stat", zenTab.review > 0 && "warn-stat")}>
                <div className="stat-k">Review</div>
                <div className={cn("stat-v", zenTab.review > 0 && "warn")}>{zenTab.review}</div>
                <div className="stat-sub">
                  {firstReviewDetail ?? (zenTab.review > 0 ? "needs your judgment" : "nothing queued")}
                </div>
              </div>
              <div className="stat">
                <div className="stat-k">Drafts</div>
                <div className="stat-v">{zenTab.drafts}</div>
                <div className="stat-sub">ready to review / send</div>
              </div>
              <div className="stat">
                <div className="stat-k">Leads</div>
                <div className={cn("stat-v", counts.leads > 0 && "attn")}>{counts.leads}</div>
                <div className="stat-sub">{leadsSubtitle}</div>
              </div>
              <div className="stat">
                <div className="stat-k">Needs filing</div>
                <div className="stat-v">{zenTab.needs_filing}</div>
                <div className="stat-sub">sort once for routing</div>
              </div>
            </div>

            <div className="ticker" aria-label="activity">
              {tickerItems.map((t, i) => (
                <span key={i} className="it">
                  <b>{t.bold}</b>
                  {t.rest}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="today-right">
          <div
            ref={priorityRegionRef}
            className="pri-panel zen-pri-panel outline-none focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-inset"
            tabIndex={priorityRovingIndex === null ? 0 : -1}
            role="listbox"
            aria-label="Priority actions"
            aria-activedescendant={activePriorityRowId ? `zen-priority-action-${activePriorityRowId}` : undefined}
            onKeyDownCapture={handlePriorityRegionKeyDownCapture}
          >
            <header className="pri-head">
              <div className="pri-eyebrow">
                <span className="fin-pulse" aria-hidden />
                Priority · {filteredActionItems.length}{" "}
                {filteredActionItems.length === 1 ? "item" : "items"} in this queue · updated just now
              </div>
              <h2 className="pri-title">
                What needs <b>your attention</b>
              </h2>

              <div className="pri-tabs" role="tablist" aria-label="Filter priority list">
                {ZEN_TODAY_TAB_ORDER.map((tabId) => (
                  <button
                    key={tabId}
                    type="button"
                    role="tab"
                    className="ptab"
                    aria-selected={priTab === tabId}
                    data-active={priTab === tabId ? "true" : "false"}
                    onClick={() => setPriTab(tabId)}
                  >
                    <span className="ptab-indicator" aria-hidden />
                    {ZEN_TODAY_TAB_LABELS[tabId]} <span className="n">{zenTab[tabId]}</span>
                  </button>
                ))}
              </div>
            </header>

            {filteredActionItems.length === 0 ? (
              <p className="px-3 pt-6 text-[14px] text-white/45">No pending actions in this tab</p>
            ) : (
              <>
                {heroItem ? (
                  <article
                    className={cn(
                      "pri-hero relative",
                      priorityRovingIndex === 0 && "ring-2 ring-inset ring-white/30",
                    )}
                    data-zen-priority-row={heroItem.id}
                  >
                    <button
                      ref={(el) => {
                        priorityRowActionRefs.current[0] = el;
                      }}
                      id={`zen-priority-action-${heroItem.id}`}
                      type="button"
                      role="option"
                      tabIndex={priorityRovingIndex === 0 ? 0 : -1}
                      aria-selected={priorityRovingIndex === 0}
                      className="block w-full text-left"
                      onClick={() => {
                        setPriorityRovingIndex(0);
                        navigate(heroItem.routeTo);
                      }}
                    >
                      <div className="pri-hero-top">
                        <span className="pri-hero-tag">
                          <span className="sdot" aria-hidden />
                          {heroTagFromItem(heroItem)}
                        </span>
                        <span className="pri-hero-age">{formatRelativeTime(heroItem.createdAt)}</span>
                      </div>
                      <div className="pri-hero-who">{heroWho(heroItem)}</div>
                      <p className="pri-hero-preview">&ldquo;{heroItem.label}&rdquo;</p>
                      <HeroMetaRow item={heroItem} />
                    </button>
                    <div className="pri-hero-actions">
                      <button
                        type="button"
                        className="pbtn"
                        onClick={() => {
                          setPriorityRovingIndex(0);
                          navigate(heroItem.routeTo);
                        }}
                      >
                        Open thread →
                      </button>
                      <button type="button" className="pbtn ghost">
                        Teach Ana the rule
                      </button>
                      <button type="button" className="pbtn ghost">
                        Snooze 1h
                      </button>
                    </div>
                  </article>
                ) : null}

                {listItems.length > 0 ? (
                  <div
                    className="pri-list"
                    ref={priListRef}
                    onScroll={(e) => setPriListScrollTop(e.currentTarget.scrollTop)}
                  >
                    {listItems.map((item, idx) => {
                      const i = idx + 1;
                      const isEscalation = item.kind === "escalation";
                      const initials = getInitials(item.detail || item.label);
                      const who = item.detail || "Unknown";
                      const pillKind = isEscalation ? "warn" : item.kind === "draft" ? "fin" : "default";
                      const rowDone = isDoneStatusLabel(item.status);
                      const isPriStackTail =
                        idx === priStackTailIndex && priListScrollTop < 1;
                      return (
                        <button
                          key={item.id}
                          ref={(el) => {
                            priorityRowActionRefs.current[i] = el;
                          }}
                          data-zen-priority-row={item.id}
                          id={`zen-priority-action-${item.id}`}
                          type="button"
                          role="option"
                          tabIndex={priorityRovingIndex === i ? 0 : -1}
                          aria-selected={priorityRovingIndex === i}
                          className={cn(
                            "prow w-full text-left",
                            rowDone && "done",
                            isPriStackTail && "zen-pri-stack-tail",
                            isEscalation && "escalation",
                            item.kind === "draft" && "fin-draft",
                            priorityRovingIndex === i && "relative z-[1] ring-2 ring-inset ring-white/25",
                          )}
                          onClick={() => {
                            setPriorityRovingIndex(i);
                            navigate(item.routeTo);
                          }}
                        >
                          <div className={cn("avatar", isEscalation && "warn")}>{initials}</div>
                          <div style={{ minWidth: 0 }}>
                            <div className="who">
                              {who}
                              <span className="age">· {formatAgeShort(item.createdAt)}</span>
                            </div>
                            <div className="label">{item.label}</div>
                          </div>
                          <span
                            className={cn(
                              "pill",
                              rowDone ? "done" : pillKind === "fin" && "fin",
                              !rowDone && pillKind === "warn" && "warn",
                            )}
                          >
                            <span className="sdot" aria-hidden />
                            {isEscalation ? ZEN_LOBBY_ESCALATION_ROW_BADGE : item.status}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>

      {urlEscalationId ? (
        <div className="fixed bottom-24 left-1/2 z-[60] w-[min(100%,28rem)] -translate-x-1/2 px-4">
          <EscalationResolutionPanel
            escalationId={urlEscalationId}
            onResolved={() => {
              setSearchParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete("escalationId");
                  return next;
                },
                { replace: true },
              );
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
