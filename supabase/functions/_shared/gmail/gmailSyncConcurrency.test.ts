import { describe, expect, it, vi } from "vitest";
import { runPoolWithConcurrency, shouldSkipThreadMetadataFetch } from "./gmailSyncConcurrency.ts";

describe("shouldSkipThreadMetadataFetch", () => {
  it("is true when list snippet is non-empty", () => {
    expect(shouldSkipThreadMetadataFetch({ snippet: " Hello " })).toBe(true);
  });

  it("is false when snippet missing or blank", () => {
    expect(shouldSkipThreadMetadataFetch({})).toBe(false);
    expect(shouldSkipThreadMetadataFetch({ snippet: "" })).toBe(false);
    expect(shouldSkipThreadMetadataFetch({ snippet: "   " })).toBe(false);
  });

  it("does not skip on historyId alone (still need threads.get for subject / counts)", () => {
    expect(shouldSkipThreadMetadataFetch({ historyId: "12345", snippet: "" })).toBe(false);
    expect(shouldSkipThreadMetadataFetch({ historyId: "12345" })).toBe(false);
  });
});

describe("runPoolWithConcurrency", () => {
  it("preserves per-index results", async () => {
    const out = await runPoolWithConcurrency(["a", "b", "c"], 2, async (x) => x.toUpperCase());
    expect(out).toEqual(["A", "B", "C"]);
  });

  it("caps in-flight work at concurrency", async () => {
    let active = 0;
    let max = 0;
    const n = 20;
    await runPoolWithConcurrency(
      Array.from({ length: n }, (_, i) => i),
      4,
      async (i) => {
        active += 1;
        max = Math.max(max, active);
        await new Promise((r) => setTimeout(r, 8));
        active -= 1;
        return i;
      },
    );
    expect(max).toBeLessThanOrEqual(4);
  });

  it("returns empty for empty items", async () => {
    const w = vi.fn();
    expect(await runPoolWithConcurrency([], 5, w)).toEqual([]);
    expect(w).not.toHaveBeenCalled();
  });
});
