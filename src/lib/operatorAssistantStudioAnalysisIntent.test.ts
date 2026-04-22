import { describe, expect, it } from "vitest";
import { shouldLoadStudioAnalysisSnapshotForQuery } from "./operatorAssistantStudioAnalysisIntent.ts";

describe("shouldLoadStudioAnalysisSnapshotForQuery (Slice 12)", () => {
  it("returns true for clear studio / pricing / data analysis questions", () => {
    expect(shouldLoadStudioAnalysisSnapshotForQuery("Should I raise my package prices for next year?")).toBe(true);
    expect(shouldLoadStudioAnalysisSnapshotForQuery("Are we undercharging compared to our average contract?")).toBe(
      true,
    );
    expect(shouldLoadStudioAnalysisSnapshotForQuery("Which packages convert best in our pipeline?")).toBe(true);
    expect(shouldLoadStudioAnalysisSnapshotForQuery("What does our recent data suggest about revenue?")).toBe(true);
  });

  it("returns false for normal CRM / app / chit-chat (regression)", () => {
    expect(shouldLoadStudioAnalysisSnapshotForQuery("hi")).toBe(false);
    expect(shouldLoadStudioAnalysisSnapshotForQuery("Where do I find drafts in the app?")).toBe(false);
    expect(shouldLoadStudioAnalysisSnapshotForQuery("What is the venue for this project?")).toBe(false);
  });
});
