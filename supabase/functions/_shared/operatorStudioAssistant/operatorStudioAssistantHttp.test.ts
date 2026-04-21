import { describe, expect, it } from "vitest";
import {
  OperatorStudioAssistantValidationError,
  httpStatusForOperatorStudioAssistantFailure,
} from "./operatorStudioAssistantHttp.ts";

describe("httpStatusForOperatorStudioAssistantFailure", () => {
  it("returns 400 for validation errors", () => {
    expect(
      httpStatusForOperatorStudioAssistantFailure(
        new OperatorStudioAssistantValidationError("queryText is required"),
      ),
    ).toBe(400);
  });

  it("returns 401 for Unauthorized", () => {
    expect(httpStatusForOperatorStudioAssistantFailure(new Error("Unauthorized"))).toBe(401);
  });

  it("returns 401 for missing Authorization header message", () => {
    expect(
      httpStatusForOperatorStudioAssistantFailure(
        new Error("Missing or invalid Authorization header"),
      ),
    ).toBe(401);
  });

  it("returns 500 for other errors", () => {
    expect(httpStatusForOperatorStudioAssistantFailure(new Error("database exploded"))).toBe(500);
  });

  it("returns 500 for non-Error throws", () => {
    expect(httpStatusForOperatorStudioAssistantFailure("oops")).toBe(500);
  });
});
