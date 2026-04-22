import { describe, expect, it } from "vitest";
import {
  addConsumedProposalKey,
  isProposalKeyConsumed,
  memoryProposalKey,
  ruleProposalKey,
  taskProposalKey,
} from "./operatorAnaProposalConsumedState.ts";

describe("operator Ana proposal consumed state", () => {
  const rule = {
    kind: "playbook_rule_candidate" as const,
    proposedActionKey: "k",
    topic: "T",
    proposedInstruction: "I",
    proposedDecisionMode: "forbidden" as const,
    proposedScope: "global" as const,
    proposedChannel: null,
    weddingId: null,
  };
  const task = {
    kind: "task" as const,
    title: "Call",
    dueDate: "2026-01-01",
    weddingId: null,
  };
  const mem = {
    kind: "memory_note" as const,
    memoryScope: "studio" as const,
    title: "N",
    summary: "S",
    fullContent: "F",
    weddingId: null,
  };

  it("builds stable keys per proposal type", () => {
    expect(ruleProposalKey(rule)).toBe("rule:k:T");
    expect(taskProposalKey(task)).toBe("task:Call:2026-01-01:");
    expect(memoryProposalKey(mem)).toBe("memory:studio:N:");
  });

  it("marks a key consumed and blocks duplicate adds", () => {
    const mid = "msg-1";
    const k = ruleProposalKey(rule);
    let state: Record<string, string[]> = {};
    state = addConsumedProposalKey(state, mid, k);
    expect(isProposalKeyConsumed(state, mid, k)).toBe(true);
    const again = addConsumedProposalKey(state, mid, k);
    expect(again).toBe(state);
  });

  it("keeps keys isolated per assistant message id", () => {
    const k = taskProposalKey(task);
    let state: Record<string, string[]> = {};
    state = addConsumedProposalKey(state, "a", k);
    expect(isProposalKeyConsumed(state, "b", k)).toBe(false);
  });
});
