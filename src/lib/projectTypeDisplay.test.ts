import { describe, expect, it } from "vitest";
import {
  formatProjectTypeUiLabel,
  isNonWeddingProjectType,
  projectTypeBadgeLabel,
} from "./projectTypeDisplay";

describe("projectTypeDisplay", () => {
  it("badge is null for wedding or missing", () => {
    expect(projectTypeBadgeLabel("wedding")).toBeNull();
    expect(projectTypeBadgeLabel(null)).toBeNull();
    expect(projectTypeBadgeLabel(undefined)).toBeNull();
  });

  it("badge shows for non-wedding types", () => {
    expect(projectTypeBadgeLabel("commercial")).toBe("Commercial");
    expect(projectTypeBadgeLabel("brand_content")).toBe("Brand content");
  });

  it("formatProjectTypeUiLabel includes wedding", () => {
    expect(formatProjectTypeUiLabel("wedding")).toBe("Wedding");
    expect(formatProjectTypeUiLabel("portrait")).toBe("Portrait");
  });

  it("isNonWeddingProjectType", () => {
    expect(isNonWeddingProjectType("wedding")).toBe(false);
    expect(isNonWeddingProjectType("family")).toBe(true);
    expect(isNonWeddingProjectType(null)).toBe(false);
  });
});
