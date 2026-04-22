import { describe, expect, it } from "vitest";
import type { AssistantContext } from "../../../../../src/types/assistantContext.types.ts";
import { IDLE_ASSISTANT_CALENDAR_SNAPSHOT } from "../../context/fetchAssistantOperatorCalendarSnapshot.ts";
import { IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT } from "../../context/fetchAssistantInquiryCountSnapshot.ts";
import { IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP } from "../../context/fetchAssistantThreadMessageLookup.ts";
import { IDLE_OPERATOR_QUERY_ENTITY_RESOLUTION } from "../../context/resolveOperatorQueryEntitiesFromIndex.ts";
import { deriveAssistantPlaybookCoverageSummary } from "../../../../../src/lib/deriveAssistantPlaybookCoverageSummary.ts";
import { getAssistantAppCatalogForContext } from "../../../../../src/lib/operatorAssistantAppCatalog.ts";
import {
  executeOperatorReadOnlyLookupTool,
  MAX_PROJECT_DETAIL_STORY_NOTES_CHARS,
  OPERATOR_READ_ONLY_LOOKUP_TOOLS,
  projectDetailsPayloadFromFocusedFacts,
} from "./operatorAssistantReadOnlyLookupTools.ts";

function minimalCtx(): AssistantContext {
  const playbookRules: AssistantContext["playbookRules"] = [];
  const cov = deriveAssistantPlaybookCoverageSummary(playbookRules);
  return {
    clientFacingForbidden: true,
    photographerId: "photo-tool",
    queryText: "test",
    focusedWeddingId: "w-focus",
    focusedPersonId: null,
    playbookCoverageSummary: cov,
    playbookRules,
    rawPlaybookRules: [],
    authorizedCaseExceptions: [],
    crmDigest: { recentWeddings: [], recentPeople: [] },
    focusedProjectFacts: null,
    focusedProjectSummary: null,
    focusedProjectRowHints: null,
    operatorStateSummary: {
      fetchedAt: "2020-01-01T00:00:00.000Z",
      sourcesNote: "",
      counts: {
        pendingApprovalDrafts: 0,
        openTasks: 0,
        openEscalations: 0,
        linkedOpenLeads: 0,
        unlinked: { inquiry: 0, needsFiling: 0, operatorReview: 0, suppressed: 0 },
        zenTabs: { review: 0, drafts: 0, leads: 0, needs_filing: 0 },
      },
      samples: { pendingDrafts: [], openEscalations: [], openTasks: [], topActions: [] },
    },
    appCatalog: getAssistantAppCatalogForContext(),
    includeAppCatalogInOperatorPrompt: false,
    studioAnalysisSnapshot: null,
    carryForward: null,
    memoryHeaders: [],
    selectedMemories: [],
    globalKnowledge: [],
    operatorQueryEntityResolution: IDLE_OPERATOR_QUERY_ENTITY_RESOLUTION,
    operatorThreadMessageLookup: IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP,
    operatorInquiryCountSnapshot: IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT,
    operatorCalendarSnapshot: IDLE_ASSISTANT_CALENDAR_SNAPSHOT,
    retrievalLog: {
      mode: "assistant_query",
      queryDigest: { charLength: 1, fingerprint: "ab" },
      scopesQueried: [],
      focus: {
        weddingIdRequested: null,
        weddingIdEffective: null,
        personIdRequested: null,
        personIdEffective: null,
      },
      queryTextScopeExpansion: "none",
      memoryHeaderCount: 0,
      selectedMemoryIds: [],
      globalKnowledgeRowCount: 0,
      studioAnalysisProjectCount: null,
      playbookCoverage: {
        totalActiveRules: 0,
        uniqueTopicCount: 0,
        uniqueActionKeyCount: 0,
      },
    },
  };
}

