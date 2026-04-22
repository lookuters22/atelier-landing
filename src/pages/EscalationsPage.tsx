/**
 * Phase 11 Step 11C — escalation surface (open, resolved, specialty queues).
 * Queues are heuristic buckets over `escalation_requests` (same table; filters only).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, BookMarked, CheckCircle2, CircleDot, Clock3 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { cn } from "@/lib/utils";
import { resolveEscalationsViaDashboardBatch } from "../lib/escalationResolutionClient";
import { fireDataChanged } from "../lib/events";
import { openAnaWithEscalation } from "../components/SupportAssistantWidget";

type EscalationStatus = "open" | "answered" | "dismissed" | "promoted";

type EscalationRow = {
  id: string;
  created_at: string;
  status: EscalationStatus;
  action_key: string;
  reason_code: string;
  question_body: string;
  promote_to_playbook: boolean;
  playbook_rule_id: string | null;
  learning_outcome: string | null;
  resolution_storage_target: string | null;
  resolved_at: string | null;
  operator_delivery: string;
  wedding_id: string | null;
};

type EscalationQueueTab =
  | "open"
  | "resolved"
  | "visual_review"
  | "banking"
  | "pr_publication";

/** Heuristic queue labels for specialty triage (execute_v3 Step 11C). */
function escalationQueueBucket(row: Pick<EscalationRow, "action_key" | "reason_code" | "question_body">): {
  visual: boolean;
  banking: boolean;
  prPublication: boolean;
} {
  const s = `${row.action_key} ${row.reason_code} ${row.question_body}`.toLowerCase();
  return {
    visual: /\b(gallery|visual|proof|retouch|selection|color|grading|image|raw)\b/.test(s),
    banking: /\b(bank|wire|iban|invoice|payment|deposit|refund|tax|pricing|card|balance)\b/.test(s),
    prPublication: /\b(pr\b|publication|press|credit|editorial|usage|publish)\b/.test(s),
  };
}

