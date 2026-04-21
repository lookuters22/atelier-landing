import { describe, expect, it } from "vitest";
import { inferPromotedNonWeddingProjectTypeV1 } from "./inferPromotedNonWeddingProjectTypeV1.ts";

describe("inferPromotedNonWeddingProjectTypeV1", () => {
  it("maps commercial intent to commercial", () => {
    expect(
      inferPromotedNonWeddingProjectTypeV1({
        dispatchIntent: "commercial",
        profile: null,
        threadTitle: null,
        rawMessagePreview: "",
      }),
    ).toBe("commercial");
  });

  it("detects family from message text", () => {
    expect(
      inferPromotedNonWeddingProjectTypeV1({
        dispatchIntent: "concierge",
        profile: null,
        threadTitle: "Maternity",
        rawMessagePreview: "session in May",
      }),
    ).toBe("family");
  });

  it("detects portrait from message text", () => {
    expect(
      inferPromotedNonWeddingProjectTypeV1({
        dispatchIntent: "concierge",
        profile: null,
        threadTitle: null,
        rawMessagePreview: "Need headshots for our team",
      }),
    ).toBe("portrait");
  });

  it("uses studio profile for concierge when keywords absent", () => {
    expect(
      inferPromotedNonWeddingProjectTypeV1({
        dispatchIntent: "concierge",
        profile: { service_types: ["family_maternity"] },
        threadTitle: null,
        rawMessagePreview: "session inquiry",
      }),
    ).toBe("family");
    expect(
      inferPromotedNonWeddingProjectTypeV1({
        dispatchIntent: "concierge",
        profile: { service_types: ["portraiture"] },
        threadTitle: null,
        rawMessagePreview: "session inquiry",
      }),
    ).toBe("portrait");
  });

  it("falls back to other when signals are weak", () => {
    expect(
      inferPromotedNonWeddingProjectTypeV1({
        dispatchIntent: "logistics",
        profile: { service_types: ["weddings"] },
        threadTitle: null,
        rawMessagePreview: "timing question",
      }),
    ).toBe("other");
  });
});
