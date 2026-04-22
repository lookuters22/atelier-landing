import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  IDLE_ASSISTANT_STUDIO_INVOICE_SETUP,
  IDLE_ASSISTANT_STUDIO_OFFER_BUILDER,
  IDLE_ASSISTANT_STUDIO_PROFILE,
  type AssistantContext,
  type AssistantOperatorStateSummary,
} from "../../../../src/types/assistantContext.types.ts";
import type { OperatorAnaCarryForwardForLlm } from "../../../../src/types/operatorAnaCarryForward.types.ts";
import { getAssistantAppCatalogForContext } from "../../../../src/lib/operatorAssistantAppCatalog.ts";
import { shouldIncludeAppCatalogInOperatorPrompt } from "../../../../src/lib/operatorAssistantAppHelpIntent.ts";
import { IDLE_ASSISTANT_THREAD_MESSAGE_BODIES } from "../context/fetchAssistantThreadMessageBodies.ts";
import { IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP } from "../context/fetchAssistantThreadMessageLookup.ts";
import { IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT } from "../context/fetchAssistantInquiryCountSnapshot.ts";
import { IDLE_ASSISTANT_CALENDAR_SNAPSHOT } from "../context/fetchAssistantOperatorCalendarSnapshot.ts";
import { deriveAssistantPlaybookCoverageSummary } from "../../../../src/lib/deriveAssistantPlaybookCoverageSummary.ts";
import { IDLE_OPERATOR_ANA_TRIAGE } from "../../../../src/lib/operatorAnaTriage.ts";
import { IDLE_OPERATOR_QUERY_ENTITY_RESOLUTION } from "../context/resolveOperatorQueryEntitiesFromIndex.ts";
import { IDLE_ASSISTANT_OPERATOR_STATE_SUMMARY } from "../context/fetchAssistantOperatorStateSummary.ts";

const EMPTY_OPERATOR_STATE: AssistantOperatorStateSummary = {
  ...IDLE_ASSISTANT_OPERATOR_STATE_SUMMARY,
  fetchedAt: "2020-01-01T00:00:00.000Z",
  sourcesNote: "",
};
import {
  applyBulkTriageSpecialistProposalGate,
  applyPlaybookAuditSpecialistProposalGate,
  handleOperatorStudioAssistantPost,
  handleOperatorStudioAssistantPostStreaming,
  parseAndValidateOperatorStudioAssistantRequest,
} from "./handleOperatorStudioAssistantPost.ts";
import { OperatorStudioAssistantValidationError } from "./operatorStudioAssistantHttp.ts";

vi.mock("../context/buildAssistantContext.ts", () => ({
  buildAssistantContext: vi.fn(),
}));

vi.mock("./completeOperatorStudioAssistantLlm.ts", () => ({
  completeOperatorStudioAssistantLlm: vi.fn(),
  completeOperatorStudioAssistantLlmStreaming: vi.fn(),
}));

import { buildAssistantContext } from "../context/buildAssistantContext.ts";
import { completeOperatorStudioAssistantLlm, completeOperatorStudioAssistantLlmStreaming } from "./completeOperatorStudioAssistantLlm.ts";

