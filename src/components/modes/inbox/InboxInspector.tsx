import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarClock,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  Link2,
  MapPin,
  MessageSquare,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "../../../context/AuthContext";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import { useWeddings } from "../../../hooks/useWeddings";
import { supabase } from "../../../lib/supabase";
import {
  type ThreadAutomationMode,
  updateThreadAutomationMode,
} from "../../../lib/threadAutomationModeClient";
import { useInboxMode } from "./InboxModeContext";
import { useInboxLayout } from "./InboxLayoutContext";
import { getPipelineMoneyLine } from "../../../data/weddingFinancials";
import { ProjectStoryAndNotes } from "../../shared/ProjectStoryAndNotes";
import { extractCoupleNamesForNewInquiry } from "../../../lib/inquiryCoupleNameExtract";
import { InboxSenderContactActions } from "./InboxSenderContactActions";
import {
  PaneInspectorEmptyState,
  PaneInspectorFrame,
  PaneInspectorScrollBody,
  PaneInspectorSectionTitle,
  PaneQuietCard,
  PANE_INSPECTOR_IDLE_LIST_CARD,
  PANE_INSPECTOR_META_LABEL,
  PANE_INSPECTOR_SECONDARY,
  PANE_INSPECTOR_TITLE,
} from "@/components/panes";

