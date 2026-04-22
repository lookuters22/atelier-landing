import { describe, expect, it } from "vitest";
import { hasOperatorCalendarScheduleIntent } from "./operatorAssistantCalendarScheduleIntent";

describe("hasOperatorCalendarScheduleIntent", () => {
  it("is true for upcoming schedule / what’s on questions", () => {
    expect(hasOperatorCalendarScheduleIntent("What’s on Friday?")).toBe(true);
    expect(hasOperatorCalendarScheduleIntent("what's next on my calendar?")).toBe(true);
    expect(hasOperatorCalendarScheduleIntent("Do I have anything on the 26th?")).toBe(true);
    expect(hasOperatorCalendarScheduleIntent("What’s the next shoot after the Capri wedding?")).toBe(true);
    expect(hasOperatorCalendarScheduleIntent("Show me upcoming events this week")).toBe(true);
  });

  it("is false for pure calendar UI navigation (no content question)", () => {
    expect(hasOperatorCalendarScheduleIntent("How do I open the calendar?")).toBe(false);
    expect(hasOperatorCalendarScheduleIntent("Where can I find the schedule tab?")).toBe(false);
  });

  it("is true for historical and month/day schedule questions", () => {
    expect(hasOperatorCalendarScheduleIntent("What was on June 14?")).toBe(true);
    expect(hasOperatorCalendarScheduleIntent("What happened last Thursday on the calendar?")).toBe(true);
    expect(hasOperatorCalendarScheduleIntent("When did we last have a consultation?")).toBe(true);
  });

  it("is true for named couple / location schedule questions when calendar-related", () => {
    expect(hasOperatorCalendarScheduleIntent("What calendar items do Rita and James have?")).toBe(true);
    expect(hasOperatorCalendarScheduleIntent("Do we have anything in Capri that week?")).toBe(true);
    expect(hasOperatorCalendarScheduleIntent("What is scheduled around this wedding?")).toBe(true);
  });

  it("is false for lead/inquiry analytics even with week words (not schedule lookup)", () => {
    expect(
      hasOperatorCalendarScheduleIntent("How many new leads did I receive this week and last week?"),
    ).toBe(false);
  });

  it("is false for very short input", () => {
    expect(hasOperatorCalendarScheduleIntent("ok")).toBe(false);
  });
});
