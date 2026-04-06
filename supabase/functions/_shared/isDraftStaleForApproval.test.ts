/**
 * execute_v3 Phase 12 Step 12C — replay stress slice: **stale-draft invalidation** only.
 *
 * Verifies the approval gate: new inbound after draft creation must block approve
 * (invalidates stale copy; operator must re-run with fresh context).
 */
import { describe, expect, it } from "vitest";
import { isDraftStaleForApproval } from "./isDraftStaleForApproval.ts";

describe("Step 12C replay — stale-draft invalidation (approval gate)", () => {
  const draftAt = "2026-04-01T12:00:00.000Z";

  it("is not stale when thread has no inbound watermark", () => {
    expect(isDraftStaleForApproval(null, draftAt)).toBe(false);
    expect(isDraftStaleForApproval("", draftAt)).toBe(false);
  });

  it("is not stale when last inbound is before or equal to draft creation", () => {
    expect(isDraftStaleForApproval("2026-04-01T11:59:59.999Z", draftAt)).toBe(false);
    expect(isDraftStaleForApproval("2026-04-01T12:00:00.000Z", draftAt)).toBe(false);
  });

  it("is stale when last inbound is strictly after draft creation", () => {
    expect(isDraftStaleForApproval("2026-04-01T12:00:00.001Z", draftAt)).toBe(true);
    expect(isDraftStaleForApproval("2026-04-02T09:00:00.000Z", draftAt)).toBe(true);
  });

  it("stress: rapid-fire ordering (client message bursts after draft)", () => {
    const created = "2026-06-15T10:00:00.000Z";
    const bursts = [
      "2026-06-15T10:00:00.001Z",
      "2026-06-15T10:00:01.000Z",
      "2026-06-15T10:05:00.000Z",
    ];
    for (const last of bursts) {
      expect(isDraftStaleForApproval(last, created)).toBe(true);
    }
  });
});
