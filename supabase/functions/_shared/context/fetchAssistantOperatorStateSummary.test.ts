import { describe, expect, it } from "vitest";
import {
  deriveOperatorQueueHighlights,
  fetchAssistantOperatorStateSummary,
} from "./fetchAssistantOperatorStateSummary.ts";

describe("fetchAssistantOperatorStateSummary", () => {
  it("returns counts and samples from the same views as the Today feed", async () => {
    const supabase = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.neq = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "v_pending_approval_drafts") {
            return resolve({
              data: [
                {
                  id: "d1",
                  body: "x",
                  thread_id: "t99",
                  created_at: "2026-01-01T00:00:00Z",
                  thread_title: "Re: hi",
                  wedding_id: "w1",
                  couple_names: "A & B",
                  photographer_id: "photo-1",
                },
              ],
              error: null,
            });
          }
          if (table === "v_open_tasks_with_wedding") {
            return resolve({
              data: [
                {
                  id: "task-1",
                  title: "Call venue",
                  due_date: "2026-02-01",
                  status: "open",
                  wedding_id: "w1",
                  couple_names: "A & B",
                },
              ],
              error: null,
            });
          }
          if (table === "escalation_requests") {
            return resolve({
              data: [
                {
                  id: "esc-1",
                  created_at: "2026-01-02T00:00:00Z",
                  question_body: "Need help with policy",
                  action_key: "test_rule",
                  wedding_id: null,
                  thread_id: null,
                },
              ],
              error: null,
            });
          }
          if (table === "v_threads_inbox_latest_message") {
            return resolve({ data: [], error: null });
          }
          if (table === "weddings") {
            return resolve({ data: [], error: null });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const s = await fetchAssistantOperatorStateSummary(supabase, "photo-1");
    expect(s.counts.pendingApprovalDrafts).toBe(1);
    expect(s.counts.openTasks).toBe(1);
    expect(s.counts.openEscalations).toBe(1);
    expect(s.counts.unlinked.inquiry).toBe(0);
    expect(s.samples.pendingDrafts[0].id).toBe("d1");
    expect(s.samples.openTasks[0].id).toBe("task-1");
    expect(s.samples.openEscalations[0].id).toBe("esc-1");
    expect(s.samples.topActions.length).toBeGreaterThan(0);
    expect(s.queueHighlights.some((h) => /escalations/i.test(h))).toBe(true);
    expect(s.samples.linkedLeads).toEqual([]);
    expect(s.samples.unlinkedBuckets.inquiry).toEqual([]);
  });

  it("derives unlinked bucket tallies and linked open leads with deriveInboxThreadBucket + INQUIRY_STAGES", async () => {
    const wLead = "w-lead-1";
    const supabase = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.neq = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "v_pending_approval_drafts" || table === "v_open_tasks_with_wedding") {
            return resolve({ data: [], error: null });
          }
          if (table === "escalation_requests") {
            return resolve({ data: [], error: null });
          }
          if (table === "v_threads_inbox_latest_message") {
            return resolve({
              data: [
                {
                  id: "t-inq",
                  wedding_id: null,
                  title: "Lead A",
                  last_activity_at: "2026-01-03T00:00:00Z",
                  ai_routing_metadata: { sender_role: "customer_lead" },
                  latest_sender: "a@a.com",
                },
                {
                  id: "t-nf",
                  wedding_id: null,
                  title: "Mystery",
                  last_activity_at: "2026-01-02T00:00:00Z",
                  ai_routing_metadata: { routing_disposition: "suggested_match_unresolved" },
                  latest_sender: "b@b.com",
                },
                {
                  id: "t-linked",
                  wedding_id: wLead,
                  title: "Re: date",
                  last_activity_at: "2026-01-01T00:00:00Z",
                  ai_routing_metadata: {},
                  latest_sender: "c@c.com",
                },
              ],
              error: null,
            });
          }
          if (table === "weddings") {
            return resolve({
              data: [{ id: wLead, stage: "inquiry", couple_names: "Sam & Pat" }],
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const s = await fetchAssistantOperatorStateSummary(supabase, "photo-1");
    expect(s.counts.unlinked.inquiry).toBe(1);
    expect(s.counts.unlinked.needsFiling).toBe(1);
    expect(s.counts.linkedOpenLeads).toBe(1);
    expect(s.counts.zenTabs.leads).toBeGreaterThanOrEqual(2);
    expect(s.samples.linkedLeads.length).toBe(1);
    expect(s.samples.linkedLeads[0].threadId).toBe("t-linked");
    expect(s.samples.unlinkedBuckets.inquiry.length).toBeGreaterThan(0);
    expect(s.samples.unlinkedBuckets.needsFiling.length).toBeGreaterThan(0);
  });
});

const EMPTY_SAMPLES = {
  pendingDrafts: [],
  openEscalations: [],
  openTasks: [],
  topActions: [],
  linkedLeads: [],
  unlinkedBuckets: { inquiry: [], needsFiling: [], operatorReview: [] },
} as const;

describe("deriveOperatorQueueHighlights", () => {
  it("F5: frames blocking vs triage and cites top-of-feed sample from snapshots", () => {
    const counts = {
      pendingApprovalDrafts: 1,
      openTasks: 2,
      openEscalations: 1,
      linkedOpenLeads: 0,
      unlinked: { inquiry: 0, needsFiling: 3, operatorReview: 1, suppressed: 0 },
      zenTabs: { review: 2, drafts: 1, leads: 0, needs_filing: 3 },
    };
    const samples = {
      ...EMPTY_SAMPLES,
      topActions: [
        { id: "open_escalation:esc-1", title: "Need policy sign-off", typeLabel: "Escalation" },
      ],
    };
    const h = deriveOperatorQueueHighlights(counts, samples);
    expect(h[0]).toMatch(/Evidence scope/i);
    expect(h.some((l) => /decide-first|blocking/i.test(l))).toBe(true);
    expect(h.some((l) => /Most recent in Today feed/i.test(l))).toBe(true);
    expect(h.join("\n")).toMatch(/Need policy sign-off/);
    expect(h.some((l) => /Triage|volume|needs filing/i.test(l))).toBe(true);
    expect(h.some((l) => /Open tasks/i.test(l))).toBe(true);
  });

  it("F5: surfaces overdue tasks from sample due dates (UTC day)", () => {
    const counts = {
      pendingApprovalDrafts: 0,
      openTasks: 2,
      openEscalations: 0,
      linkedOpenLeads: 0,
      unlinked: { inquiry: 0, needsFiling: 0, operatorReview: 0, suppressed: 0 },
      zenTabs: { review: 0, drafts: 0, leads: 0, needs_filing: 0 },
    };
    const samples = {
      ...EMPTY_SAMPLES,
      openTasks: [
        { id: "task-old", title: "Stale follow-up", dueDate: "2026-01-01", subtitle: null },
        { id: "task-future", title: "Later", dueDate: "2030-12-01", subtitle: null },
      ],
    };
    const h = deriveOperatorQueueHighlights(counts, samples, { now: new Date("2026-06-15T12:00:00.000Z") });
    expect(h.some((l) => /Overdue tasks/i.test(l))).toBe(true);
    expect(h.some((l) => /task-old/.test(l))).toBe(true);
    expect(h.join("\n")).not.toMatch(/task-future/);
  });

  it("emits a single honesty line when all counters are zero", () => {
    const h = deriveOperatorQueueHighlights(
      {
        pendingApprovalDrafts: 0,
        openTasks: 0,
        openEscalations: 0,
        linkedOpenLeads: 0,
        unlinked: { inquiry: 0, needsFiling: 0, operatorReview: 0, suppressed: 0 },
        zenTabs: { review: 0, drafts: 0, leads: 0, needs_filing: 0 },
      },
      { ...EMPTY_SAMPLES },
    );
    expect(h).toHaveLength(1);
    expect(h[0]).toMatch(/zero|Do not invent/i);
  });
});
