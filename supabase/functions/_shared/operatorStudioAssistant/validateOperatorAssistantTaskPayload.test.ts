import { describe, expect, it } from "vitest";
import {
  normalizeTaskDueDateForDb,
  tryParseLlmProposedTask,
  validateOperatorAssistantTaskPayload,
} from "./validateOperatorAssistantTaskPayload.ts";

describe("validateOperatorAssistantTaskPayload (Slice 7)", () => {
  it("validates and normalizes due date to YYYY-MM-DD (UTC calendar)", () => {
    const v = validateOperatorAssistantTaskPayload({
      title: "  Do the thing  ",
      dueDate: "2026-05-20T12:00:00.000Z",
      weddingId: null,
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.title).toBe("Do the thing");
      expect(v.value.dueDateNormalized).toBe("2026-05-20");
    }
  });

  it("rejects empty title", () => {
    const v = validateOperatorAssistantTaskPayload({ title: "   ", dueDate: "2026-01-01" });
    expect(v.ok).toBe(false);
  });
});

describe("tryParseLlmProposedTask", () => {
  it("returns not a task for playbook candidates", () => {
    const r = tryParseLlmProposedTask({
      kind: "playbook_rule_candidate",
      proposedActionKey: "x",
      topic: "t",
      proposedInstruction: "i",
      proposedDecisionMode: "auto",
      proposedScope: "global",
    });
    expect(r.ok).toBe(false);
  });
});

describe("normalizeTaskDueDateForDb", () => {
  it("rejects unparseable strings", () => {
    const r = normalizeTaskDueDateForDb("not a date");
    expect(r.ok).toBe(false);
  });
});
