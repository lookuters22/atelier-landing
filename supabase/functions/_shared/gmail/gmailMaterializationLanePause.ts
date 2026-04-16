/**
 * Temporary ops: suppress G2 prepare/backfill + label-sync prepare enqueue without unregistering Inngest.
 *
 * Set Supabase Edge secret `GMAIL_IMPORT_CANDIDATE_MATERIALIZATION_LANE_DISABLED=1` during inbox validation,
 * then remove the secret (or set to `0`) to restore label-import prepare + backfill.
 *
 * Does **not** affect `import/gmail.delta_sync.v1` or watch/webhook.
 */
export function gmailImportCandidateMaterializationLaneDisabled(): boolean {
  return Deno.env.get("GMAIL_IMPORT_CANDIDATE_MATERIALIZATION_LANE_DISABLED")?.trim() === "1";
}
