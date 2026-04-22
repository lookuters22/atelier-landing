import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { UnfiledThread } from "../../../../src/hooks/useUnfiledInbox.ts";
import {
  deriveInboxThreadBucket,
  isSuppressedInboxThread,
  type InboxThreadBucket,
} from "../../../../src/lib/inboxThreadBucket.ts";
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
const MAX_SAMPLE_LINKED_LEADS = 4;
const MAX_SAMPLES_PER_UNLINKED_BUCKET = 2;

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

function sortUnfiledByActivityDesc(threads: UnfiledThread[]): UnfiledThread[] {
  return [...threads].sort((a, b) => String(b.last_activity_at).localeCompare(String(a.last_activity_at)));
}

function sampleUnlinkedTitlesForBucket(
  threads: UnfiledThread[],
  bucket: InboxThreadBucket,
  max: number,
): Array<{ threadId: string; title: string }> {
  return sortUnfiledByActivityDesc(threads.filter((t) => deriveInboxThreadBucket(t) === bucket))
    .slice(0, max)
    .map((t) => ({
      threadId: t.id,
      title: (t.title || "").replace(/\s+/g, " ").trim().slice(0, 200) || "(no title)",
    }));
}

export type DeriveOperatorQueueHighlightsOptions = {
  /** Compare task due dates to this instant’s UTC calendar day. Defaults to `new Date()`. */
  now?: Date;
};

function utcCalendarYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function taskDueYmd(dueDate: string): string | null {
  const m = String(dueDate ?? "").trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1]! : null;
}

function clipHighlightTitle(title: string, max = 96): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function topActionIdPrefix(id: string): string | null {
  const i = id.indexOf(":");
  if (i <= 0) return null;
  return id.slice(0, i);
}

function humanKindForTopActionPrefix(prefix: string): string {
  switch (prefix) {
    case "open_escalation":
      return "open escalation";
    case "draft_approval":
      return "draft pending approval";
    case "open_task":
      return "open task";
    case "unfiled_thread":
      return "unfiled inbox thread";
    case "linked_lead_thread":
      return "linked open-lead thread";
    default:
      return "queued action";
  }
}

/**
 * F5 — evidence-backed queue priorities: blocking vs triage, top-of-feed sample, overdue tasks (UTC dates).
 * No SLA model; uses the same counts and samples as the operator snapshot.
 */
export function deriveOperatorQueueHighlights(
  counts: AssistantOperatorStateSummary["counts"],
  samples: AssistantOperatorStateSummary["samples"],
  options?: DeriveOperatorQueueHighlightsOptions,
): string[] {
  const now = options?.now ?? new Date();
  const todayYmd = utcCalendarYmd(now);
  const c = counts;

  const allZero =
    c.pendingApprovalDrafts === 0 &&
    c.openTasks === 0 &&
    c.openEscalations === 0 &&
    c.linkedOpenLeads === 0 &&
    c.unlinked.inquiry === 0 &&
    c.unlinked.needsFiling === 0 &&
    c.unlinked.operatorReview === 0 &&
    c.unlinked.suppressed === 0;

  if (allZero) {
    return [
      "All snapshot counters are zero — no drafts, tasks, escalations, or inbox-queue threads in this read. Do not invent backlog; data may have changed after snapshot time.",
    ];
  }

  const lines: string[] = [];
  lines.push(
    "**Evidence scope:** Lines below use this snapshot’s **counts** and **named samples** (Today feed recency, task due dates). Not an SLA score or external priority model.",
  );

  const blocking: string[] = [];
  if (c.openEscalations > 0) {
    blocking.push(
      `open escalations **${c.openEscalations}** (feed marks these **Blocked** until resolved)`,
    );
  }
  if (c.pendingApprovalDrafts > 0) {
    blocking.push(`drafts pending approval **${c.pendingApprovalDrafts}**`);
  }
  if (c.unlinked.operatorReview > 0) {
    blocking.push(`unlinked operator-review threads **${c.unlinked.operatorReview}**`);
  }
  if (blocking.length > 0) {
    lines.push(
      `**Usually decide-first (blocking / decision queue):** ${blocking.join("; ")}. Zen **Review** tab total **${c.zenTabs.review}** (items mapped to Review — see app feed rules; **Drafts** are separate).`,
    );
  }

  const head = samples.topActions[0];
  if (head) {
    const prefix = topActionIdPrefix(head.id);
    const kind = prefix ? humanKindForTopActionPrefix(prefix) : "queued item";
    lines.push(
      `**Most recent in Today feed** (mixed actions, recency sort): [${head.typeLabel}] ${clipHighlightTitle(head.title)} — \`${head.id}\` (kind: ${kind}).`,
    );
  }

  const overdueTasks = samples.openTasks.filter((t) => {
    const ymd = taskDueYmd(t.dueDate);
    return ymd != null && ymd < todayYmd;
  });
  if (overdueTasks.length > 0) {
    const eg = overdueTasks
      .slice(0, 2)
      .map((t) => `${clipHighlightTitle(t.title, 72)} (\`${t.id}\`)`)
      .join("; ");
    const tail = overdueTasks.length > 2 ? ` — _+${overdueTasks.length - 2} more overdue in task samples_` : "";
    lines.push(
      `**Overdue tasks** (due date **before** UTC day **${todayYmd}**): **${overdueTasks.length}** in snapshot — e.g. ${eg}${tail}.`,
    );
  }

  const triage: string[] = [];
  if (c.unlinked.inquiry > 0 || c.linkedOpenLeads > 0) {
    triage.push(
      `leads surface: unlinked inquiry **${c.unlinked.inquiry}**, linked open-lead threads **${c.linkedOpenLeads}** → Zen **Leads** **${c.zenTabs.leads}**`,
    );
  }
  if (c.unlinked.needsFiling > 0) {
    triage.push(`needs filing **${c.unlinked.needsFiling}** → Zen **Needs filing** **${c.zenTabs.needs_filing}**`);
  }
  if (c.pendingApprovalDrafts > 0) {
    triage.push(`drafts tab **${c.zenTabs.drafts}** (pending-approval drafts)`);
  }
  if (triage.length > 0) {
    lines.push(`**Triage / volume** (often busy but not the same as an open escalation): ${triage.join("; ")}.`);
  }

  if (c.openTasks > 0) {
    lines.push(
      `**Open tasks:** **${c.openTasks}** — Today **Tasks** list (**not** included in Zen tab totals).`,
    );
  }

  if (c.unlinked.suppressed > 0) {
    lines.push(
      `**Suppressed** unlinked threads in inbox projection: **${c.unlinked.suppressed}** (excluded from Today priority samples).`,
    );
  }

  return lines.slice(0, 10);
}