function formatStageLabel(stage: string): string {
  return stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function InboxInspector() {
  const layout = useInboxLayout();

  if (layout?.inspectorCollapsed) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-background px-0.5">
        <button
          type="button"
          onClick={layout.expandInspector}
          className="rounded-md p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          title="Expand Ana panel"
          aria-label="Expand Ana panel"
        >
          <ChevronsLeft className="h-5 w-5" strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {layout ? (
        <div className="flex shrink-0 items-center justify-end px-2 py-1.5">
          <button
            type="button"
            onClick={layout.collapseInspector}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            title="Collapse Ana panel"
            aria-label="Collapse Ana panel"
          >
            <ChevronsRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <InboxInspectorBody />
      </div>
    </div>
  );
}

function InboxInspectorBody() {
  const { selection } = useInboxMode();

  if (selection.kind === "none") return <IdleState />;
  if (selection.kind === "thread") return <LinkerState />;
  return <CrmState />;
}

function IdleState() {
  return (
    <PaneInspectorEmptyState
      icon={<MessageSquare className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />}
      message="Select a thread or project to view details."
    />
  );
}

function LinkerState() {
  const { selection } = useInboxMode();
  const { photographerId } = useAuth();
  const { activeWeddings, linkThread, convertThreadToInquiry } = useUnfiledInbox();
  const { data: weddings } = useWeddings(photographerId ?? "");
  const [showLinker, setShowLinker] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [automationMode, setAutomationMode] = useState<ThreadAutomationMode | null>(null);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationError, setAutomationError] = useState<string | null>(null);

  const threadId = selection.kind === "thread" ? selection.thread.id : "";
  const thread = selection.kind === "thread" ? selection.thread : null;

  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) {
        setAutomationLoading(true);
        setAutomationError(null);
      }
    });
    void supabase
      .from("threads")
      .select("automation_mode")
      .eq("id", threadId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setAutomationError(error.message);
          setAutomationMode("auto");
        } else {
          const m = data?.automation_mode as ThreadAutomationMode | undefined;
          setAutomationMode(m ?? "auto");
        }
        setAutomationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  async function handleAutomationChange(mode: ThreadAutomationMode) {
    if (!thread) return;
    setAutomationError(null);
    const prev = automationMode;
    setAutomationMode(mode);
    const { error } = await updateThreadAutomationMode(thread.id, mode);
    if (error) {
      setAutomationError(error.message);
      setAutomationMode(prev);
    }
  }

  if (selection.kind !== "thread" || !thread) return null;
  const selectedThread = thread;
  const meta = selectedThread.ai_routing_metadata;
  const assignedWedding = selectedThread.weddingId
    ? weddings.find((w) => w.id === selectedThread.weddingId) ??
      activeWeddings.find((w) => w.id === selectedThread.weddingId) ??
      null
    : null;

  async function handleLink(weddingId: string) {
    setLinkingId(weddingId);
    await linkThread(selectedThread.id, weddingId);
    setLinkingId(null);
    setShowLinker(false);
  }

  async function handleConvertToInquiry() {
    setConvertError(null);
    setConverting(true);
    const extracted = extractCoupleNamesForNewInquiry({
      threadTitle: selectedThread.title,
      latestInboundBody: selectedThread.latestMessageBody,
      snippet: selectedThread.snippet,
      sender: selectedThread.sender,
    });
    const result = await convertThreadToInquiry(selectedThread.id, {
      coupleNames: extracted.coupleNames,
      leadClientName: extracted.leadClientName,
    });
    setConverting(false);
    if (!result.ok) {
      setConvertError(result.error);
      return;
    }
  }

  return (
    <PaneInspectorFrame>
      <PaneInspectorScrollBody>
        {/* Unassigned warning */}
        {assignedWedding ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-medium text-emerald-900">Linked to a project</p>
                <p className="mt-1 text-[12px] leading-relaxed text-emerald-800/80">
                  This thread still stays in Inbox, and it is also linked to{" "}
                  <span className="font-medium text-emerald-950">{assignedWedding?.couple_names ?? "a project"}</span>.
                </p>
              </div>
              {selectedThread.weddingId ? (
                <Link
                  to={`/pipeline/${selectedThread.weddingId}`}
                  className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-[12px] font-semibold text-emerald-900 transition hover:bg-emerald-100"
                >
                  Open project
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" strokeWidth={1.75} />
              <div>
                <p className="text-[13px] font-medium text-amber-900">
                  This thread is unassigned
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-amber-800/80">
                  Link it to an existing project or convert it into a new inquiry.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-2">
          {!assignedWedding ? (
            <>
              <button
                type="button"
                onClick={() => void handleConvertToInquiry()}
                disabled={converting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#2563eb] px-4 py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#2563eb]/90 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                {converting ? "Creating…" : "Convert to New Inquiry"}
              </button>
              {convertError ? (
                <p className="text-[11px] text-destructive">{convertError}</p>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setShowLinker(!showLinker)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-[12px] font-semibold text-foreground transition hover:bg-accent"
          >
            <Link2 className="h-3.5 w-3.5" strokeWidth={2} />
            {assignedWedding ? "Move to Different Project" : "Link to Existing Project"}
          </button>
        </div>

        {/* Linker dropdown */}
        {showLinker && (
          <div className={PANE_INSPECTOR_IDLE_LIST_CARD}>
            <PaneInspectorSectionTitle className="mb-0">Select a project</PaneInspectorSectionTitle>
            {activeWeddings.length === 0 ? (
              <p className={cn("mt-2", PANE_INSPECTOR_SECONDARY)}>No active projects found.</p>
            ) : (
              <ul className="mt-2 max-h-[200px] overflow-y-auto">
                {activeWeddings.map((w) => (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => handleLink(w.id)}
                      disabled={linkingId !== null}
                      className="flex w-full items-center gap-2.5 rounded-md border border-transparent py-2 text-left text-[12px] transition-colors hover:bg-muted/20 disabled:opacity-50 dark:hover:bg-white/[0.06]"
                    >
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2563eb]/10 text-[9px] font-semibold text-[#2563eb]">
                        {w.couple_names.charAt(0)}
                      </div>
                      <span className="font-medium text-foreground">{w.couple_names}</span>
                      {linkingId === w.id && (
                        <span className="ml-auto text-[11px] text-muted-foreground">Linking…</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Phase 11 Step 11B — outbound control: thread automation mode */}
        <PaneQuietCard>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
            <PaneInspectorSectionTitle className="mb-0">Outbound automation</PaneInspectorSectionTitle>
          </div>
          <p className={cn("mt-1.5", PANE_INSPECTOR_SECONDARY)}>
            Controls how Ana handles this thread after send (draft queue vs full auto). Phase 11B inbox slice.
          </p>
          {automationLoading ? (
            <p className={cn("mt-2", PANE_INSPECTOR_SECONDARY)}>Loading mode…</p>
          ) : (
            <label className="mt-2 block text-[13px]">
              <span className="sr-only">Automation mode</span>
              <select
                value={automationMode ?? "auto"}
                onChange={(e) => void handleAutomationChange(e.target.value as ThreadAutomationMode)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-[13px] text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="auto">Auto — AI may draft and queue outbound per policy</option>
                <option value="draft_only">Draft only — AI drafts; you approve all sends</option>
                <option value="human_only">Human only — no AI drafts on this thread</option>
              </select>
            </label>
          )}
          {automationError ? (
            <p className="mt-2 text-[12px] text-red-600">{automationError}</p>
          ) : null}
        </PaneQuietCard>

        {/* Sender info */}
        <div>
          <PaneInspectorSectionTitle>Sender</PaneInspectorSectionTitle>
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 text-[13px] font-medium text-foreground">
              {selectedThread.sender || "Unknown"}
            </p>
            {selectedThread.sender ? (
              <InboxSenderContactActions sender={selectedThread.sender} />
            ) : null}
          </div>
        </div>

        {/* AI suggestion */}
        {meta && (
          <div>
            <PaneInspectorSectionTitle>AI Suggestion</PaneInspectorSectionTitle>
            <div className="space-y-1.5 text-[12px]">
              <p>
                <span className="text-muted-foreground">Intent:</span>{" "}
                {meta.classified_intent}
              </p>
              <p>
                <span className="text-muted-foreground">Confidence:</span>{" "}
                {Math.round(meta.confidence_score * 100)}%
              </p>
              <p className="leading-relaxed text-muted-foreground">{meta.reasoning}</p>
            </div>
          </div>
        )}
      </PaneInspectorScrollBody>
    </PaneInspectorFrame>
  );
}

function CrmState() {
  const { selection } = useInboxMode();
  const { photographerId } = useAuth();
  const { data: weddings } = useWeddings(photographerId ?? "");

  if (selection.kind !== "project") return null;

  const wedding = weddings.find((w) => w.id === selection.projectId);

  if (!wedding) {
    return (
      <PaneInspectorEmptyState
        icon={<MessageSquare className="h-8 w-8 text-muted-foreground/60" strokeWidth={1.5} />}
        message="Project not found."
      />
    );
  }

  const moneyLine = getPipelineMoneyLine(wedding.id);

  return (
    <PaneInspectorFrame>
      <PaneInspectorScrollBody>
        {/* Project header */}
        <div>
          <h2 className={PANE_INSPECTOR_TITLE}>{wedding.couple_names}</h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span
              className={cn(
                "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize",
                stageBadge(wedding.stage),
              )}
            >
              {formatStageLabel(wedding.stage)}
            </span>
          </div>
        </div>

        {/* Key details */}
        <div className="space-y-3">
          <div className={PANE_INSPECTOR_IDLE_LIST_CARD}>
            <div className="flex items-start gap-2.5">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <div>
                <p className={PANE_INSPECTOR_META_LABEL}>Event Date</p>
                <p className="mt-0.5 text-[13px] text-foreground">{formatDate(wedding.wedding_date)}</p>
              </div>
            </div>
          </div>

          <div className={PANE_INSPECTOR_IDLE_LIST_CARD}>
            <div className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <div>
                <p className={PANE_INSPECTOR_META_LABEL}>Location</p>
                <p className="mt-0.5 text-[13px] text-foreground">{wedding.location}</p>
              </div>
            </div>
          </div>

          {moneyLine && (
            <div className={PANE_INSPECTOR_IDLE_LIST_CARD}>
              <p className={PANE_INSPECTOR_META_LABEL}>Financials</p>
              <p className="mt-0.5 text-[13px] text-foreground">{moneyLine}</p>
            </div>
          )}
        </div>

        {/* Open in Pipeline link */}
        <Link
          to={`/pipeline/${wedding.id}`}
          className={cn(
            PANE_INSPECTOR_IDLE_LIST_CARD,
            "flex items-center justify-between text-[13px] font-medium text-foreground transition-colors hover:bg-muted/25 dark:hover:bg-white/[0.08]",
          )}
        >
          Open in Pipeline
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
        </Link>

        <ProjectStoryAndNotes projectId={wedding.id} />
      </PaneInspectorScrollBody>
    </PaneInspectorFrame>
  );
}

function stageBadge(stage: string): string {
  const INQUIRY = new Set(["inquiry", "consultation", "proposal_sent", "contract_out"]);
  const ACTIVE = new Set(["booked", "prep"]);
  if (INQUIRY.has(stage)) return "border-amber-200/80 bg-amber-50 text-amber-900";
  if (ACTIVE.has(stage)) return "border-emerald-200/80 bg-emerald-50 text-emerald-900";
  return "border-border bg-muted/60 text-muted-foreground";
}
