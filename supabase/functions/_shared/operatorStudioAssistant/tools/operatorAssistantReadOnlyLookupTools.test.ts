import { describe, expect, it } from "vitest";
import {
  IDLE_ASSISTANT_STUDIO_INVOICE_SETUP,
  IDLE_ASSISTANT_STUDIO_OFFER_BUILDER,
  IDLE_ASSISTANT_STUDIO_PROFILE,
  type AssistantContext,
} from "../../../../../src/types/assistantContext.types.ts";
import { IDLE_ASSISTANT_CALENDAR_SNAPSHOT } from "../../context/fetchAssistantOperatorCalendarSnapshot.ts";
import { IDLE_ASSISTANT_OPERATOR_STATE_SUMMARY } from "../../context/fetchAssistantOperatorStateSummary.ts";
import { IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT } from "../../context/fetchAssistantInquiryCountSnapshot.ts";
import { IDLE_ASSISTANT_THREAD_MESSAGE_BODIES } from "../../context/fetchAssistantThreadMessageBodies.ts";
import { IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP } from "../../context/fetchAssistantThreadMessageLookup.ts";
import { IDLE_OPERATOR_ANA_TRIAGE } from "../../../../../src/lib/operatorAnaTriage.ts";
import { IDLE_OPERATOR_QUERY_ENTITY_RESOLUTION } from "../../context/resolveOperatorQueryEntitiesFromIndex.ts";
import { deriveAssistantPlaybookCoverageSummary } from "../../../../../src/lib/deriveAssistantPlaybookCoverageSummary.ts";
import { getAssistantAppCatalogForContext } from "../../../../../src/lib/operatorAssistantAppCatalog.ts";
import {
  bulkTriageSpecialistToolPayload,
  executeOperatorReadOnlyLookupTool,
  investigationSpecialistToolPayload,
  MAX_PROJECT_DETAIL_STORY_NOTES_CHARS,
  maxOperatorLookupToolCallsPerTurn,
  OPERATOR_READ_ONLY_LOOKUP_TOOLS,
  projectDetailsPayloadFromFocusedFacts,
} from "./operatorAssistantReadOnlyLookupTools.ts";

const TOOL_NAMES = OPERATOR_READ_ONLY_LOOKUP_TOOLS.map((t) => t.function.name);

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
    operatorStateSummary: IDLE_ASSISTANT_OPERATOR_STATE_SUMMARY,
    studioProfile: IDLE_ASSISTANT_STUDIO_PROFILE,
    studioOfferBuilder: IDLE_ASSISTANT_STUDIO_OFFER_BUILDER,
    studioInvoiceSetup: IDLE_ASSISTANT_STUDIO_INVOICE_SETUP,
    appCatalog: getAssistantAppCatalogForContext(),
    includeAppCatalogInOperatorPrompt: false,
    studioAnalysisSnapshot: null,
    carryForward: null,
    memoryHeaders: [],
    selectedMemories: [],
    globalKnowledge: [],
    operatorQueryEntityResolution: IDLE_OPERATOR_QUERY_ENTITY_RESOLUTION,
    operatorThreadMessageLookup: IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP,
    operatorThreadMessageBodies: IDLE_ASSISTANT_THREAD_MESSAGE_BODIES,
    operatorInquiryCountSnapshot: IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT,
    operatorCalendarSnapshot: IDLE_ASSISTANT_CALENDAR_SNAPSHOT,
    operatorTriage: IDLE_OPERATOR_ANA_TRIAGE,
    escalationResolverFocus: null,
    offerBuilderSpecialistFocus: null,
    invoiceSetupSpecialistFocus: null,
    investigationSpecialistFocus: null,
    playbookAuditSpecialistFocus: null,
    bulkTriageSpecialistFocus: null,
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

