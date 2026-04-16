import { beforeAll, describe, expect, it } from "vitest";
import type { MatchmakerStepResult } from "./emailIngressClassification.ts";
import { deriveEmailIngressRouting } from "./emailIngressClassification.ts";

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
