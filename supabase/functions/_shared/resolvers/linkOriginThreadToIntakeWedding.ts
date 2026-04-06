/**
 * After intake creates a new wedding, relate it to an existing inbound thread without
 * forcing a bad merge when that thread may already map to another wedding (Step 3D).
 *
 * - If the origin thread has no primary `wedding_id`, set it to the new wedding (legacy pointer).
 * - If it already points at a different wedding, insert `thread_weddings` with `candidate` instead
 *   of overwriting `threads.wedding_id`.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function linkOriginThreadToIntakeWedding(
  supabase: SupabaseClient,
  input: {
    photographer_id: string;
    origin_thread_id: string;
    new_wedding_id: string;
  },
): Promise<void> {
  const { photographer_id, origin_thread_id, new_wedding_id } = input;

  const { data: thread, error: fetchErr } = await supabase
    .from("threads")
    .select("wedding_id")
    .eq("id", origin_thread_id)
    .eq("photographer_id", photographer_id)
    .maybeSingle();

  if (fetchErr) {
    throw new Error(`Failed to load origin thread: ${fetchErr.message}`);
  }
  if (!thread) {
    console.error(
      `[intake] Origin thread not found or not in tenant: ${origin_thread_id}`,
    );
    return;
  }

  const existing = thread.wedding_id as string | null;

  if (existing == null) {
    const { error } = await supabase
      .from("threads")
      .update({ wedding_id: new_wedding_id })
      .eq("id", origin_thread_id)
      .eq("photographer_id", photographer_id);

    if (error) {
      console.error(
        `[intake] Failed to set primary wedding on origin thread: ${error.message}`,
      );
    }
    return;
  }

  if (existing === new_wedding_id) {
    return;
  }

  const { error: twErr } = await supabase.from("thread_weddings").insert({
    photographer_id,
    thread_id: origin_thread_id,
    wedding_id: new_wedding_id,
    relation: "candidate",
    reasoning:
      "Intake created a new wedding while this thread already had a primary wedding; stored as candidate link.",
  });

  if (twErr) {
    const code = (twErr as { code?: string }).code;
    if (code === "23505") {
      return;
    }
    console.error(
      `[intake] Failed to insert thread_weddings candidate: ${twErr.message}`,
    );
  }
}
