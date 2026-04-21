import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  adjacentWeddingIdInOrderedList,
  isEditableKeyboardTarget,
  pipelineWeddingAltVerticalDelta,
  scrollPipelineWeddingRowIntoView,
  weddingQueuePosition,
} from "@/lib/pipelineWeddingListNavigation";
import type { TodayAction, TodaySelection } from "../../../lib/todayActionFeed";
import { useTodayActions } from "../../../hooks/useTodayActions";
import { useTodayMode } from "./TodayModeContext";

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function formatDuePill(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function isSameActionSelection(sel: TodaySelection, action: TodayAction): boolean {
  const t = action.today_selection;
  if (sel.type !== t.type) return false;
  if (sel.type === "draft" && t.type === "draft") return sel.id === t.id;
  if (sel.type === "unfiled" && t.type === "unfiled") return sel.id === t.id;
  if (sel.type === "task" && t.type === "task") return sel.id === t.id;
  if (sel.type === "escalation" && t.type === "escalation") return sel.id === t.id;
  return false;
}

function railActionIdForSelection(
  ordered: readonly TodayAction[],
  sel: TodaySelection,
): string | null {
  for (const a of ordered) {
    if (isSameActionSelection(sel, a)) return a.id;
  }
  return null;
}

export function TodayContextList() {
  const { selection, select } = useTodayMode();
  const {
    draftActions,
    unfiledActions,
    taskActions,
    escalationActions,
    isLoading,
  } = useTodayActions();

  const [openDrafts, setOpenDrafts] = useState(true);
  const [openUnfiled, setOpenUnfiled] = useState(true);
  const [openTasks, setOpenTasks] = useState(true);
  const [openEscalations, setOpenEscalations] = useState(true);

  const listScrollRef = useRef<HTMLDivElement>(null);

  /** A7: one combined queue in on-screen order — only rows from expanded sections (top → bottom). */
  const orderedVisibleActions = useMemo(() => {
    const out: TodayAction[] = [];
    if (isLoading) return out;
    if (openDrafts) out.push(...draftActions);
    if (openUnfiled) out.push(...unfiledActions);
    if (openTasks) out.push(...taskActions);
    if (openEscalations) out.push(...escalationActions);
    return out;
  }, [
    isLoading,
    openDrafts,
    openUnfiled,
    openTasks,
    openEscalations,
    draftActions,
    unfiledActions,
    taskActions,
    escalationActions,
  ]);

  const orderedRailIds = useMemo(() => orderedVisibleActions.map((a) => a.id), [orderedVisibleActions]);

  const selectedRailId = useMemo(
    () => railActionIdForSelection(orderedVisibleActions, selection),
    [orderedVisibleActions, selection],
  );

  const railQueuePosition = useMemo(
    () => weddingQueuePosition(orderedRailIds, selectedRailId),
    [orderedRailIds, selectedRailId],
  );

  const goPrevRail = useCallback(() => {
    const id = adjacentWeddingIdInOrderedList(orderedRailIds, selectedRailId, -1);
    if (!id) return;
    const a = orderedVisibleActions.find((x) => x.id === id);
    if (a) select(a.today_selection);
  }, [orderedRailIds, selectedRailId, orderedVisibleActions, select]);

  const goNextRail = useCallback(() => {
    const id = adjacentWeddingIdInOrderedList(orderedRailIds, selectedRailId, 1);
    if (!id) return;
    const a = orderedVisibleActions.find((x) => x.id === id);
    if (a) select(a.today_selection);
  }, [orderedRailIds, selectedRailId, orderedVisibleActions, select]);

  useEffect(() => {
    if (orderedRailIds.length < 2) return;
    function onKeyDown(e: KeyboardEvent) {
      const delta = pipelineWeddingAltVerticalDelta(e);
      if (delta === null) return;
      if (isEditableKeyboardTarget(e.target)) return;
      const id = adjacentWeddingIdInOrderedList(orderedRailIds, selectedRailId, delta);
      if (!id) return;
      const a = orderedVisibleActions.find((x) => x.id === id);
      if (!a) return;
      if (id === selectedRailId) return;
      e.preventDefault();
      e.stopPropagation();
      select(a.today_selection);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [orderedRailIds, selectedRailId, orderedVisibleActions, select]);

  useLayoutEffect(() => {
    if (!selectedRailId) return;
    const root = listScrollRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-today-rail-row="${CSS.escape(selectedRailId)}"]`);
    if (el instanceof HTMLElement) scrollPipelineWeddingRowIntoView(el);
  }, [selectedRailId, orderedRailIds]);

  return (
    <div className="dashboard-context-pane flex h-full min-h-0 flex-col border-r border-border text-[13px] text-foreground">
      {!isLoading && orderedRailIds.length >= 2 ? (
        <div
          role="region"
          aria-label="Today sidebar queue navigation"
          className="shrink-0 border-b border-border px-2 py-2"
        >
          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/80 px-2 py-1.5">
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-muted-foreground">Queue</span>
              {railQueuePosition ? (
                <span className="ml-1.5 tabular-nums text-[11px] text-muted-foreground" aria-live="polite">
                  {railQueuePosition.current} / {railQueuePosition.total}
                </span>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                title="Previous item (Alt+↑)"
                aria-label="Previous item in Today sidebar queue"
                onClick={goPrevRail}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <ChevronUp className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                title="Next item (Alt+↓)"
                aria-label="Next item in Today sidebar queue"
                onClick={goNextRail}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <ChevronDown className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {/* Drafts */}
        <div className="mb-2">
          <button
            type="button"
            onClick={() => setOpenDrafts((o) => !o)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/40"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
                openDrafts && "rotate-90",
              )}
              strokeWidth={1.5}
            />
            <span className="font-medium">Drafts</span>
            <span className="ml-auto rounded border border-border bg-background px-1.5 py-0 text-[11px] text-muted-foreground tabular-nums">
              {isLoading ? "—" : draftActions.length}
            </span>
          </button>
          {openDrafts && (
            <ul className="pb-2">
              {isLoading ? (
                <li className="px-3 py-2 text-[12px] text-muted-foreground">Loading…</li>
              ) : draftActions.length === 0 ? (
                <li className="px-3 py-2 text-[12px] text-muted-foreground">No drafts</li>
              ) : (
                draftActions.map((a) => {
                  const isSel = isSameActionSelection(selection, a);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        data-today-rail-row={a.id}
                        onClick={() => select(a.today_selection)}
                        className={cn(
                          "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors",
                          isSel ? "bg-accent" : "hover:bg-accent/50",
                        )}
                      >
                        <span className="text-[12px] font-medium text-foreground">{truncate(a.title, 28)}</span>
                        <span className="text-[12px] text-muted-foreground">{truncate(a.subtitle, 42)}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>

        {/* Unfiled */}
        <div className="mb-2">
          <button
            type="button"
            onClick={() => setOpenUnfiled((o) => !o)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/40"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
                openUnfiled && "rotate-90",
              )}
              strokeWidth={1.5}
            />
            <span className="font-medium">Inbox threads</span>
            <span className="ml-auto rounded border border-border bg-background px-1.5 py-0 text-[11px] text-muted-foreground tabular-nums">
              {isLoading ? "—" : unfiledActions.length}
            </span>
          </button>
          {openUnfiled && (
            <ul className="pb-2">
              {isLoading ? (
                <li className="px-3 py-2 text-[12px] text-muted-foreground">Loading…</li>
              ) : unfiledActions.length === 0 ? (
                <li className="px-3 py-2 text-[12px] text-muted-foreground">Inbox clear</li>
              ) : (
                unfiledActions.map((a) => {
                  const isSel = isSameActionSelection(selection, a);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        data-today-rail-row={a.id}
                        onClick={() => select(a.today_selection)}
                        className={cn(
                          "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors",
                          isSel ? "bg-accent" : "hover:bg-accent/50",
                        )}
                      >
                        <span className="text-[12px] text-foreground">{truncate(a.title, 44)}</span>
                        <span className="text-[12px] text-muted-foreground">{truncate(a.subtitle, 36)}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>

        {/* Tasks */}
        <div className="mb-2">
          <button
            type="button"
            onClick={() => setOpenTasks((o) => !o)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/40"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
                openTasks && "rotate-90",
              )}
              strokeWidth={1.5}
            />
            <span className="font-medium">Tasks</span>
            <span className="ml-auto rounded border border-border bg-background px-1.5 py-0 text-[11px] text-muted-foreground tabular-nums">
              {isLoading ? "—" : taskActions.length}
            </span>
          </button>
          {openTasks && (
            <ul className="pb-2">
              {isLoading ? (
                <li className="px-3 py-2 text-[12px] text-muted-foreground">Loading…</li>
              ) : taskActions.length === 0 ? (
                <li className="px-3 py-2 text-[12px] text-muted-foreground">No open tasks</li>
              ) : (
                taskActions.map((a) => {
                  const isSel = isSameActionSelection(selection, a);
                  const due = a.due_at;
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        data-today-rail-row={a.id}
                        onClick={() => select(a.today_selection)}
                        className={cn(
                          "flex w-full items-start justify-between gap-2 px-3 py-2 text-left transition-colors",
                          isSel ? "bg-accent" : "hover:bg-accent/50",
                        )}
                      >
                        <span className="min-w-0 flex-1 text-[12px] text-foreground">{truncate(a.title, 40)}</span>
                        {due ? (
                          <span className="shrink-0 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums">
                            {formatDuePill(due)}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>

        {/* Escalations (open human-input blocks) */}
        <div>
          <button
            type="button"
            onClick={() => setOpenEscalations((o) => !o)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/40"
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
                openEscalations && "rotate-90",
              )}
              strokeWidth={1.5}
            />
            <span className="font-medium">Escalations</span>
            <span className="ml-auto rounded border border-border bg-background px-1.5 py-0 text-[11px] text-muted-foreground tabular-nums">
              {isLoading ? "—" : escalationActions.length}
            </span>
          </button>
          {openEscalations && (
            <ul className="pb-2">
              {isLoading ? (
                <li className="px-3 py-2 text-[12px] text-muted-foreground">Loading…</li>
              ) : escalationActions.length === 0 ? (
                <li className="px-3 py-2 text-[12px] text-muted-foreground">None open</li>
              ) : (
                escalationActions.map((a) => {
                  const isSel = isSameActionSelection(selection, a);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        data-today-rail-row={a.id}
                        onClick={() => select(a.today_selection)}
                        className={cn(
                          "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors",
                          isSel ? "bg-accent" : "hover:bg-accent/50",
                        )}
                      >
                        <span className="text-[12px] font-medium text-foreground">{truncate(a.title, 44)}</span>
                        <span className="text-[12px] text-muted-foreground">{truncate(a.subtitle, 32)}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
