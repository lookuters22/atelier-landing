import { describe, expect, it } from "vitest";
import { computeUtcInquiryCountWindows, startOfIsoWeekUtc, startOfUtcDay } from "./operatorInquiryCountWindows.ts";

describe("computeUtcInquiryCountWindows", () => {
  it("builds this week, last week, and DB lookback from last week’s Monday (UTC, ISO weeks)", () => {
    // Wednesday 2026-04-21 15:30 UTC
    const now = new Date("2026-04-21T15:30:00.000Z");
    const w = computeUtcInquiryCountWindows(now);
    // Monday of this ISO week: 2026-04-20
    expect(w.thisWeek.start).toBe("2026-04-20T00:00:00.000Z");
    // Last week Monday: 2026-04-13
    expect(w.lastWeek.start).toBe("2026-04-13T00:00:00.000Z");
    // Same as last week start: earliest bound for loading view rows
    expect(w.dbLookbackStart).toBe(w.lastWeek.start);
    expect(w.today.start).toBe("2026-04-21T00:00:00.000Z");
    expect(w.yesterday.start).toBe("2026-04-20T00:00:00.000Z");
    expect(w.yesterday.end).toBe("2026-04-21T00:00:00.000Z");
  });

  it("aligns startOfIsoWeekUtc to Monday UTC", () => {
    const wed = new Date("2020-01-15T12:00:00.000Z");
    const mon = startOfIsoWeekUtc(wed);
    expect(mon.toISOString()).toBe("2020-01-13T00:00:00.000Z");
  });

  it("startOfUtcDay normalizes to midnight UTC", () => {
    const d = new Date("2020-01-15T12:34:56.789Z");
    expect(startOfUtcDay(d).toISOString()).toBe("2020-01-15T00:00:00.000Z");
  });
});
