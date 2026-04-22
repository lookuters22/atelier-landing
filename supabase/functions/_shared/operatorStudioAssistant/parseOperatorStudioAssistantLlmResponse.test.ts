import { describe, expect, it } from "vitest";
import { parseOperatorStudioAssistantLlmResponse } from "./parseOperatorStudioAssistantLlmResponse.ts";

describe("parseOperatorStudioAssistantLlmResponse", () => {
  it("parses JSON with empty proposals", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({ reply: "Hi there", proposedActions: [] }),
    );
    expect(o.reply).toBe("Hi there");
    expect(o.proposedActions).toEqual([]);
  });

  it("drops invalid proposal entries and keeps the reply", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          { kind: "playbook_rule_candidate", proposedActionKey: "", topic: "t", proposedInstruction: "i", proposedDecisionMode: "auto", proposedScope: "global" },
        ],
      }),
    );
    expect(o.proposedActions).toEqual([]);
  });

  it("falls back to full text as reply when not JSON", () => {
    const o = parseOperatorStudioAssistantLlmResponse("Plain answer only");
    expect(o.reply).toBe("Plain answer only");
    expect(o.proposedActions).toEqual([]);
  });

  it("Slice 7: parses a task proposal and normalizes dueDate", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          { kind: "task", title: "Follow up with planner", dueDate: "2026-06-15T00:00:00.000Z" },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("task");
    if (o.proposedActions[0]!.kind === "task") {
      expect(o.proposedActions[0].title).toBe("Follow up with planner");
      expect(o.proposedActions[0].dueDate).toBe("2026-06-15");
    }
  });

  it("Slice 6+7: keeps both a rule and a task in one turn", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          {
            kind: "playbook_rule_candidate",
            proposedActionKey: "k1",
            topic: "T",
            proposedInstruction: "I",
            proposedDecisionMode: "auto",
            proposedScope: "global",
          },
          { kind: "task", title: "Call couple", dueDate: "2026-01-10" },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(2);
  });

  it("Slice 8: parses a studio memory_note", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "studio",
            title: "Package default",
            summary: "Signature includes 10 hours.",
            fullContent: "Signature includes 10 hours coverage.",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("memory_note");
  });

  it("Slice 8: parses a project memory_note with weddingId", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "project",
            title: "Venue constraint",
            summary: "Ceremony ends by 4pm.",
            fullContent: "Ceremony must end by 4pm local time.",
            weddingId: "11111111-1111-1111-1111-111111111111",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    if (o.proposedActions[0]!.kind === "memory_note") {
      expect(o.proposedActions[0].memoryScope).toBe("project");
      expect(o.proposedActions[0].weddingId).toBe("11111111-1111-1111-1111-111111111111");
    }
  });

  it("Slice 11: parses authorized_case_exception with wedding + override", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          {
            kind: "authorized_case_exception",
            overridesActionKey: "travel_fee",
            overridePayload: { decision_mode: "ask_first" },
            weddingId: "22222222-2222-4222-8222-222222222222",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("authorized_case_exception");
  });
});
