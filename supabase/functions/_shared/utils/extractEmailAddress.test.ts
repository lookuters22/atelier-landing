import { describe, expect, it } from "vitest";
import { extractEmailAddress } from "./extractEmailAddress.ts";

describe("extractEmailAddress", () => {
  it("parses angle-bracket form", () => {
    expect(extractEmailAddress('"Name" <lead@example.com>')).toBe("lead@example.com");
  });
  it("parses bare email", () => {
    expect(extractEmailAddress("solo@example.co.uk")).toBe("solo@example.co.uk");
  });
  it("returns null for empty", () => {
    expect(extractEmailAddress("")).toBeNull();
  });
});
