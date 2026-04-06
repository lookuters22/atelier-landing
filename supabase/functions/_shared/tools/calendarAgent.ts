import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import type { AgentResult } from "../../../../src/types/agent.types.ts";
import { inngest } from "../inngest.ts";
import { BookCalendarEventSchema, CalendarToolInputSchema } from "./schemas.ts";

const DEFAULT_BOOKING_APP_ORIGIN = "https://app.yourdomain.com";

export function bookingLinkForWedding(weddingId: string): string {
  const origin = Deno.env.get("BOOKING_APP_ORIGIN") ?? DEFAULT_BOOKING_APP_ORIGIN;
  const base = origin.replace(/\/$/, "");
  return `${base}/book/${weddingId}`;
}

type CalendarAvailabilityInput = z.infer<typeof CalendarToolInputSchema>;
type BookEventInput = z.infer<typeof BookCalendarEventSchema>;

/**
 * Find `calendar_events` rows whose time range overlaps [rangeStart, rangeEnd). Tenant-scoped.
 */
export async function runCalendarAvailabilityCheck(
  supabase: SupabaseClient,
  photographerId: string,
  input: CalendarAvailabilityInput,
): Promise<AgentResult<Record<string, unknown>>> {
  try {
    const rangeStart = new Date(input.rangeStart);
    const rangeEnd = new Date(input.rangeEnd);
    if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
      return {
        success: false,
        facts: {},
        confidence: 0,
        error: "Invalid rangeStart or rangeEnd",
      };
    }

    const rangeStartIso = rangeStart.toISOString();
    const rangeEndIso = rangeEnd.toISOString();

    const { data: rows, error } = await supabase
      .from("calendar_events")
      .select("id, title, start_time, end_time, event_type, wedding_id")
      .eq("photographer_id", photographerId)
      .lt("start_time", rangeEndIso)
      .gt("end_time", rangeStartIso);

    if (error) {
      return {
        success: false,
        facts: {},
        confidence: 0,
        error: error.message,
      };
    }

    const overlappingEvents = rows ?? [];
    const rangeFree = overlappingEvents.length === 0;

    const facts: Record<string, unknown> = {
      rangeFree,
      overlappingEvents,
      eventTypeRequested: input.eventType,
    };

    if (input.weddingId) {
      facts.bookingLink = bookingLinkForWedding(input.weddingId);
    }

    return {
      success: true,
      facts,
      confidence: 1,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      facts: {},
      confidence: 0,
      error: message,
    };
  }
}

/**
 * Insert a `calendar_events` row after verifying the wedding belongs to the tenant.
 */
export async function runBookCalendarEvent(
  supabase: SupabaseClient,
  photographerId: string,
  input: BookEventInput,
): Promise<AgentResult<Record<string, unknown>>> {
  try {
    const start = new Date(input.startTime);
    const end = new Date(input.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return {
        success: false,
        facts: {},
        confidence: 0,
        error: "Invalid startTime or endTime",
      };
    }

    const { data: wedding, error: wErr } = await supabase
      .from("weddings")
      .select("id")
      .eq("id", input.weddingId)
      .eq("photographer_id", photographerId)
      .maybeSingle();

    if (wErr) {
      return {
        success: false,
        facts: {},
        confidence: 0,
        error: wErr.message,
      };
    }
    if (!wedding) {
      return {
        success: false,
        facts: {},
        confidence: 0,
        error: "Wedding not found or not owned by this photographer.",
      };
    }

    const { data: inserted, error: insErr } = await supabase
      .from("calendar_events")
      .insert({
        photographer_id: photographerId,
        wedding_id: input.weddingId,
        client_id: null,
        title: input.title,
        event_type: input.eventType,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        meeting_link: null,
      })
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      return {
        success: false,
        facts: {},
        confidence: 0,
        error: insErr?.message ?? "Insert failed",
      };
    }

    await inngest.send({
      name: "calendar/event.booked",
      data: {
        eventId: inserted.id as string,
        photographerId,
        weddingId: input.weddingId,
        startTime: start.toISOString(),
      },
    });

    return {
      success: true,
      facts: {
        calendarEventId: inserted.id,
        weddingId: input.weddingId,
        bookingLink: bookingLinkForWedding(input.weddingId),
      },
      confidence: 1,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      facts: {},
      confidence: 0,
      error: message,
    };
  }
}
