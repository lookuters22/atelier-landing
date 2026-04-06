/**
 * Single resolver for the intake lead path: wedding → client → thread → first message.
 * Workers should call this instead of ad hoc inserts (execute_v3.md Step 3C).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { normalizeEmail } from "../utils/normalizeEmail.ts";

/** Ensures `weddings.wedding_date` never receives the string `"null"` or other invalid timestamptz input. */
function coerceWeddingDateForInsert(value: string | null | undefined): string {
  if (value == null) return new Date().toISOString();
  const t = String(value).trim();
  if (!t || t.toLowerCase() === "null" || t.toLowerCase() === "undefined") {
    return new Date().toISOString();
  }
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return new Date().toISOString();
  return new Date(ms).toISOString();
}

export type IntakeLeadExtraction = {
  couple_names: string;
  wedding_date: string | null;
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

  const { data: wedding, error: weddingErr } = await supabase
    .from("weddings")
    .insert({
      photographer_id,
      couple_names: extraction.couple_names,
      wedding_date: coerceWeddingDateForInsert(extraction.wedding_date),
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
