import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ClipboardPen, FlaskConical, Inbox, ListTodo, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "../../../lib/supabase";
import { fireDraftsChanged } from "../../../lib/events";
import { useAuth } from "../../../context/AuthContext";
import { usePendingApprovals } from "../../../hooks/usePendingApprovals";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import { useTasks } from "../../../hooks/useTasks";
import { useTodayMetrics } from "../../../hooks/useTodayMetrics";
import { useUpcomingWeddings } from "../../../hooks/useUpcomingWeddings";
import { Button } from "@/components/ui/button";
import { useTodayMode } from "./TodayModeContext";

function formatTodayHeading(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatWeddingDate(iso: string, location: string): string {
  const d = new Date(iso);
  const formatted = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${formatted} · ${location}`;
}

function formatStageLabel(stage: string): string {
  return stage
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTaskDue(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function TodayWorkspace() {
  const { selection, select } = useTodayMode();
  const navigate = useNavigate();
  const { photographerId } = useAuth();
  const { unfiledCount, pendingDraftsCount, isLoading: metricsLoading } = useTodayMetrics();
  const { tasks, completeTask } = useTasks();
  const { drafts } = usePendingApprovals();
  const { unfiledThreads, linkThread, activeWeddings } = useUnfiledInbox();
  const { weddings: upcomingWeddings, isLoading: weddingsLoading } = useUpcomingWeddings(photographerId ?? "", 8);

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [linkWeddingId, setLinkWeddingId] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function fireTestLead() {
    try {
      setIsSimulating(true);
      setSimResult(null);
      const { error } = await supabase.functions.invoke("webhook-web", {
        body: {
          source: "test_button",
          photographer_id: photographerId,
          lead: {
            name: "Sarah & James",
            email: "sarah.test@example.com",
            event_date: "2026-09-15",
            message:
              "Hi! We are getting married in Lake Como and absolutely love your editorial style. Are you available for our dates?",
          },
        },
      });
      if (error) throw error;
      setSimResult({ ok: true, message: "Lead sent \u2014 check Inbox for the AI pipeline result." });
    } catch (err: unknown) {
      setSimResult({ ok: false, message: err instanceof Error ? err.message : "Failed to send test lead." });
    } finally {
      setIsSimulating(false);
    }
  }

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const tasksDueCount = tasks.filter((t) => new Date(t.due_date) <= endOfToday).length;

  const draft =
    selection.type === "draft" ? drafts.find((d) => d.id === selection.id) : undefined;
  const unfiled =
    selection.type === "unfiled" ? unfiledThreads.find((t) => t.id === selection.id) : undefined;
  const task =
    selection.type === "task" ? tasks.find((t) => t.id === selection.id) : undefined;

  if (selection.type === "overview") {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background p-6 text-[13px] text-foreground">
        <header className="mb-6">
          <p className="text-[12px] text-muted-foreground">{formatTodayHeading()}</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">Good morning, Elena</h1>
        </header>

        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          <AttentionCard
            title="Unfiled messages"
            count={metricsLoading ? null : unfiledCount}
            icon={Inbox}
            onSelect={() => {
              const first = unfiledThreads[0];
              if (first) select({ type: "unfiled", id: first.id });
              else select({ type: "overview" });
            }}
          />
          <AttentionCard
            title="Drafts awaiting approval"
            count={metricsLoading ? null : pendingDraftsCount}
            icon={ClipboardPen}
            onSelect={() => {
              const first = drafts[0];
              if (first) select({ type: "draft", id: first.id });
              else select({ type: "overview" });
            }}
          />
          <AttentionCard
            title="Tasks due today"
            count={metricsLoading ? null : tasksDueCount}
            icon={ListTodo}
            onSelect={() => {
              const due = tasks.filter((t) => new Date(t.due_date) <= endOfToday);
              const first = due[0] ?? tasks[0];
              if (first) select({ type: "task", id: first.id });
              else select({ type: "overview" });
            }}
          />
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold">Upcoming weddings</h2>
          </div>
          <div className="rounded-lg border border-border bg-background">
            {weddingsLoading ? (
              <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">Loading…</p>
            ) : upcomingWeddings.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12px] text-muted-foreground">No upcoming weddings</p>
            ) : (
              <ul>
                {upcomingWeddings.map((w, i) => (
                  <li
                    key={w.id}
                    className={cn(
                      "flex items-center justify-between gap-3 px-4 py-3",
                      i < upcomingWeddings.length - 1 && "border-b border-border",
                    )}
                  >
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => navigate(`/pipeline/${w.id}`)}
                        className="text-left text-[13px] font-medium text-foreground hover:underline"
                      >
                        {w.couple_names}
                      </button>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <CalendarClock className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={1.5} />
                        {formatWeddingDate(w.wedding_date, w.location)}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                      {formatStageLabel(w.stage)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-dashed border-border bg-accent/20 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] shadow-md"
                style={{ background: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)" }}
              >
                <FlaskConical className="h-[18px] w-[18px] text-white" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-foreground">Developer Test</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Fire a simulated inquiry into the live AI pipeline via{" "}
                  <span className="font-mono text-[11px] text-muted-foreground/70">webhook-web</span>.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={fireTestLead}
              disabled={isSimulating}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-[13px] text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSimulating ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              {isSimulating ? "Sending\u2026" : "Simulate Incoming Lead"}
            </button>
          </div>
          {simResult && (
            <div
              className={cn(
                "mt-3 rounded-lg px-4 py-2 text-[13px]",
                simResult.ok
                  ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                  : "border border-red-500/20 bg-red-500/10 text-red-600",
              )}
            >
              {simResult.message}
            </div>
          )}
        </section>
      </div>
    );
  }

  if (selection.type === "draft") {
    if (!draft) {
      return (
        <div className="flex h-full items-center justify-center bg-background p-6 text-[13px] text-muted-foreground">
          Draft not found.
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background p-6 text-[13px] text-foreground">
        <h2 className="mb-1 text-[13px] font-semibold">{draft.thread_title}</h2>
        <p className="mb-4 text-[12px] text-muted-foreground">{draft.couple_names}</p>
        <div className="mb-4 rounded-md border border-border bg-sidebar/30 px-3 py-2 text-[12px]">
          <span className="text-muted-foreground">To:</span>{" "}
          <span className="text-foreground">—</span>
        </div>
        <div className="mb-6 min-h-[120px] whitespace-pre-wrap rounded-md border border-border bg-background p-4 text-[13px] leading-relaxed">
          {draft.body}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={processingId === selection.id}
            onClick={() => {
              void (async () => {
                setProcessingId(selection.id);
                try {
                  await supabase.functions.invoke("webhook-approval", {
                    body: { draft_id: selection.id, photographer_id: draft.photographer_id },
                  });
                  fireDraftsChanged();
                  select({ type: "overview" });
                } finally {
                  setProcessingId(null);
                }
              })();
            }}
          >
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={processingId === selection.id}
            onClick={() => {
              void (async () => {
                const feedback = window.prompt("What should the AI change?");
                if (feedback === null) return;
                setProcessingId(selection.id);
                try {
                  await supabase.functions.invoke("api-resolve-draft", {
                    body: {
                      draft_id: selection.id,
                      action: "reject",
                      edited_body: "",
                      feedback,
                    },
                  });
                  fireDraftsChanged();
                  select({ type: "overview" });
                } finally {
                  setProcessingId(null);
                }
              })();
            }}
          >
            Reject
          </Button>
        </div>
      </div>
    );
  }

  if (selection.type === "unfiled") {
    if (!unfiled) {
      return (
        <div className="flex h-full items-center justify-center bg-background p-6 text-[13px] text-muted-foreground">
          Thread not found.
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background p-6 text-[13px] text-foreground">
        <h2 className="mb-1 text-[13px] font-semibold">{unfiled.title}</h2>
        <p className="mb-4 text-[12px] text-muted-foreground">{unfiled.sender || "Unknown sender"}</p>
        <div className="mb-4 rounded-md border border-border bg-sidebar/30 p-4 text-[13px] leading-relaxed text-foreground">
          {unfiled.snippet || "No preview."}
        </div>
        {unfiled.ai_routing_metadata ? (
          <p className="mb-4 text-[12px] text-muted-foreground">
            AI routing: {unfiled.ai_routing_metadata.classified_intent} ·{" "}
            {Math.round(unfiled.ai_routing_metadata.confidence_score * 100)}% confidence
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[12px] text-muted-foreground">Wedding</span>
            <select
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              value={linkWeddingId}
              onChange={(e) => setLinkWeddingId(e.target.value)}
            >
              <option value="">Choose wedding…</option>
              {activeWeddings.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.couple_names}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!linkWeddingId}
            onClick={() => {
              void (async () => {
                await linkThread(selection.id, linkWeddingId);
                select({ type: "overview" });
              })();
            }}
          >
            Link Thread
          </Button>
        </div>
      </div>
    );
  }

  if (selection.type === "task") {
    if (!task) {
      return (
        <div className="flex h-full items-center justify-center bg-background p-6 text-[13px] text-muted-foreground">
          Task not found.
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background p-6 text-[13px] text-foreground">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-border"
            onChange={() => {
              void completeTask(task.id);
              select({ type: "overview" });
            }}
          />
          <span>
            <span className="font-medium">{task.title}</span>
            <span className="mt-2 block text-[12px] text-muted-foreground">Due {formatTaskDue(task.due_date)}</span>
            {task.couple_names ? (
              <span className="mt-1 block text-[12px] text-muted-foreground">{task.couple_names}</span>
            ) : null}
          </span>
        </label>
      </div>
    );
  }

  return null;
}

function AttentionCard({
  title,
  count,
  icon: Icon,
  onSelect,
}: {
  title: string;
  count: number | null;
  icon: typeof Inbox;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex flex-col gap-2 rounded-lg border border-border bg-background p-4 text-left transition-colors hover:bg-accent/40"
    >
      <div className="flex items-center justify-between gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
          {count === null ? "—" : count}
        </span>
      </div>
      <span className="text-[13px] font-medium leading-snug text-foreground">{title}</span>
    </button>
  );
}

