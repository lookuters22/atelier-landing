import { describe, expect, it } from "vitest";
import { tryParseLlmProposedEscalationResolve } from "./validateOperatorAssistantEscalationResolvePayload.ts";

const OK_ID = "a0eebc99-9c0b-4ef8-8bb2-111111111111";

describe("tryParseLlmProposedEscalationResolve", () => {
  it("accepts minimal valid payload", () => {
    const r = tryParseLlmProposedEscalationResolve({
      kind: "escalation_resolve",
      escalationId: OK_ID,
      resolutionSummary: "Operator decided to refund the rush fee.",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.escalationId).toBe(OK_ID);
      expect(r.value.resolutionSummary).toContain("refund");
      expect(r.value.photographerReplyRaw).toBeNull();
    }
  });

  it("accepts optional photographerReplyRaw", () => {
    const r = tryParseLlmProposedEscalationResolve({
      kind: "escalation_resolve",
      escalationId: OK_ID,
      resolutionSummary: "Summary",
      photographerReplyRaw: "  We replied on thread.  ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.photographerReplyRaw).toBe("We replied on thread.");
    }
  });

  it("rejects bad kind, uuid, empty summary, and oversize strings", () => {
    expect(tryParseLlmProposedEscalationResolve({ kind: "task" }).ok).toBe(false);
    expect(
      tryParseLlmProposedEscalationResolve({
        kind: "escalation_resolve",
        escalationId: "nope",
        resolutionSummary: "x",
      }).ok,
    ).toBe(false);
    expect(
      tryParseLlmProposedEscalationResolve({
        kind: "escalation_resolve",
        escalationId: OK_ID,
        resolutionSummary: "",
      }).ok,
    ).toBe(false);
    expect(
      tryParseLlmProposedEscalationResolve({
        kind: "escalation_resolve",
        escalationId: OK_ID,
        resolutionSummary: "x".repeat(2001),
      }).ok,
    ).toBe(false);
    expect(
      tryParseLlmProposedEscalationResolve({
        kind: "escalation_resolve",
        escalationId: OK_ID,
        resolutionSummary: "ok",
        photographerReplyRaw: "y".repeat(8001),
      }).ok,
    ).toBe(false);
  });
});
