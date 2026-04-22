import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookMarked, Info } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  fetchPlaybookRuleCandidates,
  type PlaybookRuleCandidateListRow,
} from "@/lib/fetchPlaybookRuleCandidates";
import { reviewPlaybookRuleCandidate } from "@/lib/reviewPlaybookRuleCandidate";
import { cn } from "@/lib/utils";
import { openAnaWithPlaybookAuditMode } from "@/components/SupportAssistantWidget";

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function sourceLabel(src: PlaybookRuleCandidateListRow["source_classification"]): string {
  if (src && typeof src === "object" && !Array.isArray(src) && "source" in src) {
    const s = (src as Record<string, unknown>).source;
    if (s === "operator_studio_assistant") return "Ana (operator assistant)";
  }
  return "Other / pipeline";
}

function reviewStatusPill(status: string): string {
  const s = status.toLowerCase();
  if (s === "candidate") return "border-amber-200/80 bg-amber-50 text-amber-950";
  if (s === "approved") return "border-emerald-200/80 bg-emerald-50 text-emerald-950";
  if (s === "rejected") return "border-rose-200/80 bg-rose-50 text-rose-950";
  if (s === "superseded") return "border-border bg-muted text-muted-foreground";
  return "border-border bg-muted/80 text-muted-foreground";
}

/** Human label: pending vs reviewed (non-candidate) states. */
function reviewStatusDisplayLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "candidate") return "Pending review";
  return s.replace(/_/g, " ");
}

export function PlaybookRuleCandidatesPage() {
  const [rows, setRows] = useState<PlaybookRuleCandidateListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingReview, setPendingReview] = useState<{
    id: string;
    action: "approve" | "reject";
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { rows: next, error: err } = await fetchPlaybookRuleCandidates(supabase);
    if (err) {
      setRows([]);
      setError(err);
    } else {
      setRows(next);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runReview(candidateId: string, action: "approve" | "reject") {
    setActionError(null);
    setPendingReview({ id: candidateId, action });
    const result = await reviewPlaybookRuleCandidate(supabase, { candidateId, action });
    setPendingReview(null);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    await load();
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-[13px] font-semibold tracking-tight text-foreground">
          <BookMarked className="h-4 w-4 opacity-80" aria-hidden />
          Rule candidates (review)
        </div>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Staged playbook suggestions — including from{" "}
          <span className="font-medium text-foreground/90">Ana</span> — live here until you promote them.{" "}
          <span className="font-medium text-foreground/90">These are not active studio rules</span> by themselves;
          effective policy stays in your main playbook until a candidate is approved and promoted.
        </p>
        <div
          className="flex gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground"
          role="note"
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          <span>
            Use <strong className="font-medium text-foreground/85">Approve</strong> or{" "}
            <strong className="font-medium text-foreground/85">Reject</strong> on each pending row. The server runs{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">review_playbook_rule_candidate</code> (via a secure
            edge function) — this updates status and, on approve, promotes to your playbook.
          </span>
        </div>
        <div>
          <button
            type="button"
            onClick={() => openAnaWithPlaybookAuditMode()}
            className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-950 hover:bg-emerald-500/15 dark:text-emerald-100"
          >
            Ask Ana — rule audit mode
          </button>
          <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
            Opens the assistant in a playbook-focused lane: coverage and gaps use your Context rules; new policy stages
            as candidates only.
          </p>
        </div>
      </header>

      {actionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {actionError}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-[13px] text-muted-foreground">Loading candidates…</p>
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          No rule candidates yet. When Ana or the learning loop stages a rule, it will appear here.
        </p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-[13px] font-semibold text-foreground">{r.topic}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {r.proposed_action_key} · {r.id}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
                    reviewStatusPill(r.review_status),
                  )}
                >
                  {reviewStatusDisplayLabel(r.review_status)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-foreground/90">
                {r.proposed_instruction}
              </p>
              <dl className="mt-3 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                <div>
                  <dt className="inline font-medium text-foreground/70">Decision mode</dt>
                  <dd className="inline pl-1">{r.proposed_decision_mode}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-foreground/70">Scope</dt>
                  <dd className="inline pl-1">
                    {r.proposed_scope}
                    {r.proposed_scope === "channel" && r.proposed_channel ? ` · ${r.proposed_channel}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-medium text-foreground/70">Created</dt>
                  <dd className="inline pl-1">{formatWhen(r.created_at)}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-foreground/70">Source</dt>
                  <dd className="inline pl-1">{sourceLabel(r.source_classification)}</dd>
                </div>
                {r.wedding_id ? (
                  <div className="sm:col-span-2">
                    <dt className="inline font-medium text-foreground/70">Project</dt>
                    <dd className="inline pl-1">
                      <Link
                        to={`/pipeline/${r.wedding_id}`}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        Open in pipeline
                      </Link>
                      <span className="pl-1 font-mono text-[10px] opacity-80">({r.wedding_id})</span>
                    </dd>
                  </div>
                ) : null}
                {r.promoted_to_playbook_rule_id ? (
                  <div className="sm:col-span-2">
                    <dt className="inline font-medium text-emerald-800/90">Promoted to active rule</dt>
                    <dd className="inline pl-1 font-mono text-[10px]">{r.promoted_to_playbook_rule_id}</dd>
                  </div>
                ) : null}
                {r.operator_resolution_summary ? (
                  <div className="sm:col-span-2">
                    <dt className="inline font-medium text-foreground/70">Summary</dt>
                    <dd className="mt-0.5 block text-[11px] text-muted-foreground">{r.operator_resolution_summary}</dd>
                  </div>
                ) : null}
              </dl>
              {r.review_status === "candidate" ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-8 items-center rounded-md border border-emerald-200/80 bg-emerald-50 px-2.5 text-[11px] font-medium text-emerald-950 hover:bg-emerald-100/80 disabled:opacity-50"
                    disabled={pendingReview !== null}
                    aria-busy={pendingReview?.id === r.id && pendingReview.action === "approve"}
                    onClick={() => void runReview(r.id, "approve")}
                  >
                    {pendingReview?.id === r.id && pendingReview.action === "approve" ? "Approving…" : "Approve"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center rounded-md border border-rose-200/80 bg-rose-50 px-2.5 text-[11px] font-medium text-rose-950 hover:bg-rose-100/80 disabled:opacity-50"
                    disabled={pendingReview !== null}
                    aria-busy={pendingReview?.id === r.id && pendingReview.action === "reject"}
                    onClick={() => void runReview(r.id, "reject")}
                  >
                    {pendingReview?.id === r.id && pendingReview.action === "reject" ? "Rejecting…" : "Reject"}
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Reviewed — no further actions on this row.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-muted-foreground">
        Tip: dock <strong className="font-medium text-foreground/80">Projects</strong> → Studio tools →{" "}
        <strong className="font-medium text-foreground/80">Rule candidates (review)</strong>.
      </p>
    </div>
  );
}
