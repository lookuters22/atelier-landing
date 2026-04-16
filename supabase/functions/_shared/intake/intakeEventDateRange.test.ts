import { describe, expect, it } from "vitest";
import { enrichIntakeStructuredExtraction, tryParseMultiDayRangeFromText } from "./intakeEventDateRange.ts";

describe("tryParseMultiDayRangeFromText", () => {
  it("parses Month D–D, YYYY", () => {
    const r = tryParseMultiDayRangeFromText("We are planning August 20–22, 2027 in Tuscany.");
    expect(r).not.toBeNull();
    expect(r!.startIso.slice(0, 10)).toBe("2027-08-20");
    expect(r!.endIso.slice(0, 10)).toBe("2027-08-22");
  });

  it("parses D–D Month YYYY", () => {
    const r = tryParseMultiDayRangeFromText("20-22 August 2027 weekend");
    expect(r).not.toBeNull();
    expect(r!.startIso.slice(0, 10)).toBe("2027-08-20");
    expect(r!.endIso.slice(0, 10)).toBe("2027-08-22");
  });
});

describe("enrichIntakeStructuredExtraction", () => {
  it("single-day keeps event range null", () => {
    const out = enrichIntakeStructuredExtraction("June 14, 2026 in Lake Como", {
      wedding_date: "2026-06-14T12:00:00.000Z",
      couple_names: "A & B",
    });
    expect(out.event_start_date).toBeNull();
    expect(out.event_end_date).toBeNull();
    expect(out.wedding_date?.slice(0, 10)).toBe("2026-06-14");
  });

  it("multi-day without explicit ceremony anchors wedding_date to first day (not a misleading middle day)", () => {
    const raw =
      "Destination weekend August 20-22, 2027. We need photography pricing for the full stay.";
    const out = enrichIntakeStructuredExtraction(raw, {
      couple_names: "X & Y",
      /** Model picked Saturday mid-range */
      wedding_date: "2027-08-21T12:00:00.000Z",
    });
    expect(out.event_start_date?.slice(0, 10)).toBe("2027-08-20");
    expect(out.event_end_date?.slice(0, 10)).toBe("2027-08-22");
    expect(out.wedding_date?.slice(0, 10)).toBe("2027-08-20");
  });

  it("multi-day with explicit ceremony day uses that as canonical wedding_date", () => {
    const raw =
      "Wedding weekend August 20-22, 2027 — our ceremony is on Saturday the 21st; welcome dinner is the 20th.";
    const out = enrichIntakeStructuredExtraction(raw, {
      couple_names: "A & B",
      wedding_date: "2027-08-20T12:00:00.000Z",
    });
    expect(out.wedding_date?.slice(0, 10)).toBe("2027-08-21");
  });

  it("multi-day range + LLM wedding_date outside the range => canonical date is first day", () => {
    const raw = "We're looking at August 20-22, 2027 for our destination wedding.";
    const out = enrichIntakeStructuredExtraction(raw, {
      couple_names: "A & B",
      /** Model hallucinated a date outside the stated window */
      wedding_date: "2027-08-28T12:00:00.000Z",
    });
    expect(out.wedding_date?.slice(0, 10)).toBe("2027-08-20");
    expect(out.event_start_date?.slice(0, 10)).toBe("2027-08-20");
    expect(out.event_end_date?.slice(0, 10)).toBe("2027-08-22");
  });

  it("multi-day range + ceremony_date outside the range => ignore and use first day", () => {
    const raw = "Weekend of August 20-22, 2027 — please send your brochure.";
    const out = enrichIntakeStructuredExtraction(raw, {
      couple_names: "A & B",
      wedding_date: "2027-08-21T12:00:00.000Z",
      ceremony_date: "2027-08-30T12:00:00.000Z",
    });
    expect(out.wedding_date?.slice(0, 10)).toBe("2027-08-20");
  });

  it("multi-day range + in-range ceremony_date (no explicit ceremony phrase) => use ceremony_date", () => {
    const raw = "August 20-22, 2027 in Tuscany. Need quote.";
    const out = enrichIntakeStructuredExtraction(raw, {
      couple_names: "A & B",
      wedding_date: "2027-08-28T12:00:00.000Z",
      ceremony_date: "2027-08-21T12:00:00.000Z",
    });
    expect(out.wedding_date?.slice(0, 10)).toBe("2027-08-21");
  });
});
