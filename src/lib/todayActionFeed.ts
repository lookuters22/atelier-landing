/**
 * Read model for Today (Stage 2 unified action feed) — aggregates rows from existing tables only.
 */
import type { PendingDraft } from "../hooks/usePendingApprovals.ts";
import type { UnfiledThread } from "../hooks/useUnfiledInbox.ts";
import type { TaskRow } from "../hooks/useTasks.ts";
import {
  deriveInboxThreadBucket,
  inboxBucketTodayStatusLabel,
  isSuppressedInboxThread,
  readInboxMetadataSenderRole,
  zenLobbyHeroTagForInboxBucket,
  type InboxThreadBucket,
} from "./inboxThreadBucket.ts";
import {
  escalationResolutionTarget,
  resolutionTargetToTodayActionResolution,
  type ResolutionTarget,
  type TodayActionResolution,
} from "./resolutionTarget.ts";

export type { PipelineResolutionTab, TodayActionResolution } from "./resolutionTarget.ts";

export type TodayActionType =
  | "draft_approval"
  | "unfiled_thread"
  | "linked_lead_thread"
  | "open_task"
  | "open_escalation";

/**
 * ZenLobby priority tabs — four operator-facing groups, no catch-all “All”.
 * Open tasks stay in `allActions` for pulse/sidebar/dock but map to `null` here (no task tab).
 */
export type ZenTodayTabId = "review" | "drafts" | "leads" | "needs_filing";

export const ZEN_TODAY_TAB_ORDER: readonly ZenTodayTabId[] = [
  "review",
  "drafts",
  "leads",
  "needs_filing",
] as const;

/** Stable UI labels for Zen tab buttons (single source for tests + ZenLobby). */
export const ZEN_TODAY_TAB_LABELS: Record<ZenTodayTabId, string> = {
  review: "Review",
  drafts: "Drafts",
  leads: "Leads",
  needs_filing: "Needs filing",
};

const ZEN_TAB_COUNT_ZERO: Record<ZenTodayTabId, number> = {
  review: 0,
  drafts: 0,
  leads: 0,
  needs_filing: 0,
};

export type TodayCanonicalHomeType = "wedding" | "thread" | "inbox";

/** Selection key for `TodayAction.today_selection` (ZenLobby feed + navigation). */
export type TodaySelection =
  | { type: "overview" }
  | { type: "draft"; id: string }
  | { type: "unfiled"; id: string }
  | { type: "task"; id: string }
  | { type: "wedding"; id: string }
  | { type: "escalation"; id: string };

export type TodayAction = {
  /** Stable id for React keys */
  id: string;
  action_type: TodayActionType;
  source_table: "drafts" | "threads" | "tasks" | "escalation_requests";
  source_id: string;
  title: string;
  subtitle: string;
  status_label: string;
  canonical_home_type: TodayCanonicalHomeType;
  canonical_home_id: string | null;
  needs_user_input: true;
  created_at: string;
  due_at: string | null;
  route_to: string;
  resolution: TodayActionResolution;
  /** Typed destination — use for navigation and tests; `resolution` / `route_to` are derived. */
  target: ResolutionTarget;
  today_selection: Exclude<TodaySelection, { type: "overview" } | { type: "wedding" }>;
  /** Set for `unfiled_thread` actions only — drives ZenLobby labels. */
  inbox_thread_bucket?: InboxThreadBucket;
  /** Zen priority list hero tag (unfiled + linked lead thread rows). */
  zen_priority_tag?: string;
};

/** @returns Tab for Zen priority list, or `null` when the action is not shown in any top tab (e.g. tasks). */
export function zenTodayTabForAction(a: TodayAction): ZenTodayTabId | null {
  switch (a.action_type) {
    case "open_escalation":
      return "review";
    case "draft_approval":
      return "drafts";
    case "linked_lead_thread":
      return "leads";
    case "unfiled_thread": {
      const b = a.inbox_thread_bucket;
      if (b === "inquiry") return "leads";
      if (b === "operator_review") return "review";
      return "needs_filing";
    }
    case "open_task":
      return null;
    default:
      return "needs_filing";
  }
}

export function countTodayActionsByZenTab(actions: TodayAction[]): Record<ZenTodayTabId, number> {
  const out = { ...ZEN_TAB_COUNT_ZERO };
  for (const a of actions) {
    const t = zenTodayTabForAction(a);
    if (t) out[t]++;
  }
  return out;
}

