/**
 * Calendar tools — backed by `calendar_events` (see `calendarAgent.ts`).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import type { AgentResult } from "../../../../src/types/agent.types.ts";
import { CalendarToolInputSchema } from "./schemas.ts";
import { runCalendarAvailabilityCheck } from "./calendarAgent.ts";

export async function executeCalendarTool(
  supabase: SupabaseClient,
  input: z.infer<typeof CalendarToolInputSchema>,
  photographerId: string,
): Promise<AgentResult<Record<string, unknown>>> {
  return runCalendarAvailabilityCheck(supabase, photographerId, input);
}

export { runBookCalendarEvent, runCalendarAvailabilityCheck, bookingLinkForWedding } from "./calendarAgent.ts";
