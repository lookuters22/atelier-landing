import { describe, expect, it } from "vitest";
import { memoryScopeForWeddingBinding } from "./memoryInsertScope.ts";

describe("memoryScopeForWeddingBinding", () => {
  it("returns project when wedding id is non-empty", () => {
    expect(memoryScopeForWeddingBinding("w-1")).toBe("project");
    expect(memoryScopeForWeddingBinding("  x  ")).toBe("project");
  });

  it("returns studio for null, undefined, or blank wedding id", () => {
    expect(memoryScopeForWeddingBinding(null)).toBe("studio");
    expect(memoryScopeForWeddingBinding(undefined)).toBe("studio");
    expect(memoryScopeForWeddingBinding("")).toBe("studio");
    expect(memoryScopeForWeddingBinding("   ")).toBe("studio");
  });
});
