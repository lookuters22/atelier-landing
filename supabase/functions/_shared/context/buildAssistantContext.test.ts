import { describe, expect, it, vi, beforeEach } from "vitest";
import type {
  AssistantOperatorStateSummary,
  AssistantStudioAnalysisSnapshot,
} from "../../../../src/types/assistantContext.types.ts";

const { operatorStateFixture, fetchAssistantOperatorStateSummaryMock, fetchStudioAnalysisMock } = vi.hoisted(() => {
  const operatorStateFixture: AssistantOperatorStateSummary = {
    fetchedAt: "2020-01-01T00:00:00.000Z",
    sourcesNote: "test fixture",
    counts: {
      pendingApprovalDrafts: 0,
      openTasks: 0,
      openEscalations: 0,
      linkedOpenLeads: 0,
      unlinked: { inquiry: 0, needsFiling: 0, operatorReview: 0, suppressed: 0 },
      zenTabs: { review: 0, drafts: 0, leads: 0, needs_filing: 0 },
    },
    samples: {
      pendingDrafts: [],
      openEscalations: [],
      openTasks: [],
      topActions: [],
    },
  };
  return {
    operatorStateFixture,
    fetchAssistantOperatorStateSummaryMock: vi.fn(() => Promise.resolve(operatorStateFixture)),
    fetchStudioAnalysisMock: vi.fn(() => Promise.resolve(null)),
  };
});

vi.mock("./fetchAssistantOperatorStateSummary.ts", () => ({
  fetchAssistantOperatorStateSummary: fetchAssistantOperatorStateSummaryMock,
}));

vi.mock("./fetchAssistantStudioAnalysisSnapshot.ts", () => ({
  fetchAssistantStudioAnalysisSnapshot: fetchStudioAnalysisMock,
}));

import { buildAssistantContext } from "./buildAssistantContext.ts";
import { fetchAssistantOperatorStateSummary } from "./fetchAssistantOperatorStateSummary.ts";

