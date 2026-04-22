import { describe, expect, it } from "vitest";
import {
  validateOperatorAssistantAuthorizedCaseExceptionPayload,
} from "./validateOperatorAssistantAuthorizedCaseExceptionPayload.ts";

const validWedding = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("validateOperatorAssistantAuthorizedCaseExceptionPayload (Slice 11)", () => {
  it("accepts a minimal valid body", () => {
    const v = validateOperatorAssistantAuthorizedCaseExceptionPayload({
      overridesActionKey: "travel_fee",
      overridePayload: { decision_mode: "ask_first" },
      weddingId: validWedding,
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.weddingId).toBe(validWedding);
      expect(v.value.overridePayload).toEqual({ decision_mode: "ask_first" });
    }
  });

  it("rejects empty or non-effective override payload", () => {
    const v = validateOperatorAssistantAuthorizedCaseExceptionPayload({
      overridesActionKey: "k",
      overridePayload: {},
      weddingId: validWedding,
    });
    expect(v.ok).toBe(false);
  });

  it("rejects invalid wedding id", () => {
    const v = validateOperatorAssistantAuthorizedCaseExceptionPayload({
      overridesActionKey: "k",
      overridePayload: { decision_mode: "forbidden" },
      weddingId: "not-a-uuid",
    });
    expect(v.ok).toBe(false);
  });
});