describe("maxOperatorLookupToolCallsPerTurn / bulkTriageSpecialistToolPayload (S6)", () => {
  it("uses bulk triage cap when bulk triage focus is set", () => {
    const ctx: AssistantContext = {
      ...minimalCtx(),
      bulkTriageSpecialistFocus: { toolPayload: { mode: "bulk_triage_queue_v1" } },
    };
    expect(maxOperatorLookupToolCallsPerTurn(ctx)).toBe(4);
  });

  it("bulk triage payload names mode and triage behavior", () => {
    const p = bulkTriageSpecialistToolPayload();
    expect(p.mode).toBe("bulk_triage_queue_v1");
    expect(p.maxLookupToolCallsThisTurn).toBe(4);
    expect(p.triageBehavior).toBeDefined();
  });
});

describe("maxOperatorLookupToolCallsPerTurn / investigationSpecialistToolPayload (S4)", () => {
  it("uses the default read-only lookup cap without investigation focus", () => {
    expect(maxOperatorLookupToolCallsPerTurn(minimalCtx())).toBe(3);
  });

  it("raises the cap when investigation specialist focus is set", () => {
    const ctx: AssistantContext = {
      ...minimalCtx(),
      investigationSpecialistFocus: { toolPayload: { mode: "deep_search_investigation_v1" } },
    };
    expect(maxOperatorLookupToolCallsPerTurn(ctx)).toBe(5);
  });

  it("investigation payload names mode, tool list, and evidence discipline", () => {
    const p = investigationSpecialistToolPayload();
    expect(p.mode).toBe("deep_search_investigation_v1");
    expect(p.maxLookupToolCallsThisTurn).toBe(5);
    expect(p.defaultMaxLookupToolCalls).toBe(3);
    expect(Array.isArray(p.readOnlyLookupToolNames)).toBe(true);
    expect((p.readOnlyLookupToolNames as string[]).length).toBe(OPERATOR_READ_ONLY_LOOKUP_TOOLS.length);
    expect(typeof p.evidenceDiscipline).toBe("string");
    expect(typeof p.notInScope).toBe("string");
  });
});

