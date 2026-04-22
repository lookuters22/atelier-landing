import { describe, expect, it } from "vitest";
import { fetchAssistantOperatorStateSummary } from "./fetchAssistantOperatorStateSummary.ts";

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
  });
});