describe("executeOperatorReadOnlyLookupTool", () => {
  it("operator_lookup_projects returns JSON from entity index", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "weddings") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  order: () => ({
                    limit: () =>
                      Promise.resolve({
                        data: [
                          {
                            id: "w1",
                            couple_names: "A & B",
                            location: "Como",
                            stage: "inquiry",
                            project_type: "wedding",
                            wedding_date: null,
                          },
                        ],
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "people") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    } as never;

    const raw = await executeOperatorReadOnlyLookupTool(
      supabase,
      "photo-tool",
      minimalCtx(),
      "operator_lookup_projects",
      JSON.stringify({ query: "Como inquiry" }),
    );
    const j = JSON.parse(raw) as {
      tool: string;
      result: { weddingSignal: string; weddingCandidates: Array<{ project_type: string }>; note: string };
    };
    expect(j.tool).toBe("operator_lookup_projects");
    expect(j.result.weddingSignal).toBe("unique");
    expect(j.result.note).toMatch(/Slice 5/);
  });

  it("operator_lookup_projects includes project_type on each row when the signal is ambiguous (Slice 5)", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "weddings") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  order: () => ({
                    limit: () =>
                      Promise.resolve({
                        data: [
                          {
                            id: "w-a",
                            couple_names: "Milan A",
                            location: "Milan",
                            stage: "inquiry",
                            project_type: "wedding",
                            wedding_date: null,
                          },
                          {
                            id: "w-b",
                            couple_names: "Milan B commercial",
                            location: "Milan",
                            stage: "inquiry",
                            project_type: "commercial",
                            wedding_date: null,
                          },
                        ],
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "people") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  order: () => ({
                    limit: () => Promise.resolve({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    } as never;

    const raw = await executeOperatorReadOnlyLookupTool(
      supabase,
      "photo-tool",
      minimalCtx(),
      "operator_lookup_projects",
      JSON.stringify({ query: "Milan" }),
    );
    const j = JSON.parse(raw) as {
      tool: string;
      result: { weddingSignal: string; weddingCandidates: Array<{ weddingId: string; project_type: string }> };
    };
    expect(j.result.weddingSignal).toBe("ambiguous");
    const types = j.result.weddingCandidates.map((c) => c.project_type).sort();
    expect(types).toEqual(["commercial", "wedding"]);
  });

  it("operator_lookup_inquiry_counts reuses inquiry snapshot helper shape", async () => {
    const supabase = {
      from: (table: string) => {
        if (table === "v_thread_first_inbound_at") {
          const chain: Record<string, unknown> = {};
          chain.select = () => chain;
          chain.eq = () => chain;
          chain.neq = () => chain;
          chain.gte = () => chain;
          chain.order = () => chain;
          chain.limit = () => Promise.resolve({ data: [], error: null });
          return chain;
        }
        return {};
      },
    } as never;

    const raw = await executeOperatorReadOnlyLookupTool(
      supabase,
      "photo-tool",
      minimalCtx(),
      "operator_lookup_inquiry_counts",
      "{}",
    );
    const j = JSON.parse(raw) as { tool: string; result: { didRun: boolean } };
    expect(j.tool).toBe("operator_lookup_inquiry_counts");
    expect(j.result.didRun).toBe(true);
  });

  it("returns error payload for unknown tool name", async () => {
    const supabase = { from: () => ({}) } as never;
    const raw = await executeOperatorReadOnlyLookupTool(supabase, "p", minimalCtx(), "operator_hack", "{}");
    const j = JSON.parse(raw) as { error: string };
    expect(j.error).toBe("unknown_tool");
  });
});

const DETAIL_OK_UUID = "a0eebc99-9c0b-4ef8-8bb2-111111111111";

function supabaseMockForProjectDetailOk(wid: string) {
  const pid = "p1";
  return {
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
              project_type: "video",
              wedding_date: "2026-01-10",
              event_start_date: "2026-01-10",
              event_end_date: "2026-01-11",
              location: "Venue Hall",
              package_name: "P1",
              contract_value: 2000,
              balance_due: 500,
              story_notes: "Short note",
              package_inclusions: ["x"],
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
}

describe("operator_lookup_project_details (registry + contract)", () => {
  it("is registered in OPERATOR_READ_ONLY_LOOKUP_TOOLS with projectId-only schema", () => {
    const names = OPERATOR_READ_ONLY_LOOKUP_TOOLS.map((t) => t.function.name);
    expect(names).toContain("operator_lookup_project_details");
    const t = OPERATOR_READ_ONLY_LOOKUP_TOOLS.find((x) => x.function.name === "operator_lookup_project_details")!;
    expect(t.function.parameters?.additionalProperties).toBe(false);
    expect(t.function.parameters?.required).toEqual(["projectId"]);
    const props = t.function.parameters?.properties as Record<string, unknown> | undefined;
    expect(Object.keys(props ?? {})).toEqual(["projectId"]);
  });

  it("tool descriptions keep resolver (projects) separate from detail (UUID) fetcher", () => {
    const projects = OPERATOR_READ_ONLY_LOOKUP_TOOLS.find((x) => x.function.name === "operator_lookup_projects")!;
    const details = OPERATOR_READ_ONLY_LOOKUP_TOOLS.find((x) => x.function.name === "operator_lookup_project_details")!;
    expect(projects.function.description).toMatch(/Resolver only/i);
    expect(projects.function.description).toMatch(/operator_lookup_project_details/);
    expect(details.function.description).toMatch(/UUID/);
    expect(details.function.description).toMatch(/operator_lookup_projects/);
    expect(details.function.description).toMatch(/not.*name|not pass names|Do \*\*not\*\* pass names/i);
  });

  it("projectDetailsPayloadFromFocusedFacts includes projectType and one-call follow-up fields", () => {
    const payload = projectDetailsPayloadFromFocusedFacts({
      weddingId: DETAIL_OK_UUID,
      couple_names: "X",
      stage: "inquiry",
      project_type: "wedding",
      wedding_date: null,
      event_start_date: "2026-02-01",
      event_end_date: null,
      location: "Loc",
      package_name: "Pkg",
      contract_value: 100,
      balance_due: 10,
      story_notes: "S",
      package_inclusions: [],
      people: [],
      contactPoints: [],
      counts: { openTasks: 3, openEscalations: 2, pendingApprovalDrafts: 1 },
    });
    expect(payload.projectId).toBe(DETAIL_OK_UUID);
    expect(payload.projectType).toBe("wedding");
    expect(payload.displayTitle).toBe("X");
    expect(payload.openTaskCount).toBe(3);
    expect(payload.openEscalationCount).toBe(2);
    expect(payload.pendingApprovalDraftCount).toBe(1);
    expect(payload.eventStartDate).toBe("2026-02-01");
  });

  it("honors story excerpt cap in tool output (400 chars per slice contract)", () => {
    expect(MAX_PROJECT_DETAIL_STORY_NOTES_CHARS).toBe(400);
    const long = "z".repeat(MAX_PROJECT_DETAIL_STORY_NOTES_CHARS + 50);
    const payload = projectDetailsPayloadFromFocusedFacts({
      weddingId: DETAIL_OK_UUID,
      couple_names: "",
      stage: "",
      project_type: "other",
      wedding_date: null,
      event_start_date: null,
      event_end_date: null,
      location: "",
      package_name: null,
      contract_value: null,
      balance_due: null,
      story_notes: long,
      package_inclusions: [],
      people: [],
      contactPoints: [],
      counts: { openTasks: 0, openEscalations: 0, pendingApprovalDrafts: 0 },
    });
    expect(payload.storyNotes?.length).toBe(MAX_PROJECT_DETAIL_STORY_NOTES_CHARS);
  });
});

describe("executeOperatorReadOnlyLookupTool — operator_lookup_project_details", () => {
  it("valid UUID returns structured result including projectType", async () => {
    const supabase = supabaseMockForProjectDetailOk(DETAIL_OK_UUID);
    const raw = await executeOperatorReadOnlyLookupTool(
      supabase,
      "photo-tool",
      minimalCtx(),
      "operator_lookup_project_details",
      JSON.stringify({ projectId: DETAIL_OK_UUID }),
    );
    const j = JSON.parse(raw) as {
      tool: string;
      result: { projectId: string; projectType: string; openTaskCount: number; people: unknown[] };
    };
    expect(j.tool).toBe("operator_lookup_project_details");
    expect(j.result.projectType).toBe("video");
    expect(j.result.openTaskCount).toBe(2);
    expect(j.result.people.length).toBe(1);
  });

  it("invalid UUID returns validation_error JSON, not a throw", async () => {
    const supabase = { from: () => ({}) } as never;
    const raw = await executeOperatorReadOnlyLookupTool(
      supabase,
      "p",
      minimalCtx(),
      "operator_lookup_project_details",
      JSON.stringify({ projectId: "completely-not-a-uuid" }),
    );
    const j = JSON.parse(raw) as { error: string; code: string; tool: string };
    expect(j.tool).toBe("operator_lookup_project_details");
    expect(j.error).toBe("validation_error");
    expect(j.code).toBe("invalid_project_id");
  });

  it("rejects extra properties (mixed resolve/detail input)", async () => {
    const supabase = supabaseMockForProjectDetailOk(DETAIL_OK_UUID);
    const raw = await executeOperatorReadOnlyLookupTool(
      supabase,
      "p",
      minimalCtx(),
      "operator_lookup_project_details",
      JSON.stringify({ projectId: DETAIL_OK_UUID, query: "Venue" }),
    );
    const j = JSON.parse(raw) as { error: string; code: string; disallowed: string[] };
    expect(j.error).toBe("invalid_arguments");
    expect(j.code).toBe("extra_properties");
    expect(j.disallowed).toContain("query");
  });

  it("valid UUID for another tenant / missing row is not_found without leaking", async () => {
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
    const raw = await executeOperatorReadOnlyLookupTool(
      supabase,
      "photo-tool",
      minimalCtx(),
      "operator_lookup_project_details",
      JSON.stringify({ projectId: DETAIL_OK_UUID }),
    );
    const j = JSON.parse(raw) as { error: string; code: string; message: string };
    expect(j.error).toBe("not_found");
    expect(j.code).toBe("not_found");
    expect(j.message).toMatch(/No project|not visible|studio/i);
  });
});
