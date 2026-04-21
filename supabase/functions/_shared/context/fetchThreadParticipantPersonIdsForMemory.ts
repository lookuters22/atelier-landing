import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Deterministic `people.id` values on the thread — used for reply-mode person-scope memory (Slice 4).
 * No fuzzy matching; only `thread_participants.person_id` for this tenant + thread.
 */
export async function fetchThreadParticipantPersonIdsForMemory(
  supabase: SupabaseClient,
  photographerId: string,
  threadId: string | null,
): Promise<string[]> {
  if (!threadId || String(threadId).trim() === "") {
    return [];
  }

  const { data, error } = await supabase
    .from("thread_participants")
    .select("person_id")
    .eq("thread_id", threadId)
    .eq("photographer_id", photographerId);

  if (error) {
    throw new Error(`fetchThreadParticipantPersonIdsForMemory: ${error.message}`);
  }

  const out = new Set<string>();
  for (const row of data ?? []) {
    const pid = row.person_id as string | null | undefined;
    if (pid != null && String(pid).trim() !== "") {
      out.add(String(pid).trim());
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}
