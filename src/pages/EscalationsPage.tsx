/**
 * Phase 11 Step 11C — escalation surface (open, resolved, specialty queues).
 * Queues are heuristic buckets over `escalation_requests` (same table; filters only).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BookMarked, CheckCircle2, CircleDot, Clock3 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { cn } from "@/lib/utils";

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
  const [rows, setRows] = useState<EscalationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<EscalationQueueTab>("open");

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

  const tabs: { id: EscalationQueueTab; label: string; hint: string }[] = [
    { id: "open", label: "Open", hint: "All open escalation requests" },
    { id: "resolved", label: "Resolved", hint: "Answered, dismissed, or promoted" },
    { id: "visual_review", label: "Visual review", hint: "Gallery, proof, retouch, selection" },
    { id: "banking", label: "Banking", hint: "Payments, invoices, tax, refunds" },
    { id: "pr_publication", label: "PR / publication", hint: "Press, credits, usage, publication" },
  ];

  return (
    <div className="space-y-6 text-[13px] text-foreground">
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
              className="rounded-lg border border-border bg-background px-4 py-3 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
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
