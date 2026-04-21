import { beforeAll, describe, expect, it } from "vitest";
import type { MatchmakerStepResult } from "./emailIngressClassification.ts";
import {
  buildAiRoutingMetadataForUnresolved,
  deriveEmailIngressRouting,
  shouldInvokeNonWeddingBusinessInquiryPolicyForGmailCanonical,
} from "./emailIngressClassification.ts";

beforeAll(() => {
  (globalThis as unknown as { Deno?: { env: { get: (k: string) => string | undefined } } }).Deno = {
    env: { get: () => undefined },
  };
});

const emptyMatch: MatchmakerStepResult = {
  weddingId: null,
  match: null,
  matchmaker_invoked: false,
  matchmaker_skip_reason: "test",
};

describe("deriveEmailIngressRouting gmail_canonical", () => {
  it("does not coerce unlinked dispatch to intake when LLM said concierge", () => {
    const out = deriveEmailIngressRouting({
      identity: { weddingId: null, photographerId: "p1", projectStage: null },
      llmIntent: "concierge",
      stageGateIntent: "concierge",
      matchResult: emptyMatch,
      payloadPhotographerId: "p1",
      boundedUnresolvedSubsetEligible: false,
      derivePolicy: "gmail_canonical",
    });
    expect(out.finalWeddingId).toBeNull();
    expect(out.dispatchIntent).toBe("concierge");
  });

  it("legacy policy still forces intake when no wedding resolved", () => {
    const out = deriveEmailIngressRouting({
      identity: { weddingId: null, photographerId: "p1", projectStage: null },
      llmIntent: "concierge",
      stageGateIntent: "intake",
      matchResult: emptyMatch,
      payloadPhotographerId: "p1",
      boundedUnresolvedSubsetEligible: false,
      derivePolicy: "legacy",
    });
    expect(out.dispatchIntent).toBe("intake");
  });
});

describe("non-wedding policy gate (gmail canonical post-ingest)", () => {
  it("buildAiRoutingMetadataForUnresolved is non-null for any match suggestion without final wedding", () => {
    const meta = buildAiRoutingMetadataForUnresolved({
      finalWeddingId: null,
      dispatchIntent: "concierge",
      nearMatchForApproval: false,
      matchResult: {
        weddingId: null,
        matchmaker_invoked: true,
        matchmaker_skip_reason: "test",
        match: {
          suggested_wedding_id: "w-suggest",
          confidence_score: 0.2,
          reasoning: "weak guess",
        },
      },
    });
    expect(meta).not.toBeNull();
    expect(meta?.routing_disposition).toBe("suggested_match_unresolved");
  });

  it("should still invoke non-wedding policy when only a weak match suggestion exists (not near-match approval)", () => {
    expect(
      shouldInvokeNonWeddingBusinessInquiryPolicyForGmailCanonical({
        finalWeddingId: null,
        linkedProjectAtStart: false,
        llmIntent: "concierge",
        nearMatchForApproval: false,
      }),
    ).toBe(true);
  });

  it("does not invoke non-wedding policy in the near-match approval escalation lane", () => {
    expect(
      shouldInvokeNonWeddingBusinessInquiryPolicyForGmailCanonical({
        finalWeddingId: null,
        linkedProjectAtStart: false,
        llmIntent: "concierge",
        nearMatchForApproval: true,
      }),
    ).toBe(false);
  });
});
