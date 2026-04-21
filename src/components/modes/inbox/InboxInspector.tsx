import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import { useWeddings } from "../../../hooks/useWeddings";
import { supabase } from "../../../lib/supabase";
import {
  type ThreadAutomationMode,
  updateThreadAutomationMode,
} from "../../../lib/threadAutomationModeClient";
import { useInboxMode } from "./InboxModeContext";
import { routingConfidencePercent } from "../../../lib/aiRoutingFormat";
import type { Tables } from "../../../types/database.types";
import type { UnfiledThread } from "../../../hooks/useUnfiledInbox";
import {
  REDESIGN_AI_CONFIDENCE_LABEL,
  REDESIGN_AI_INTENT,
  REDESIGN_AI_REASON,
  REDESIGN_EVENT_DATE,
  REDESIGN_EVENT_GUESTS,
  REDESIGN_EVENT_LOCATION,
  REDESIGN_EVENT_PACKAGE,
  REDESIGN_INSPECTOR_LINKED_H4,
  REDESIGN_INSPECTOR_LINKED_P,
} from "./inboxRedesignLiterals";

function packageSummary(w: Pick<Tables<"weddings">, "package_name" | "contract_value">): string {
  const name = w.package_name?.trim() ?? "";
  const val = w.contract_value;
  if (name && val != null) return `${name} · ${val}`;
  if (name) return name;
  if (val != null) return String(val);
  return REDESIGN_EVENT_PACKAGE;
}

/**
 * Literal structure from `Ana Dashboard.html` `<aside class="pane inspector last">` / `.inspector-body`.
 * Live values replace copy only where available; otherwise redesign strings stay verbatim.
 */
