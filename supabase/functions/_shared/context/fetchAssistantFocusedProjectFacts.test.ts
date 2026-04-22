import { describe, expect, it } from "vitest";
import {
  fetchAssistantFocusedProjectFacts,
  fetchAssistantFocusedProjectSummaryRow,
  readAssistantProjectDetailById,
} from "./fetchAssistantFocusedProjectFacts.ts";

const SAMPLE_PROJECT_UUID = "a0eebc99-9c0b-4ef8-8bb2-111111111111";

describe("fetchAssistantFocusedProjectFacts", () => {
  it("assembles people, contact points, and counts (tenant-scoped)", async () => {
    const wid = "w1";
    const pid = "p1";
    const supabase = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.in = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.single = () => {
          if (table === "weddings") {
            return Promise.resolve({
              data: {
                id: wid,
                couple_names: "A & B",
                stage: "booked",
                project_type: "wedding",
                wedding_date: "2026-01-10",
                event_start_date: "2026-01-10",
                event_end_date: "2026-01-11",
                location: "Venue Hall",
                package_name: "P1",
                contract_value: 2000,
                balance_due: 500,
                story_notes: "Short note",
                package_inclusions: ["x", "y"],
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: { message: "not wedding" } });
        };
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "wedding_people") {
            return resolve({
              data: [
                {
                  person_id: pid,
                  role_label: "Bride",
                  is_primary_contact: true,
                  people: { display_name: "A", kind: "client" },
                },
              ],
              error: null,
            });
          }
          if (table === "contact_points") {
            return resolve({
              data: [
                { person_id: pid, kind: "email", value_raw: "a@a.com", is_primary: true },
              ],
              error: null,
            });
          }
          if (table === "tasks") {
            return resolve({ data: null, count: 2, error: null });
          }
          if (table === "escalation_requests") {
            return resolve({ data: null, count: 1, error: null });
          }
          if (table === "thread_weddings") {
            return resolve({ data: [{ thread_id: "t1" }], error: null });
          }
          if (table === "drafts") {
            return resolve({ data: null, count: 1, error: null });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const out = await fetchAssistantFocusedProjectFacts(supabase, "photo-1", wid);
    expect(out.weddingId).toBe(wid);
    expect(out.location).toBe("Venue Hall");
    expect(out.people).toHaveLength(1);
    expect(out.people[0].display_name).toBe("A");
    expect(out.contactPoints[0].value_raw).toBe("a@a.com");
    expect(out.counts).toEqual({
      openTasks: 2,
      openEscalations: 1,
      pendingApprovalDrafts: 1,
    });
  });
});

describe("readAssistantProjectDetailById", () => {
  it("returns ok + facts for a valid tenant-scoped id (UUID)", async () => {
    const wid = SAMPLE_PROJECT_UUID;
    const pid = "p1";
    const supabase = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.in = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.single = () => {
          if (table === "weddings") {
            return Promise.resolve({
              data: {
                id: wid,
                couple_names: "A & B",
                stage: "booked",
                project_type: "commercial",
                wedding_date: "2026-01-10",
                event_start_date: "2026-01-10",
                event_end_date: "2026-01-11",
                location: "Venue Hall",
                package_name: "P1",
                contract_value: 2000,
                balance_due: 500,
                story_notes: "Short note",
                package_inclusions: ["x", "y"],
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: { message: "not wedding" } });
        };
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "wedding_people") {
            return resolve({
              data: [
                {
                  person_id: pid,
                  role_label: "Bride",
                  is_primary_contact: true,
                  people: { display_name: "A", kind: "client" },
                },
              ],
              error: null,
            });
          }
          if (table === "contact_points") {
            return resolve({
              data: [{ person_id: pid, kind: "email", value_raw: "a@a.com", is_primary: true }],
              error: null,
            });
          }
          if (table === "tasks") {
            return resolve({ data: null, count: 2, error: null });
          }
          if (table === "escalation_requests") {
            return resolve({ data: null, count: 0, error: null });
          }
          if (table === "thread_weddings") {
            return resolve({ data: [], error: null });
          }
          if (table === "drafts") {
            return resolve({ data: null, count: 0, error: null });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const r = await readAssistantProjectDetailById(supabase, "photo-1", wid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.facts.weddingId).toBe(wid);
      expect(r.facts.project_type).toBe("commercial");
    }
  });

  it("returns invalid_project_id (no throw) for non-UUID strings", async () => {
    const supabase = { from: () => ({}) } as never;
    const r = await readAssistantProjectDetailById(supabase, "photo-1", "Romano & Bianchi");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_project_id");
  });

  it("returns not_found when the wedding row is missing for this tenant (no cross-tenant data)", async () => {
    const supabase = {
      from: (table: string) => {
        if (table !== "weddings") return {} as never;
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: null,
                    error: { message: "JSON object requested, multiple (or no) rows returned" },
                  }),
              }),
            }),
          }),
        } as never;
      },
    } as never;

    const r = await readAssistantProjectDetailById(supabase, "photo-1", SAMPLE_PROJECT_UUID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("not_found");
  });
});

describe("fetchAssistantFocusedProjectSummaryRow", () => {
  it("returns summary + row hints from a single weddings row (no people/tasks fetches)", async () => {
    const wid = SAMPLE_PROJECT_UUID;
    const supabase = {
      from: (table: string) => {
        if (table !== "weddings") return {} as never;
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      id: wid,
                      couple_names: "A & B",
                      stage: "inquiry",
                      project_type: "video",
                      location: "Loc",
                      wedding_date: "2026-01-10",
                      event_start_date: null,
                      event_end_date: null,
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        } as never;
      },
    } as never;

    const r = await fetchAssistantFocusedProjectSummaryRow(supabase, "p1", wid);
    expect(r).not.toBeNull();
    expect(r?.summary).toEqual({
      projectId: wid,
      projectType: "video",
      stage: "inquiry",
      displayTitle: "A & B",
    });
    expect(r?.rowHints).toEqual({
      location: "Loc",
      wedding_date: "2026-01-10",
      event_start_date: null,
      event_end_date: null,
    });
  });
});
