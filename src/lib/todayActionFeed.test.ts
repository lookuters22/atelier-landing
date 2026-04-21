import { describe, expect, it } from "vitest";
import {
  todayActionFromDraft,
  todayActionFromEscalation,
  todayActionFromLinkedLeadThread,
  todayActionFromTask,
  todayActionFromUnfiled,
  buildTodayActionsFromSources,
  countTodayActionsByZenTab,
  findDraftForInboxHydration,
  todayActionHref,
  ZEN_TODAY_TAB_LABELS,
  ZEN_TODAY_TAB_ORDER,
  zenTodayTabForAction,
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

  it("draft with thread but empty wedding_id still uses inbox review_draft deep link (unfiled thread)", () => {
    const d: PendingDraft = {
      id: "dr-u",
      body: "x",
      thread_id: "th-u",
      thread_title: "Commercial ask",
      wedding_id: "",
      couple_names: "Unknown",
      photographer_id: "ph",
    };
    const a = todayActionFromDraft(d);
    expect(a.target).toMatchObject({
      type: "inbox_draft_review",
      threadId: "th-u",
      draftId: "dr-u",
    });
    expect(a.route_to).toContain("action=review_draft");
    expect(a.route_to).toContain("threadId=th-u");
    expect(a.route_to).toContain("draftId=dr-u");
    expect(a.resolution.weddingId).toBe("");
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
    expect(a.status_label).toBe("Needs filing");
    expect(a.inbox_thread_bucket).toBe("unfiled");
    expect(a.zen_priority_tag).toBe("Needs filing");
  });

  it("unfiled customer_lead uses Inquiry label in Today feed", () => {
    const t: UnfiledThread = {
      latestMessageBody: "q",
      latestMessageHtmlSanitized: null,
      gmailRenderHtmlRef: null,
      latestMessageId: null,
      latestMessageAttachments: [],
      latestProviderMessageId: null,
      hasGmailImport: false,
      gmailLabelIds: null,
      id: "lead-1",
      title: "Quote",
      weddingId: null,
      sender: "c@d.com",
      snippet: "s",
      last_activity_at: "2026-01-15T10:00:00.000Z",
      ai_routing_metadata: { sender_role: "customer_lead" },
    };
    const a = todayActionFromUnfiled(t);
    expect(a.status_label).toBe("Inquiry");
    expect(a.inbox_thread_bucket).toBe("inquiry");
    expect(a.zen_priority_tag).toBe("Inquiry");
  });

  it("buildTodayActionsFromSources excludes suppressed threads from default Today feed", () => {
    const promo: UnfiledThread = {
      latestMessageBody: "",
      latestMessageHtmlSanitized: null,
      gmailRenderHtmlRef: null,
      latestMessageId: null,
      latestMessageAttachments: [],
      latestProviderMessageId: null,
      hasGmailImport: false,
      gmailLabelIds: null,
      id: "promo-1",
      title: "Sale",
      weddingId: null,
      sender: "news@x.com",
      snippet: "",
      last_activity_at: "2026-01-15T10:00:00.000Z",
      ai_routing_metadata: { routing_disposition: "promo_automated" },
    };
    const human: UnfiledThread = {
      latestMessageBody: "h",
      latestMessageHtmlSanitized: null,
      gmailRenderHtmlRef: null,
      latestMessageId: null,
      latestMessageAttachments: [],
      latestProviderMessageId: null,
      hasGmailImport: false,
      gmailLabelIds: null,
      id: "hum-1",
      title: "Hi",
      weddingId: null,
      sender: "a@b.com",
      snippet: "",
      last_activity_at: "2026-01-16T10:00:00.000Z",
      ai_routing_metadata: { routing_disposition: "unresolved_human" },
    };
    const all = buildTodayActionsFromSources({
      drafts: [],
      unfiledThreads: [promo, human],
      linkedLeadThreads: [],
      tasks: [],
      escalations: [],
    });
    expect(all.some((x) => x.source_id === "promo-1")).toBe(false);
    expect(all.some((x) => x.source_id === "hum-1")).toBe(true);
    const tabs = countTodayActionsByZenTab(all);
    expect(tabs.needs_filing).toBeGreaterThan(0);
    expect(tabs.review + tabs.drafts + tabs.leads + tabs.needs_filing).toBe(all.length);
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
    const all = buildTodayActionsFromSources({
      drafts,
      unfiledThreads,
      linkedLeadThreads: [],
      tasks,
      escalations,
    });
    expect(all.some((x) => x.action_type === "open_escalation" && x.source_id === "e1")).toBe(true);
    const esc = all.find((x) => x.source_id === "e1");
    expect(esc?.route_to).toBe("/today?escalationId=e1");
  });
});

