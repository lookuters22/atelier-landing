import { describe, expect, it } from "vitest";
import { sanitizeInboxSearchForIlike } from "./inboxSearchSanitize";

describe("sanitizeInboxSearchForIlike", () => {
  it("trims and strips LIKE/or-breaking characters", () => {
    expect(sanitizeInboxSearchForIlike("  hello%world_ ")).toBe("hello world");
  });

  it("returns empty for whitespace-only", () => {
    expect(sanitizeInboxSearchForIlike("   , ")).toBe("");
  });
});
