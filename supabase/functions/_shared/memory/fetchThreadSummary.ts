import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** PostgREST: result contains 0 rows when `.single()` was used. */
const NO_ROWS = "PGRST116";

/**
 * Session-state tier: rolling summary for one thread (`thread_summaries`).
 * Returns the summary text, or `null` if no row exists yet (e.g. new thread).
 */
export async function fetchThreadSummary(
  supabase: SupabaseClient,
  photographerId: string,
  threadId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("thread_summaries")
    .select("summary")
    .eq("thread_id", threadId)
    .eq("photographer_id", photographerId)
    .single();

  if (error) {
    if (error.code === NO_ROWS) {
      return null;
    }
    throw new Error(`fetchThreadSummary: ${error.message}`);
  }

  const summary = data?.summary;
  return typeof summary === "string" ? summary : null;
}