describe("executeOperatorReadOnlyLookupTool", () => {
  it("exposes operator_lookup_thread_messages and operator_lookup_draft in the tool list", () => {
    expect(TOOL_NAMES).toContain("operator_lookup_thread_messages");
    expect(TOOL_NAMES).toContain("operator_lookup_draft");
    expect(TOOL_NAMES).toContain("operator_lookup_thread_queue");
    expect(TOOL_NAMES).toContain("operator_lookup_escalation");
    expect(TOOL_NAMES).toContain("operator_lookup_offer_builder");
    expect(TOOL_NAMES).toContain("operator_lookup_invoice_setup");
    expect(TOOL_NAMES.length).toBe(10);
  });

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

  it("operator_lookup_thread_messages returns bounded message excerpts for a tenant thread", async () => {
    const tid = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const supabase = {
      from: (table: string) => {
        if (table === "threads") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: { id: tid, title: "Re: Hello", photographer_id: "p1" },
                      error: null,
                    }),
                }),
              }),
            }),
          };
        }
        if (table === "messages") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () =>
                      Promise.resolve({
                        data: [
                          {
                            id: "m1",
                            direction: "in",
                            sender: "client@example.com",
                            body: "We are interested in your June package.",
                            sent_at: "2025-01-01T00:00:00.000Z",
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
        return {};
      },
    } as never;

    const raw = await executeOperatorReadOnlyLookupTool(
      supabase,
      "p1",
      minimalCtx(),
      "operator_lookup_thread_messages",
      JSON.stringify({ threadId: tid }),
    );
    const j = JSON.parse(raw) as {
      tool: string;
      result: { messages: Array<{ bodyExcerpt: string; direction: string }>; messageCount: number };
    };
    expect(j.tool).toBe("operator_lookup_thread_messages");
    expect(j.result.messageCount).toBe(1);
    expect(j.result.messages[0]!.direction).toBe("in");
    expect(j.result.messages[0]!.bodyExcerpt).toContain("June package");
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

describe("executeOperatorReadOnlyLookupTool — operator_lookup_draft", () => {
  const D_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  it("registry: draftId-only schema", () => {
    const t = OPERATOR_READ_ONLY_LOOKUP_TOOLS.find((x) => x.function.name === "operator_lookup_draft")!;
    expect(t.function.parameters?.additionalProperties).toBe(false);
    expect(t.function.parameters?.required).toEqual(["draftId"]);
    const props = t.function.parameters?.properties as Record<string, unknown> | undefined;
    expect(Object.keys(props ?? {})).toEqual(["draftId"]);
  });

  it("returns draft provenance JSON for a tenant row", async () => {
    const supabase = {
      from: (table: string) => {
        if (table !== "drafts") return {} as never;
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: D_ID,
                      thread_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                      status: "pending_approval",
                      created_at: "2026-01-15T00:00:00Z",
                      decision_mode: "ask_first",
                      source_action_key: "followup_milestone",
                      body: "Body text",
                      instruction_history: null,
                      threads: { title: "Subj", wedding_id: null, kind: "email" },
                    },
                    error: null,
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
      "operator_lookup_draft",
      JSON.stringify({ draftId: D_ID }),
    );
    const j = JSON.parse(raw) as {
      tool: string;
      result: { draft: { sourceActionKey: string | null; instructionHistoryJson: null } };
    };
    expect(j.tool).toBe("operator_lookup_draft");
    expect(j.result.draft.sourceActionKey).toBe("followup_milestone");
    expect(j.result.draft.instructionHistoryJson).toBeNull();
  });

  it("rejects extra properties on args", async () => {
    const supabase = { from: () => ({}) } as never;
    const raw = await executeOperatorReadOnlyLookupTool(
      supabase,
      "p",
      minimalCtx(),
      "operator_lookup_draft",
      JSON.stringify({ draftId: D_ID, projectId: "x" }),
    );
    const j = JSON.parse(raw) as { error: string; onlyAllowed: string[] };
    expect(j.error).toBe("invalid_arguments");
    expect(j.onlyAllowed).toEqual(["draftId"]);
  });
});

describe("executeOperatorReadOnlyLookupTool — operator_lookup_thread_queue", () => {
  const TID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

  it("registry: threadId-only schema", () => {
    const t = OPERATOR_READ_ONLY_LOOKUP_TOOLS.find((x) => x.function.name === "operator_lookup_thread_queue")!;
    expect(t.function.parameters?.additionalProperties).toBe(false);
    expect(t.function.parameters?.required).toEqual(["threadId"]);
    const props = t.function.parameters?.properties as Record<string, unknown> | undefined;
    expect(Object.keys(props ?? {})).toEqual(["threadId"]);
  });

  it("returns queue explanation JSON", async () => {
    const meta = { sender_role: "customer_lead" };
    const supabase = {
      from: (table: string) => {
        if (table === "threads") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: {
                        id: TID,
                        title: "Hi",
                        kind: "email",
                        channel: "email",
                        wedding_id: null,
                        needs_human: false,
                        automation_mode: "auto",
                        v3_operator_automation_hold: false,
                        v3_operator_hold_escalation_id: null,
                        ai_routing_metadata: meta,
                        last_activity_at: "2026-01-01T00:00:00Z",
                        status: "open",
                      },
                      error: null,
                    }),
                }),
              }),
            }),
          } as never;
        }
        if (table === "escalation_requests") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    order: () => ({
                      limit: () => Promise.resolve({ data: [], error: null }),
                    }),
                  }),
                }),
              }),
            }),
          } as never;
        }
        if (table === "drafts") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    order: () => ({
                      limit: () => Promise.resolve({ data: [], error: null }),
                    }),
                  }),
                }),
              }),
            }),
          } as never;
        }
        if (table === "v3_thread_workflow_state") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          } as never;
        }
        return {} as never;
      },
    } as never;
    const raw = await executeOperatorReadOnlyLookupTool(
      supabase,
      "photo-tool",
      minimalCtx(),
      "operator_lookup_thread_queue",
      JSON.stringify({ threadId: TID }),
    );
    const j = JSON.parse(raw) as {
      tool: string;
      result: { thread: { derivedInboxBucket: string } };
    };
    expect(j.tool).toBe("operator_lookup_thread_queue");
    expect(j.result.thread.derivedInboxBucket).toBe("inquiry");
  });
});

