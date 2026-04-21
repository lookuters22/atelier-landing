import { describe, expect, it } from "vitest";
import type { DecisionContext } from "../../../../src/types/decisionContext.types.ts";
import { emptyCrmSnapshot } from "../../../../src/types/crmSnapshot.types.ts";
import {
  applyAudiencePrivateCommercialRedaction,
  redactOrchestratorContextInjectionForAudience,
  redactPersonaCommittedTermsForAudience,
  redactPersonaWriterFactsBlockForAudience,
  redactPlannerPrivateCommercialMultilineText,
  redactPlannerPrivateCommercialText,
} from "./applyAudiencePrivateCommercialRedaction.ts";
import type { OrchestratorContextInjection } from "../../../../src/types/decisionContext.types.ts";

const EMPTY_RETRIEVAL_TRACE: DecisionContext["retrievalTrace"] = {
  selectedMemoryIdsResolved: [],
  selectedMemoriesLoadedCount: 0,
  globalKnowledgeIdsLoaded: [],
  globalKnowledgeLoadedCount: 0,
  globalKnowledgeFetch: "skipped_by_gate",
  globalKnowledgeGateDetail: "skipped_empty_turn",
};

function baseDc(over: Partial<DecisionContext["audience"]> = {}): DecisionContext {
  return {
    contextVersion: 1,
    photographerId: "p",
    weddingId: "w",
    threadId: "t",
    replyChannel: "email",
    rawMessage: "",
    crmSnapshot: emptyCrmSnapshot(),
    recentMessages: [],
    threadSummary: "Planner commission is 15% on this package.",
    replyModeParticipantPersonIds: [],
    memoryHeaders: [
      {
        id: "h1",
        wedding_id: null,
        person_id: null,
        scope: "studio",
        type: "note",
        title: "Deal",
        summary: "Agency fee discussion with planner.",
      },
    ],
    selectedMemories: [
      {
        id: "m1",
        type: "case",
        title: "Internal",
        summary: "x",
        full_content: "Internal negotiation: 20% markup on extras.",
      },
    ],
    globalKnowledge: [],
    retrievalTrace: {
      ...EMPTY_RETRIEVAL_TRACE,
      selectedMemoryIdsResolved: ["m1"],
      selectedMemoriesLoadedCount: 1,
    },
    candidateWeddingIds: [],
    rawPlaybookRules: [],
    authorizedCaseExceptions: [],
    playbookRules: [],
    threadDraftsSummary: null,
    inboundSenderIdentity: null,
    inboundSenderAuthority: {
      bucket: "unknown",
      personId: null,
      isApprovalContact: false,
      source: "unresolved",
    },
    audience: {
      threadParticipants: [],
      agencyCcLock: null,
      broadcastRisk: "unknown",
      recipientCount: 0,
      visibilityClass: "client_visible",
      clientVisibleForPrivateCommercialRedaction: true,
      approvalContactPersonIds: [],
      ...over,
    },
  } as DecisionContext;
}

