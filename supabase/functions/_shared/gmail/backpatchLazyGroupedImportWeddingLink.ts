/**
 * Atomic backpatch of the wedding linkage on Gmail-grouped lazy imports
 * after `ensureBatchWeddingForGroup` finally creates the inquiry wedding for
 * the first non-suppressed candidate of a batch.
 *
 * Why this exists:
 *   In the lazy grouped path, the very first non-suppressed candidate is
 *   materialized BEFORE the batch wedding exists. The materialize RPC
 *   therefore writes:
 *     - `threads.wedding_id           = NULL`
 *     - `threads.ai_routing_metadata`  = provenance WITHOUT `materialized_wedding_id`
 *     - `import_candidates.import_provenance` = provenance WITHOUT `materialized_wedding_id`
 *   Once `ensureBatchWeddingForGroup` claims a wedding id, all three surfaces
 *   must be patched up together. This used to be done as two separate Edge
 *   `.update(...)` calls, which left a real failure window where
 *   `threads.wedding_id` could be set while the candidate provenance JSON
 *   stayed stale (split-brain audit state). The fix moves the merge + write
 *   into a Postgres RPC so all three surfaces are committed atomically — or
 *   none are.
 *
 * Atomicity + identity contract:
 *   - The DB function `public.backpatch_lazy_grouped_import_wedding_link`
 *     locks `threads` and `import_candidates` rows `FOR UPDATE`, merges in
 *     the missing `materialized_wedding_id` and `gmail_label_import_group_id`
 *     keys, then writes both surfaces in one transaction. Any RAISE inside
 *     the function rolls the whole thing back. There is no path that can
 *     update `threads` without also updating `import_candidates`.
 *   - The candidate row lookup ALSO requires
 *       `materialized_thread_id = p_thread_id`
 *     AND
 *       `gmail_label_import_group_id = p_gmail_label_import_group_id`
 *     so a same-tenant but mismatched candidate/thread/group triple cannot
 *     be backpatched. The RPC is authoritative for both atomicity AND row
 *     identity, not just atomicity.
 *
 * Scope (intentionally narrow):
 *   - Only the lazy first-eligible-candidate code path calls this.
 *   - Suppressed candidates are NEVER passed here — they must remain
 *     wedding-null both relationally and in their suppression provenance.
 *   - The reuse-thread finalize path is unaffected; it uses
 *     `finalizeApprovedImportCandidate` which carries `materialized_wedding_id`
 *     in `extraProvenance` already.
 *
 * Merge contract (mirrored on both sides):
 *   - Treat null / non-object JSON as `{}`.
 *   - Add `materialized_wedding_id` only if absent (or empty string).
 *   - Add `gmail_label_import_group_id` only if absent (or empty string).
 *   - Never overwrite a pre-existing differing value (forensics-friendly).
 *   - Preserve every other key, including `suppression`, source / thread ids,
 *     and timestamps written by the materialize RPC.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type BackpatchLazyGroupedImportWeddingLinkInput = {
  supabaseAdmin: SupabaseClient;
  photographerId: string;
  threadId: string;
  importCandidateId: string;
  groupId: string;
  weddingId: string;
};

export type BackpatchLazyGroupedImportWeddingLinkResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Pure JSON merge — kept exported for documentation and unit testing of the
 * merge contract. The authoritative write path is the SQL RPC; this TS
 * version is a behavior-equivalent reference implementation that locks the
 * same rules in tests so any divergence between SQL and TS is caught early.
 *
 * Rules:
 *   - Null / non-object input is treated as `{}`.
 *   - Adds `materialized_wedding_id` only if missing (or empty string).
 *   - Adds `gmail_label_import_group_id` only if missing (or empty string).
 *   - Never overwrites a pre-existing differing value.
 *   - Preserves every other key.
 */
export function mergeLazyWeddingProvenance(
  existing: Record<string, unknown> | null | undefined,
  weddingId: string,
  groupId: string,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};

  if (typeof base.materialized_wedding_id !== "string" || base.materialized_wedding_id.length === 0) {
    base.materialized_wedding_id = weddingId;
  }
  if (
    typeof base.gmail_label_import_group_id !== "string" ||
    base.gmail_label_import_group_id.length === 0
  ) {
    base.gmail_label_import_group_id = groupId;
  }
  return base;
}

/**
 * Thin wrapper over the atomic SQL RPC. Maps DB errors into the
 * `{ ok: false, error }` shape the worker already routes through
 * `persistChunkFailureBump`. The error string carries an actionable prefix
 * so observability dashboards can group by failure mode.
 */
export async function backpatchLazyGroupedImportWeddingLink(
  input: BackpatchLazyGroupedImportWeddingLinkInput,
): Promise<BackpatchLazyGroupedImportWeddingLinkResult> {
  const { supabaseAdmin, photographerId, threadId, importCandidateId, groupId, weddingId } = input;

  /**
   * Defensive arg validation — the SQL function will RAISE on the same
   * conditions, but failing in TS first avoids a network round-trip and
   * gives a cleaner error string.
   */
  if (!photographerId || !threadId || !importCandidateId || !groupId || !weddingId) {
    return { ok: false, error: "lazy_backpatch_invalid_args" };
  }

  const { error } = await supabaseAdmin.rpc(
    "backpatch_lazy_grouped_import_wedding_link",
    {
      p_photographer_id: photographerId,
      p_thread_id: threadId,
      p_import_candidate_id: importCandidateId,
      p_gmail_label_import_group_id: groupId,
      p_wedding_id: weddingId,
    },
  );

  if (error) {
    return { ok: false, error: `lazy_backpatch_rpc_failed:${error.message}` };
  }

  return { ok: true };
}