/** Tab that contains this row for deep-linking (specialty queue if it matches, else open / resolved). */
function escalationTabForDeepLink(row: EscalationRow): EscalationQueueTab {
  if (row.status !== "open") return "resolved";
  const b = escalationQueueBucket(row);
  if (b.visual) return "visual_review";
  if (b.banking) return "banking";
  if (b.prPublication) return "pr_publication";
  return "open";
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function EscalationsPage() {
  const { photographerId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<EscalationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<EscalationQueueTab>("open");
  const deepLinkHandled = useRef<string | null>(null);
  /** A7: explicit multi-select on open-queue views only — same resolution summary queued per ID. */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [batchSummary, setBatchSummary] = useState("");
  const [batchNotes, setBatchNotes] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!photographerId) return;
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from("escalation_requests")
      .select(
        "id, created_at, status, action_key, reason_code, question_body, promote_to_playbook, playbook_rule_id, learning_outcome, resolution_storage_target, resolved_at, operator_delivery, wedding_id",
      )
      .eq("photographer_id", photographerId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (queryError) {
      setError(queryError.message);
      setRows([]);
    } else {
      setRows((data ?? []) as EscalationRow[]);
    }
    setLoading(false);
  }, [photographerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    const escalationId = searchParams.get("escalationId");
    if (!escalationId) {
      deepLinkHandled.current = null;
      return;
    }

    const signature = `${escalationId}|${searchParams.toString()}`;
    if (deepLinkHandled.current === signature) return;

    const row = rows.find((r) => r.id === escalationId);
    if (!row) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("escalationId");
          return next;
        },
        { replace: true },
      );
      return;
    }

    deepLinkHandled.current = signature;
    setTab(escalationTabForDeepLink(row));

    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        document.getElementById(`escalation-row-${escalationId}`)?.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        });
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("escalationId");
            return next;
          },
          { replace: true },
        );
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [loading, rows, searchParams, setSearchParams]);

  useEffect(() => {
    setSelectedIds(new Set());
    setBatchError(null);
  }, [tab]);

  const filtered = useMemo(() => {
    const open = (r: EscalationRow) => r.status === "open";
    const resolved = (r: EscalationRow) => r.status !== "open";

    switch (tab) {
      case "open":
        return rows.filter(open);
      case "resolved":
        return rows.filter(resolved);
      case "visual_review":
        return rows.filter((r) => open(r) && escalationQueueBucket(r).visual);
      case "banking":
        return rows.filter((r) => open(r) && escalationQueueBucket(r).banking);
      case "pr_publication":
        return rows.filter((r) => open(r) && escalationQueueBucket(r).prPublication);
      default:
        return rows;
    }
  }, [rows, tab]);

  const selectionEnabled = tab !== "resolved";
  const selectedOpenIds = useMemo(() => {
    if (!selectionEnabled) return [];
    return filtered.filter((r) => r.status === "open" && selectedIds.has(r.id)).map((r) => r.id);
  }, [filtered, selectedIds, selectionEnabled]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllVisibleOpen = useCallback(() => {
    const openIds = filtered.filter((r) => r.status === "open").map((r) => r.id);
    setSelectedIds(new Set(openIds));
  }, [filtered]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  async function queueBatchResolution() {
    const ids = selectedOpenIds;
    if (ids.length < 2) return;
    const summary = batchSummary.trim();
    if (!summary) {
      setBatchError("Enter a resolution summary that applies to every selected escalation.");
      return;
    }
    setBatchError(null);
    const ok = window.confirm(
      `Queue ${ids.length} background resolutions using the same summary for each? This matches recording one resolution per item, without waiting for each job to finish.`,
    );
    if (!ok) return;

    setBatchBusy(true);
    setBatchProgress({ done: 0, total: ids.length });
    try {
      const { succeeded, failed } = await resolveEscalationsViaDashboardBatch(
        {
          escalationIds: ids,
          resolutionSummary: summary,
          photographerReplyRaw: batchNotes.trim() || undefined,
        },
        (done, total) => setBatchProgress({ done, total }),
      );
      if (succeeded.length > 0) {
        fireDataChanged("escalations");
        fireDataChanged("inbox");
        await load();
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of succeeded) next.delete(id);
          return next;
        });
      }
      if (failed.length > 0) {
        const detail = failed.map((f) => `${f.id.slice(0, 8)}…: ${f.message}`).join("\n");
        setBatchError(`${failed.length} failed:\n${detail}`);
      } else {
        setBatchSummary("");
        setBatchNotes("");
      }
    } catch (e) {
      setBatchError(e instanceof Error ? e.message : String(e));
    } finally {
      setBatchBusy(false);
      setBatchProgress(null);
    }
  }

  const tabs: { id: EscalationQueueTab; label: string; hint: string }[] = [
    { id: "open", label: "Open", hint: "All open escalation requests" },
    { id: "resolved", label: "Resolved", hint: "Answered, dismissed, or promoted" },
    { id: "visual_review", label: "Visual review", hint: "Gallery, proof, retouch, selection" },
    { id: "banking", label: "Banking", hint: "Payments, invoices, tax, refunds" },
    { id: "pr_publication", label: "PR / publication", hint: "Press, credits, usage, publication" },
  ];

  return (
    <div className="space-y-6 text-[13px] text-foreground">
      <div
        className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-[13px] text-foreground"
        role="note"
      >
        <span className="font-medium">Today is your operator hub.</span> Resolve open escalations from{" "}
        <Link to="/today" className="text-primary underline underline-offset-2">
          Home / Today
        </Link>{" "}
        (priority feed and contextual surfaces). This page remains for history and specialty triage.
      </div>
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Escalations</h1>
        <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
          Phase 11C — operator asks and blocked actions. Specialty queues use keyword heuristics on{" "}
          <span className="font-mono text-[11px]">action_key</span>,{" "}
          <span className="font-mono text-[11px]">reason_code</span>, and the question text.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.hint}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
              tab === t.id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {selectionEnabled && !loading && !error && filtered.some((r) => r.status === "open") ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[12px] text-foreground">
          <span className="font-medium text-muted-foreground">Selection</span>
          <button
            type="button"
            title="Select all open items in this tab"
            onClick={() => selectAllVisibleOpen()}
            disabled={batchBusy}
            className="rounded border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-accent/60 disabled:opacity-50"
          >
            Select all
          </button>
          <button
            type="button"
            title="Clear selection"
            onClick={() => clearSelection()}
            disabled={batchBusy || selectedIds.size === 0}
            className="rounded border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-accent/60 disabled:opacity-50"
          >
            Clear
          </button>
          <span className="text-muted-foreground">
            {selectedIds.size === 0 ? "None selected" : `${selectedIds.size} selected`}
          </span>
        </div>
      ) : null}

      {selectionEnabled && selectedOpenIds.length >= 2 ? (
        <div className="space-y-2 rounded-lg border border-border bg-card px-4 py-3 text-[13px] text-foreground shadow-sm">
          <p className="font-semibold text-foreground">Batch resolution (A7)</p>
          <p className="text-[12px] leading-snug text-muted-foreground">
            Use when the same outcome applies to every selected item (e.g. duplicates cleared, handled outside Ana). One
            summary is queued per escalation via the same dashboard path as{" "}
            <span className="font-medium text-foreground">Record resolution</span> in Today / Inbox.
          </p>
          <label className="block">
            <span className="mb-1 block text-[12px] text-muted-foreground">Resolution summary (applies to all selected)</span>
            <textarea
              className="min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              value={batchSummary}
              onChange={(e) => setBatchSummary(e.target.value)}
              placeholder="What was decided for these items (one or two sentences)"
              disabled={batchBusy}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-muted-foreground">Notes / reply for learning (optional)</span>
            <textarea
              className="min-h-[48px] w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              value={batchNotes}
              onChange={(e) => setBatchNotes(e.target.value)}
              placeholder="Optional; defaults to summary if empty"
              disabled={batchBusy}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={batchBusy || !batchSummary.trim()}
              onClick={() => void queueBatchResolution()}
              className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-[12px] font-semibold text-foreground hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {batchBusy ? "Queueing…" : `Queue resolution for ${selectedOpenIds.length} selected`}
            </button>
            {batchProgress ? (
              <span className="text-[11px] text-muted-foreground" aria-live="polite">
                {batchProgress.done} / {batchProgress.total} queued
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {batchError ? (
        <p className="whitespace-pre-wrap rounded-md border border-red-500/35 bg-red-500/10 px-3 py-2 text-[12px] text-red-700 dark:text-red-300" role="alert">
          {batchError}
        </p>
      ) : null}

      {loading ? (
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-[13px] text-red-600">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
          No items in this view.
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((r) => (
            <li
              key={r.id}
              id={`escalation-row-${r.id}`}
              className={cn(
                "rounded-lg border bg-background px-4 py-3 shadow-sm",
                selectionEnabled && r.status === "open" && selectedIds.has(r.id)
                  ? "border-primary/50 ring-1 ring-primary/25"
                  : "border-border",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {selectionEnabled && r.status === "open" ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-border"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelected(r.id)}
                        disabled={batchBusy}
                        aria-label={`Select escalation ${r.action_key}`}
                      />
                    ) : null}
                    <span className="font-mono text-[11px] text-muted-foreground">{r.action_key}</span>
                    <StatusPill status={r.status} />
                    {r.operator_delivery ? (
                      <span className="rounded border border-border px-1.5 py-0 text-[10px] text-muted-foreground">
                        {r.operator_delivery.replace(/_/g, " ")}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-[13px] leading-snug text-foreground">{r.question_body}</p>
                </div>
                <time className="shrink-0 text-[11px] text-muted-foreground">{formatShortDate(r.created_at)}</time>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                <span>reason: {r.reason_code}</span>
                {r.wedding_id ? (
                  <Link
                    to={`/pipeline/${r.wedding_id}`}
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    Open wedding
                  </Link>
                ) : (
                  <span className="italic">No wedding linked</span>
                )}
                {r.status === "open" ? (
                  <button
                    type="button"
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                    onClick={() => openAnaWithEscalation(r.id)}
                  >
                    Resolve with Ana
                  </button>
                ) : null}
              </div>

              <PromoteRow row={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: EscalationStatus }) {
  const cls =
    status === "open"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", cls)}>
      {status === "open" ? (
        <CircleDot className="h-3 w-3" strokeWidth={2} />
      ) : (
        <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
      )}
      {status}
    </span>
  );
}

function PromoteRow({ row }: { row: EscalationRow }) {
  if (row.status === "open") {
    return row.promote_to_playbook ? (
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
        Marked for playbook promotion when resolved.
      </div>
    ) : null;
  }

  return (
    <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
      {row.resolved_at ? (
        <p className="flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5" strokeWidth={1.75} />
          Resolved {formatShortDate(row.resolved_at)}
        </p>
      ) : null}
      {row.learning_outcome ? (
        <p>
          Learning outcome: <span className="font-medium text-foreground">{row.learning_outcome}</span>
        </p>
      ) : null}
      {row.resolution_storage_target ? (
        <p>
          Stored in: <span className="font-mono text-[10px]">{row.resolution_storage_target}</span>
        </p>
      ) : null}
      {row.playbook_rule_id ? (
        <p className="flex items-center gap-1.5 text-foreground">
          <BookMarked className="h-3.5 w-3.5" strokeWidth={1.75} />
          Playbook rule:{" "}
          <span className="font-mono text-[10px]">{row.playbook_rule_id.slice(0, 8)}…</span>
        </p>
      ) : null}
    </div>
  );
}
