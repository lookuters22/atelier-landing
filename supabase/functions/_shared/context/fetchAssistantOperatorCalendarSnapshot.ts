import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../src/types/database.types.ts";
import type { AssistantOperatorCalendarSnapshot } from "../../../../src/types/assistantContext.types.ts";
import {
  OPERATOR_ASSISTANT_CALENDAR_MAX_EVENTS,
  type OperatorCalendarLookupPlan,
} from "../../../../src/lib/operatorAssistantCalendarLookupPlan.ts";

export { OPERATOR_ASSISTANT_CALENDAR_MAX_EVENTS } from "../../../../src/lib/operatorAssistantCalendarLookupPlan.ts";

const IDLE: AssistantOperatorCalendarSnapshot = {
  didRun: false,
  computedAt: "1970-01-01T00:00:00.000Z",
  lookupMode: "idle",
  lookupBasis: "",
  windowStartIso: "",
  windowEndIso: "",
  windowLabel: "",
  windowDays: 0,
  maxRows: OPERATOR_ASSISTANT_CALENDAR_MAX_EVENTS,
  rowCountReturned: 0,
  truncated: false,
  timeZoneNote:
    "Event times are stored as timestamptz; listed in ISO 8601 (UTC in suffix). The UI may show local time — do not convert unless the operator asks in a local frame.",
  semanticsNote: "Not run — only loaded for calendar / scheduling content questions (see hasOperatorCalendarScheduleIntent).",
  weddingFilter: null,
  titleContains: null,
  eventTypeFilter: null,
  orderAscending: true,
  events: [],
};

export const IDLE_ASSISTANT_CALENDAR_SNAPSHOT = IDLE;

type EventType = Database["public"]["Enums"]["event_type"];

const EVENT_TYPE_LABEL: Record<EventType, string> = {
  about_call: "About call",
  timeline_call: "Timeline call",
  gallery_reveal: "Gallery reveal",
  other: "Other",
};

export type FetchAssistantOperatorCalendarSnapshotInput = {
  now?: Date;
  plan: OperatorCalendarLookupPlan;
};

/**
 * Bounded `calendar_events` for the tenant from a deterministic lookup plan (read-only).
 * No Google Calendar; DB rows only.
 */
export async function fetchAssistantOperatorCalendarSnapshot(
  supabase: SupabaseClient,
  photographerId: string,
  input: FetchAssistantOperatorCalendarSnapshotInput,
): Promise<AssistantOperatorCalendarSnapshot> {
  const now = input.now ?? new Date();
  const plan = input.plan;

  let query = supabase
    .from("calendar_events")
    .select("id, title, start_time, end_time, event_type, wedding_id, meeting_link")
    .eq("photographer_id", photographerId)
    .gte("start_time", plan.windowStartIso)
    .lt("start_time", plan.windowEndIso);

  if (plan.weddingId) {
    query = query.eq("wedding_id", plan.weddingId);
  }
  if (plan.titleContains && plan.titleContains.length > 0) {
    query = query.ilike("title", `%${plan.titleContains}%`);
  }
  if (plan.eventTypes != null && plan.eventTypes.length > 0) {
    query = query.in("event_type", plan.eventTypes);
  }

  query = query.order("start_time", { ascending: plan.orderAscending }).limit(OPERATOR_ASSISTANT_CALENDAR_MAX_EVENTS + 1);

  const { data, error } = await query;

  if (error) {
    throw new Error(`fetchAssistantOperatorCalendarSnapshot: ${error.message}`);
  }

  const raw = data ?? [];
  const truncated = raw.length > OPERATOR_ASSISTANT_CALENDAR_MAX_EVENTS;
  const rows = truncated ? raw.slice(0, OPERATOR_ASSISTANT_CALENDAR_MAX_EVENTS) : raw;

  const weddingIds = [
    ...new Set(
      rows
        .map((r) => (r as { wedding_id: string | null }).wedding_id)
        .filter((id): id is string => id != null && String(id).length > 0),
    ),
  ];

  let nameByWedding = new Map<string, string>();
  if (weddingIds.length > 0) {
    const { data: weds, error: wErr } = await supabase
      .from("weddings")
      .select("id, couple_names")
      .eq("photographer_id", photographerId)
      .in("id", weddingIds);
    if (wErr) {
      throw new Error(`fetchAssistantOperatorCalendarSnapshot (weddings): ${wErr.message}`);
    }
    for (const w of weds ?? []) {
      const row = w as { id: string; couple_names: string | null };
      nameByWedding.set(String(row.id), (row.couple_names ?? "").trim() || "—");
    }
  }

  const weddingFilter =
    plan.weddingId != null
      ? {
          weddingId: plan.weddingId,
          coupleNames: plan.coupleNamesForFilter,
        }
      : null;

  const events: AssistantOperatorCalendarSnapshot["events"] = [];
  for (const r of rows) {
    const row = r as {
      id: string;
      title: string;
      start_time: string;
      end_time: string;
      event_type: EventType;
      wedding_id: string | null;
      meeting_link: string | null;
    };
    const wid = row.wedding_id;
    const coupleNames = wid != null ? nameByWedding.get(String(wid)) ?? null : null;
    const et = row.event_type in EVENT_TYPE_LABEL ? row.event_type : "other";
    events.push({
      id: String(row.id),
      title: String(row.title),
      startTime: String(row.start_time),
      endTime: String(row.end_time),
      eventType: et,
      eventTypeLabel: EVENT_TYPE_LABEL[et],
      weddingId: wid != null ? String(wid) : null,
      coupleNames,
      meetingLink: row.meeting_link != null ? String(row.meeting_link) : null,
    });
  }

  const semanticsNote =
    "Read-only `calendar_events` rows for this tenant (no Google Calendar writes in this path). Tasks are not calendar events.";

  return {
    didRun: true,
    computedAt: now.toISOString(),
    lookupMode: plan.lookupMode,
    lookupBasis: plan.lookupBasis,
    windowStartIso: plan.windowStartIso,
    windowEndIso: plan.windowEndIso,
    windowLabel: plan.windowLabel,
    windowDays: plan.windowDays,
    maxRows: OPERATOR_ASSISTANT_CALENDAR_MAX_EVENTS,
    rowCountReturned: events.length,
    truncated,
    timeZoneNote: IDLE.timeZoneNote,
    semanticsNote,
    weddingFilter,
    titleContains: plan.titleContains,
    eventTypeFilter: plan.eventTypes,
    orderAscending: plan.orderAscending,
    events,
  };
}
