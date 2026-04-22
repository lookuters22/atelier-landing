/**
 * Calendar event proposals + confirm path (F3). Bounded writes to `calendar_events` only.
 */
import type { Database } from "../../../../src/types/database.types.ts";
import type {
  InsertOperatorAssistantCalendarEventBody,
  OperatorAssistantProposedActionCalendarEventCreate,
  OperatorAssistantProposedActionCalendarEventReschedule,
} from "../../../../src/types/operatorAssistantProposedAction.types.ts";

const MAX_TITLE_LEN = 500;
/** Simple events only — no multi-day blocks from the assistant path. */
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_SPAN_FROM_NOW_MS = 5 * 365 * 24 * 60 * 60 * 1000;

const EVENT_TYPES: Database["public"]["Enums"]["event_type"][] = [
  "about_call",
  "timeline_call",
  "gallery_reveal",
  "other",
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

function trimTitle(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > MAX_TITLE_LEN ? t.slice(0, MAX_TITLE_LEN) : t;
}

function parseInstantMs(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

function assertBoundedWindow(startMs: number, endMs: number, nowMs: number): { ok: true } | { ok: false; error: string } {
  if (endMs < startMs) {
    return { ok: false, error: "endTime must be on or after startTime" };
  }
  if (endMs - startMs > MAX_DURATION_MS) {
    return { ok: false, error: "event duration must be at most 24 hours for assistant-created events" };
  }
  if (Math.abs(startMs - nowMs) > MAX_SPAN_FROM_NOW_MS) {
    return { ok: false, error: "start time is too far from today" };
  }
  return { ok: true };
}

export function validateOperatorAssistantCalendarEventPayload(
  raw: unknown,
  nowMs: number = Date.now(),
):
  | { ok: true; value: InsertOperatorAssistantCalendarEventBody }
  | { ok: false; error: string } {
  if (raw == null || typeof raw !== "object") {
    return { ok: false, error: "payload must be an object" };
  }
  const o = raw as Record<string, unknown>;
  const op = o.operation;
  if (op === "reschedule") {
    const calendarEventId =
      typeof o.calendarEventId === "string"
        ? o.calendarEventId.trim()
        : typeof o.calendar_event_id === "string"
          ? o.calendar_event_id.trim()
          : "";
    if (!calendarEventId || !isUuid(calendarEventId)) {
      return { ok: false, error: "calendarEventId must be a UUID" };
    }
    const startMs = parseInstantMs(o.startTime ?? o.start_time);
    const endMs = parseInstantMs(o.endTime ?? o.end_time);
    if (startMs == null) return { ok: false, error: "startTime is required" };
    if (endMs == null) return { ok: false, error: "endTime is required" };
    const win = assertBoundedWindow(startMs, endMs, nowMs);
    if (!win.ok) return win;
    return {
      ok: true,
      value: {
        operation: "reschedule",
        calendarEventId,
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(endMs).toISOString(),
      },
    };
  }
  if (op !== "create") {
    return { ok: false, error: "operation must be create or reschedule" };
  }

  const title = trimTitle(o.title);
  if (!title) return { ok: false, error: "title is required" };

  const startMs = parseInstantMs(o.startTime ?? o.start_time);
  const endMs = parseInstantMs(o.endTime ?? o.end_time);
  if (startMs == null) return { ok: false, error: "startTime is required" };
  if (endMs == null) return { ok: false, error: "endTime is required" };

  const win = assertBoundedWindow(startMs, endMs, nowMs);
  if (!win.ok) return win;

  let eventType: Database["public"]["Enums"]["event_type"] = "other";
  const etRaw = o.eventType ?? o.event_type;
  if (typeof etRaw === "string" && EVENT_TYPES.includes(etRaw as Database["public"]["Enums"]["event_type"])) {
    eventType = etRaw as Database["public"]["Enums"]["event_type"];
  }

  let weddingId: string | null = null;
  const wRaw = o.weddingId ?? o.wedding_id;
  if (wRaw != null) {
    if (typeof wRaw !== "string" || !wRaw.trim()) {
      return { ok: false, error: "weddingId must be a non-empty UUID when set" };
    }
    const w = wRaw.trim();
    if (!isUuid(w)) return { ok: false, error: "weddingId must be a UUID" };
    weddingId = w;
  }

  return {
    ok: true,
    value: {
      operation: "create",
      title,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      eventType,
      weddingId,
    },
  };
}

export function tryParseLlmProposedCalendarEventCreate(
  item: unknown,
):
  | { ok: true; value: OperatorAssistantProposedActionCalendarEventCreate }
  | { ok: false; reason: string } {
  if (item == null || typeof item !== "object" || (item as { kind?: unknown }).kind !== "calendar_event_create") {
    return { ok: false, reason: "not a calendar_event_create" };
  }
  const o = item as Record<string, unknown>;
  const { kind: _k, operation: _op, ...rest } = o;
  const v = validateOperatorAssistantCalendarEventPayload({ operation: "create", ...rest });
  if (!v.ok) return { ok: false, reason: v.error };
  if (v.value.operation !== "create") return { ok: false, reason: "internal" };
  return {
    ok: true,
    value: {
      kind: "calendar_event_create",
      title: v.value.title,
      startTime: v.value.startTime,
      endTime: v.value.endTime,
      eventType: v.value.eventType,
      weddingId: v.value.weddingId,
    },
  };
}

export function tryParseLlmProposedCalendarEventReschedule(
  item: unknown,
):
  | { ok: true; value: OperatorAssistantProposedActionCalendarEventReschedule }
  | { ok: false; reason: string } {
  if (item == null || typeof item !== "object" || (item as { kind?: unknown }).kind !== "calendar_event_reschedule") {
    return { ok: false, reason: "not a calendar_event_reschedule" };
  }
  const o = item as Record<string, unknown>;
  const calendarEventId =
    typeof o.calendarEventId === "string"
      ? o.calendarEventId.trim()
      : typeof o.calendar_event_id === "string"
        ? o.calendar_event_id.trim()
        : "";
  const v = validateOperatorAssistantCalendarEventPayload({
    operation: "reschedule",
    calendarEventId,
    startTime: o.startTime ?? o.start_time,
    endTime: o.endTime ?? o.end_time,
  });
  if (!v.ok) return { ok: false, reason: v.error };
  if (v.value.operation !== "reschedule") return { ok: false, reason: "internal" };
  return {
    ok: true,
    value: {
      kind: "calendar_event_reschedule",
      calendarEventId: v.value.calendarEventId,
      startTime: v.value.startTime,
      endTime: v.value.endTime,
    },
  };
}
