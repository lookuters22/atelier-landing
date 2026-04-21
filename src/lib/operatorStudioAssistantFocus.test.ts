import { describe, expect, it } from "vitest";
import {
  deriveFocusedWeddingIdFromPathname,
  deriveOperatorAnaFocusFromPathname,
  operatorAnaFocusBadgeLabel,
} from "./operatorStudioAssistantFocus.ts";

describe("deriveFocusedWeddingIdFromPathname", () => {
  it("returns wedding id on pipeline detail", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(deriveFocusedWeddingIdFromPathname(`/pipeline/${id}`)).toBe(id);
    expect(deriveFocusedWeddingIdFromPathname(`/pipeline/${id}/`)).toBe(id);
  });

  it("returns null on pipeline root", () => {
    expect(deriveFocusedWeddingIdFromPathname("/pipeline")).toBeNull();
    expect(deriveFocusedWeddingIdFromPathname("/pipeline/")).toBeNull();
    expect(deriveFocusedWeddingIdFromPathname("/inbox/pipeline/foo")).toBeNull();
  });

  it("returns project id on offer builder edit", () => {
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    expect(deriveFocusedWeddingIdFromPathname(`/workspace/offer-builder/edit/${id}`)).toBe(id);
  });

  it("returns null elsewhere", () => {
    expect(deriveFocusedWeddingIdFromPathname("/today")).toBeNull();
    expect(deriveFocusedWeddingIdFromPathname("/inbox")).toBeNull();
  });
});

describe("deriveOperatorAnaFocusFromPathname", () => {
  it("returns pipeline surface", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    expect(deriveOperatorAnaFocusFromPathname(`/pipeline/${id}`)).toEqual({
      weddingId: id,
      surface: "pipeline",
    });
  });

  it("returns offer_builder surface", () => {
    const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    expect(deriveOperatorAnaFocusFromPathname(`/workspace/offer-builder/edit/${id}`)).toEqual({
      weddingId: id,
      surface: "offer_builder",
    });
  });
});

describe("operatorAnaFocusBadgeLabel", () => {
  it("returns null with no id", () => {
    expect(operatorAnaFocusBadgeLabel({ weddingId: null, surface: null })).toBeNull();
  });

  it("labels pipeline", () => {
    expect(
      operatorAnaFocusBadgeLabel({
        weddingId: "x",
        surface: "pipeline",
      }),
    ).toBe("Using this pipeline project");
  });

  it("labels offer builder", () => {
    expect(
      operatorAnaFocusBadgeLabel({
        weddingId: "x",
        surface: "offer_builder",
      }),
    ).toBe("Using this project's offer builder");
  });
});