function baseThread(partial: Partial<UnfiledThread> & { id: string }): UnfiledThread {
  return {
    latestMessageBody: "",
    latestMessageHtmlSanitized: null,
    gmailRenderHtmlRef: null,
    latestMessageId: null,
    latestMessageAttachments: [],
    latestProviderMessageId: null,
    hasGmailImport: false,
    gmailLabelIds: null,
    title: "S",
    weddingId: null,
    sender: "a@b.com",
    snippet: "",
    last_activity_at: "2026-01-01T00:00:00.000Z",
    ai_routing_metadata: null,
    ...partial,
  };
}

describe("Zen Today tabs", () => {
  it("has exactly four top tabs, no ALL catch-all", () => {
    expect(ZEN_TODAY_TAB_ORDER.join(",")).not.toMatch(/\ball\b/i);
    expect(ZEN_TODAY_TAB_ORDER).toEqual(["review", "drafts", "leads", "needs_filing"]);
    expect(Object.keys(ZEN_TODAY_TAB_LABELS)).toHaveLength(4);
    expect(ZEN_TODAY_TAB_ORDER.every((id) => ZEN_TODAY_TAB_LABELS[id]?.length)).toBe(true);
  });

  it("partitions sample actions into Review, Drafts, Leads, Needs filing (tasks excluded from tab counts)", () => {
    const actions = [
      todayActionFromEscalation({
        id: "e1",
        created_at: "2026-01-20T10:00:00.000Z",
        question_body: "Q",
        action_key: "k",
        wedding_id: null,
        thread_id: null,
      }),
      todayActionFromDraft({
        id: "d1",
        body: "",
        thread_id: "t1",
        thread_title: "D",
        wedding_id: "w1",
        couple_names: "A & B",
        photographer_id: "p",
        created_at: "2026-01-19T10:00:00.000Z",
      }),
      todayActionFromUnfiled(
        baseThread({ id: "u1", ai_routing_metadata: { sender_role: "customer_lead" } }),
      ),
      todayActionFromUnfiled(
        baseThread({ id: "u2", ai_routing_metadata: { routing_disposition: "unresolved_human" } }),
      ),
      todayActionFromUnfiled(
        baseThread({ id: "u3", ai_routing_metadata: { sender_role: "vendor_solicitation" } }),
      ),
      todayActionFromLinkedLeadThread(
        baseThread({ id: "L1", weddingId: "w-commercial", title: "Commercial" }),
        "Acme Co · commercial",
      ),
      todayActionFromTask({
        id: "tk1",
        title: "T",
        due_date: "2026-02-01",
        status: "open",
        wedding_id: "w9",
        couple_names: "X",
      }),
    ];
    const c = countTodayActionsByZenTab(actions);
    expect(c.review).toBe(2);
    expect(c.drafts).toBe(1);
    expect(c.leads).toBe(2);
    expect(c.needs_filing).toBe(1);
    expect(c.review + c.drafts + c.leads + c.needs_filing).toBe(actions.length - 1);
    expect(zenTodayTabForAction(actions[0])).toBe("review");
    expect(zenTodayTabForAction(actions[2])).toBe("leads");
    expect(zenTodayTabForAction(actions[4])).toBe("review");
    expect(zenTodayTabForAction(actions[5])).toBe("leads");
    expect(zenTodayTabForAction(actions[6])).toBe(null);
  });

  it("Review merges blocked decisions and operator-review mail", () => {
    const esc = todayActionFromEscalation({
      id: "e2",
      created_at: "2026-01-20T10:00:00.000Z",
      question_body: "Blocked",
      action_key: "policy",
      wedding_id: null,
      thread_id: "t-x",
    });
    const billing = todayActionFromUnfiled(
      baseThread({ id: "bill", ai_routing_metadata: { sender_role: "billing_or_account_followup" } }),
    );
    expect(zenTodayTabForAction(esc)).toBe("review");
    expect(zenTodayTabForAction(billing)).toBe("review");
    const c = countTodayActionsByZenTab([esc, billing]);
    expect(c.review).toBe(2);
  });

  it("promoted / linked pre-booking lead maps to Leads tab", () => {
    const a = todayActionFromLinkedLeadThread(
      baseThread({
        id: "promo-thread",
        weddingId: "proj-1",
        title: "Brand shoot",
      }),
      "Studio client · commercial",
    );
    expect(a.action_type).toBe("linked_lead_thread");
    expect(zenTodayTabForAction(a)).toBe("leads");
  });

  it("suppressed inbox thread contributes to no Today tab (omitted from feed)", () => {
    const promo = baseThread({
      id: "promo-only",
      ai_routing_metadata: { routing_disposition: "promo_automated" },
    });
    const all = buildTodayActionsFromSources({
      drafts: [],
      unfiledThreads: [promo],
      linkedLeadThreads: [],
      tasks: [],
      escalations: [],
    });
    expect(all.length).toBe(0);
    const sum = Object.values(countTodayActionsByZenTab(all)).reduce((a, b) => a + b, 0);
    expect(sum).toBe(0);
  });
});
