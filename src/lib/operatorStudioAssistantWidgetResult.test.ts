import { describe, expect, it } from "vitest";
import {
  OPERATOR_STUDIO_ASSISTANT_CONTRACT_VIOLATION_MESSAGE,
  buildOperatorStudioAssistantAssistantDisplay,
} from "./operatorStudioAssistantWidgetResult.ts";

describe("buildOperatorStudioAssistantAssistantDisplay", () => {
  it("fails closed when clientFacingForbidden is missing", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay({ reply: "secret" }, { devMode: false });
    expect(d.kind).toBe("contract_violation");
    if (d.kind === "contract_violation") {
      expect(d.mainText).toBe(OPERATOR_STUDIO_ASSISTANT_CONTRACT_VIOLATION_MESSAGE);
    }
  });

  it("fails closed when clientFacingForbidden is false", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      { reply: "secret", clientFacingForbidden: false },
      { devMode: false },
    );
    expect(d.kind).toBe("contract_violation");
  });

  it("returns answer with ribbon when contract holds", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      { reply: "  ok  ", clientFacingForbidden: true },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.mainText).toBe("ok");
      expect(d.operatorRibbon).toContain("Internal assistant");
      expect(d.devRetrieval).toBeNull();
    }
  });

  it("includes devRetrieval in dev when retrievalLog is present", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "x",
        clientFacingForbidden: true,
        retrievalLog: { scopesQueried: ["a"], selectedMemoryIds: ["m1"] },
      },
      { devMode: true },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.devRetrieval).toEqual({ scopes: ["a"], memoryIds: ["m1"] });
    }
  });

  it("hides devRetrieval in production mode even if retrievalLog exists", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "x",
        clientFacingForbidden: true,
        retrievalLog: { scopesQueried: ["a"], selectedMemoryIds: [] },
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.devRetrieval).toBeNull();
    }
  });
});
