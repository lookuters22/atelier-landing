/**
 * Lazy creation of the batch inquiry wedding for a Gmail-label grouped approval.
 *
 * Why lazy:
 *   The original design eagerly created the wedding in the edge handler before
 *   the async worker even started. For Promotions / Newsletter / OTA batches
 *   that meant CRM gained an inquiry-stage shell even when every candidate
 *   was suppressed or lacked attachment eligibility (no positive CRM-link signal).
 *   The fix: defer creation until the worker encounters a candidate that is both
 *   not suppressed and explicitly eligible to attach to the batch project. If
 *   none ever appears, no wedding is created and CRM stays clean.
 *
 * Race safety:
 *   Multiple chunks can run in parallel within one Inngest run (and retries
 *   can kick another worker). The "claim" update is gated on
 *   `materialized_wedding_id IS NULL`, so the first writer wins; later
 *   chunks reload and reuse the persisted wedding id.
 *
 * Extracted from `processGmailLabelGroupApproval.ts` so the contract can be
 * unit-tested with a mock supabase client (the worker file itself is hard to
 * import under vitest because of `npm:inngest` resolution).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createGmailLabelImportWedding } from "./gmailImportMaterialize.ts";

export type LazyWeddingState = {
  weddingId: string | null;
  /** Label name used as `couple_names` source when the first attachment-eligible candidate fires. */
  labelName: string | null;
};

export type EnsureBatchWeddingResult =
  | { weddingId: string }
  | { error: string };

/**
 * Idempotently create the batch wedding the first time it is needed.
 *
 * Returns the wedding id when:
 *   - state already has one (in-memory cached);
 *   - the group row already has one (another chunk / retry created it);
 *   - we created it now under the `materialized_wedding_id IS NULL` claim.
 *
 * Returns `{ error }` on DB failure or a hopelessly inconsistent claim state.
 */
export async function ensureBatchWeddingForGroup(
  supabaseAdmin: SupabaseClient,
  groupId: string,
  photographerId: string,
  state: LazyWeddingState,
  now: string,
): Promise<EnsureBatchWeddingResult> {
  if (state.weddingId) return { weddingId: state.weddingId };

  const { data: existing, error: existErr } = await supabaseAdmin
    .from("gmail_label_import_groups")
    .select("materialized_wedding_id")
    .eq("id", groupId)
    .maybeSingle();
  if (existErr) return { error: existErr.message };
  const already = existing?.materialized_wedding_id as string | null | undefined;
  if (already) {
    state.weddingId = already;
    return { weddingId: already };
  }

  const w = await createGmailLabelImportWedding(supabaseAdmin, {
    photographerId,
    labelName: state.labelName ?? "Gmail label",
    now,
  });
  if ("error" in w) return { error: w.error };

  /**
   * Race-safe upsert: only the first chunk to fire wins; later chunks see the
   * persisted wedding id and reuse it. The `is("materialized_wedding_id", null)`
   * predicate makes this lock-free and idempotent.
   */
  const { data: claimed, error: upErr } = await supabaseAdmin
    .from("gmail_label_import_groups")
    .update({ materialized_wedding_id: w.weddingId, updated_at: now })
    .eq("id", groupId)
    .is("materialized_wedding_id", null)
    .select("materialized_wedding_id")
    .maybeSingle();

  if (upErr) {
    return { error: upErr.message };
  }

  if (!claimed?.materialized_wedding_id) {
    /** Lost race — another chunk already inserted; reuse that wedding id. */
    const { data: winner } = await supabaseAdmin
      .from("gmail_label_import_groups")
      .select("materialized_wedding_id")
      .eq("id", groupId)
      .maybeSingle();
    const winnerId = winner?.materialized_wedding_id as string | null | undefined;
    if (!winnerId) return { error: "lazy_wedding_claim_inconsistent" };
    state.weddingId = winnerId;
    return { weddingId: winnerId };
  }

  state.weddingId = claimed.materialized_wedding_id as string;
  return { weddingId: state.weddingId };
}
