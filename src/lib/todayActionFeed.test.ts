import { describe, expect, it } from "vitest";
import {
  todayActionFromDraft,
  todayActionFromEscalation,
  todayActionFromTask,
  todayActionFromUnfiled,
  buildTodayActionsFromSources,
  findDraftForInboxHydration,
  todayActionHref,
  type OpenEscalationRow,
} from "./todayActionFeed";
import type { PendingDraft } from "../hooks/usePendingApprovals";
import type { UnfiledThread } from "../hooks/useUnfiledInbox";
import type { TaskRow } from "../hooks/useTasks";

describe("todayActionHref", () => {
  it("builds path with sorted query string", () => {
    const href = todayActionHref({
      pathname: "/inbox",
      searchParams: { threadId: "t1", draftId: "d1", action: "review_draft" },
    });
    expect(href).toContain("/inbox?");
    expect(href).toContain("threadId=t1");
    expect(href).toContain("draftId=d1");
    expect(href).toContain("action=review_draft");
  });
});

describe("findDraftForInboxHydration", () => {
  const drafts: PendingDraft[] = [
    {
      id: "draft-pk",
      body: "",
      thread_id: "thread-uuid",
      thread_title: "Hi",
      wedding_id: "wed-1",
      couple_names: "A & B",
      photographer_id: "ph",
    },
  ];

  it("prefers draftId match", () => {
    const d = findDraftForInboxHydration(drafts, { threadId: "wrong", draftId: "draft-pk" });
    expect(d?.id).toBe("draft-pk");
  });

  it("matches thread_id to threadId param", () => {
    const d = findDraftForInboxHydration(drafts, { threadId: "thread-uuid", draftId: null });
    expect(d?.id).toBe("draft-pk");
  });

  it("falls back to legacy draft id in threadId slot", () => {
    const d = findDraftForInboxHydration(drafts, { threadId: "draft-pk", draftId: null });
    expect(d?.id).toBe("draft-pk");
  });
});

