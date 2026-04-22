import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { UnfiledThread } from "../../../../src/hooks/useUnfiledInbox.ts";
import { deriveInboxThreadBucket, isSuppressedInboxThread } from "../../../../src/lib/inboxThreadBucket.ts";
import { INQUIRY_STAGES } from "../../../../src/lib/inboxVisibleThreads.ts";
import { mapPendingApprovalProjectionRow } from "../../../../src/lib/pendingApprovalProjection.ts";
import {
  buildTodayActionsFromSources,
  countTodayActionsByZenTab,
  type OpenEscalationRow,
  sortTodayActionsByRecency,
  type TodayAction,
} from "../../../../src/lib/todayActionFeed.ts";
import type { AssistantOperatorStateSummary } from "../../../../src/types/assistantContext.types.ts";

const MAX_INBOX_PROJECTION_THREADS = 200;
const MAX_WEDDING_STAGE_LOOKUP = 500;
const MAX_SAMPLE_DRAFTS = 4;
const MAX_SAMPLE_ESCALATIONS = 4;
const MAX_SAMPLE_TASKS = 4;
const MAX_SAMPLE_TOP_ACTIONS = 8;

const INBOX_LIST_SELECT = "id, wedding_id, title, last_activity_at, ai_routing_metadata, latest_sender";

function minimalUnfiledThreadFromViewRow(row: Record<string, unknown>): UnfiledThread {
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    weddingId: row.wedding_id != null ? String(row.wedding_id) : null,
    last_activity_at: String(row.last_activity_at ?? ""),
    ai_routing_metadata: (row.ai_routing_metadata ?? null) as UnfiledThread["ai_routing_metadata"],
    snippet: "",
    latestMessageBody: "",
    latestMessageHtmlSanitized: null,
    gmailRenderHtmlRef: null,
    latestMessageId: null,
    latestMessageAttachments: [],
    sender: row.latest_sender != null ? String(row.latest_sender) : "",
    latestProviderMessageId: null,
    hasGmailImport: false,
    gmailLabelIds: null,
  };
}

function actionSampleLabel(a: TodayAction): string {
  switch (a.action_type) {
    case "draft_approval":
      return "Pending draft approval";
    case "unfiled_thread":
      return a.zen_priority_tag ?? a.status_label;
    case "linked_lead_thread":
      return a.zen_priority_tag ?? "Open lead";
    case "open_task":
      return `Task (${a.status_label})`;
    case "open_escalation":
      return "Escalation";
    default:
      return a.status_label;
  }
}

/**
 * Bounded Today / Inbox read model for the operator widget (Slice 3).
 * Uses the same sources and bucket rules as `useTodayActions` / `buildTodayActionsFromSources`.
 */
