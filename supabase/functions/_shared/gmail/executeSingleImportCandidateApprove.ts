/**
 * Shared single-row Gmail import approval (unfiled Inbox thread).
 * Used by `import-candidate-review` (sync fast paths) and `processGmailSingleImportCandidateApprove` (async).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { finalizeApprovedImportCandidate } from "./finalizeGmailImportCandidateApproved.ts";
import { gmailExternalThreadKey, materializeGmailImportCandidate } from "./gmailImportMaterialize.ts";

export type ExecuteSingleImportCandidateApproveResult =
  | { ok: true; threadId: string }
  | { ok: false; error: string };

export async function executeSingleImportCandidateApprove(
  supabaseAdmin: SupabaseClient,
  params: {
    photographerId: string;
    importCandidateId: string;
    row: Record<string, unknown>;
    now: string;
  },
): Promise<ExecuteSingleImportCandidateApproveResult> {
  const { photographerId, importCandidateId, row, now } = params;

  if (row.materialized_thread_id) {
    const finErr = await finalizeApprovedImportCandidate(supabaseAdmin, {
      importCandidateId,
      photographerId,
      threadId: row.materialized_thread_id as string,
      row,
      now,
    });
    if (finErr) {
      return { ok: false, error: finErr };
    }
    return { ok: true, threadId: row.materialized_thread_id as string };
  }

  const externalKey = gmailExternalThreadKey(row.raw_provider_thread_id as string);

  const { data: existing } = await supabaseAdmin
    .from("threads")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("channel", "email")
    .eq("external_thread_key", externalKey)
    .maybeSingle();

  let threadId: string;

  if (existing?.id) {
    threadId = existing.id as string;
  } else {
    const mat = await materializeGmailImportCandidate(supabaseAdmin, {
      photographerId,
      importCandidateId,
      row,
      weddingId: null,
      now,
    });
    if ("error" in mat) {
      return { ok: false, error: typeof mat.error === "string" ? mat.error : "materialize_failed" };
    }
    if (mat.finalizedCore) {
      return { ok: true, threadId: mat.threadId };
    }
    threadId = mat.threadId;
  }

  const finErr = await finalizeApprovedImportCandidate(supabaseAdmin, {
    importCandidateId,
    photographerId,
    threadId,
    row,
    now,
    threadWeddingId: null,
  });
  if (finErr) {
    return { ok: false, error: finErr };
  }

  return { ok: true, threadId };
}
