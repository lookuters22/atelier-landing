import { describe, expect, it } from "vitest";
import {
  IDLE_ASSISTANT_STUDIO_INVOICE_SETUP,
  IDLE_ASSISTANT_STUDIO_OFFER_BUILDER,
  IDLE_ASSISTANT_STUDIO_PROFILE,
  type AssistantContext,
} from "../../../../src/types/assistantContext.types.ts";
import type { OperatorAnaCarryForwardData, OperatorAnaCarryForwardForLlm } from "../../../../src/types/operatorAnaCarryForward.types.ts";
import { getAssistantAppCatalogForContext } from "../../../../src/lib/operatorAssistantAppCatalog.ts";
import { deriveAssistantPlaybookCoverageSummary } from "../../../../src/lib/deriveAssistantPlaybookCoverageSummary.ts";
import { IDLE_ASSISTANT_OPERATOR_STATE_SUMMARY } from "../context/fetchAssistantOperatorStateSummary.ts";
import { IDLE_ASSISTANT_THREAD_MESSAGE_BODIES } from "../context/fetchAssistantThreadMessageBodies.ts";
import { IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP } from "../context/fetchAssistantThreadMessageLookup.ts";
import { IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT } from "../context/fetchAssistantInquiryCountSnapshot.ts";
import { IDLE_ASSISTANT_CALENDAR_SNAPSHOT } from "../context/fetchAssistantOperatorCalendarSnapshot.ts";
import { IDLE_OPERATOR_ANA_TRIAGE } from "../../../../src/lib/operatorAnaTriage.ts";
import { IDLE_OPERATOR_QUERY_ENTITY_RESOLUTION } from "../context/resolveOperatorQueryEntitiesFromIndex.ts";
import {
  buildCarryForwardForLlm,
  buildOperatorAnaCarryForwardTelemetry,
  computeCarryForwardAdvisoryHint,
  extractCarryForwardDataFromTurn,
  inferLlmHandlerUsingPointerHeuristic,
  OPERATOR_ANA_CARRY_FORWARD_MAX_AGE_SECONDS,
  prepareCarryForwardForContext,
  pruneCarryForwardData,
  tryParseClientCarryForward,
} from "./operatorAssistantCarryForward.ts";
import { OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT } from "./completeOperatorStudioAssistantLlm.ts";

const emptyCtxBase = {
  clientFacingForbidden: true as const,
  photographerId: "p1",
  queryText: "Hi",
  focusedWeddingId: null as string | null,
  focusedPersonId: null as string | null,
  playbookRules: [] as never[],
  rawPlaybookRules: [] as never[],
  authorizedCaseExceptions: [] as never[],
  crmDigest: { recentWeddings: [] as never[], recentPeople: [] as never[] },
  focusedProjectFacts: null,
  focusedProjectSummary: null,
  focusedProjectRowHints: null,
  operatorStateSummary: {
    ...IDLE_ASSISTANT_OPERATOR_STATE_SUMMARY,
    fetchedAt: "2020-01-01T00:00:00.000Z",
  },
  studioProfile: IDLE_ASSISTANT_STUDIO_PROFILE,
  studioOfferBuilder: IDLE_ASSISTANT_STUDIO_OFFER_BUILDER,
  studioInvoiceSetup: IDLE_ASSISTANT_STUDIO_INVOICE_SETUP,
  memoryHeaders: [] as never[],
  selectedMemories: [] as never[],
  globalKnowledge: [] as never[],
  appCatalog: getAssistantAppCatalogForContext(),
  studioAnalysisSnapshot: null,
  carryForward: null,
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
    mode: "assistant_query" as const,
    queryDigest: { charLength: 1, fingerprint: "a" },
    scopesQueried: ["app_catalog" as const],
    focus: {
      weddingIdRequested: null,
      weddingIdEffective: null,
      personIdRequested: null,
      personIdEffective: null,
    },
    queryTextScopeExpansion: "none" as const,
    memoryHeaderCount: 0,
    selectedMemoryIds: [] as string[],
    globalKnowledgeRowCount: 0,
    studioAnalysisProjectCount: null,
  },
};

function makeCtx(overrides: Partial<AssistantContext> = {}): AssistantContext {
  const merged = { ...emptyCtxBase, includeAppCatalogInOperatorPrompt: false, ...overrides } as never;
  const m = merged as unknown as { playbookRules: never[] };
  const cov = deriveAssistantPlaybookCoverageSummary(m.playbookRules);
  return {
    ...merged,
    playbookCoverageSummary: cov,
  } as AssistantContext;
}