describe("applyAudiencePrivateCommercialRedaction", () => {
  it("redacts memory and summary when client-visible flag is true", () => {
    const dc = applyAudiencePrivateCommercialRedaction(baseDc());
    expect(dc.threadSummary).toContain("Redacted");
    expect(dc.selectedMemories[0].full_content).toContain("Redacted");
    expect(dc.memoryHeaders[0].summary).toContain("Redacted");
  });

  it("does not redact for planner_only", () => {
    const dc = applyAudiencePrivateCommercialRedaction(
      baseDc({
        visibilityClass: "planner_only",
        clientVisibleForPrivateCommercialRedaction: false,
      }),
    );
    expect(dc.threadSummary).toContain("Planner commission");
    expect(dc.selectedMemories[0].full_content).toContain("markup");
  });

  it("redactPlannerPrivateCommercialText replaces matching phrases", () => {
    expect(redactPlannerPrivateCommercialText("Our agency fee is 10%.")).toContain("Redacted");
    expect(redactPlannerPrivateCommercialText("Hello")).toBe("Hello");
  });

  it("redactPlannerPrivateCommercialMultilineText redacts risky lines but preserves the rest of the prompt", () => {
    const huge = [
      "Orchestrator rationale (generic): align on planner commission with the venue.",
      "=== Verification rules for the reply (mandatory) ===",
      "- Do not invent pricing.",
    ].join("\n");
    const out = redactPlannerPrivateCommercialMultilineText(huge);
    expect(out.split("\n")[0]).toContain("Redacted");
    expect(out).toContain("Verification rules");
    expect(out).toContain("Do not invent pricing");
  });

  it("redactPlannerPrivateCommercialMultilineText avoids whole-buffer replacement when commission and planner sit on different lines", () => {
    const crossLines =
      "section a mentions commission rates in general\nsection b mentions planner role only";
    const single = redactPlannerPrivateCommercialText(crossLines);
    expect(single).toBe(
      "[Redacted: planner-private commercial context — not for this audience]",
    );
    const multi = redactPlannerPrivateCommercialMultilineText(crossLines);
    expect(multi).not.toBe(single);
    expect(multi.split(/\r?\n/).length).toBe(2);
    expect(multi).toContain("commission rates");
    expect(multi).toContain("planner role");
  });

  it("redactPersonaWriterFactsBlockForAudience matches client-visible flag", () => {
    const facts = "Discuss planner commission with the venue coordinator.";
    expect(
      redactPersonaWriterFactsBlockForAudience(facts, { clientVisibleForPrivateCommercialRedaction: true }),
    ).toContain("Redacted");
    expect(
      redactPersonaWriterFactsBlockForAudience(facts, { clientVisibleForPrivateCommercialRedaction: false }),
    ).toBe(facts);
  });

  it("redactPersonaCommittedTermsForAudience redacts package_names strings for client-visible only", () => {
    const terms = {
      package_names: ["Elite", "Venue planner commission add-on"],
      deposit_percentage: 30,
      travel_miles_included: 50 as number | null,
    };
    const out = redactPersonaCommittedTermsForAudience(terms, {
      clientVisibleForPrivateCommercialRedaction: true,
    });
    expect(out.package_names[0]).toBe("Elite");
    expect(out.package_names[1]).toContain("Redacted");
    expect(out.deposit_percentage).toBe(30);
    expect(out.travel_miles_included).toBe(50);
    const passthrough = redactPersonaCommittedTermsForAudience(terms, {
      clientVisibleForPrivateCommercialRedaction: false,
    });
    expect(passthrough.package_names[1]).toContain("planner commission");
  });

  it("redactOrchestratorContextInjectionForAudience redacts injection when client-visible enforcement is on", () => {
    const inj: OrchestratorContextInjection = {
      approved_supporting_facts: ["Planner commission note in fact line"],
      action_constraints: ["Verify agency fee with planner"],
      memory_digest_lines: ["case_mem: Note — agency fee 50"],
      global_knowledge_digest_lines: ["kb1… [doc] internal markup policy"],
      retrieval_observation: {
        selected_memory_ids: [],
        global_knowledge_ids_loaded: [],
        global_knowledge_fetch: "skipped_by_gate",
        global_knowledge_gate_detail: "gate mentions planner commission rule",
        trace_line: "trace agency fee",
      },
    };
    const out = redactOrchestratorContextInjectionForAudience(inj, {
      clientVisibleForPrivateCommercialRedaction: true,
    });
    expect(out.approved_supporting_facts[0]).toContain("Redacted");
    expect(out.memory_digest_lines[0]).toContain("Redacted");
    expect(out.retrieval_observation.trace_line).toContain("Redacted");
  });

  it("redactOrchestratorContextInjectionForAudience is a no-op when planner-only (no redaction flag)", () => {
    const inj: OrchestratorContextInjection = {
      approved_supporting_facts: ["Planner commission is fine here"],
      action_constraints: [],
      memory_digest_lines: ["x"],
      global_knowledge_digest_lines: [],
      retrieval_observation: {
        selected_memory_ids: [],
        global_knowledge_ids_loaded: [],
        global_knowledge_fetch: "queried",
        global_knowledge_gate_detail: "ok",
        trace_line: "t",
      },
    };
    const out = redactOrchestratorContextInjectionForAudience(inj, {
      clientVisibleForPrivateCommercialRedaction: false,
    });
    expect(out).toEqual(inj);
  });
});
