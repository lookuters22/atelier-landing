import { describe, expect, it } from "vitest";
import { validateAndNormalizeOperatorStudioAssistantConversation } from "./validateOperatorStudioAssistantConversation.ts";

describe("validateAndNormalizeOperatorStudioAssistantConversation", () => {
  it("accepts undefined as empty", () => {
    const v = validateAndNormalizeOperatorStudioAssistantConversation(undefined);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value).toEqual([]);
  });

  it("rejects non-array", () => {
    const v = validateAndNormalizeOperatorStudioAssistantConversation({});
    expect(v.ok).toBe(false);
  });

  it("rejects odd-length (incomplete pair)", () => {
    const v = validateAndNormalizeOperatorStudioAssistantConversation([{ role: "user", content: "hi" }]);
    expect(v.ok).toBe(false);
  });

  it("rejects wrong role string", () => {
    const v = validateAndNormalizeOperatorStudioAssistantConversation([
      { role: "system", content: "x" },
      { role: "assistant", content: "y" },
    ]);
    expect(v.ok).toBe(false);
  });

  it("rejects non-alternating order", () => {
    const v = validateAndNormalizeOperatorStudioAssistantConversation([
      { role: "assistant", content: "a" },
      { role: "user", content: "b" },
    ]);
    expect(v.ok).toBe(false);
  });

  it("accepts a valid pair", () => {
    const v = validateAndNormalizeOperatorStudioAssistantConversation([
      { role: "user", content: "what was it about?" },
      { role: "assistant", content: "Pricing." },
    ]);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value).toHaveLength(2);
      expect(v.value[0]!.role).toBe("user");
    }
  });
});
