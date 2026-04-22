import { describe, expect, it } from "vitest";
import {
  tryParseLlmProposedCalendarEventCreate,
  tryParseLlmProposedCalendarEventReschedule,
  validateOperatorAssistantCalendarEventPayload,
} from "./validateOperatorAssistantCalendarEventPayload.ts";

const wid = "11111111-1111-4111-8111-111111111111";
const eid = "22222222-2222-4222-a222-222222222222";

describe("validateOperatorAssistantCalendarEventPayload", () => {
  it("accepts create with null wedding", () => {
    const v = validateOperatorAssistantCalendarEventPayload(
      {
        operation: "create",
        title: "Venue call",
        startTime: "2026-05-03T14:00:00.000Z",
        endTime: "2026-05-03T15:00:00.000Z",
        eventType: "other",
        weddingId: null,
      },
      Date.parse("2026-04-01T12:00:00.000Z"),
    );
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.operation).toBe("create");
      expect(v.value.weddingId).toBeNull();
    }
  });

  it("rejects duration over 24h", () => {
    const v = validateOperatorAssistantCalendarEventPayload({
      operation: "create",
      title: "x",
      startTime: "2026-05-03T14:00:00.000Z",
      endTime: "2026-05-05T14:00:00.000Z",
      eventType: "other",
      weddingId: null,
    });
    expect(v.ok).toBe(false);
  });

  it("accepts reschedule", () => {
    const v = validateOperatorAssistantCalendarEventPayload({
      operation: "reschedule",
      calendarEventId: eid,
      startTime: "2026-05-03T16:00:00.000Z",
      endTime: "2026-05-03T17:00:00.000Z",
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.operation).toBe("reschedule");
      expect(v.value.calendarEventId).toBe(eid);
    }
  });
});

describe("tryParseLlmProposedCalendarEventCreate", () => {
  it("parses LLM-shaped object", () => {
    const r = tryParseLlmProposedCalendarEventCreate({
      kind: "calendar_event_create",
      title: "Consultation",
      startTime: "2026-05-03T15:00:00.000Z",
      endTime: "2026-05-03T16:00:00.000Z",
      eventType: "about_call",
      weddingId: wid,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.title).toBe("Consultation");
      expect(r.value.weddingId).toBe(wid);
    }
  });

  it("ignores stray operation field from model (still create)", () => {
    const r = tryParseLlmProposedCalendarEventCreate({
      kind: "calendar_event_create",
      operation: "reschedule",
      title: "Hold",
      startTime: "2026-05-03T15:00:00.000Z",
      endTime: "2026-05-03T16:00:00.000Z",
      eventType: "other",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.kind).toBe("calendar_event_create");
  });
});

describe("tryParseLlmProposedCalendarEventReschedule", () => {
  it("parses reschedule proposal", () => {
    const r = tryParseLlmProposedCalendarEventReschedule({
      kind: "calendar_event_reschedule",
      calendarEventId: eid,
      startTime: "2026-06-01T16:00:00.000Z",
      endTime: "2026-06-01T17:00:00.000Z",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.calendarEventId).toBe(eid);
    }
  });
});
