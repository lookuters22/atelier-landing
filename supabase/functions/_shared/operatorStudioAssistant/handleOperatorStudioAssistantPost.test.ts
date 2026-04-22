import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AssistantContext, AssistantOperatorStateSummary } from "../../../../src/types/assistantContext.types.ts";
import type { OperatorAnaCarryForwardForLlm } from "../../../../src/types/operatorAnaCarryForward.types.ts";
import { getAssistantAppCatalogForContext } from "../../../../src/lib/operatorAssistantAppCatalog.ts";
import { shouldIncludeAppCatalogInOperatorPrompt } from "../../../../src/lib/operatorAssistantAppHelpIntent.ts";
import { IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP } from "../context/fetchAssistantThreadMessageLookup.ts";
import { IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT } from "../context/fetchAssistantInquiryCountSnapshot.ts";
import { IDLE_ASSISTANT_CALENDAR_SNAPSHOT } from "../context/fetchAssistantOperatorCalendarSnapshot.ts";
import { deriveAssistantPlaybookCoverageSummary } from "../../../../src/lib/deriveAssistantPlaybookCoverageSummary.ts";
import { IDLE_OPERATOR_QUERY_ENTITY_RESOLUTION } from "../context/resolveOperatorQueryEntitiesFromIndex.ts";

const EMPTY_OPERATOR_STATE: AssistantOperatorStateSummary = {
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
  samples: {
    pendingDrafts: [],
    openEscalations: [],
    openTasks: [],
    topActions: [],
  },
};
import {
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
    operatorInquiryCountSnapshot: IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT,
    operatorCalendarSnapshot: IDLE_ASSISTANT_CALENDAR_SNAPSHOT,
    ...overrides,
  };
  const cov = deriveAssistantPlaybookCoverageSummary(merged.playbookRules);
  return {
    ...merged,
    includeAppCatalogInOperatorPrompt:
      overrides.includeAppCatalogInOperatorPrompt ?? shouldIncludeAppCatalogInOperatorPrompt(merged.queryText),
    operatorThreadMessageLookup:
      merged.operatorThreadMessageLookup ?? IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP,
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
});
