import { describe, expect, it } from "vitest";
import { formatWeddingDetailWhen, formatWeddingPipelineShortDate } from "./weddingDateDisplay";

describe("weddingDateDisplay", () => {
  it("shows a single long-form date when no range", () => {
    const s = formatWeddingDetailWhen({
      wedding_date: "2027-08-21T12:00:00.000Z",
      event_start_date: null,
      event_end_date: null,
    });
    expect(s).toContain("2027");
    expect(s).not.toContain("–");
  });

  it("shows range when event_start and event_end differ", () => {
    const s = formatWeddingDetailWhen({
      wedding_date: "2027-08-20T12:00:00.000Z",
      event_start_date: "2027-08-20T12:00:00.000Z",
      event_end_date: "2027-08-22T12:00:00.000Z",
    });
    expect(s).toContain("–");
  });

  it("pipeline short formatter shows en-dash range", () => {
    const s = formatWeddingPipelineShortDate({
      wedding_date: "2027-08-20T12:00:00.000Z",
      event_start_date: "2027-08-20T12:00:00.000Z",
      event_end_date: "2027-08-22T12:00:00.000Z",
    });
    expect(s).toMatch(/20.+22/);
  });

  it("detail shows Date TBD when wedding_date is null without a range", () => {
    expect(
      formatWeddingDetailWhen({
        wedding_date: null,
        event_start_date: null,
        event_end_date: null,
      }),
    ).toBe("Date TBD");
  });

  it("pipeline short shows TBD when wedding_date is null", () => {
    expect(
      formatWeddingPipelineShortDate({
        wedding_date: null,
        event_start_date: null,
        event_end_date: null,
      }),
    ).toBe("TBD");
  });
});
