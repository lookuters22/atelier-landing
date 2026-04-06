import { describe, expect, it } from "vitest";
import { auditDraftTerms, buildAuthoritativeCommercialContext } from "./auditDraftCommercialTerms.ts";
import type { DecisionContext } from "../../../../src/types/decisionContext.types.ts";
import type { PlaybookRuleContextRow } from "../../../../src/types/decisionContext.types.ts";

function minimalDc(over: Partial<DecisionContext> = {}): DecisionContext {
  return {
    contextVersion: 1,
    photographerId: "p",
    weddingId: "w",
    threadId: "t",
    replyChannel: "email",
    rawMessage: "",
    crmSnapshot: {},
    recentMessages: [],
    threadSummary: null,
    memoryHeaders: [],
    selectedMemories: [],
    globalKnowledge: [],
    audience: { broadcastRisk: "low" },
    candidateWeddingIds: [],
    playbookRules: [],
    threadDraftsSummary: null,
    ...over,
  } as DecisionContext;
}

describe("auditDraftTerms", () => {
  it("passes when no commercial claims and empty playbook", () => {
    const ctx = buildAuthoritativeCommercialContext(minimalDc(), []);
    const r = auditDraftTerms(
      { package_names: [], deposit_percentage: null, travel_miles_included: null },
      ctx,
      "Thanks — we'll confirm details from your contract.",
    );
    expect(r.isValid).toBe(true);
  });

  it("fails when email prose asserts deposit % with no playbook grounding", () => {
    const ctx = buildAuthoritativeCommercialContext(minimalDc(), []);
    const r = auditDraftTerms(
      { package_names: [], deposit_percentage: null, travel_miles_included: null },
      ctx,
      "Yes, the retainer is 30% to hold your date.",
    );
    expect(r.isValid).toBe(false);
    if (r.isValid === false) {
      expect(r.violations.some((v) => v.includes("30%"))).toBe(true);
    }
  });

  it("passes when playbook includes 30% retainer and email matches", () => {
    const rules: PlaybookRuleContextRow[] = [
      {
        id: "1",
        action_key: "send_message",
        topic: "commercial",
        decision_mode: "draft_only",
        scope: "global",
        channel: null,
        instruction: "Booking requires 30% retainer to hold the date.",
        source_type: "test",
        confidence_label: "explicit",
        is_active: true,
      },
    ];
    const ctx = buildAuthoritativeCommercialContext(minimalDc(), rules);
    const r = auditDraftTerms(
      { package_names: [], deposit_percentage: 30, travel_miles_included: null },
      ctx,
      "We confirm the 30% retainer applies once the contract is signed.",
    );
    expect(r.isValid).toBe(true);
  });
});