describe("executeOperatorReadOnlyLookupTool — operator_lookup_escalation", () => {
  const EID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

  it("registry: escalationId-only schema", () => {
    const t = OPERATOR_READ_ONLY_LOOKUP_TOOLS.find((x) => x.function.name === "operator_lookup_escalation")!;
    expect(t.function.parameters?.additionalProperties).toBe(false);
    expect(t.function.parameters?.required).toEqual(["escalationId"]);
    const props = t.function.parameters?.properties as Record<string, unknown> | undefined;
    expect(Object.keys(props ?? {})).toEqual(["escalationId"]);
  });

  it("returns escalation provenance JSON", async () => {
    const supabase = {
      from: (table: string) => {
        if (table !== "escalation_requests") return {} as never;
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: EID,
                      created_at: "2026-01-01T00:00:00Z",
                      status: "open",
                      action_key: "ak",
                      reason_code: "rc",
                      question_body: "Q?",
                      decision_justification: { a: 1 },
                      operator_delivery: "batch_later",
                      learning_outcome: null,
                      playbook_rule_id: null,
                      promote_to_playbook: false,
                      recommended_resolution: null,
                      resolution_storage_target: null,
                      resolution_text: null,
                      resolved_at: null,
                      resolved_decision_mode: null,
                      thread_id: null,
                      wedding_id: null,
                      threads: null,
                      weddings: null,
                      playbook_rules: null,
                    },
                    error: null,
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
      "operator_lookup_escalation",
      JSON.stringify({ escalationId: EID }),
    );
    const j = JSON.parse(raw) as {
      tool: string;
      result: { escalation: { actionKey: string; reasonCode: string } };
    };
    expect(j.tool).toBe("operator_lookup_escalation");
    expect(j.result.escalation.actionKey).toBe("ak");
    expect(j.result.escalation.reasonCode).toBe("rc");
  });

  it("operator_lookup_offer_builder returns bounded detailed summary for one offer project", async () => {
    const OID = "550e8400-e29b-41d4-a716-446655440000";
    const supabase = {
      from: (table: string) => {
        if (table !== "studio_offer_builder_projects") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: OID,
                      name: "Destination pack",
                      updated_at: "2026-04-01T12:00:00.000Z",
                      puck_data: {
                        root: { props: { title: "Island guide" } },
                        content: [
                          {
                            type: "PricingTier",
                            props: {
                              tierName: "Elite",
                              price: "5000",
                              features: [{ text: "Full day coverage" }],
                            },
                          },
                        ],
                      },
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        };
      },
    } as never;
    const raw = await executeOperatorReadOnlyLookupTool(
      supabase,
      "photo-tool",
      minimalCtx(),
      "operator_lookup_offer_builder",
      JSON.stringify({ offerProjectId: OID }),
    );
    const j = JSON.parse(raw) as { tool: string; result: { displayName: string; detailedSummary: string } };
    expect(j.tool).toBe("operator_lookup_offer_builder");
    expect(j.result.displayName).toBe("Destination pack");
    expect(j.result.detailedSummary).toMatch(/Elite/);
  });

  it("operator_lookup_invoice_setup returns template fields without raw logo", async () => {
    const supabase = {
      from: (table: string) => {
        expect(table).toBe("studio_invoice_setup");
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    template: {
                      legalName: "Co",
                      invoicePrefix: "X",
                      paymentTerms: "Due",
                      accentColor: "#fff",
                      footerNote: "Line",
                      logoDataUrl: "data:image/png;base64,QUFBQQ==",
                    },
                    updated_at: "2026-01-01T00:00:00.000Z",
                  },
                  error: null,
                }),
            }),
          }),
        };
      },
    } as never;
    const raw = await executeOperatorReadOnlyLookupTool(
      supabase,
      "photo-tool",
      minimalCtx(),
      "operator_lookup_invoice_setup",
      "{}",
    );
    const j = JSON.parse(raw) as { tool: string; result: { hasRow: boolean; invoicePrefix: string; logo: { hasLogo: boolean } } };
    expect(j.tool).toBe("operator_lookup_invoice_setup");
    expect(j.result.hasRow).toBe(true);
    expect(j.result.invoicePrefix).toBe("X");
    expect(j.result.logo.hasLogo).toBe(true);
    expect(JSON.stringify(j)).not.toMatch(/data:image\//);
  });
});