describe("todayActionFeed", () => {
  it("draft approval includes threadId, draftId, and review action in resolution", () => {
    const d: PendingDraft = {
      id: "dr-1",
      body: "x",
      thread_id: "th-1",
      thread_title: "Subject",
      wedding_id: "wed-99",
      couple_names: "Sam & Jo",
      photographer_id: "ph",
      created_at: "2026-01-15T10:00:00.000Z",
    };
    const a = todayActionFromDraft(d);
    expect(a.route_to).toContain("/inbox?");
    expect(a.route_to).toContain("threadId=th-1");
    expect(a.route_to).toContain("draftId=dr-1");
    expect(a.route_to).toContain("action=review_draft");
    expect(a.resolution.draftId).toBe("dr-1");
    expect(a.resolution.threadId).toBe("th-1");
    expect(a.resolution.inboxAction).toBe("review_draft");
  });

  it("unfiled thread resolution lists thread id only", () => {
    const t: UnfiledThread = {
      latestMessageBody: "full",
      latestMessageHtmlSanitized: null,
      gmailRenderHtmlRef: null,
      latestMessageId: null,
      latestMessageAttachments: [],
      latestProviderMessageId: null,
      hasGmailImport: false,
      gmailLabelIds: null,
      id: "unf-1",
      title: "Hello",
      weddingId: null,
      sender: "x@y.com",
      snippet: "snip",
      last_activity_at: "2026-01-15T10:00:00.000Z",
      ai_routing_metadata: null,
    };
    const a = todayActionFromUnfiled(t);
    expect(a.route_to).toBe("/inbox?threadId=unf-1");
    expect(a.resolution.threadId).toBe("unf-1");
  });

  it("task with wedding uses tab=tasks and openTask", () => {
    const task: TaskRow = {
      id: "task-1",
      title: "Call",
      due_date: "2026-02-01",
      status: "open",
      wedding_id: "wed-7",
      couple_names: "A & B",
    };
    const a = todayActionFromTask(task);
    expect(a.route_to).toContain("/pipeline/wed-7");
    expect(a.route_to).toContain("tab=tasks");
    expect(a.route_to).toContain("openTask=task-1");
    expect(a.resolution.pipelineTab).toBe("tasks");
    expect(a.resolution.taskId).toBe("task-1");
  });

  it("task without wedding routes to /tasks with no task id in URL (QA: App.tsx redirects /tasks → /today — see docs/qa)", () => {
    const task: TaskRow = {
      id: "orphan-task",
      title: "Orphan",
      due_date: "2026-02-01",
      status: "open",
      wedding_id: null,
      couple_names: null,
    };
    const a = todayActionFromTask(task);
    expect(a.route_to).toBe("/tasks");
    expect(a.resolution.taskId).toBe("orphan-task");
    expect(Object.keys(a.resolution.searchParams).length).toBe(0);
  });

  it("routes wedding + thread escalation to pipeline with thread and escalationId", () => {
    const e: OpenEscalationRow = {
      id: "esc-1",
      created_at: "2026-01-15T10:00:00.000Z",
      question_body: "Approve discount?",
      action_key: "discount_quote",
      wedding_id: "wed-99",
      thread_id: "th-99",
    };
    const a = todayActionFromEscalation(e);
    expect(a.route_to).toContain("/pipeline/wed-99");
    expect(a.route_to).toContain("threadId=th-99");
    expect(a.route_to).toContain("escalationId=esc-1");
    expect(a.route_to.startsWith("/escalations")).toBe(false);
    expect(a.resolution.escalationId).toBe("esc-1");
    expect(a.resolution.weddingId).toBe("wed-99");
    expect(a.target.type).toBe("pipeline_escalation");
    expect(a.canonical_home_type).toBe("wedding");
  });

  it("routes thread-only escalation to inbox with escalationId", () => {
    const e: OpenEscalationRow = {
      id: "esc-2",
      created_at: "2026-01-15T10:00:00.000Z",
      question_body: "Need studio policy",
      action_key: "operator_blocked_action",
      wedding_id: null,
      thread_id: "th-2",
    };
    const a = todayActionFromEscalation(e);
    expect(a.route_to).toContain("/inbox?");
    expect(a.route_to).toContain("threadId=th-2");
    expect(a.route_to).toContain("escalationId=esc-2");
    expect(a.route_to.startsWith("/escalations")).toBe(false);
    expect(a.target.type).toBe("inbox_escalation");
    expect(a.canonical_home_type).toBe("thread");
  });

  it("routes escalation without thread to Today with escalationId (fallback only)", () => {
    const e: OpenEscalationRow = {
      id: "esc-3",
      created_at: "2026-01-15T10:00:00.000Z",
      question_body: "Studio-wide policy",
      action_key: "operator_blocked_action",
      wedding_id: null,
      thread_id: null,
    };
    const a = todayActionFromEscalation(e);
    expect(a.route_to).toBe("/today?escalationId=esc-3");
    expect(a.target.type).toBe("today_escalation");
    expect(a.route_to.startsWith("/escalations")).toBe(false);
  });

  it("buildTodayActionsFromSources includes open escalations in feed", () => {
    const drafts: PendingDraft[] = [];
    const unfiledThreads: UnfiledThread[] = [];
    const tasks: TaskRow[] = [];
    const escalations: OpenEscalationRow[] = [
      {
        id: "e1",
        created_at: "2026-02-01T12:00:00.000Z",
        question_body: "Q1",
        action_key: "k1",
        wedding_id: null,
        thread_id: null,
      },
    ];
    const all = buildTodayActionsFromSources({ drafts, unfiledThreads, tasks, escalations });
    expect(all.some((x) => x.action_type === "open_escalation" && x.source_id === "e1")).toBe(true);
    const esc = all.find((x) => x.source_id === "e1");
    expect(esc?.route_to).toBe("/today?escalationId=e1");
  });
});