function fakeCtx(overrides: Partial<AssistantContext> = {}): AssistantContext {
  const merged = {
    clientFacingForbidden: true as const,
    photographerId: "photo-1",
    queryText: "hello",
    focusedWeddingId: null,
    focusedPersonId: null,
    playbookRules: [],
    rawPlaybookRules: [],
    authorizedCaseExceptions: [],
    crmDigest: { recentWeddings: [], recentPeople: [] },
    focusedProjectFacts: null,
    focusedProjectSummary: null,
    focusedProjectRowHints: null,
    operatorStateSummary: EMPTY_OPERATOR_STATE,
    studioProfile: IDLE_ASSISTANT_STUDIO_PROFILE,
    studioOfferBuilder: IDLE_ASSISTANT_STUDIO_OFFER_BUILDER,
    studioInvoiceSetup: IDLE_ASSISTANT_STUDIO_INVOICE_SETUP,
    memoryHeaders: [],
    selectedMemories: [],
    globalKnowledge: [],
    appCatalog: getAssistantAppCatalogForContext(),
    studioAnalysisSnapshot: null,
    carryForward: null,
    retrievalLog: {
      mode: "assistant_query" as const,
      queryDigest: { charLength: 5, fingerprint: "abcd1234" },
      scopesQueried: ["studio_memory", "playbook", "app_catalog"],
      focus: {
        weddingIdRequested: null,
        weddingIdEffective: null,
        personIdRequested: null,
        personIdEffective: null,
      },
      queryTextScopeExpansion: "none",
      memoryHeaderCount: 0,
      selectedMemoryIds: ["m1"],
      globalKnowledgeRowCount: 0,
      studioAnalysisProjectCount: null,
    },
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
    ...overrides,
  };
  const cov = deriveAssistantPlaybookCoverageSummary(merged.playbookRules);
  return {
    ...merged,
    includeAppCatalogInOperatorPrompt:
      overrides.includeAppCatalogInOperatorPrompt ?? shouldIncludeAppCatalogInOperatorPrompt(merged.queryText),
    operatorThreadMessageLookup:
      merged.operatorThreadMessageLookup ?? IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP,
    operatorThreadMessageBodies:
      merged.operatorThreadMessageBodies ?? IDLE_ASSISTANT_THREAD_MESSAGE_BODIES,
    operatorInquiryCountSnapshot:
      merged.operatorInquiryCountSnapshot ?? IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT,
    operatorCalendarSnapshot: merged.operatorCalendarSnapshot ?? IDLE_ASSISTANT_CALENDAR_SNAPSHOT,
    playbookCoverageSummary: cov,
    retrievalLog: {
      ...merged.retrievalLog,
      playbookCoverage: {
        totalActiveRules: cov.totalActiveRules,
        uniqueTopicCount: cov.uniqueTopics.length,
        uniqueActionKeyCount: cov.uniqueActionKeys.length,
      },
    },
  };
}

