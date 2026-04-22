import { describe, expect, it } from "vitest";
import {
  tryParseLlmProposedPlaybookRuleCandidate,
  validatePlaybookRuleCandidatePayload,
} from "./validatePlaybookRuleCandidatePayload.ts";

describe("validatePlaybookRuleCandidatePayload", () => {
  it("accepts a valid global proposal", () => {
    const r = validatePlaybookRuleCandidatePayload({
      proposedActionKey: "no_flash_ceremony",
      topic: "Flash",
      proposedInstruction: "No on-camera flash during ceremony.",
      proposedDecisionMode: "forbidden",
      proposedScope: "global",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.proposedChannel).toBeNull();
    }
  });

  it("rejects global + channel", () => {
    const r = validatePlaybookRuleCandidatePayload({
      proposedActionKey: "x",
      topic: "t",
      proposedInstruction: "i",
      proposedDecisionMode: "auto",
      proposedScope: "global",
      proposedChannel: "email",
    });
    expect(r.ok).toBe(false);
  });

  it("requires channel for channel scope", () => {
    const r = validatePlaybookRuleCandidatePayload({
      proposedActionKey: "x",
      topic: "t",
      proposedInstruction: "i",
      proposedDecisionMode: "auto",
      proposedScope: "channel",
    });
    expect(r.ok).toBe(false);
  });
});

describe("tryParseLlmProposedPlaybookRuleCandidate", () => {
  it("merges kind with validated body", () => {
    const r = tryParseLlmProposedPlaybookRuleCandidate({
      kind: "playbook_rule_candidate",
      proposedActionKey: "a",
      topic: "b",
      proposedInstruction: "c",
      proposedDecisionMode: "ask_first",
      proposedScope: "global",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.kind).toBe("playbook_rule_candidate");
      expect(r.value.proposedActionKey).toBe("a");
    }
  });
});