export type OpenEscalationRow = {
  id: string;
  created_at: string;
  question_body: string;
  action_key: string;
  wedding_id: string | null;
  thread_id: string | null;
};

function truncate(s: string, max: number): string {
  if (s.length > max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/** Build location string for React Router `navigate()`. */
export function todayActionHref(r: TodayActionResolution): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(r.searchParams)) {
    if (v !== undefined && v !== "") u.set(k, v);
  }
  const q = u.toString();
  return q ? `${r.pathname}?${q}` : r.pathname;
}

/**
 * Inbox draft hydration: prefer draftId, then thread_id match, then legacy draft id in threadId param.
 */
export function findDraftForInboxHydration(
  drafts: PendingDraft[],
  opts: { threadId: string | null; draftId: string | null },
): PendingDraft | undefined {
  if (opts.draftId) {
    const byDraft = drafts.find((d) => d.id === opts.draftId);
    if (byDraft) return byDraft;
  }
  if (opts.threadId) {
    const byThread = drafts.find((d) => d.thread_id === opts.threadId);
    if (byThread) return byThread;
    return drafts.find((d) => d.id === opts.threadId);
  }
  return undefined;
}

export function todayActionFromDraft(d: PendingDraft): TodayAction {
  const created = d.created_at ?? new Date().toISOString();
  const hasThread = d.thread_id && d.thread_id.length > 0;
  const target: ResolutionTarget = hasThread
    ? {
        type: "inbox_draft_review",
        threadId: d.thread_id,
        draftId: d.id,
        weddingId: d.wedding_id,
      }
    : {
        type: "draft_no_thread",
        draftId: d.id,
        weddingId: d.wedding_id,
      };
  const resolution = resolutionTargetToTodayActionResolution(target);
  return {
    id: `draft_approval:${d.id}`,
    action_type: "draft_approval",
    source_table: "drafts",
    source_id: d.id,
    title: d.thread_title,
    subtitle: d.couple_names,
    status_label: "Pending approval",
    canonical_home_type: "inbox",
    canonical_home_id: d.thread_id || null,
    needs_user_input: true,
    created_at: created,
    due_at: null,
    route_to: todayActionHref(resolution),
    resolution,
    target,
    today_selection: { type: "draft", id: d.id },
  };
}

/**
 * Linked inbox thread whose project is still in pre-booking (`INQUIRY_STAGES` in inbox surface).
 * Includes promoted non-wedding projects sharing the same stage enum.
 */
export function todayActionFromLinkedLeadThread(t: UnfiledThread, projectLabel: string): TodayAction {
  const created = t.last_activity_at;
  const target: ResolutionTarget = { type: "inbox_import", threadId: t.id };
  const resolution = resolutionTargetToTodayActionResolution(target);
  const label = projectLabel.trim() || "Open lead";
  return {
    id: `linked_lead_thread:${t.id}`,
    action_type: "linked_lead_thread",
    source_table: "threads",
    source_id: t.id,
    title: t.title,
    subtitle: label,
    status_label: "Open lead",
    canonical_home_type: "thread",
    canonical_home_id: t.id,
    needs_user_input: true,
    created_at: created,
    due_at: null,
    route_to: todayActionHref(resolution),
    resolution,
    target,
    today_selection: { type: "unfiled", id: t.id },
    zen_priority_tag: "Open lead",
  };
}

export function todayActionFromUnfiled(t: UnfiledThread): TodayAction {
  const created = t.last_activity_at;
  const target: ResolutionTarget = { type: "inbox_import", threadId: t.id };
  const resolution = resolutionTargetToTodayActionResolution(target);
  const inbox_thread_bucket = deriveInboxThreadBucket(t);
  const senderRole = readInboxMetadataSenderRole(t.ai_routing_metadata);
  return {
    id: `unfiled_thread:${t.id}`,
    action_type: "unfiled_thread",
    source_table: "threads",
    source_id: t.id,
    title: t.title,
    subtitle: t.sender || "Unknown sender",
    status_label: inboxBucketTodayStatusLabel(t),
    canonical_home_type: "thread",
    canonical_home_id: t.id,
    needs_user_input: true,
    created_at: created,
    due_at: null,
    route_to: todayActionHref(resolution),
    resolution,
    target,
    today_selection: { type: "unfiled", id: t.id },
    inbox_thread_bucket,
    zen_priority_tag: zenLobbyHeroTagForInboxBucket(inbox_thread_bucket, senderRole),
  };
}

