import { describe, expect, it, vi } from "vitest";
import { runIntakeExtractionAndResearch } from "./intakeExtraction.ts";

const emptyExtraction = {
  couple_names: "Unknown",
  wedding_date: null,
  event_start_date: null,
  event_end_date: null,
  location: null,
  budget: null,
  story_notes: "",
  raw_facts: "",
} as const;

describe("runIntakeExtractionAndResearch", () => {
  it("returns default extraction without fetch when message is empty or whitespace-only", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(runIntakeExtractionAndResearch("")).resolves.toEqual(emptyExtraction);
    await expect(runIntakeExtractionAndResearch("  \n\t  ")).resolves.toEqual(emptyExtraction);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