const IDLE_OPERATOR_STATE_COUNTS: AssistantOperatorStateSummary["counts"] = {
  pendingApprovalDrafts: 0,
  openTasks: 0,
  openEscalations: 0,
  linkedOpenLeads: 0,
  unlinked: { inquiry: 0, needsFiling: 0, operatorReview: 0, suppressed: 0 },
  zenTabs: { review: 0, drafts: 0, leads: 0, needs_filing: 0 },
};

const IDLE_OPERATOR_STATE_SAMPLES: AssistantOperatorStateSummary["samples"] = {
  pendingDrafts: [],
  openEscalations: [],
  openTasks: [],
  topActions: [],
  linkedLeads: [],
  unlinkedBuckets: { inquiry: [], needsFiling: [], operatorReview: [] },
};

/** Placeholder for tests / stubs when operator state is not loaded. */
export const IDLE_ASSISTANT_OPERATOR_STATE_SUMMARY: AssistantOperatorStateSummary = {
  fetchedAt: "1970-01-01T00:00:00.000Z",
  sourcesNote: "",
  counts: IDLE_OPERATOR_STATE_COUNTS,
  samples: IDLE_OPERATOR_STATE_SAMPLES,
  queueHighlights: deriveOperatorQueueHighlights(IDLE_OPERATOR_STATE_COUNTS, IDLE_OPERATOR_STATE_SAMPLES),
};

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

  const unlinkedNonSuppressed = unfiledThreads.filter((t) => !isSuppressedInboxThread(t));
  const linkedLeadSamples = sortUnfiledByActivityDesc(linkedLeadThreads)
    .slice(0, MAX_SAMPLE_LINKED_LEADS)
    .map((t) => ({
      threadId: t.id,
      title: (t.title || "").replace(/\s+/g, " ").trim().slice(0, 200) || "(no title)",
      subtitle: getLinkedLeadSubtitle(t),
    }));

  const counts = {
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
  };

  const samples: AssistantOperatorStateSummary["samples"] = {
    pendingDrafts: draftSamples,
    openEscalations: escalationSamples,
    openTasks: taskSamples,
    topActions,
    linkedLeads: linkedLeadSamples,
    unlinkedBuckets: {
      inquiry: sampleUnlinkedTitlesForBucket(unlinkedNonSuppressed, "inquiry", MAX_SAMPLES_PER_UNLINKED_BUCKET),
      needsFiling: sampleUnlinkedTitlesForBucket(unlinkedNonSuppressed, "unfiled", MAX_SAMPLES_PER_UNLINKED_BUCKET),
      operatorReview: sampleUnlinkedTitlesForBucket(
        unlinkedNonSuppressed,
        "operator_review",
        MAX_SAMPLES_PER_UNLINKED_BUCKET,
      ),
    },
  };

  return {
    fetchedAt,
    sourcesNote:
      "Aligned with the Today / Zen action feed: v_pending_approval_drafts, v_open_tasks_with_wedding, open escalation_requests, v_threads_inbox_latest_message, deriveInboxThreadBucket, INQUIRY_STAGES.",
    counts,
    samples,
    queueHighlights: deriveOperatorQueueHighlights(counts, samples),
  };
}
