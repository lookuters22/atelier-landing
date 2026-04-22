/**
 * Service-role writes to `calendar_events` from operator-confirmed assistant proposals (F3).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database } from "../../../../src/types/database.types.ts";
import type { InsertOperatorAssistantCalendarEventBody } from "../../../../src/types/operatorAssistantProposedAction.types.ts";
import { inngest } from "../inngest.ts";
import { recordOperatorAssistantWriteAudit } from "./recordOperatorAssistantWriteAudit.ts";

export async function insertOrUpdateCalendarEventForOperatorAssistant(
  supabase: SupabaseClient,
  photographerId: string,
  body: InsertOperatorAssistantCalendarEventBody,
): Promise<{ calendarEventId: string; operation: "create" | "reschedule"; auditId: string }> {
  if (body.operation === "reschedule") {
    const { data: existing, error: selErr } = await supabase
      .from("calendar_events")
      .select("id, wedding_id, start_time, end_time")
      .eq("id", body.calendarEventId)
      .eq("photographer_id", photographerId)
      .maybeSingle();

    if (selErr) {
      throw new Error(`calendar event lookup failed: ${selErr.message}`);
    }
    if (!existing?.id) {
      throw new Error("calendar event not found for tenant");
    }

    const beforeStart = String((existing as { start_time: string }).start_time);
    const beforeEnd = String((existing as { end_time: string }).end_time);
    const calendarEventId = String(existing.id);

    const { error: updErr } = await supabase
      .from("calendar_events")
      .update({
        start_time: body.startTime,
        end_time: body.endTime,
      })
      .eq("id", body.calendarEventId)
      .eq("photographer_id", photographerId);

    if (updErr) {
      throw new Error(updErr.message);
    }

    const { auditId } = await recordOperatorAssistantWriteAudit(supabase, photographerId, {
      operation: "calendar_event_reschedule",
      entityTable: "calendar_events",
      entityId: calendarEventId,
      detail: {
        before: { startTime: beforeStart, endTime: beforeEnd },
        after: { startTime: body.startTime, endTime: body.endTime },
      },
    });

    return { calendarEventId, operation: "reschedule", auditId };
  }

  if (body.weddingId) {
    const { data: wedding, error: wErr } = await supabase
      .from("weddings")
      .select("id")
      .eq("id", body.weddingId)
      .eq("photographer_id", photographerId)
      .maybeSingle();

    if (wErr) {
      throw new Error(`wedding verify failed: ${wErr.message}`);
    }
    if (!wedding?.id) {
      throw new Error("wedding not found for tenant");
    }
  }

  const insertRow: Database["public"]["Tables"]["calendar_events"]["Insert"] = {
    photographer_id: photographerId,
    wedding_id: body.weddingId,
    client_id: null,
    title: body.title,
    event_type: body.eventType,
    start_time: body.startTime,
    end_time: body.endTime,
    meeting_link: null,
  };

  const { data: row, error: insErr } = await supabase.from("calendar_events").insert(insertRow).select("id").single();

  if (insErr) {
    throw new Error(insErr.message);
  }
  if (!row?.id) {
    throw new Error("insert did not return id");
  }

  const id = String(row.id);
  if (body.weddingId) {
    await inngest.send({
      name: "calendar/event.booked",
      data: {
        eventId: id,
        photographerId,
        weddingId: body.weddingId,
        startTime: body.startTime,
      },
    });
  }

  const { auditId } = await recordOperatorAssistantWriteAudit(supabase, photographerId, {
    operation: "calendar_event_create",
    entityTable: "calendar_events",
    entityId: id,
    detail: {
      title: body.title,
      startTime: body.startTime,
      endTime: body.endTime,
      eventType: body.eventType,
      weddingId: body.weddingId ?? null,
    },
  });

  return { calendarEventId: id, operation: "create", auditId };
}
