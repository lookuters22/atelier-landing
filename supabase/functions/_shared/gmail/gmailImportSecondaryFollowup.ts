/**
 * Durable degraded state + backlog for Gmail import post-commit follow-up (attachments, metadata repair).
 * Primary materialization uses RPC; this layer is for Storage/secondary DB updates that run after.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type GmailSecondaryPendingKind =
  | "render_or_metadata"
  | "staged_attachments_finalize"
  | "attachment_metadata_update";

export async function markImportCandidateSecondaryDegraded(
  supabaseAdmin: SupabaseClient,
  importCandidateId: string,
  photographerId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("import_candidates")
    .update({
      materialization_secondary_status: "degraded",
      updated_at: new Date().toISOString(),
    })
    .eq("id", importCandidateId)
    .eq("photographer_id", photographerId);
  if (error) {
    console.error("[gmailImportSecondaryFollowup] degraded flag", error.message);
  }
}

export async function enqueueGmailImportSecondaryPending(
  supabaseAdmin: SupabaseClient,
  opts: {
    photographerId: string;
    importCandidateId: string;
    messageId: string;
    threadId: string;
    pendingKind: GmailSecondaryPendingKind;
    detail: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabaseAdmin.from("gmail_import_secondary_pending").insert({
    photographer_id: opts.photographerId,
    import_candidate_id: opts.importCandidateId,
    message_id: opts.messageId,
    thread_id: opts.threadId,
    pending_kind: opts.pendingKind,
    detail: opts.detail,
    status: "open",
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (error.code === "23505") {
      return;
    }
    console.error("[gmailImportSecondaryFollowup] enqueue", error.message);
  }
}
