import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { Check, PenLine } from "lucide-react";
import { ListPageSkeleton } from "../components/DashboardSkeleton";
import { ApprovalDraftAiModal } from "../components/ApprovalDraftAiModal";
import type { ApprovalDraft } from "../data/approvalDrafts";
import {
  enqueueDraftApprovedForOutbound,
  enqueueDraftsApprovedForOutboundBatch,
  humanizeDraftApprovalInvokeError,
  requestDraftRewrite,
} from "../lib/draftApprovalClient";
import { useTimedToast } from "../hooks/useTimedToast";
import { fireDraftsChanged } from "../lib/events";
import { scrollPipelineWeddingRowIntoView } from "../lib/pipelineWeddingListNavigation";
import { isEditableKeyboardTarget } from "../lib/timelineThreadNavigation";
import { cn } from "../lib/utils";
import { usePendingApprovals, type PendingDraft } from "../hooks/usePendingApprovals";

function toApprovalDraft(d: PendingDraft): ApprovalDraft & { photographerId: string } {
  return {
    id: d.id,
    wedding: d.couple_names,
    weddingId: d.wedding_id,
    to: "",
    subject: d.thread_title,
    body: d.body,
    photographerId: d.photographer_id,
  };
}

export function ApprovalsPage() {
  const { showToast } = useTimedToast();
  const { drafts: liveDrafts, isLoading } = usePendingApprovals();
  const [localEdits, setLocalEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<ApprovalDraft | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  /** A7: bulk approve progress — `processingId === "bulk"` while running. */
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  /** A7: roving keyboard focus (unmodified ↑/↓/j/k only; Enter/Space stay native on “Approve & send”). */
  const [rovingIndex, setRovingIndex] = useState<number | null>(null);
  const approvalsListRef = useRef<HTMLDivElement>(null);
  const approveButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function applyBody(id: string, body: string) {
    setLocalEdits((prev) => ({ ...prev, [id]: body }));
  }

  async function handleApprove(draft: ApprovalDraft & { photographerId: string }) {
    setProcessingId(draft.id);
    try {
      await enqueueDraftApprovedForOutbound(draft.id);
      setDismissed((prev) => new Set(prev).add(draft.id));
      fireDraftsChanged();
    } catch (err) {
      console.error("Approve failed", err);
      showToast(await humanizeDraftApprovalInvokeError(err));
    } finally {
      setProcessingId(null);
    }
  }

  async function handleApproveAllVisible(ids: string[]) {
    if (ids.length < 2) return;
    setBulkError(null);
    const ok = window.confirm(
      `Approve and queue ${ids.length} drafts for send? Each uses the same approval path as “Approve & send”.`,
    );
    if (!ok) return;

    setProcessingId("bulk");
    setBulkProgress({ done: 0, total: ids.length });
    try {
      const { succeeded, failed } = await enqueueDraftsApprovedForOutboundBatch(ids, (done, total) => {
        setBulkProgress({ done, total });
      });
      if (succeeded.length > 0) {
        setDismissed((prev) => {
          const next = new Set(prev);
          for (const id of succeeded) next.add(id);
          return next;
        });
        fireDraftsChanged();
      }
      if (failed.length > 0) {
        const detail = failed.map((f) => `${f.id.slice(0, 8)}…: ${f.message}`).join("\n");
        setBulkError(`${failed.length} of ${ids.length} failed:\n${detail}`);
        console.error("Batch approve partial failure", failed);
      }
    } catch (err) {
      console.error("Approve all failed", err);
      setBulkError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessingId(null);
      setBulkProgress(null);
    }
  }

  async function handleReject(draft: ApprovalDraft) {
    const feedback = window.prompt("What should the AI change or add?");
    if (feedback === null) return;

    setProcessingId(draft.id);
    try {
      await requestDraftRewrite({ draftId: draft.id, feedback });
      setDismissed((prev) => new Set(prev).add(draft.id));
      fireDraftsChanged();
    } catch (err) {
      console.error("Reject failed", err);
    } finally {
      setProcessingId(null);
    }
  }

  const drafts: (ApprovalDraft & { photographerId: string })[] = liveDrafts
    .filter((d) => !dismissed.has(d.id))
    .map((d) => {
      const mapped = toApprovalDraft(d);
      if (localEdits[d.id]) mapped.body = localEdits[d.id];
      return mapped;
    });

  const bulkApproveIds = drafts.map((d) => d.id);
  const bulkBusy = processingId === "bulk";

  useEffect(() => {
    if (drafts.length === 0) {
      setRovingIndex(null);
      return;
    }
    setRovingIndex((prev) => {
      if (prev === null) return null;
      return Math.min(prev, drafts.length - 1);
    });
  }, [drafts.length]);

  const handleApprovalsListKeyDownCapture = useCallback(
    (e: ReactKeyboardEvent) => {
      if (drafts.length === 0) return;
      if (isEditableKeyboardTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      const key = e.key;
      const keyLower = key.length === 1 ? key.toLowerCase() : key;
      const isDown = key === "ArrowDown" || keyLower === "j";
      const isUp = key === "ArrowUp" || keyLower === "k";

      if (key === "Escape") {
        if (rovingIndex !== null) {
          e.preventDefault();
          setRovingIndex(null);
          requestAnimationFrame(() => approvalsListRef.current?.focus());
        }
        return;
      }

      if (!isDown && !isUp) return;

      e.preventDefault();
      if (isDown) {
        setRovingIndex((prev) => {
          if (prev === null) return 0;
          return Math.min(prev + 1, drafts.length - 1);
        });
      } else {
        setRovingIndex((prev) => {
          if (prev === null) return drafts.length - 1;
          return Math.max(prev - 1, 0);
        });
      }
    },
    [drafts.length, rovingIndex],
  );

  const activeApprovalDraftId = rovingIndex !== null ? drafts[rovingIndex]?.id : undefined;

  useLayoutEffect(() => {
    if (rovingIndex === null || !activeApprovalDraftId) return;
    const wrap = document.querySelector(
      `[data-approvals-draft-row="${CSS.escape(activeApprovalDraftId)}"]`,
    );
    if (wrap instanceof HTMLElement) scrollPipelineWeddingRowIntoView(wrap);
    approveButtonRefs.current[rovingIndex]?.focus({ preventScroll: true });
  }, [rovingIndex, activeApprovalDraftId]);

  if (isLoading) {
    return <ListPageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Approvals</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          Nothing reaches a planner or couple until you approve it here or in WhatsApp. Edits stay in one queue.
        </p>
      </div>

      {drafts.length >= 2 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13px] font-semibold text-ink">Batch</p>
            <p className="text-[12px] text-ink-muted">
              Approve every visible draft in order (same server path as single approve).
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <button
              type="button"
              disabled={bulkBusy || processingId !== null}
              onClick={() => void handleApproveAllVisible(bulkApproveIds)}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="h-4 w-4" strokeWidth={1.75} />
              {bulkBusy ? "Approving…" : `Approve all visible (${drafts.length})`}
            </button>
            {bulkProgress ? (
              <p className="text-[11px] text-ink-muted" aria-live="polite">
                {bulkProgress.done} / {bulkProgress.total} queued
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {bulkError ? (
        <p className="whitespace-pre-wrap rounded-md border border-red-500/35 bg-red-500/10 px-3 py-2 text-[12px] text-red-700 dark:text-red-300" role="alert">
          {bulkError}
        </p>
      ) : null}

      <div
        ref={approvalsListRef}
        className={cn(
          "grid gap-4 lg:grid-cols-2",
          "outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        )}
        tabIndex={rovingIndex === null ? 0 : -1}
        role="listbox"
        aria-label="Pending draft approvals"
        aria-activedescendant={
          activeApprovalDraftId ? `approvals-draft-action-${activeApprovalDraftId}` : undefined
        }
        onKeyDownCapture={handleApprovalsListKeyDownCapture}
      >
        {drafts.map((d, i) => {
          const busy = processingId === d.id || bulkBusy;
          return (
            <div
              key={d.id}
              data-approvals-draft-row={d.id}
              className={cn(
                "flex flex-col rounded-lg border border-border bg-surface p-5",
                rovingIndex === i && "relative z-[1] ring-2 ring-inset ring-primary/35",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">{d.wedding}</p>
                  <p className="mt-1 text-[15px] font-semibold text-ink">{d.subject}</p>
                  {d.to && <p className="mt-1 text-[12px] text-ink-faint">To {d.to}</p>}
                </div>
                <Link
                  to={`/wedding/${d.weddingId}`}
                  onClick={() => setRovingIndex(i)}
                  className="text-[12px] font-semibold text-link hover:text-link-hover"
                >
                  Open context
                </Link>
              </div>
              <p className="whitespace-pre-wrap mt-4 flex-1 text-[14px] leading-relaxed text-ink-muted">{d.body}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  id={`approvals-draft-action-${d.id}`}
                  ref={(el) => {
                    approveButtonRefs.current[i] = el;
                  }}
                  type="button"
                  role="option"
                  tabIndex={rovingIndex === i ? 0 : -1}
                  aria-selected={rovingIndex === i}
                  disabled={busy}
                  onClick={() => {
                    setRovingIndex(i);
                    void handleApprove(d);
                  }}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-ink transition hover:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50",
                    "outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                  )}
                >
                  <Check className="h-4 w-4" strokeWidth={1.75} />
                  {busy ? "Sending…" : "Approve & send"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRovingIndex(i);
                    setEditing(d);
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-[13px] text-ink transition hover:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PenLine className="h-4 w-4" strokeWidth={1.75} />
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRovingIndex(i);
                    void handleReject(d);
                  }}
                  className="rounded-full px-4 py-2 text-[13px] font-semibold text-ink-faint hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <ApprovalDraftAiModal
        draft={editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onApply={(body) => {
          if (editing) applyBody(editing.id, body);
        }}
      />
    </div>
  );
}