export async function fetchAssistantOperatorStateSummary(
  supabase: SupabaseClient,
  photographerId: string,
): Promise<AssistantOperatorStateSummary> {
  const fetchedAt = new Date().toISOString();

  const [draftsRes, tasksRes, escRes, threadsRes, weddingsRes] = await Promise.all([
    supabase
      .from("v_pending_approval_drafts")
      .select("id, body, thread_id, created_at, thread_title, wedding_id, couple_names, photographer_id")
      .eq("photographer_id", photographerId)
      .order("created_at", { ascending: false }),
    supabase
      .from("v_open_tasks_with_wedding")
      .select("id, title, due_date, status, wedding_id, couple_names")
      .eq("photographer_id", photographerId)
      .order("due_date", { ascending: true }),
    supabase
      .from("escalation_requests")
      .select("id, created_at, question_body, action_key, wedding_id, thread_id")
      .eq("photographer_id", photographerId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("v_threads_inbox_latest_message")
      .select(INBOX_LIST_SELECT)
      .eq("photographer_id", photographerId)
      .neq("kind", "other")
      .order("last_activity_at", { ascending: false })
      .limit(MAX_INBOX_PROJECTION_THREADS),
    supabase
      .from("weddings")
      .select("id, stage, couple_names")
      .eq("photographer_id", photographerId)
      .neq("stage", "archived")
      .limit(MAX_WEDDING_STAGE_LOOKUP),
  ]);

  if (draftsRes.error) {
    throw new Error(`fetchAssistantOperatorStateSummary: drafts: ${draftsRes.error.message}`);
  }
  if (tasksRes.error) {
    throw new Error(`fetchAssistantOperatorStateSummary: tasks: ${tasksRes.error.message}`);
  }
  if (escRes.error) {
    throw new Error(`fetchAssistantOperatorStateSummary: escalations: ${escRes.error.message}`);
  }
  if (threadsRes.error) {
    throw new Error(`fetchAssistantOperatorStateSummary: inbox view: ${threadsRes.error.message}`);
  }
  if (weddingsRes.error) {
    throw new Error(`fetchAssistantOperatorStateSummary: weddings: ${weddingsRes.error.message}`);
  }

  const drafts = (draftsRes.data ?? []).map((r) => mapPendingApprovalProjectionRow(r as Record<string, unknown>));
  const tasks = (tasksRes.data ?? []).map((r) => {
    const x = r as Record<string, unknown>;
    return {
      id: String(x.id),
      title: String(x.title ?? ""),
      due_date: String(x.due_date ?? ""),
      status: String(x.status ?? ""),
      wedding_id: x.wedding_id != null ? String(x.wedding_id) : null,
      couple_names: x.couple_names != null ? String(x.couple_names) : null,
    };
  });
  const escalations: OpenEscalationRow[] = (escRes.data ?? []) as OpenEscalationRow[];
  const inboxThreads: UnfiledThread[] = (threadsRes.data ?? []).map((r) =>
    minimalUnfiledThreadFromViewRow(r as Record<string, unknown>),
  );
  const stageByWeddingId = new Map<string, string>();
  for (const w of weddingsRes.data ?? []) {
    const row = w as { id: string; stage: string };
    if (row.id && row.stage) stageByWeddingId.set(String(row.id), String(row.stage));
  }

  const unfiledThreads = inboxThreads.filter((t) => t.weddingId === null);
  const unlinkedTallies = { inquiry: 0, needsFiling: 0, operatorReview: 0, suppressed: 0 };
  for (const t of unfiledThreads) {
    const b = deriveInboxThreadBucket(t);
    if (b === "inquiry") unlinkedTallies.inquiry += 1;
    else if (b === "unfiled") unlinkedTallies.needsFiling += 1;
    else if (b === "operator_review") unlinkedTallies.operatorReview += 1;
    else if (b === "suppressed") unlinkedTallies.suppressed += 1;
  }

  const todayPriorityUnlinked = unfiledThreads.filter((t) => !isSuppressedInboxThread(t));
  const linkedLeadThreads = inboxThreads.filter((t) => {
    if (!t.weddingId || isSuppressedInboxThread(t)) return false;
    const stage = stageByWeddingId.get(t.weddingId);
    return stage != null && INQUIRY_STAGES.has(stage);
  });
  const getLinkedLeadSubtitle = (t: UnfiledThread) => {
    const wid = t.weddingId;
    if (!wid) return "Open lead";
    const w = (weddingsRes.data ?? []).find((x) => String((x as { id: string }).id) === wid) as
      | { couple_names: string | null }
      | undefined;
    const cn = w?.couple_names?.trim();
    return cn ? String(cn) : "Open lead";
  };

  const allActions = buildTodayActionsFromSources({
    drafts,
    unfiledThreads: todayPriorityUnlinked,
    linkedLeadThreads,
    getLinkedLeadSubtitle,
    tasks,
    escalations,
  });
  const sorted = sortTodayActionsByRecency(allActions);
  const zt = countTodayActionsByZenTab(allActions);

  const draftSamples = drafts.slice(0, MAX_SAMPLE_DRAFTS).map((d) => ({
    id: d.id,
    title: d.thread_title || "Draft",
    subtitle: d.couple_names || "",
  }));
  const escalationSamples = escalations.slice(0, MAX_SAMPLE_ESCALATIONS).map((e) => {
    const q = e.question_body.replace(/\s+/g, " ").trim();
    return {
      id: e.id,
      title: q.length > 100 ? `${q.slice(0, 99)}…` : (q || "Escalation"),
      actionKey: e.action_key,
    };
  });
  const taskSamples = tasks.slice(0, MAX_SAMPLE_TASKS).map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.due_date,
    subtitle: t.couple_names,
  }));
  const topActions = sorted.slice(0, MAX_SAMPLE_TOP_ACTIONS).map((a) => ({
    id: a.id,
    title: a.title,
    typeLabel: actionSampleLabel(a),
  }));

  return {
    fetchedAt,
    sourcesNote:
      "Aligned with the Today / Zen action feed: v_pending_approval_drafts, v_open_tasks_with_wedding, open escalation_requests, v_threads_inbox_latest_message, deriveInboxThreadBucket, INQUIRY_STAGES.",
    counts: {
      pendingApprovalDrafts: drafts.length,
      openTasks: tasks.length,
      openEscalations: escalations.length,
      linkedOpenLeads: linkedLeadThreads.length,
      unlinked: unlinkedTallies,
      zenTabs: {
        review: zt.review,
        drafts: zt.drafts,
        leads: zt.leads,
        needs_filing: zt.needs_filing,
      },
    },
    samples: {
      pendingDrafts: draftSamples,
      openEscalations: escalationSamples,
      openTasks: taskSamples,
      topActions,
    },
  };
}
