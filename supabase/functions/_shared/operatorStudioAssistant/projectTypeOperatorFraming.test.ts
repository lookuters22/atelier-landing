import { describe, expect, it } from "vitest";
import {
  displayTitleLabel,
  normalizeProjectTypeKey,
  primaryDateLabel,
  projectTypeFramingLine,
} from "./projectTypeOperatorFraming.ts";

describe("projectTypeOperatorFraming (Slice 5)", () => {
  it("normalizes to supported keys", () => {
    expect(normalizeProjectTypeKey("Wedding")).toBe("wedding");
    expect(normalizeProjectTypeKey(" unknown ")).toBe("other");
  });

  it("wedding vs commercial name / date labels differ", () => {
    expect(displayTitleLabel("wedding")).toContain("Couple");
    expect(displayTitleLabel("commercial")).toContain("Client");
    expect(primaryDateLabel("wedding")).toBe("Wedding date");
    expect(primaryDateLabel("commercial")).toBe("Event / schedule date");
  });

  it("projectTypeFramingLine includes slice marker and type id", () => {
    const s = projectTypeFramingLine("video");
    expect(s).toMatch(/Slice 5/);
    expect(s).toMatch(/video/);
  });
});
