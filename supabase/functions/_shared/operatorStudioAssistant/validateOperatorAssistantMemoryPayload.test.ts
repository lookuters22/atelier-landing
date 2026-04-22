import { describe, expect, it } from "vitest";
import {
  tryParseLlmProposedMemoryNote,
  validateOperatorAssistantMemoryPayload,
} from "./validateOperatorAssistantMemoryPayload.ts";

describe("validateOperatorAssistantMemoryPayload (Slice 8)", () => {
  it("accepts studio scope without wedding", () => {
    const v = validateOperatorAssistantMemoryPayload({
      memoryScope: "studio",
      title: "Pref",
      summary: "Short",
      fullContent: "Longer body of the note",
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.memoryScope).toBe("studio");
      expect(v.value.weddingId).toBeNull();
    }
  });

  it("requires weddingId for project scope", () => {
    const v = validateOperatorAssistantMemoryPayload({
      memoryScope: "project",
      title: "T",
      summary: "S",
      fullContent: "F",
    });
    expect(v.ok).toBe(false);
  });

  it("rejects weddingId for studio scope", () => {
    const v = validateOperatorAssistantMemoryPayload({
      memoryScope: "studio",
      title: "T",
      summary: "S",
      fullContent: "F",
      weddingId: "11111111-1111-1111-1111-111111111111",
    });
    expect(v.ok).toBe(false);
  });
});

describe("tryParseLlmProposedMemoryNote", () => {
  it("rejects person scope in proposal JSON", () => {
    const r = tryParseLlmProposedMemoryNote({
      kind: "memory_note",
      memoryScope: "person",
      title: "x",
      summary: "y",
      fullContent: "z",
    });
    expect(r.ok).toBe(false);
  });
});