describe("handleOperatorStudioAssistantPost", () => {
  beforeEach(() => {
    vi.mocked(buildAssistantContext).mockReset();
    vi.mocked(completeOperatorStudioAssistantLlm).mockReset();
    vi.mocked(completeOperatorStudioAssistantLlmStreaming).mockReset();
  });

  it("builds AssistantContext then LLM reply", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "Operator answer",
      proposedActions: [],
    });

    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "What is our turnaround?",
      focusedWeddingId: "11111111-1111-1111-1111-111111111111",
      focusedPersonId: null,
    });

    expect(buildAssistantContext).toHaveBeenCalledWith({} as never, "photo-1", {
      queryText: "What is our turnaround?",
      focusedWeddingId: "11111111-1111-1111-1111-111111111111",
      focusedPersonId: null,
      carryForward: undefined,
      escalationResolverEscalationId: null,
      offerBuilderSpecialistProjectId: null,
      invoiceSetupSpecialist: false,
      investigationSpecialist: false,
      playbookAuditSpecialist: false,
      bulkTriageSpecialist: false,
    });
    expect(completeOperatorStudioAssistantLlm).toHaveBeenCalledTimes(1);
    expect(completeOperatorStudioAssistantLlm).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ conversation: [], supabase: {} }),
    );
    expect(out.reply).toBe("Operator answer");
    expect(out.clientFacingForbidden).toBe(true);
    expect(out.retrievalLog.selectedMemoryIds).toEqual(["m1"]);
    expect(out.proposedActions).toBeUndefined();
  });

  it("passes through Slice 6 proposed rule candidates when present", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "ok",
      proposedActions: [
        {
          kind: "playbook_rule_candidate",
          proposedActionKey: "a",
          topic: "T",
          proposedInstruction: "I",
          proposedDecisionMode: "forbidden",
          proposedScope: "global",
        },
      ],
    });
    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", { queryText: "Add rule" });
    expect(out.proposedActions).toHaveLength(1);
    expect(out.proposedActions![0]!.proposedActionKey).toBe("a");
  });

  it("passes through Slice 7 proposed tasks when present", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "ok",
      proposedActions: [{ kind: "task", title: "Book call", dueDate: "2026-04-20", weddingId: null }],
    });
    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", { queryText: "Add task" });
    expect(out.proposedActions).toHaveLength(1);
    expect(out.proposedActions![0]!.kind).toBe("task");
  });

  it("passes through Slice 8 proposed memory notes when present", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "ok",
      proposedActions: [
        {
          kind: "memory_note",
          memoryScope: "studio",
          title: "Note",
          summary: "S",
          fullContent: "Full",
          weddingId: null,
        },
      ],
    });
    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", { queryText: "Remember" });
    expect(out.proposedActions).toHaveLength(1);
    expect(out.proposedActions![0]!.kind).toBe("memory_note");
  });

  it("returns fallback reply when LLM fails", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlm).mockRejectedValue(new Error("openai_down"));

    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "test",
    });

    expect(out.clientFacingForbidden).toBe(true);
    expect(out.reply).toContain("retrieval succeeded");
    expect(out.reply).toContain("openai_down");
    expect(out.reply).toContain("m1");
  });

  it("rejects empty queryText", async () => {
    await expect(
      handleOperatorStudioAssistantPost({} as never, "photo-1", { queryText: "  " }),
    ).rejects.toThrow(OperatorStudioAssistantValidationError);
    await expect(
      handleOperatorStudioAssistantPost({} as never, "photo-1", { queryText: "  " }),
    ).rejects.toMatchObject({ message: "queryText is required" });
  });

  it("parseAndValidateOperatorStudioAssistantRequest matches the same queryText / conversation rules (Slice 4 pre-stream gate)", () => {
    expect(() => parseAndValidateOperatorStudioAssistantRequest({ queryText: "  " })).toThrow(
      OperatorStudioAssistantValidationError,
    );
    const v = parseAndValidateOperatorStudioAssistantRequest({ queryText: "ok" });
    expect(v.queryText).toBe("ok");
    expect(v.conversation).toEqual([]);
  });

  it("forwards validated conversation to the LLM (stateless)", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({ reply: "r", proposedActions: [] });
    const hist = [
      { role: "user" as const, content: "first?" },
      { role: "assistant" as const, content: "first answer." },
    ];
    await handleOperatorStudioAssistantPost({} as never, "photo-1", { queryText: "follow up", conversation: hist });
    expect(completeOperatorStudioAssistantLlm).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ conversation: hist, supabase: {} }),
    );
  });

  it("merges readOnlyLookupTool trace into retrievalLog when the LLM used lookup tools", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "ok",
      proposedActions: [],
      readOnlyLookupToolTrace: [{ name: "operator_lookup_inquiry_counts", ok: true }],
    });
    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", { queryText: "How many leads today?" });
    expect(out.retrievalLog.readOnlyLookupTools).toEqual([
      { name: "operator_lookup_inquiry_counts", ok: true },
    ]);
  });

  it("emits Slice 7 carry_forward telemetry (pointer + heuristic) when context has pointer and tools", async () => {
    const logSpy = vi.fn();
    const logRestore = vi.spyOn(console, "log").mockImplementation(logSpy);
    const wid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    const carry: OperatorAnaCarryForwardForLlm = {
      lastDomain: "projects",
      lastFocusedProjectId: wid,
      lastFocusedProjectType: "wedding",
      lastMentionedPersonId: null,
      lastThreadId: null,
      lastEntityAmbiguous: false,
      ageSeconds: 4,
      advisoryHint: { likelyFollowUp: true, reason: "short_cue_detected", confidence: "medium" },
    };
    vi.mocked(buildAssistantContext).mockResolvedValue(
      fakeCtx({ carryForward: carry, queryText: "When is it?" }),
    );
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "ok",
      proposedActions: [],
      readOnlyLookupToolOutcomes: [
        {
          name: "operator_lookup_project_details",
          ok: true,
          content: "{}",
          functionArguments: JSON.stringify({ projectId: wid }),
        },
      ],
    });
    await handleOperatorStudioAssistantPost({} as never, "photo-1", { queryText: "When is it?" });
    const telCall = logSpy.mock.calls
      .map((c) => c[0] as string)
      .find((s) => typeof s === "string" && s.includes("operator_ana_carry_forward_telemetry"));
    expect(telCall).toBeDefined();
    const o = JSON.parse(telCall!) as {
      type: string;
      pointer_present: boolean;
      pointer_has_ids: boolean;
      pointer_age_seconds: number | null;
      last_domain: string | null;
      llm_invoked_handler_using_pointer_heuristic: boolean;
      heuristic_note: string;
    };
    expect(o.type).toBe("operator_ana_carry_forward_telemetry");
    expect(o.pointer_present).toBe(true);
    expect(o.pointer_has_ids).toBe(true);
    expect(o.pointer_age_seconds).toBe(4);
    expect(o.last_domain).toBe("projects");
    expect(o.llm_invoked_handler_using_pointer_heuristic).toBe(true);
    expect(o.heuristic_note).toBe("project_details_arg_matches_pointer_no_resolver");
    logRestore.mockRestore();
  });

  it("passes request carryForward into buildAssistantContext and returns carryForward from extracted tool outcomes", async () => {
    const wid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    const projectsJson = {
      tool: "operator_lookup_projects",
      result: {
        weddingSignal: "unique",
        uniqueWeddingId: wid,
        weddingCandidates: [
          { weddingId: wid, couple_names: "A & B", stage: "booked", wedding_date: null, location: "Milan", project_type: "wedding" },
        ],
        personMatches: [],
        note: "",
      },
    };
    vi.mocked(buildAssistantContext).mockResolvedValue(
      fakeCtx({ focusedWeddingId: wid, queryText: "Which project" }),
    );
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "ok",
      proposedActions: [],
      readOnlyLookupToolOutcomes: [
        { name: "operator_lookup_projects", ok: true, content: JSON.stringify(projectsJson) },
      ],
    });
    const prior = {
      lastDomain: "projects" as const,
      lastFocusedProjectId: wid,
      lastFocusedProjectType: "wedding" as const,
      lastMentionedPersonId: null,
      lastThreadId: null,
      lastEntityAmbiguous: false,
      emittedAtEpochMs: Date.now() - 5_000,
      capturedFocusWeddingId: wid,
      capturedFocusPersonId: null,
    };
    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "When is it?",
      carryForward: prior,
    });
    expect(buildAssistantContext).toHaveBeenCalledWith(
      {} as never,
      "photo-1",
      expect.objectContaining({ queryText: "When is it?", carryForward: prior }),
    );
    expect(out.carryForward?.lastFocusedProjectId).toBe(wid);
    expect(out.carryForward?.emittedAtEpochMs).toBeDefined();
  });

  it("rejects invalid conversation", async () => {
    await expect(
      handleOperatorStudioAssistantPost({} as never, "photo-1", { queryText: "x", conversation: "bad" as never }),
    ).rejects.toThrow(OperatorStudioAssistantValidationError);
  });

  it("handleOperatorStudioAssistantPostStreaming: calls onToken with streamed deltas; final body matches one-shot shape", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlmStreaming).mockImplementation(async (_ctx, _opts, onToken) => {
      onToken("a");
      onToken("b");
      return { reply: "ab", proposedActions: [] };
    });
    const toks: string[] = [];
    const out = await handleOperatorStudioAssistantPostStreaming({} as never, "photo-1", { queryText: "hi" }, (d) =>
      toks.push(d),
    );
    expect(toks).toEqual(["a", "b"]);
    expect(out.reply).toBe("ab");
    expect(out.clientFacingForbidden).toBe(true);
    expect(completeOperatorStudioAssistantLlmStreaming).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ supabase: {}, conversation: [] }),
      expect.any(Function),
    );
  });

  it("handleOperatorStudioAssistantPostStreaming: propagates LLM errors (no fallback reply)", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlmStreaming).mockRejectedValue(new Error("openai_up"));
    await expect(
      handleOperatorStudioAssistantPostStreaming({} as never, "photo-1", { queryText: "hi" }, () => {}),
    ).rejects.toThrow("openai_up");
  });

  it("S1: passes escalationResolverEscalationId into buildAssistantContext", async () => {
    const eid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({ reply: "x", proposedActions: [] });
    await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "Summarize",
      escalationResolverEscalationId: eid,
    });
    expect(buildAssistantContext).toHaveBeenCalledWith(
      {} as never,
      "photo-1",
      expect.objectContaining({ escalationResolverEscalationId: eid }),
    );
  });

  it("S1: strips escalation_resolve proposals when context is not in resolver mode", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "x",
      proposedActions: [
        {
          kind: "escalation_resolve",
          escalationId: "a0eebc99-9c0b-4ef8-8bb2-111111111111",
          resolutionSummary: "Done",
        },
      ],
    });
    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", { queryText: "x" });
    expect(out.proposedActions).toBeUndefined();
  });

  it("S1: keeps escalation_resolve when resolver focus is open and ids match", async () => {
    const eid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    vi.mocked(buildAssistantContext).mockResolvedValue(
      fakeCtx({
        escalationResolverFocus: {
          pinnedEscalationId: eid,
          toolPayload: {
            selectionNote: "ok",
            escalation: { status: "open", id: eid },
          },
        },
      }),
    );
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "x",
      proposedActions: [{ kind: "escalation_resolve", escalationId: eid, resolutionSummary: "Approved" }],
    });
    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "x",
      escalationResolverEscalationId: eid,
    });
    expect(out.proposedActions).toHaveLength(1);
    expect(out.proposedActions![0]!.kind).toBe("escalation_resolve");
  });

  it("S1: strips escalation_resolve when proposal id does not match pin", async () => {
    const eid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    vi.mocked(buildAssistantContext).mockResolvedValue(
      fakeCtx({
        escalationResolverFocus: {
          pinnedEscalationId: eid,
          toolPayload: { selectionNote: "ok", escalation: { status: "open", id: eid } },
        },
      }),
    );
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "x",
      proposedActions: [
        {
          kind: "escalation_resolve",
          escalationId: "b0eebc99-9c0b-4ef8-8bb2-222222222222",
          resolutionSummary: "x",
        },
      ],
    });
    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "x",
      escalationResolverEscalationId: eid,
    });
    expect(out.proposedActions).toBeUndefined();
  });

  it("parseAndValidate: empty queryText with escalation pin gets default resolver prompt", () => {
    const eid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    const v = parseAndValidateOperatorStudioAssistantRequest({
      queryText: "  ",
      escalationResolverEscalationId: eid,
    });
    expect(v.queryText).toContain("[Escalation resolver mode]");
  });

  it("parseAndValidate: rejects non-UUID escalationResolverEscalationId", () => {
    expect(() =>
      parseAndValidateOperatorStudioAssistantRequest({
        queryText: "x",
        escalationResolverEscalationId: "not-a-uuid",
      }),
    ).toThrow(OperatorStudioAssistantValidationError);
  });

  it("parseAndValidate: rejects S1 and S2 pins together", () => {
    const eid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    const pid = "b0eebc99-9c0b-4ef8-8bb2-222222222222";
    expect(() =>
      parseAndValidateOperatorStudioAssistantRequest({
        queryText: "x",
        escalationResolverEscalationId: eid,
        offerBuilderSpecialistProjectId: pid,
      }),
    ).toThrow(OperatorStudioAssistantValidationError);
  });

  it("parseAndValidate: rejects S1 and S3 together", () => {
    const eid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    expect(() =>
      parseAndValidateOperatorStudioAssistantRequest({
        queryText: "x",
        escalationResolverEscalationId: eid,
        invoiceSetupSpecialist: true,
      }),
    ).toThrow(OperatorStudioAssistantValidationError);
  });

  it("parseAndValidate: rejects S2 and S3 together", () => {
    const pid = "b0eebc99-9c0b-4ef8-8bb2-222222222222";
    expect(() =>
      parseAndValidateOperatorStudioAssistantRequest({
        queryText: "x",
        offerBuilderSpecialistProjectId: pid,
        invoiceSetupSpecialist: true,
      }),
    ).toThrow(OperatorStudioAssistantValidationError);
  });

  it("parseAndValidate: empty queryText with invoice specialist gets default prompt", () => {
    const v = parseAndValidateOperatorStudioAssistantRequest({
      queryText: "  ",
      invoiceSetupSpecialist: true,
    });
    expect(v.queryText).toContain("[Invoice setup specialist mode]");
  });

  it("parseAndValidate: ignores non-boolean invoiceSetupSpecialist", () => {
    expect(() =>
      parseAndValidateOperatorStudioAssistantRequest({
        queryText: "",
        invoiceSetupSpecialist: "true" as never,
      }),
    ).toThrow(OperatorStudioAssistantValidationError);
  });

  it("parseAndValidate: rejects S1 and S4 together", () => {
    const eid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    expect(() =>
      parseAndValidateOperatorStudioAssistantRequest({
        queryText: "x",
        escalationResolverEscalationId: eid,
        investigationSpecialist: true,
      }),
    ).toThrow(OperatorStudioAssistantValidationError);
  });

  it("parseAndValidate: rejects S2 and S4 together", () => {
    const pid = "b0eebc99-9c0b-4ef8-8bb2-222222222222";
    expect(() =>
      parseAndValidateOperatorStudioAssistantRequest({
        queryText: "x",
        offerBuilderSpecialistProjectId: pid,
        investigationSpecialist: true,
      }),
    ).toThrow(OperatorStudioAssistantValidationError);
  });

  it("parseAndValidate: rejects S3 and S4 together", () => {
    expect(() =>
      parseAndValidateOperatorStudioAssistantRequest({
        queryText: "x",
        invoiceSetupSpecialist: true,
        investigationSpecialist: true,
      }),
    ).toThrow(OperatorStudioAssistantValidationError);
  });

  it("parseAndValidate: empty queryText with investigation gets default prompt", () => {
    const v = parseAndValidateOperatorStudioAssistantRequest({
      queryText: "  ",
      investigationSpecialist: true,
    });
    expect(v.queryText).toContain("[Investigation mode]");
  });

  it("parseAndValidate: ignores non-boolean investigationSpecialist", () => {
    expect(() =>
      parseAndValidateOperatorStudioAssistantRequest({
        queryText: "",
        investigationSpecialist: "true" as never,
      }),
    ).toThrow(OperatorStudioAssistantValidationError);
  });

  it("parseAndValidate: rejects S4 and S5 together", () => {
    expect(() =>
      parseAndValidateOperatorStudioAssistantRequest({
        queryText: "x",
        investigationSpecialist: true,
        playbookAuditSpecialist: true,
      }),
    ).toThrow(OperatorStudioAssistantValidationError);
  });

  it("parseAndValidate: rejects S5 and S6 together", () => {
    expect(() =>
      parseAndValidateOperatorStudioAssistantRequest({
        queryText: "x",
        playbookAuditSpecialist: true,
        bulkTriageSpecialist: true,
      }),
    ).toThrow(OperatorStudioAssistantValidationError);
  });

  it("parseAndValidate: rejects S4 and S6 together", () => {
    expect(() =>
      parseAndValidateOperatorStudioAssistantRequest({
        queryText: "x",
        investigationSpecialist: true,
        bulkTriageSpecialist: true,
      }),
    ).toThrow(OperatorStudioAssistantValidationError);
  });

  it("parseAndValidate: rejects S1 and S5 together", () => {
    const eid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    expect(() =>
      parseAndValidateOperatorStudioAssistantRequest({
        queryText: "x",
        escalationResolverEscalationId: eid,
        playbookAuditSpecialist: true,
      }),
    ).toThrow(OperatorStudioAssistantValidationError);
  });

  it("parseAndValidate: empty queryText with playbook audit gets default prompt", () => {
    const v = parseAndValidateOperatorStudioAssistantRequest({
      queryText: "  ",
      playbookAuditSpecialist: true,
    });
    expect(v.queryText).toContain("[Rule audit mode]");
  });

  it("parseAndValidate: ignores non-boolean playbookAuditSpecialist", () => {
    expect(() =>
      parseAndValidateOperatorStudioAssistantRequest({
        queryText: "",
        playbookAuditSpecialist: "true" as never,
      }),
    ).toThrow(OperatorStudioAssistantValidationError);
  });

  it("parseAndValidate: empty queryText with bulk triage gets default prompt", () => {
    const v = parseAndValidateOperatorStudioAssistantRequest({
      queryText: "  ",
      bulkTriageSpecialist: true,
    });
    expect(v.queryText).toContain("[Bulk triage mode]");
  });

  it("parseAndValidate: ignores non-boolean bulkTriageSpecialist", () => {
    expect(() =>
      parseAndValidateOperatorStudioAssistantRequest({
        queryText: "",
        bulkTriageSpecialist: "true" as never,
      }),
    ).toThrow(OperatorStudioAssistantValidationError);
  });

  it("parseAndValidate: empty queryText with offer-builder pin gets default specialist prompt", () => {
    const pid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    const v = parseAndValidateOperatorStudioAssistantRequest({
      queryText: "  ",
      offerBuilderSpecialistProjectId: pid,
    });
    expect(v.queryText).toContain("[Offer builder specialist mode]");
  });

  it("S2: passes offerBuilderSpecialistProjectId into buildAssistantContext", async () => {
    const pid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({ reply: "x", proposedActions: [] });
    await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "Rename help",
      offerBuilderSpecialistProjectId: pid,
    });
    expect(buildAssistantContext).toHaveBeenCalledWith(
      {} as never,
      "photo-1",
      expect.objectContaining({ offerBuilderSpecialistProjectId: pid }),
    );
  });

  it("S2: does not strip offer_builder_change_proposal when not in specialist mode", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "ok",
      proposedActions: [
        {
          kind: "offer_builder_change_proposal",
          rationale: "Rename",
          project_id: "a0eebc99-9c0b-4ef8-8bb2-111111111111",
          metadata_patch: { name: "X" },
        },
      ],
    });
    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", { queryText: "Rename offer" });
    expect(out.proposedActions).toHaveLength(1);
    expect(out.proposedActions![0]!.kind).toBe("offer_builder_change_proposal");
  });

  it("S2: strips offer_builder_change_proposal when specialist snapshot is not ok", async () => {
    const pid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    vi.mocked(buildAssistantContext).mockResolvedValue(
      fakeCtx({
        offerBuilderSpecialistFocus: {
          pinnedProjectId: pid,
          toolPayload: { selectionNote: "offer_project_not_found_or_denied" },
        },
      }),
    );
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "x",
      proposedActions: [
        {
          kind: "offer_builder_change_proposal",
          rationale: "x",
          project_id: pid,
          metadata_patch: { name: "Y" },
        },
      ],
    });
    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "x",
      offerBuilderSpecialistProjectId: pid,
    });
    expect(out.proposedActions).toBeUndefined();
  });

  it("S2: keeps offer_builder_change_proposal when specialist focus ok and project_id matches", async () => {
    const pid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    vi.mocked(buildAssistantContext).mockResolvedValue(
      fakeCtx({
        offerBuilderSpecialistFocus: {
          pinnedProjectId: pid,
          toolPayload: { selectionNote: "ok", project: { id: pid } },
        },
      }),
    );
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "x",
      proposedActions: [
        {
          kind: "offer_builder_change_proposal",
          rationale: "New hub label",
          project_id: pid,
          metadata_patch: { name: "Premium" },
        },
      ],
    });
    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "x",
      offerBuilderSpecialistProjectId: pid,
    });
    expect(out.proposedActions).toHaveLength(1);
    expect(out.proposedActions![0]!.kind).toBe("offer_builder_change_proposal");
  });

  it("S2: strips offer_builder_change_proposal when project_id does not match pin", async () => {
    const pid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    vi.mocked(buildAssistantContext).mockResolvedValue(
      fakeCtx({
        offerBuilderSpecialistFocus: {
          pinnedProjectId: pid,
          toolPayload: { selectionNote: "ok" },
        },
      }),
    );
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "x",
      proposedActions: [
        {
          kind: "offer_builder_change_proposal",
          rationale: "x",
          project_id: "b0eebc99-9c0b-4ef8-8bb2-222222222222",
          metadata_patch: { name: "Z" },
        },
      ],
    });
    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "x",
      offerBuilderSpecialistProjectId: pid,
    });
    expect(out.proposedActions).toBeUndefined();
  });

  it("S3: passes invoiceSetupSpecialist into buildAssistantContext", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({ reply: "x", proposedActions: [] });
    await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "Prefix help",
      invoiceSetupSpecialist: true,
    });
    expect(buildAssistantContext).toHaveBeenCalledWith(
      {} as never,
      "photo-1",
      expect.objectContaining({ invoiceSetupSpecialist: true }),
    );
  });

  it("S4: passes investigationSpecialist into buildAssistantContext", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({ reply: "x", proposedActions: [] });
    await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "Trace queue evidence",
      investigationSpecialist: true,
    });
    expect(buildAssistantContext).toHaveBeenCalledWith(
      {} as never,
      "photo-1",
      expect.objectContaining({ investigationSpecialist: true }),
    );
  });

  it("S5: passes playbookAuditSpecialist into buildAssistantContext", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({ reply: "x", proposedActions: [] });
    await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "Do we cover rush fees?",
      playbookAuditSpecialist: true,
    });
    expect(buildAssistantContext).toHaveBeenCalledWith(
      {} as never,
      "photo-1",
      expect.objectContaining({ playbookAuditSpecialist: true }),
    );
  });

  it("S6: passes bulkTriageSpecialist into buildAssistantContext", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({ reply: "x", proposedActions: [] });
    await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "What should I tackle first?",
      bulkTriageSpecialist: true,
    });
    expect(buildAssistantContext).toHaveBeenCalledWith(
      {} as never,
      "photo-1",
      expect.objectContaining({ bulkTriageSpecialist: true }),
    );
  });

  it("S6: keeps only the first proposed action when bulk triage focus is set", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(
      fakeCtx({
        bulkTriageSpecialistFocus: { toolPayload: { mode: "bulk_triage_queue_v1" } },
      }),
    );
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "ok",
      proposedActions: [
        {
          kind: "task",
          title: "First",
          dueDate: "2026-04-22",
        },
        {
          kind: "task",
          title: "Second",
          dueDate: "2026-04-23",
        },
      ],
    });
    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "x",
      bulkTriageSpecialist: true,
    });
    expect(out.proposedActions).toHaveLength(1);
    expect(out.proposedActions![0]!.kind).toBe("task");
    expect((out.proposedActions![0] as { title: string }).title).toBe("First");
  });

  it("S5: keeps only playbook_rule_candidate proposals when audit focus is set", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(
      fakeCtx({
        playbookAuditSpecialistFocus: { toolPayload: { mode: "rule_authoring_audit_v1" } },
      }),
    );
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "ok",
      proposedActions: [
        {
          kind: "playbook_rule_candidate",
          proposedActionKey: "rush_fee",
          topic: "Pricing",
          proposedInstruction: "Ask about rush",
          proposedDecisionMode: "forbidden",
          proposedScope: "global",
        },
        {
          kind: "task",
          title: "Follow up",
          dueDate: "2026-04-22",
        },
      ],
    });
    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "x",
      playbookAuditSpecialist: true,
    });
    expect(out.proposedActions).toHaveLength(1);
    expect(out.proposedActions![0]!.kind).toBe("playbook_rule_candidate");
  });

  it("S3: does not strip invoice_setup_change_proposal when not in specialist mode", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(fakeCtx());
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "ok",
      proposedActions: [
        {
          kind: "invoice_setup_change_proposal",
          rationale: "x",
          template_patch: { invoicePrefix: "INV" },
        },
      ],
    });
    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", { queryText: "x" });
    expect(out.proposedActions).toHaveLength(1);
  });

  it("S3: strips invoice_setup_change_proposal when specialist snapshot is not ok", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(
      fakeCtx({
        invoiceSetupSpecialistFocus: {
          toolPayload: { selectionNote: "no_invoice_setup_row" },
        },
      }),
    );
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "x",
      proposedActions: [
        {
          kind: "invoice_setup_change_proposal",
          rationale: "x",
          template_patch: { legalName: "Co" },
        },
      ],
    });
    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "x",
      invoiceSetupSpecialist: true,
    });
    expect(out.proposedActions).toBeUndefined();
  });

  it("S3: keeps invoice_setup_change_proposal when specialist focus ok", async () => {
    vi.mocked(buildAssistantContext).mockResolvedValue(
      fakeCtx({
        invoiceSetupSpecialistFocus: {
          toolPayload: { selectionNote: "ok", template: { hasRow: true } },
        },
      }),
    );
    vi.mocked(completeOperatorStudioAssistantLlm).mockResolvedValue({
      reply: "x",
      proposedActions: [
        {
          kind: "invoice_setup_change_proposal",
          rationale: "x",
          template_patch: { legalName: "Co" },
        },
      ],
    });
    const out = await handleOperatorStudioAssistantPost({} as never, "photo-1", {
      queryText: "x",
      invoiceSetupSpecialist: true,
    });
    expect(out.proposedActions).toHaveLength(1);
    expect(out.proposedActions![0]!.kind).toBe("invoice_setup_change_proposal");
  });
});

