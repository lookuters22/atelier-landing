import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, PenLine } from "lucide-react";
import { ListPageSkeleton } from "../components/DashboardSkeleton";
import { ApprovalDraftAiModal } from "../components/ApprovalDraftAiModal";
import type { ApprovalDraft } from "../data/approvalDrafts";
import { supabase } from "../lib/supabase";
import { fireDraftsChanged } from "../lib/events";
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
  const { drafts: liveDrafts, isLoading, refetch } = usePendingApprovals();
  const [localEdits, setLocalEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<ApprovalDraft | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  function applyBody(id: string, body: string) {
    setLocalEdits((prev) => ({ ...prev, [id]: body }));
  }

  async function handleApprove(draft: ApprovalDraft & { photographerId: string }) {
    setProcessingId(draft.id);
    try {
      const { error } = await supabase.functions.invoke("webhook-approval", {
        body: {
          draft_id: draft.id,
        },
      });
      if (error) throw error;
      setDismissed((prev) => new Set(prev).add(draft.id));
      fireDraftsChanged();
    } catch (err) {
      console.error("Approve failed", err);
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(draft: ApprovalDraft) {
    const feedback = window.prompt("What should the AI change or add?");
    if (feedback === null) return;

    setProcessingId(draft.id);
    try {
      const { error } = await supabase.functions.invoke("api-resolve-draft", {
        body: {
          draft_id: draft.id,
          action: "reject",
          edited_body: "",
          feedback,
        },
      });
      if (error) throw error;
      setDismissed((prev) => new Set(prev).add(draft.id));
      fireDraftsChanged();
    } catch (err) {
      console.error("Reject failed", err);
    } finally {
      setProcessingId(null);
    }
  }

  const drafts: ApprovalDraft[] = liveDrafts
    .filter((d) => !dismissed.has(d.id))
    .map((d) => {
      const mapped = toApprovalDraft(d);
      if (localEdits[d.id]) mapped.body = localEdits[d.id];
      return mapped;
    });

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

      <div className="grid gap-4 lg:grid-cols-2">
        {drafts.map((d) => {
          const busy = processingId === d.id;
          return (
            <div
              key={d.id}
              className="flex flex-col rounded-lg border border-border bg-surface p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">{d.wedding}</p>
                  <p className="mt-1 text-[15px] font-semibold text-ink">{d.subject}</p>
                  {d.to && <p className="mt-1 text-[12px] text-ink-faint">To {d.to}</p>}
                </div>
                <Link to={`/wedding/${d.weddingId}`} className="text-[12px] font-semibold text-link hover:text-link-hover">
                  Open context
                </Link>
              </div>
              <p className="whitespace-pre-wrap mt-4 flex-1 text-[14px] leading-relaxed text-ink-muted">{d.body}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleApprove(d)}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-ink transition hover:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check className="h-4 w-4" strokeWidth={1.75} />
                  {busy ? "Sending…" : "Approve & send"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(d)}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-[13px] text-ink transition hover:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PenLine className="h-4 w-4" strokeWidth={1.75} />
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleReject(d)}
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
