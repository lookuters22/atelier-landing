import { describe, expect, it } from "vitest";
import { shouldAllowDraftSnapshotWrites } from "./onboardingBriefingDraftGuards.ts";

/**
 * Hook mirrors: `hasPendingDraftEdits` is set only from `updatePayload` when `briefingStatus === "completed"`.
 * Navigation does not set it — browsing a completed briefing stays non-draft for autosave.
 */
describe("shouldAllowDraftSnapshotWrites", () => {
  it("allows draft snapshots while briefing is in draft", () => {
    expect(shouldAllowDraftSnapshotWrites("draft", false)).toBe(true);
    expect(shouldAllowDraftSnapshotWrites("draft", true)).toBe(true);
  });

  it("blocks draft writes after completion until a payload edit (navigation alone keeps this false)", () => {
    expect(shouldAllowDraftSnapshotWrites("completed", false)).toBe(false);
  });

  it("allows draft snapshots after payload edit on a completed briefing (re-finalize path)", () => {
    expect(shouldAllowDraftSnapshotWrites("completed", true)).toBe(true);
  });
});
