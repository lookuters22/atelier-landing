import { describe, expect, it } from "vitest";
import { offerBuilderProjectPinToolPayload } from "./fetchAssistantOfferBuilderProjectPin.ts";

describe("offerBuilderProjectPinToolPayload", () => {
  it("serializes snapshot for operator context / LLM", () => {
    const p = offerBuilderProjectPinToolPayload({
      didRun: true,
      selectionNote: "ok",
      projectId: "a0eebc99-9c0b-4ef8-8bb2-111111111111",
      displayName: "Test offer",
      updatedAt: "2026-01-01T00:00:00.000Z",
      compactSummary: "outline",
    });
    expect(p.selectionNote).toBe("ok");
    expect(p.evidenceNote).toMatch(/studio_offer_builder_projects/);
    const proj = p.project as { id: string; displayName: string };
    expect(proj.id).toContain("11111111");
    expect(proj.displayName).toBe("Test offer");
  });
});