describe("applyBulkTriageSpecialistProposalGate", () => {
  it("passes actions through when bulk triage focus is absent", () => {
    const actions = [
      { kind: "task" as const, title: "A", dueDate: "2026-04-01" },
      { kind: "task" as const, title: "B", dueDate: "2026-04-02" },
    ];
    expect(applyBulkTriageSpecialistProposalGate(fakeCtx(), actions)).toEqual(actions);
  });

  it("keeps only the first proposal when bulk triage focus is set", () => {
    const ctx = fakeCtx({
      bulkTriageSpecialistFocus: { toolPayload: { mode: "bulk_triage_queue_v1" } },
    });
    const actions = [
      { kind: "task" as const, title: "A", dueDate: "2026-04-01" },
      { kind: "memory_note" as const, memoryScope: "studio" as const, title: "m", summary: "s", fullContent: "c" },
    ];
    const out = applyBulkTriageSpecialistProposalGate(ctx, actions);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("task");
  });
});

describe("applyPlaybookAuditSpecialistProposalGate", () => {
  it("passes actions through when audit focus is absent", () => {
    const actions = [{ kind: "task" as const, title: "T", dueDate: "2026-04-01" }];
    expect(applyPlaybookAuditSpecialistProposalGate(fakeCtx(), actions)).toEqual(actions);
  });

  it("keeps only playbook_rule_candidate when audit focus is set", () => {
    const ctx = fakeCtx({
      playbookAuditSpecialistFocus: { toolPayload: { mode: "rule_authoring_audit_v1" } },
    });
    const actions = [
      {
        kind: "playbook_rule_candidate" as const,
        proposedActionKey: "k",
        topic: "t",
        proposedInstruction: "i",
        proposedDecisionMode: "forbidden" as const,
        proposedScope: "global" as const,
      },
      {
        kind: "memory_note" as const,
        memoryScope: "studio" as const,
        title: "m",
        summary: "s",
        fullContent: "c",
      },
    ];
    const out = applyPlaybookAuditSpecialistProposalGate(ctx, actions);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("playbook_rule_candidate");
  });
});