describe("buildAssistantContext", () => {
  beforeEach(() => {
    vi.mocked(fetchStudioAnalysisMock).mockReset();
    vi.mocked(fetchStudioAnalysisMock).mockResolvedValue(null);
  });

  it("returns clientFacingForbidden true and studio-only memory scope when no focus", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    let weddingsCalls = 0;
    let memoriesThenCalls = 0;
    const supabase = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.is = () => chain;
        chain.in = () => chain;
        chain.lte = () => chain;
        chain.or = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.maybeSingle = () => {
          if (table === "weddings") {
            weddingsCalls += 1;
            if (weddingsCalls === 1) {
              return Promise.resolve({ data: null, error: null });
            }
          }
          if (table === "people") {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "playbook_rules") {
            return resolve({ data: [], error: null });
          }
          if (table === "weddings") {
            return resolve({
              data: [{ id: "w1", couple_names: "A & B", stage: "booked", wedding_date: null }],
              error: null,
            });
          }
          if (table === "people") {
            return resolve({
              data: [{ id: "p1", display_name: "Pat", kind: "client" }],
              error: null,
            });
          }
          if (table === "memories") {
            memoriesThenCalls += 1;
            if (memoriesThenCalls === 1) {
              return resolve({
                data: [
                  {
                    id: "m-studio",
                    wedding_id: null,
                    scope: "studio",
                    person_id: null,
                    type: "note",
                    title: "turnaround",
                    summary: "four weeks",
                  },
                ],
                error: null,
              });
            }
            return resolve({
              data: [
                {
                  id: "m-studio",
                  type: "note",
                  title: "turnaround",
                  summary: "four weeks",
                  full_content: "Default turnaround is four weeks.",
                },
              ],
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const ctx = await buildAssistantContext(supabase, "photo-1", {
      queryText: "",
    });

    expect(ctx.playbookRules.length).toBe(0);
    expect(ctx.playbookCoverageSummary.totalActiveRules).toBe(0);
    expect(ctx.retrievalLog.playbookCoverage?.totalActiveRules).toBe(0);
    expect(ctx.clientFacingForbidden).toBe(true);
    expect(ctx.focusedWeddingId).toBeNull();
    expect(ctx.focusedPersonId).toBeNull();
    expect(ctx.retrievalLog.queryTextScopeExpansion).toBe("none");
    expect(ctx.retrievalLog.focus.weddingIdEffective).toBeNull();
    expect(ctx.retrievalLog.scopesQueried).toContain("studio_memory");
    expect(ctx.retrievalLog.scopesQueried).not.toContain("crm_digest");
    expect(ctx.retrievalLog.scopesQueried).not.toContain("project_memory");
    expect(ctx.retrievalLog.scopesQueried).not.toContain("person_memory");
    expect(ctx.retrievalLog.scopesQueried).not.toContain("focused_project_summary");
    expect(ctx.retrievalLog.scopesQueried).toContain("operator_state_summary");
    expect(ctx.retrievalLog.scopesQueried).toContain("app_catalog");
    expect(ctx.focusedProjectFacts).toBeNull();
    expect(ctx.focusedProjectSummary).toBeNull();
    expect(ctx.focusedProjectRowHints).toBeNull();
    expect(ctx.appCatalog.version).toBe(1);
    expect(ctx.appCatalog.serializedUtf8Bytes).toBeGreaterThan(1000);
    expect(ctx.appCatalog.serializedUtf8Bytes).toBeLessThan(24 * 1024);
    expect(ctx.appCatalog.catalogJson).toContain("APP_ROUTES");
    expect(ctx.appCatalog.catalogJson).toContain("/today");
    expect(ctx.includeAppCatalogInOperatorPrompt).toBe(false);
    expect(ctx.studioAnalysisSnapshot).toBeNull();
    expect(ctx.retrievalLog.studioAnalysisProjectCount).toBeNull();
    expect(ctx.retrievalLog.scopesQueried).not.toContain("studio_analysis_snapshot");
    expect(fetchStudioAnalysisMock).not.toHaveBeenCalled();
    expect(ctx.operatorStateSummary).toBe(operatorStateFixture);
    expect(fetchAssistantOperatorStateSummary).toHaveBeenCalledWith(supabase, "photo-1");
    expect(ctx.selectedMemories.map((m) => m.id)).toContain("m-studio");
    expect(ctx.crmDigest.recentWeddings).toEqual([]);
    expect(ctx.crmDigest.recentPeople).toEqual([]);
    expect(ctx.operatorCalendarSnapshot.didRun).toBe(false);
    expect(ctx.retrievalLog.scopesQueried).not.toContain("operator_calendar_snapshot");

    vi.restoreAllMocks();
  });

  it("applies effective focusedWeddingId for memory headers and logs project_memory scope", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const wid = "11111111-1111-1111-1111-111111111111";
    let weddingsMaybeSingle = 0;
    let memoriesThenCalls = 0;

    const supabase = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.is = () => chain;
        chain.in = () => chain;
        chain.lte = () => chain;
        chain.or = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.single = () => {
          if (table === "weddings") {
            return Promise.resolve({
              data: {
                id: wid,
                couple_names: "X & Y",
                stage: "inquiry",
                project_type: "wedding",
                wedding_date: null,
                event_start_date: null,
                event_end_date: null,
                location: "Big Sur Lodge",
                package_name: "Gold",
                contract_value: 100,
                balance_due: 50,
                story_notes: null,
                package_inclusions: ["Album"],
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: { message: "single not in test" } });
        };
        chain.maybeSingle = () => {
          if (table === "weddings") {
            weddingsMaybeSingle += 1;
            if (weddingsMaybeSingle === 1) {
              return Promise.resolve({ data: { id: wid }, error: null });
            }
          }
          if (table === "people") {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "playbook_rules") return resolve({ data: [], error: null });
          if (table === "authorized_case_exceptions") {
            return resolve({ data: [], error: null });
          }
          if (table === "tasks" || table === "escalation_requests") {
            return resolve({ data: null, count: 0, error: null });
          }
          if (table === "thread_weddings") {
            return resolve({ data: [], error: null });
          }
          if (table === "weddings") {
            return resolve({
              data: [{ id: wid, couple_names: "X", stage: "inquiry", wedding_date: null }],
              error: null,
            });
          }
          if (table === "people") {
            return resolve({ data: [], error: null });
          }
          if (table === "memories") {
            memoriesThenCalls += 1;
            if (memoriesThenCalls === 1) {
              return resolve({
                data: [
                  {
                    id: "m-proj",
                    wedding_id: wid,
                    scope: "project",
                    person_id: null,
                    type: "t",
                    title: "venue",
                    summary: "s",
                  },
                ],
                error: null,
              });
            }
            return resolve({
              data: [
                {
                  id: "m-proj",
                  type: "t",
                  title: "venue",
                  summary: "s",
                  full_content: "full",
                },
              ],
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const ctx = await buildAssistantContext(supabase, "photo-1", {
      queryText: "venue",
      focusedWeddingId: wid,
    });

    expect(ctx.focusedWeddingId).toBe(wid);
    expect(ctx.retrievalLog.scopesQueried).toContain("project_memory");
    expect(ctx.retrievalLog.scopesQueried).toContain("focused_project_summary");
    expect(ctx.focusedProjectFacts).toBeNull();
    expect(ctx.focusedProjectSummary).not.toBeNull();
    expect(ctx.focusedProjectSummary).toEqual({
      projectId: wid,
      projectType: "wedding",
      stage: "inquiry",
      displayTitle: "X & Y",
    });
    expect(ctx.focusedProjectRowHints).toEqual({
      location: "Big Sur Lodge",
      wedding_date: null,
      event_start_date: null,
      event_end_date: null,
    });
    expect(ctx.memoryHeaders.some((h) => h.id === "m-proj")).toBe(true);

    vi.restoreAllMocks();
  });

  it("applies effective focusedPersonId and logs person_memory scope", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const pid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    let memoriesThenCalls = 0;

    const supabase = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.is = () => chain;
        chain.in = () => chain;
        chain.lte = () => chain;
        chain.or = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.maybeSingle = () => {
          if (table === "weddings") return Promise.resolve({ data: null, error: null });
          if (table === "people") {
            return Promise.resolve({ data: { id: pid }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "playbook_rules") return resolve({ data: [], error: null });
          if (table === "weddings") {
            return resolve({ data: [], error: null });
          }
          if (table === "people") {
            return resolve({
              data: [{ id: pid, display_name: "Marco", kind: "vendor" }],
              error: null,
            });
          }
          if (table === "memories") {
            memoriesThenCalls += 1;
            if (memoriesThenCalls === 1) {
              return resolve({
                data: [
                  {
                    id: "m-person",
                    wedding_id: null,
                    scope: "person",
                    person_id: pid,
                    type: "t",
                    title: "scout",
                    summary: "four hour",
                  },
                ],
                error: null,
              });
            }
            return resolve({
              data: [
                {
                  id: "m-person",
                  type: "t",
                  title: "scout",
                  summary: "four hour",
                  full_content: "Scout block is four hours.",
                },
              ],
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const ctx = await buildAssistantContext(supabase, "photo-1", {
      queryText: "scout",
      focusedPersonId: pid,
    });

    expect(ctx.focusedPersonId).toBe(pid);
    expect(ctx.retrievalLog.scopesQueried).toContain("person_memory");
    expect(ctx.focusedProjectFacts).toBeNull();
    expect(ctx.focusedProjectSummary).toBeNull();
    expect(ctx.focusedProjectRowHints).toBeNull();
    expect(ctx.selectedMemories.some((m) => m.id === "m-person")).toBe(true);

    vi.restoreAllMocks();
  });

  it("drops invalid focusedWeddingId (not owned by tenant) for memory OR and scopesQueried", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const requested = "11111111-1111-1111-1111-111111111111";
    let memoriesThenCalls = 0;

    const supabase = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.is = () => chain;
        chain.in = () => chain;
        chain.lte = () => chain;
        chain.or = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.maybeSingle = () => {
          if (table === "weddings") {
            return Promise.resolve({ data: null, error: null });
          }
          if (table === "people") {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "playbook_rules") return resolve({ data: [], error: null });
          if (table === "weddings") {
            return resolve({ data: [], error: null });
          }
          if (table === "people") {
            return resolve({ data: [], error: null });
          }
          if (table === "memories") {
            memoriesThenCalls += 1;
            if (memoriesThenCalls === 1) {
              return resolve({
                data: [
                  {
                    id: "only-studio",
                    wedding_id: null,
                    scope: "studio",
                    person_id: null,
                    type: "t",
                    title: "x",
                    summary: "y",
                  },
                ],
                error: null,
              });
            }
            return resolve({
              data: [
                {
                  id: "only-studio",
                  type: "t",
                  title: "x",
                  summary: "y",
                  full_content: "z",
                },
              ],
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const ctx = await buildAssistantContext(supabase, "photo-1", {
      queryText: "",
      focusedWeddingId: requested,
    });

    expect(ctx.focusedWeddingId).toBeNull();
    expect(ctx.retrievalLog.focus.weddingIdRequested).toBe(requested);
    expect(ctx.retrievalLog.focus.weddingIdEffective).toBeNull();
    expect(ctx.retrievalLog.scopesQueried).not.toContain("project_memory");
    expect(ctx.focusedProjectFacts).toBeNull();
    expect(ctx.focusedProjectSummary).toBeNull();
    expect(ctx.focusedProjectRowHints).toBeNull();

    vi.restoreAllMocks();
  });

  it("loads studio analysis snapshot when the query matches analysis intent (Slice 12)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const snap: AssistantStudioAnalysisSnapshot = {
      fetchedAt: "2020-01-01T00:00:00.000Z",
      window: { monthsBack: 24, cutoffDateIso: "2018-01-01" },
      projectCount: 3,
      stageDistribution: { inquiry: 1, booked: 2 },
      byStage: [
        { stage: "booked", count: 2 },
        { stage: "inquiry", count: 1 },
      ],
      projectTypeMix: [{ project_type: "wedding", count: 3 }],
      packageMixBooked: [],
      contractStats: null,
      balanceStats: null,
      openTasksCount: 0,
      openEscalationsCount: 0,
      locationCoverage: { withLocationCount: 0, total: 3, note: "test" },
      rowSamples: [],
    };
    vi.mocked(fetchStudioAnalysisMock).mockResolvedValue(snap);

    let weddingsCalls = 0;
    let memoriesThenCalls = 0;
    const supabase = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.is = () => chain;
        chain.in = () => chain;
        chain.lte = () => chain;
        chain.or = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.maybeSingle = () => {
          if (table === "weddings") {
            weddingsCalls += 1;
            if (weddingsCalls === 1) {
              return Promise.resolve({ data: null, error: null });
            }
          }
          if (table === "people") {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "playbook_rules") {
            return resolve({ data: [], error: null });
          }
          if (table === "weddings") {
            return resolve({
              data: [{ id: "w1", couple_names: "A & B", stage: "booked", wedding_date: null }],
              error: null,
            });
          }
          if (table === "people") {
            return resolve({
              data: [{ id: "p1", display_name: "Pat", kind: "client" }],
              error: null,
            });
          }
          if (table === "memories") {
            memoriesThenCalls += 1;
            if (memoriesThenCalls === 1) {
              return resolve({
                data: [
                  {
                    id: "m-studio",
                    wedding_id: null,
                    scope: "studio",
                    person_id: null,
                    type: "note",
                    title: "turnaround",
                    summary: "four weeks",
                  },
                ],
                error: null,
              });
            }
            return resolve({
              data: [
                {
                  id: "m-studio",
                  type: "note",
                  title: "turnaround",
                  summary: "four weeks",
                  full_content: "Default turnaround is four weeks.",
                },
              ],
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const ctx = await buildAssistantContext(supabase, "photo-1", {
      queryText: "Are we undercharging for our package prices on average?",
    });

    expect(fetchStudioAnalysisMock).toHaveBeenCalled();
    expect(ctx.studioAnalysisSnapshot).toEqual(snap);
    expect(ctx.retrievalLog.scopesQueried).toContain("studio_analysis_snapshot");
    expect(ctx.retrievalLog.studioAnalysisProjectCount).toBe(3);

    vi.restoreAllMocks();
  });

  it("includes bounded operator query entity resolution (ambiguous location matches) without extra writes", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const supabase = {
      rpc: () => Promise.resolve({ data: [], error: null }),
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.is = () => chain;
        chain.in = () => chain;
        chain.lte = () => chain;
        chain.or = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.neq = () => chain;
        chain.gte = () => chain;
        chain.lt = () => chain;
        chain.ilike = () => chain;
        chain.maybeSingle = () => {
          if (table === "weddings" || table === "people") {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "playbook_rules") {
            return resolve({ data: [], error: null });
          }
          if (table === "authorized_case_exceptions") {
            return resolve({ data: [], error: null });
          }
          if (table === "tasks" || table === "escalation_requests") {
            return resolve({ data: null, count: 0, error: null });
          }
          if (table === "thread_weddings") {
            return resolve({ data: [], error: null });
          }
          if (table === "weddings") {
            return resolve({
              data: [
                {
                  id: "w1",
                  couple_names: "A & A",
                  location: "Villa, Como",
                  stage: "inquiry",
                  project_type: "wedding",
                  wedding_date: null,
                },
                {
                  id: "w2",
                  couple_names: "B & B",
                  location: "Hotel Como",
                  stage: "inquiry",
                  project_type: "wedding",
                  wedding_date: null,
                },
              ],
              error: null,
            });
          }
          if (table === "people") {
            return resolve({ data: [], error: null });
          }
          if (table === "memories") {
            return resolve({ data: [], error: null });
          }
          if (table === "global_knowledge" || table === "knowledge_documents") {
            return resolve({ data: [], error: null });
          }
          if (table === "v_threads_inbox_latest_message") {
            return resolve({ data: [], error: null });
          }
          if (table === "threads") {
            return resolve({ data: [], error: null });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const ctx = await buildAssistantContext(supabase, "photo-1", {
      queryText: "What is the inquiry in Como about?",
    });

    expect(ctx.retrievalLog.scopesQueried).toContain("operator_query_entity_resolution");
    expect(ctx.retrievalLog.entityResolution?.didRun).toBe(true);
    expect(ctx.operatorQueryEntityResolution.didRun).toBe(true);
    expect(ctx.operatorQueryEntityResolution.weddingSignal).toBe("ambiguous");
    expect(ctx.operatorQueryEntityResolution.weddingCandidates.length).toBeGreaterThanOrEqual(2);
    expect(ctx.operatorQueryEntityResolution.queryResolvedProjectFacts).toBeNull();
    expect(ctx.focusedWeddingId).toBeNull();
    expect(ctx.retrievalLog.scopesQueried).toContain("operator_thread_message_lookup");
    expect(ctx.retrievalLog.threadMessageLookup?.didRun).toBe(true);

    vi.restoreAllMocks();
  });

  it("includes thread/message lookup when the question matches inbox intent (read-only, bounded)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});

    const wid = "11111111-1111-1111-1111-111111111111";
    let weddingsMaybeSingle = 0;
    let memoriesThenCalls = 0;

    const supabase = {
      rpc: () => Promise.resolve({ data: [], error: null }),
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.is = () => chain;
        chain.in = () => chain;
        chain.lte = () => chain;
        chain.or = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.ilike = () => chain;
        chain.neq = () => chain;
        chain.single = () => {
          if (table === "weddings") {
            return Promise.resolve({
              data: {
                id: wid,
                couple_names: "X & Y",
                stage: "inquiry",
                project_type: "wedding",
                wedding_date: null,
                event_start_date: null,
                event_end_date: null,
                location: "Big Sur Lodge",
                package_name: "Gold",
                contract_value: 100,
                balance_due: 50,
                story_notes: null,
                package_inclusions: ["Album"],
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: { message: "single not in test" } });
        };
        chain.maybeSingle = () => {
          if (table === "weddings") {
            weddingsMaybeSingle += 1;
            if (weddingsMaybeSingle === 1) {
              return Promise.resolve({ data: { id: wid }, error: null });
            }
          }
          if (table === "people") {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "playbook_rules") return resolve({ data: [], error: null });
          if (table === "authorized_case_exceptions") {
            return resolve({ data: [], error: null });
          }
          if (table === "tasks" || table === "escalation_requests") {
            return resolve({ data: null, count: 0, error: null });
          }
          if (table === "thread_weddings") {
            return resolve({ data: [], error: null });
          }
          if (table === "threads") {
            return resolve({
              data: [
                {
                  id: "th-1",
                  title: "Hello",
                  wedding_id: wid,
                  channel: "email",
                  kind: "client",
                  last_activity_at: "2025-01-01T00:00:00.000Z",
                  last_inbound_at: "2025-01-01T00:00:00.000Z",
                  last_outbound_at: null,
                },
              ],
              error: null,
            });
          }
          if (table === "thread_participants") {
            return resolve({ data: [], error: null });
          }
          if (table === "weddings") {
            return resolve({
              data: [{ id: wid, couple_names: "X & Y", stage: "inquiry", wedding_date: null }],
              error: null,
            });
          }
          if (table === "people") {
            return resolve({ data: [], error: null });
          }
          if (table === "memories") {
            memoriesThenCalls += 1;
            if (memoriesThenCalls === 1) {
              return resolve({
                data: [
                  {
                    id: "m-proj",
                    wedding_id: wid,
                    scope: "project",
                    person_id: null,
                    type: "t",
                    title: "venue",
                    summary: "s",
                  },
                ],
                error: null,
              });
            }
            return resolve({
              data: [
                {
                  id: "m-proj",
                  type: "t",
                  title: "venue",
                  summary: "s",
                  full_content: "full",
                },
              ],
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const ctx = await buildAssistantContext(supabase, "photo-1", {
      queryText: "Did the client send another email on this inquiry?",
      focusedWeddingId: wid,
    });

    expect(ctx.retrievalLog.scopesQueried).toContain("operator_thread_message_lookup");
    expect(ctx.operatorThreadMessageLookup.didRun).toBe(true);
    expect(ctx.operatorThreadMessageLookup.threads.length).toBe(1);
    expect(ctx.operatorThreadMessageLookup.threads[0]?.threadId).toBe("th-1");

    vi.restoreAllMocks();
  });

  it("thread lookup prefers inbox-scored match for skincare / today / email question (operator Ana)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T16:00:00.000Z"));

    const thSkincare = {
      id: "th-skin",
      title: "Brand shoot inquiry for skincare campaign",
      wedding_id: null,
      channel: "email",
      kind: "client",
      last_activity_at: "2026-04-22T14:00:00.000Z",
      last_inbound_at: "2026-04-22T13:00:00.000Z",
      last_outbound_at: null,
    };

    const supabase = {
      rpc: () => Promise.resolve({ data: [], error: null }),
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.is = () => chain;
        chain.in = () => chain;
        chain.lte = () => chain;
        chain.lt = () => chain;
        chain.or = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.neq = () => chain;
        chain.gte = () => chain;
        chain.ilike = () => chain;
        chain.maybeSingle = () => {
          if (table === "weddings" || table === "people") {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "playbook_rules") return resolve({ data: [], error: null });
          if (table === "authorized_case_exceptions") return resolve({ data: [], error: null });
          if (table === "tasks" || table === "escalation_requests") {
            return resolve({ data: null, count: 0, error: null });
          }
          if (table === "thread_weddings") return resolve({ data: [], error: null });
          if (table === "weddings") {
            return resolve({
              data: [
                {
                  id: "w1",
                  couple_names: "Other Couple",
                  location: "X",
                  stage: "inquiry",
                  project_type: "wedding",
                  wedding_date: null,
                },
              ],
              error: null,
            });
          }
          if (table === "people") {
            return resolve({
              data: [{ id: "p-miki", display_name: "Miki Zmajce", kind: "client" }],
              error: null,
            });
          }
          if (table === "memories") return resolve({ data: [], error: null });
          if (table === "global_knowledge" || table === "knowledge_documents") {
            return resolve({ data: [], error: null });
          }
          if (table === "v_threads_inbox_latest_message") {
            return resolve({
              data: [
                {
                  id: "th-skin",
                  title: "Brand shoot inquiry for skincare campaign",
                  wedding_id: null,
                  last_activity_at: "2026-04-22T14:00:00.000Z",
                  kind: "client",
                  latest_sender: "Miki Zmajce <miki@example.com>",
                  latest_body: "Skincare brand shoot inquiry.",
                },
              ],
              error: null,
            });
          }
          if (table === "threads") {
            return resolve({ data: [thSkincare], error: null });
          }
          if (table === "thread_participants") {
            return resolve({ data: [], error: null });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const ctx = await buildAssistantContext(supabase, "photo-1", {
      queryText:
        "I got a phone call today from Miki Zmajce about a skincare brand shoot — did they send an email too?",
    });

    expect(ctx.retrievalLog.scopesQueried).toContain("operator_thread_message_lookup");
    expect(ctx.operatorThreadMessageLookup.didRun).toBe(true);
    expect(ctx.operatorThreadMessageLookup.threads[0]?.threadId).toBe("th-skin");
    expect(ctx.operatorThreadMessageLookup.selectionNote).toMatch(/inbox_scored/);

    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads inquiry count snapshot when the question matches inquiry analytics intent", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T15:30:00.000Z"));

    const supabase = {
      rpc: () => Promise.resolve({ data: [], error: null }),
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.is = () => chain;
        chain.in = () => chain;
        chain.lte = () => chain;
        chain.lt = () => chain;
        chain.or = () => chain;
        chain.order = () => chain;
        chain.neq = () => chain;
        chain.gte = () => chain;
        chain.ilike = () => chain;
        chain.limit = () => {
          if (table === "calendar_events") {
            return Promise.resolve({ data: [], error: null });
          }
          return chain;
        };
        chain.maybeSingle = () => {
          if (table === "weddings" || table === "people") {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "playbook_rules") return resolve({ data: [], error: null });
          if (table === "authorized_case_exceptions") {
            return resolve({ data: [], error: null });
          }
          if (table === "tasks" || table === "escalation_requests") {
            return resolve({ data: null, count: 0, error: null });
          }
          if (table === "thread_weddings") return resolve({ data: [], error: null });
          if (table === "v_thread_first_inbound_at") {
            return resolve({
              data: [
                {
                  thread_id: "t-inq-1",
                  first_inbound_at: "2026-04-21T10:00:00.000Z",
                  wedding_id: "w1",
                  wedding_stage: "inquiry",
                  ai_routing_metadata: null,
                  kind: "client",
                },
                {
                  thread_id: "t-inq-2",
                  first_inbound_at: "2026-04-20T10:00:00.000Z",
                  wedding_id: null,
                  wedding_stage: null,
                  ai_routing_metadata: { sender_role: "customer_lead" },
                  kind: "client",
                },
              ],
              error: null,
            });
          }
          if (table === "weddings") {
            return resolve({
              data: [{ id: "w1", couple_names: "A", stage: "inquiry", wedding_date: null }],
              error: null,
            });
          }
          if (table === "people") return resolve({ data: [], error: null });
          if (table === "memories") return resolve({ data: [], error: null });
          if (table === "global_knowledge" || table === "knowledge_documents") {
            return resolve({ data: [], error: null });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const ctx = await buildAssistantContext(supabase, "photo-1", {
      // Wording uses "leads" so `hasOperatorThreadMessageLookupIntent` does not also fire (no `ilike` in mock).
      queryText: "How many new leads did I receive this week and last week?",
    });

    expect(ctx.retrievalLog.scopesQueried).toContain("operator_inquiry_count_snapshot");
    expect(ctx.operatorInquiryCountSnapshot.didRun).toBe(true);
    expect(ctx.operatorInquiryCountSnapshot.windows.today.count).toBe(1);
    expect(ctx.operatorInquiryCountSnapshot.windows.yesterday.count).toBe(1);
    expect(ctx.retrievalLog.inquiryCountSnapshot?.didRun).toBe(true);

    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads inquiry count snapshot for comparative phrasing (then vs than yesterday typo)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T15:30:00.000Z"));

    const supabase = {
      rpc: () => Promise.resolve({ data: [], error: null }),
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.is = () => chain;
        chain.in = () => chain;
        chain.lte = () => chain;
        chain.lt = () => chain;
        chain.or = () => chain;
        chain.order = () => chain;
        chain.neq = () => chain;
        chain.gte = () => chain;
        chain.ilike = () => chain;
        chain.limit = () => {
          if (table === "calendar_events") {
            return Promise.resolve({ data: [], error: null });
          }
          return chain;
        };
        chain.maybeSingle = () => {
          if (table === "weddings" || table === "people") {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "playbook_rules") return resolve({ data: [], error: null });
          if (table === "authorized_case_exceptions") {
            return resolve({ data: [], error: null });
          }
          if (table === "tasks" || table === "escalation_requests") {
            return resolve({ data: null, count: 0, error: null });
          }
          if (table === "thread_weddings") return resolve({ data: [], error: null });
          if (table === "v_thread_first_inbound_at") {
            return resolve({
              data: [
                {
                  thread_id: "t-cmp-1",
                  first_inbound_at: "2026-04-21T10:00:00.000Z",
                  wedding_id: "w1",
                  wedding_stage: "inquiry",
                  ai_routing_metadata: null,
                  kind: "client",
                },
              ],
              error: null,
            });
          }
          if (table === "weddings") {
            return resolve({
              data: [{ id: "w1", couple_names: "A", stage: "inquiry", wedding_date: null }],
              error: null,
            });
          }
          if (table === "people") return resolve({ data: [], error: null });
          if (table === "memories") return resolve({ data: [], error: null });
          if (table === "global_knowledge" || table === "knowledge_documents") {
            return resolve({ data: [], error: null });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const ctx = await buildAssistantContext(supabase, "photo-1", {
      queryText: "did I receive more inquiries today then yesterday?",
    });

    expect(ctx.retrievalLog.scopesQueried).toContain("operator_inquiry_count_snapshot");
    expect(ctx.operatorInquiryCountSnapshot.didRun).toBe(true);
    expect(ctx.retrievalLog.inquiryCountSnapshot?.didRun).toBe(true);

    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads bounded calendar lookup when the query matches schedule intent (read-only)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00.000Z"));

    let weddingsCalls = 0;
    let memoriesThenCalls = 0;
    const supabase = {
      rpc: () => Promise.resolve({ data: [], error: null }),
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.is = () => chain;
        chain.in = () => chain;
        chain.lte = () => chain;
        chain.lt = () => chain;
        chain.or = () => chain;
        chain.order = () => chain;
        chain.neq = () => chain;
        chain.gte = () => chain;
        chain.ilike = () => chain;
        chain.limit = () => {
          if (table === "calendar_events") {
            return Promise.resolve({
              data: [
                {
                  id: "ce1",
                  title: "Consultation",
                  start_time: "2025-06-14T15:00:00.000Z",
                  end_time: "2025-06-14T16:00:00.000Z",
                  event_type: "about_call",
                  wedding_id: null,
                  meeting_link: null,
                },
              ],
              error: null,
            });
          }
          return chain;
        };
        chain.maybeSingle = () => {
          if (table === "weddings") {
            weddingsCalls += 1;
            if (weddingsCalls === 1) {
              return Promise.resolve({ data: null, error: null });
            }
          }
          if (table === "people") {
            return Promise.resolve({ data: null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        };
        chain.then = (resolve: (v: unknown) => unknown) => {
          if (table === "playbook_rules") {
            return resolve({ data: [], error: null });
          }
          if (table === "authorized_case_exceptions") {
            return resolve({ data: [], error: null });
          }
          if (table === "tasks" || table === "escalation_requests") {
            return resolve({ data: null, count: 0, error: null });
          }
          if (table === "thread_weddings") {
            return resolve({ data: [], error: null });
          }
          if (table === "weddings") {
            return resolve({
              data: [{ id: "w1", couple_names: "A & B", stage: "booked", wedding_date: null }],
              error: null,
            });
          }
          if (table === "people") {
            return resolve({
              data: [{ id: "p1", display_name: "Pat", kind: "client" }],
              error: null,
            });
          }
          if (table === "memories") {
            memoriesThenCalls += 1;
            if (memoriesThenCalls === 1) {
              return resolve({
                data: [
                  {
                    id: "m-studio",
                    wedding_id: null,
                    scope: "studio",
                    person_id: null,
                    type: "note",
                    title: "turnaround",
                    summary: "four weeks",
                  },
                ],
                error: null,
              });
            }
            return resolve({
              data: [
                {
                  id: "m-studio",
                  type: "note",
                  title: "turnaround",
                  summary: "four weeks",
                  full_content: "Default turnaround is four weeks.",
                },
              ],
              error: null,
            });
          }
          if (table === "global_knowledge" || table === "knowledge_documents") {
            return resolve({ data: [], error: null });
          }
          return resolve({ data: [], error: null });
        };
        return chain;
      },
    } as never;

    const ctx = await buildAssistantContext(supabase, "photo-1", {
      queryText: "What was on June 14?",
    });

    expect(ctx.retrievalLog.scopesQueried).toContain("operator_calendar_snapshot");
    expect(ctx.operatorCalendarSnapshot.didRun).toBe(true);
    expect(ctx.operatorCalendarSnapshot.lookupMode).toBe("exact_day");
    expect(ctx.retrievalLog.calendarSnapshot?.lookupMode).toBe("exact_day");
    expect(ctx.retrievalLog.calendarSnapshot?.didRun).toBe(true);
    expect(ctx.operatorCalendarSnapshot.events).toHaveLength(1);
    expect(ctx.operatorCalendarSnapshot.events[0]!.title).toBe("Consultation");

    vi.useRealTimers();
    vi.restoreAllMocks();
  });
});
