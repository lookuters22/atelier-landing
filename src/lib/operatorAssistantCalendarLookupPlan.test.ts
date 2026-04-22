import { describe, expect, it } from "vitest";
import { buildOperatorCalendarLookupPlan } from "./operatorAssistantCalendarLookupPlan";

const emptyEntity = {
  weddingSignal: "none" as const,
  uniqueWeddingId: null,
  queryResolvedProjectFacts: null,
};

describe("buildOperatorCalendarLookupPlan", () => {
  const ref = new Date("2026-04-22T12:00:00.000Z");

  it("exact day: past-leaning June 14 resolves to previous year when June is still ahead in current year", () => {
    const plan = buildOperatorCalendarLookupPlan({
      queryText: "What was on June 14?",
      now: ref,
      focusedWeddingId: null,
      entityResolution: emptyEntity,
      weddingIndexRows: [],
    });
    expect(plan.lookupMode).toBe("exact_day");
    expect(plan.windowStartIso).toBe("2025-06-14T00:00:00.000Z");
    expect(plan.windowEndIso).toBe("2025-06-15T00:00:00.000Z");
  });

  it("exact day: future-leaning June 14 uses current year when still in the future", () => {
    const plan = buildOperatorCalendarLookupPlan({
      queryText: "What is on June 14 on my calendar?",
      now: ref,
      focusedWeddingId: null,
      entityResolution: emptyEntity,
      weddingIndexRows: [],
    });
    expect(plan.lookupMode).toBe("exact_day");
    expect(plan.windowStartIso).toBe("2026-06-14T00:00:00.000Z");
  });

  it("last_event scans backward with optional consultation filter", () => {
    const plan = buildOperatorCalendarLookupPlan({
      queryText: "When did we last have a consultation with them?",
      now: ref,
      focusedWeddingId: null,
      entityResolution: emptyEntity,
      weddingIndexRows: [],
    });
    expect(plan.lookupMode).toBe("last_event");
    expect(plan.orderAscending).toBe(false);
    expect(plan.eventTypes).toEqual(["about_call", "timeline_call"]);
    expect(plan.windowEndIso).toBe(ref.toISOString());
  });

  it("next_event scans forward", () => {
    const plan = buildOperatorCalendarLookupPlan({
      queryText: "What is the next shoot on the calendar?",
      now: ref,
      focusedWeddingId: null,
      entityResolution: emptyEntity,
      weddingIndexRows: [],
    });
    expect(plan.lookupMode).toBe("next_event");
    expect(plan.orderAscending).toBe(true);
  });

  it("applies wedding filter when entity resolution is unique", () => {
    const plan = buildOperatorCalendarLookupPlan({
      queryText: "What calendar items do Rita and James have?",
      now: ref,
      focusedWeddingId: null,
      entityResolution: {
        weddingSignal: "unique",
        uniqueWeddingId: "w-rita",
        queryResolvedProjectFacts: {
          weddingId: "w-rita",
          couple_names: "Rita & James",
          location: "Capri",
        },
      },
      weddingIndexRows: [{ id: "w-rita", couple_names: "Rita & James", location: "Capri" }],
    });
    expect(plan.weddingId).toBe("w-rita");
    expect(plan.lookupMode).toBe("date_range");
    expect(plan.coupleNamesForFilter).toBe("Rita & James");
  });

  it("uses focused wedding for this-project phrasing", () => {
    const plan = buildOperatorCalendarLookupPlan({
      queryText: "What is scheduled around this wedding?",
      now: ref,
      focusedWeddingId: "w-focus",
      entityResolution: emptyEntity,
      weddingIndexRows: [],
    });
    expect(plan.weddingId).toBe("w-focus");
    expect(plan.lookupBasis).toMatch(/Focused project/i);
  });

  it("location hint for Capri adds title filter when no wedding filter", () => {
    const plan = buildOperatorCalendarLookupPlan({
      queryText: "Do we have anything in Capri that week?",
      now: ref,
      focusedWeddingId: null,
      entityResolution: emptyEntity,
      weddingIndexRows: [],
    });
    expect(plan.titleContains).toBe("capri");
    expect(plan.lookupMode).toBe("date_range");
  });

  it("recent_history for vague past questions without a named day", () => {
    const plan = buildOperatorCalendarLookupPlan({
      queryText: "What was on the calendar for us last season?",
      now: ref,
      focusedWeddingId: null,
      entityResolution: emptyEntity,
      weddingIndexRows: [],
    });
    expect(plan.lookupMode).toBe("recent_history");
    expect(plan.orderAscending).toBe(false);
  });

  it("defaults to upcoming rolling window", () => {
    const plan = buildOperatorCalendarLookupPlan({
      queryText: "What's next on my calendar?",
      now: ref,
      focusedWeddingId: null,
      entityResolution: emptyEntity,
      weddingIndexRows: [],
    });
    expect(plan.lookupMode).toBe("upcoming");
    expect(plan.orderAscending).toBe(true);
  });
});