describe("operatorAssistantCarryForward", () => {
  it("extracts project id from operator_lookup_projects tool JSON", () => {
    const wid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    const content = JSON.stringify({
      tool: "operator_lookup_projects",
      result: {
        weddingSignal: "unique",
        uniqueWeddingId: wid,
        weddingCandidates: [
          {
            weddingId: wid,
            couple_names: "A & B",
            stage: "inquiry",
            wedding_date: null,
            location: "Como",
            project_type: "wedding",
          },
        ],
        personMatches: [],
        note: "",
      },
    });
    const d = extractCarryForwardDataFromTurn(
      makeCtx(),
      [{ name: "operator_lookup_projects", ok: true, content }],
    );
    expect(d.lastFocusedProjectId).toBe(wid);
    expect(d.lastDomain).toBe("projects");
    expect(d.lastEntityAmbiguous).toBe(false);
  });

  it("no-tool small-talk style context can yield lastDomain none", () => {
    const d = extractCarryForwardDataFromTurn(makeCtx({ includeAppCatalogInOperatorPrompt: false }), []);
    expect(d.lastDomain).toBe("none");
  });

  it("no-tool path sets lastDomain inquiry_counts when the prior turn loaded inquiry count snapshot", () => {
    const d = extractCarryForwardDataFromTurn(
      makeCtx({
        retrievalLog: {
          ...emptyCtxBase.retrievalLog,
          scopesQueried: ["operator_inquiry_count_snapshot"],
        },
        operatorInquiryCountSnapshot: { ...IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT, didRun: true },
      }),
      [],
    );
    expect(d.lastDomain).toBe("inquiry_counts");
  });

  it("operator_lookup_inquiry_counts tool sets lastDomain inquiry_counts", () => {
    const d = extractCarryForwardDataFromTurn(
      makeCtx(),
      [{ name: "operator_lookup_inquiry_counts", ok: true, content: JSON.stringify({ tool: "x", result: { ok: true } }) }],
    );
    expect(d.lastDomain).toBe("inquiry_counts");
  });

  it("operator_lookup_thread_messages tool sets lastThreadId and threads domain", () => {
    const tid = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const content = JSON.stringify({
      tool: "operator_lookup_thread_messages",
      result: {
        didRun: true,
        threadId: tid,
        threadTitle: "Subj",
        messageCount: 1,
        truncatedOverall: false,
        messages: [{ messageId: "m1", direction: "in", sender: "a@b", sentAt: "2025-01-01", bodyExcerpt: "Hi", bodyClipped: false }],
      },
    });
    const d = extractCarryForwardDataFromTurn(makeCtx(), [
      { name: "operator_lookup_thread_messages", ok: true, content },
    ]);
    expect(d.lastThreadId).toBe(tid);
    expect(d.lastDomain).toBe("threads");
  });

  it("sets lastEntityAmbiguous from ambiguous project resolver", () => {
    const content = JSON.stringify({
      tool: "operator_lookup_projects",
      result: {
        weddingSignal: "ambiguous",
        uniqueWeddingId: null,
        weddingCandidates: [
          { weddingId: "a", couple_names: "A", stage: "x", wedding_date: null, location: "L", project_type: "wedding" },
          { weddingId: "b", couple_names: "B", stage: "x", wedding_date: null, location: "L", project_type: "wedding" },
        ],
        personMatches: [],
        note: "",
      },
    });
    const d = extractCarryForwardDataFromTurn(
      makeCtx(),
      [{ name: "operator_lookup_projects", ok: true, content }],
    );
    expect(d.lastEntityAmbiguous).toBe(true);
  });

  it("advisory: short follow-up -> likelyFollowUp true; pointer data unchanged for topic / no-cue (same data)", () => {
    const data = {
      lastDomain: "projects" as const,
      lastFocusedProjectId: "a0eebc99-9c0b-4ef8-8bb2-111111111111",
      lastFocusedProjectType: "wedding" as const,
      lastMentionedPersonId: null,
      lastThreadId: null,
      lastEntityAmbiguous: false,
    };
    const short = computeCarryForwardAdvisoryHint("when is it?", { kind: "none" }, data);
    const topic = computeCarryForwardAdvisoryHint("open my playbook for flash rules", { kind: "none" }, data);
    const vague = computeCarryForwardAdvisoryHint("Milan balance please", { kind: "none" }, data);
    expect(short.likelyFollowUp).toBe(true);
    expect(topic.likelyFollowUp).toBe(false);
    expect(vague.likelyFollowUp).toBeNull();
    expect(data.lastFocusedProjectId).toBe("a0eebc99-9c0b-4ef8-8bb2-111111111111");
  });

  it("prepareCarryForwardForContext: age_expired returns explicit cleared view (non-null)", () => {
    const now = 1_700_000_000_000;
    const t0 = now - (OPERATOR_ANA_CARRY_FORWARD_MAX_AGE_SECONDS + 10) * 1000;
    const inc = {
      lastDomain: "projects" as const,
      lastFocusedProjectId: "a0eebc99-9c0b-4ef8-8bb2-111111111111",
      lastFocusedProjectType: "wedding" as const,
      lastMentionedPersonId: null,
      lastThreadId: null,
      lastEntityAmbiguous: false,
      emittedAtEpochMs: t0,
      capturedFocusWeddingId: "a0eebc99-9c0b-4ef8-8bb2-111111111111" as string | null,
      capturedFocusPersonId: null,
    };
    const dataOnly: OperatorAnaCarryForwardData = {
      lastDomain: inc.lastDomain,
      lastFocusedProjectId: inc.lastFocusedProjectId,
      lastFocusedProjectType: inc.lastFocusedProjectType,
      lastMentionedPersonId: inc.lastMentionedPersonId,
      lastThreadId: inc.lastThreadId,
      lastEntityAmbiguous: inc.lastEntityAmbiguous,
    };
    const { data, prune } = pruneCarryForwardData(
      dataOnly,
      now,
      { emittedAtEpochMs: t0, capturedFocusWeddingId: inc.capturedFocusWeddingId, capturedFocusPersonId: inc.capturedFocusPersonId },
      { weddingId: inc.capturedFocusWeddingId, personId: null },
    );
    expect(prune.kind).toBe("age_expired");
    expect(data.lastFocusedProjectId).toBeNull();
    const forLlm = prepareCarryForwardForContext(tryParseClientCarryForward(inc)!, {
      weddingId: inc.capturedFocusWeddingId,
      personId: null,
    }, "and when?", now);
    expect(forLlm).not.toBeNull();
    expect(forLlm!.lastDomain).toBe("none");
    expect(forLlm!.lastFocusedProjectId).toBeNull();
    expect(forLlm!.advisoryHint.reason).toBe("age_expired");
    expect(forLlm!.advisoryHint.likelyFollowUp).toBe(false);
    expect(forLlm!.advisoryHint.confidence).toBe("high");
    expect(forLlm!.ageSeconds).toBeGreaterThan(OPERATOR_ANA_CARRY_FORWARD_MAX_AGE_SECONDS);
  });

  it("prepareCarryForwardForContext: focus_changed returns explicit cleared view (non-null)", () => {
    const now = 1_750_000_000_000;
    const inc = {
      lastDomain: "projects" as const,
      lastFocusedProjectId: "a0eebc99-9c0b-4ef8-8bb2-111111111111",
      lastFocusedProjectType: "wedding" as const,
      lastMentionedPersonId: null,
      lastThreadId: null,
      lastEntityAmbiguous: false,
      emittedAtEpochMs: now - 1_000,
      capturedFocusWeddingId: "a0eebc99-9c0b-4ef8-8bb2-111111111111" as string | null,
      capturedFocusPersonId: null,
    };
    const dataOnly2: OperatorAnaCarryForwardData = {
      lastDomain: inc.lastDomain,
      lastFocusedProjectId: inc.lastFocusedProjectId,
      lastFocusedProjectType: inc.lastFocusedProjectType,
      lastMentionedPersonId: inc.lastMentionedPersonId,
      lastThreadId: inc.lastThreadId,
      lastEntityAmbiguous: inc.lastEntityAmbiguous,
    };
    const { prune } = pruneCarryForwardData(
      dataOnly2,
      now,
      { emittedAtEpochMs: inc.emittedAtEpochMs, capturedFocusWeddingId: inc.capturedFocusWeddingId, capturedFocusPersonId: inc.capturedFocusPersonId },
      { weddingId: "b0eebc99-9c0b-4ef8-8bb2-222222222222", personId: null },
    );
    expect(prune.kind).toBe("focus_changed");
    const forLlm = prepareCarryForwardForContext(tryParseClientCarryForward(inc)!, {
      weddingId: "b0eebc99-9c0b-4ef8-8bb2-222222222222",
      personId: null,
    }, "What about this one?", now);
    expect(forLlm).not.toBeNull();
    expect(forLlm!.lastDomain).toBe("none");
    expect(forLlm!.advisoryHint.reason).toBe("focus_changed");
    expect(forLlm!.advisoryHint.likelyFollowUp).toBe(false);
    expect(forLlm!.advisoryHint.confidence).toBe("high");
  });

  it("prepareCarryForwardForContext returns null with no client carry-forward (first turn)", () => {
    expect(
      prepareCarryForwardForContext(null, { weddingId: null, personId: null }, "Hello", 1_700_000_000_000),
    ).toBeNull();
  });
});

