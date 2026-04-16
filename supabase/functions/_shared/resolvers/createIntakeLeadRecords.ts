/**
 * Single resolver for the intake lead path: wedding → client → thread → first message.
 * Workers should call this instead of ad hoc inserts (execute_v3.md Step 3C).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { normalizeEmail } from "../utils/normalizeEmail.ts";

/**
 * Canonical ceremony/sort date only when we have a real calendar anchor.
 * Does **not** fall back to "today" — unknown dates stay null.
 */
function coerceCanonicalWeddingDate(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  if (!t || t.toLowerCase() === "null" || t.toLowerCase() === "undefined") return null;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function coerceOptionalEventTimestamptz(value: string | null | undefined): string | null {
  if (value == null || !String(value).trim()) return null;
  const t = String(value).trim();
  if (t.toLowerCase() === "null" || t.toLowerCase() === "undefined") return null;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

export type IntakeLeadExtraction = {
  couple_names: string;
  wedding_date: string | null;
  event_start_date?: string | null;
  event_end_date?: string | null;
  location: string | null;
  story_notes: string | null;
};

export async function createIntakeLeadRecords(
  supabase: SupabaseClient,
  input: {
    photographer_id: string;
    extraction: IntakeLeadExtraction;
    sender_email: string | undefined;
    raw_message: string;
  },
): Promise<{ weddingId: string; threadId: string }> {
  const { photographer_id, extraction, sender_email, raw_message } = input;

  const eventStart = coerceOptionalEventTimestamptz(extraction.event_start_date);
  const eventEnd = coerceOptionalEventTimestamptz(extraction.event_end_date);
  const hasRange =
    Boolean(eventStart) &&
    Boolean(eventEnd) &&
    new Date(eventStart!).getTime() !== new Date(eventEnd!).getTime();

  let weddingDate = coerceCanonicalWeddingDate(extraction.wedding_date);
  if (weddingDate == null && eventStart) {
    /** Structured event window/anchor from extraction — first day is a real calendar anchor. */
    weddingDate = eventStart;
  }

  const { data: wedding, error: weddingErr } = await supabase
    .from("weddings")
    .insert({
      photographer_id,
      couple_names: extraction.couple_names,
      wedding_date: weddingDate,
      event_start_date: hasRange ? eventStart : null,
      event_end_date: hasRange ? eventEnd : null,
      location: extraction.location ?? "TBD",
      stage: "inquiry",
      story_notes: extraction.story_notes || null,
    })
    .select("id")
    .single();

  if (weddingErr || !wedding) {
    throw new Error(`Failed to create wedding: ${weddingErr?.message}`);
  }

  const weddingId = wedding.id as string;

  const { error: clientErr } = await supabase.from("clients").insert({
    wedding_id: weddingId,
    name: extraction.couple_names,
    role: "Lead",
    email: normalizeEmail(sender_email) || null,
  });

  if (clientErr) {
    throw new Error(`Failed to create client: ${clientErr.message}`);
  }

  const { data: thread, error: threadErr } = await supabase
    .from("threads")
    .insert({
      wedding_id: weddingId,
      photographer_id,
      title: "Initial Inquiry",
      kind: "group",
    })
    .select("id")
    .single();

  if (threadErr || !thread) {
    throw new Error(`Failed to create thread: ${threadErr?.message}`);
  }

  const threadId = thread.id as string;

  const { error: msgErr } = await supabase.from("messages").insert({
    thread_id: threadId,
    photographer_id,
    direction: "in",
    sender: sender_email,
    body: raw_message,
  });

  if (msgErr) {
    throw new Error(`Failed to log inbound message: ${msgErr.message}`);
  }

  return { weddingId, threadId };
}