function InspectorRedesignBody({
  thread,
  projectWedding,
}: {
  thread: UnfiledThread | null;
  projectWedding: Tables<"weddings"> | null;
}) {
  const { photographerId } = useAuth();
  const { data: weddings } = useWeddings(photographerId ?? "");
  const { activeWeddings } = useUnfiledInbox();

  const [automationMode, setAutomationMode] = useState<ThreadAutomationMode | null>(null);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationError, setAutomationError] = useState<string | null>(null);

  const assignedFromThread =
    thread?.weddingId != null
      ? (weddings ?? []).find((w) => w.id === thread.weddingId) ??
        activeWeddings.find((w) => w.id === thread.weddingId) ??
        null
      : null;

  const wedding = projectWedding ?? assignedFromThread;

  const threadId = thread?.id ?? "";

  useEffect(() => {
    if (!threadId) {
      setAutomationMode("draft_only");
      setAutomationLoading(false);
      return;
    }
    let cancelled = false;
    setAutomationLoading(true);
    setAutomationError(null);
    void supabase
      .from("threads")
      .select("automation_mode")
      .eq("id", threadId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setAutomationError(error.message);
          setAutomationMode("draft_only");
        } else {
          const m = data?.automation_mode as ThreadAutomationMode | undefined;
          setAutomationMode(m ?? "draft_only");
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

  const meta = thread?.ai_routing_metadata;
  const intentLine = meta?.classified_intent?.trim() || REDESIGN_AI_INTENT;
  const confPct = meta != null ? routingConfidencePercent(meta.confidence_score) : null;
  const confLabel = confPct != null ? `${confPct}%` : REDESIGN_AI_CONFIDENCE_LABEL;
  const confBarPct = confPct ?? 87;
  const reasonText = meta?.reasoning?.trim() || REDESIGN_AI_REASON;

  const linkedH4 = wedding?.couple_names?.trim() || REDESIGN_INSPECTOR_LINKED_H4;
  const linkedP = wedding?.story_notes?.trim() || REDESIGN_INSPECTOR_LINKED_P;
  const pipelineTo = wedding?.id ? `/pipeline/${wedding.id}` : "/pipeline";

  const eventDate = wedding?.wedding_date ? formatDateUk(wedding.wedding_date) : REDESIGN_EVENT_DATE;
  const eventLoc = wedding?.location?.trim() || REDESIGN_EVENT_LOCATION;
  const eventPkg = wedding ? packageSummary(wedding) : REDESIGN_EVENT_PACKAGE;
  const eventGuests = REDESIGN_EVENT_GUESTS;

  const autoMode = automationMode ?? "draft_only";

  return (
    <>
      <div className="card-ana linked">
        <div className="eyebrow">Linked project</div>
        <h4>{linkedH4}</h4>
        <p>{linkedP}</p>
        <Link className="open-link" to={pipelineTo}>
          Open in Pipeline →
        </Link>
      </div>

      <div>
        <div className="insp-label">Event</div>
        <div className="kv">
          <div className="row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
              <rect x="3" y="5" width="18" height="16" rx="1" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            <div>
              <div className="k">Date</div>
              <div className="v">{eventDate}</div>
            </div>
          </div>
          <div className="row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <div>
              <div className="k">Location</div>
              <div className="v">{eventLoc}</div>
            </div>
          </div>
          <div className="row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
              <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <div>
              <div className="k">Package</div>
              <div className="v">{eventPkg}</div>
            </div>
          </div>
          <div className="row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
            <div>
              <div className="k">Guests</div>
              <div className="v">{eventGuests}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="ai-reason" style={{ ["--ana-inspector-conf-pct" as string]: `${confBarPct}%` }}>
        <div className="insp-label">Ana&apos;s reasoning</div>
        <div className="kv" style={{ gap: 6 }}>
          <div>
            <span className="insp-label" style={{ color: "var(--fg-2)", margin: 0 }}>
              Intent:
            </span>{" "}
            <span style={{ fontSize: 13, color: "var(--fg-1)" }}>{intentLine}</span>
          </div>
          <div>
            <span className="insp-label" style={{ color: "var(--fg-2)", margin: 0 }}>
              Confidence:
            </span>{" "}
            <span style={{ fontSize: 13, color: "var(--fg-1)" }}>{confLabel}</span>
          </div>
        </div>
        <div className="conf-bar">
          <i />
        </div>
        <p className="reason">{reasonText}</p>
      </div>

      <div>
        <div className="insp-label">Outbound automation</div>
        {automationLoading ? null : (
          <div className="auto-mode">
            <div className="auto-seg">
              <button
                type="button"
                data-active={autoMode === "auto" ? "true" : "false"}
                onClick={() => void handleAutomationChange("auto")}
                disabled={!thread}
              >
                Auto
              </button>
              <button
                type="button"
                data-active={autoMode === "draft_only" ? "true" : "false"}
                onClick={() => void handleAutomationChange("draft_only")}
                disabled={!thread}
              >
                Draft only
              </button>
              <button
                type="button"
                data-active={autoMode === "human_only" ? "true" : "false"}
                onClick={() => void handleAutomationChange("human_only")}
                disabled={!thread}
              >
                Human only
              </button>
            </div>
            <p className="auto-desc">
              Ana will keep drafting replies for your approval on this thread. She won&apos;t send anything without you.
            </p>
          </div>
        )}
        {automationError ? (
          <p className="insp-mini-err" role="alert">
            {automationError}
          </p>
        ) : null}
      </div>
    </>
  );
}

function formatDateUk(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function InboxInspector() {
  return (
    <aside className="inspector pane last flex h-full min-h-0 flex-col overflow-hidden">
      <div className="pane-head">
        <h3>Context</h3>
      </div>
      <div className="inspector-body min-h-0 flex-1">
        <InboxInspectorInner />
      </div>
    </aside>
  );
}

function InboxInspectorInner() {
  const { selection } = useInboxMode();
  const { photographerId } = useAuth();
  const { data: weddings } = useWeddings(photographerId ?? "");

  if (selection.kind === "thread") {
    return <InspectorRedesignBody thread={selection.thread} projectWedding={null} />;
  }

  if (selection.kind === "project") {
    const w = weddings?.find((x) => x.id === selection.projectId) ?? null;
    return <InspectorRedesignBody thread={null} projectWedding={w} />;
  }

  return <InspectorRedesignBody thread={null} projectWedding={null} />;
}