describe("Slice 7 — telemetry (pure)", () => {
  const wid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
  it("buildOperatorAnaCarryForwardTelemetry includes pointer and advisory when carryForward is set", () => {
    const cf: OperatorAnaCarryForwardForLlm = {
      lastDomain: "projects",
      lastFocusedProjectId: wid,
      lastFocusedProjectType: "wedding",
      lastMentionedPersonId: null,
      lastThreadId: null,
      lastEntityAmbiguous: false,
      ageSeconds: 9,
      advisoryHint: { likelyFollowUp: true, reason: "short_cue_detected", confidence: "low" },
    };
    const t = buildOperatorAnaCarryForwardTelemetry(
      makeCtx({ carryForward: cf }),
      [{ name: "operator_lookup_inquiry_counts", ok: true, functionArguments: "{}" }],
    );
    expect(t.type).toBe("operator_ana_carry_forward_telemetry");
    expect(t.pointer_present).toBe(true);
    expect(t.pointer_has_ids).toBe(true);
    expect(t.pointer_age_seconds).toBe(9);
    expect(t.advisory_likely_follow_up).toBe("true");
    expect(t.last_domain).toBe("projects");
  });

  it("advisory hint varies by query class but prior-turn pointer id fields are stable", () => {
    const nowMs = 1_800_000_000_000;
    const emittedAt = 1_799_999_000_000;
    const data: OperatorAnaCarryForwardData = {
      lastDomain: "projects",
      lastFocusedProjectId: "a0eebc99-9c0b-4ef8-8bb2-111111111111",
      lastFocusedProjectType: "wedding",
      lastMentionedPersonId: "b0eebc99-9c0b-4ef8-8bb2-222222222222",
      lastThreadId: "c0eebc99-9c0b-4ef8-8bb2-333333333333",
      lastEntityAmbiguous: false,
    };
    const prune = { kind: "none" as const };
    const aShort = computeCarryForwardAdvisoryHint("when is it?", prune, data);
    const aTopic = computeCarryForwardAdvisoryHint("add a new playbook task for the calendar", prune, data);
    const aVague = computeCarryForwardAdvisoryHint("Milan open balance for this", prune, data);
    expect(aShort.likelyFollowUp).toBe(true);
    expect(aShort.reason).toBe("short_cue_detected");
    expect(aTopic.likelyFollowUp).toBe(false);
    expect(aTopic.reason).toBe("topic_change_shaped");
    expect(aVague.likelyFollowUp).toBeNull();
    expect(aVague.reason).toBe("no_cue_detected");
    const v1 = buildCarryForwardForLlm(data, aShort, nowMs, emittedAt);
    const v2 = buildCarryForwardForLlm(data, aTopic, nowMs, emittedAt);
    const v3 = buildCarryForwardForLlm(data, aVague, nowMs, emittedAt);
    for (const v of [v1, v2, v3]) {
      expect(v.lastDomain).toBe(data.lastDomain);
      expect(v.lastFocusedProjectId).toBe(data.lastFocusedProjectId);
      expect(v.lastFocusedProjectType).toBe(data.lastFocusedProjectType);
      expect(v.lastMentionedPersonId).toBe(data.lastMentionedPersonId);
      expect(v.lastThreadId).toBe(data.lastThreadId);
      expect(v.lastEntityAmbiguous).toBe(data.lastEntityAmbiguous);
    }
    expect(v1.advisoryHint).not.toEqual(v2.advisoryHint);
  });

  it("inferLlmHandlerUsingPointerHeuristic is false with no tools", () => {
    const cf: OperatorAnaCarryForwardForLlm = {
      lastDomain: "projects",
      lastFocusedProjectId: wid,
      lastFocusedProjectType: "wedding",
      lastMentionedPersonId: null,
      lastThreadId: null,
      lastEntityAmbiguous: false,
      ageSeconds: 1,
      advisoryHint: { likelyFollowUp: null, reason: "no_cue_detected", confidence: "low" },
    };
    const h = inferLlmHandlerUsingPointerHeuristic(cf, []);
    expect(h.value).toBe(false);
    expect(h.note).toBe("no_tool_outcomes");
  });
});

describe("Slice 6 system prompt (golden)", () => {
  it("includes the follow-up resolution paragraph exactly once (canonical text)", () => {
    const p = OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT;
    const matches = p.match(/\*\*Follow-up resolution \(Slice 6 — carry-forward pointer\):\*\*/g);
    expect(matches?.length).toBe(1);
    expect(p).toMatch(/Carry-forward pointer/);
  });
});