export function todayActionFromTask(task: TaskRow): TodayAction {
  const created = task.due_date;
  const eod = new Date();
  eod.setHours(23, 59, 59, 999);
  const due = new Date(task.due_date);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const statusLabel =
    due.toDateString() === new Date().toDateString()
      ? "Due today"
      : due <= eod && due < startOfToday
        ? "Overdue"
        : "Open";
  const hasWedding = task.wedding_id && task.wedding_id.length > 0;
  const target: ResolutionTarget = hasWedding
    ? { type: "pipeline_task", weddingId: task.wedding_id, taskId: task.id }
    : { type: "orphan_task", taskId: task.id };
  const resolution = resolutionTargetToTodayActionResolution(target);
  return {
    id: `open_task:${task.id}`,
    action_type: "open_task",
    source_table: "tasks",
    source_id: task.id,
    title: task.title,
    subtitle: task.couple_names ?? "No wedding",
    status_label: statusLabel,
    canonical_home_type: task.wedding_id ? "wedding" : "inbox",
    canonical_home_id: task.wedding_id,
    needs_user_input: true,
    created_at: created,
    due_at: task.due_date,
    route_to: todayActionHref(resolution),
    resolution,
    target,
    today_selection: { type: "task", id: task.id },
  };
}

export function todayActionFromEscalation(e: OpenEscalationRow): TodayAction {
  const target = escalationResolutionTarget(e);
  const resolution = resolutionTargetToTodayActionResolution(target);
  const title = truncate(e.question_body.replace(/\s+/g, " ").trim(), 80) || "Escalation";
  const canonical_home_type: TodayCanonicalHomeType =
    target.type === "pipeline_escalation"
      ? "wedding"
      : target.type === "inbox_escalation"
        ? "thread"
        : target.type === "today_escalation"
          ? "inbox"
          : "inbox";
  const canonical_home_id =
    target.type === "pipeline_escalation"
      ? target.weddingId
      : target.type === "inbox_escalation"
        ? target.threadId
        : target.type === "today_escalation"
          ? null
          : null;
  return {
    id: `open_escalation:${e.id}`,
    action_type: "open_escalation",
    source_table: "escalation_requests",
    source_id: e.id,
    title,
    subtitle: e.action_key.replace(/_/g, " "),
    status_label: "Blocked",
    canonical_home_type,
    canonical_home_id,
    needs_user_input: true,
    created_at: e.created_at,
    due_at: null,
    route_to: todayActionHref(resolution),
    resolution,
    target,
    today_selection: { type: "escalation", id: e.id },
  };
}

export function sortTodayActionsByRecency(actions: TodayAction[]): TodayAction[] {
  return [...actions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function buildTodayActionsFromSources(input: {
  drafts: PendingDraft[];
  unfiledThreads: UnfiledThread[];
  /** Linked threads in pre-booking stages (wedding + non-wedding projects). */
  linkedLeadThreads: UnfiledThread[];
  /** Project list label (e.g. couple / client names) for each linked lead thread. */
  getLinkedLeadSubtitle?: (t: UnfiledThread) => string;
  tasks: TaskRow[];
  escalations: OpenEscalationRow[];
}): TodayAction[] {
  const out: TodayAction[] = [];
  const leadSubtitle = input.getLinkedLeadSubtitle ?? (() => "Open lead");
  for (const d of input.drafts) out.push(todayActionFromDraft(d));
  for (const t of input.unfiledThreads) {
    if (isSuppressedInboxThread(t)) continue;
    out.push(todayActionFromUnfiled(t));
  }
  for (const t of input.linkedLeadThreads) {
    if (isSuppressedInboxThread(t)) continue;
    out.push(todayActionFromLinkedLeadThread(t, leadSubtitle(t)));
  }
  for (const t of input.tasks) out.push(todayActionFromTask(t));
  for (const e of input.escalations) out.push(todayActionFromEscalation(e));
  return sortTodayActionsByRecency(out);
}
