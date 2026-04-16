/**
 * Shared finalize step after `materializeGmailImportCandidate` (reuse-thread path) — RPC in one transaction.
 * New-thread path finalizes inside `complete_gmail_import_materialize_new_thread`.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function finalizeApprovedImportCandidate(
  supabaseAdmin: SupabaseClient,
  params: {
    importCandidateId: string;
    photographerId: string;
    threadId: string;
    row: Record<string, unknown>;
    now: string;
    extraProvenance?: Record<string, unknown>;
    /** Clears grouped-approval error on success when present. */
    clearImportApprovalError?: boolean;
    /** Grouped reuse: set threads.wedding_id atomically with candidate finalize. */
    threadWeddingId?: string | null;
  },
): Promise<string | null> {
  const {
    importCandidateId,
    photographerId,
    threadId,
    row,
    now,
    extraProvenance,
    clearImportApprovalError = false,
    threadWeddingId = null,
  } = params;

  const baseProv = {
    source: "gmail_label_import",
    gmail_thread_id: row.raw_provider_thread_id,
    materialized_at: now,
    ...(extraProvenance ?? {}),
  };

  const { error: finErr } = await supabaseAdmin.rpc("finalize_gmail_import_link_existing_thread", {
    p_photographer_id: photographerId,
    p_import_candidate_id: importCandidateId,
    p_thread_id: threadId,
    p_thread_wedding_id: threadWeddingId,
    p_import_provenance: baseProv,
    p_clear_import_approval_error: clearImportApprovalError,
  });

  if (finErr) {
    console.error("[finalizeGmailImportCandidateApproved] candidate finalize", finErr.message);
    return finErr.message;
  }
  return null;
}
