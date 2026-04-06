import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ThreadDraftsSummary } from "../../../../src/types/decisionContext.types.ts";

const PENDING_DRAFT_ID_CAP = 5;

/**
 * Bounded, tenant-safe pending-draft facts for orchestrator read-side parity (A4).
 * No draft bodies; `thread_id` must resolve under `photographer_id` or returns null.
 */
export async function fetchThreadDraftsSummaryForDecisionContext(
  supabase: SupabaseClient,
  photographerId: string,
  threadId: string | null,
): Promise<ThreadDraftsSummary | null> {
  if (!threadId) {
    return null;
  }

  const { data: threadRow, error: threadErr } = await supabase
    .from("threads")
    .select("id")
    .eq("id", threadId)
    .eq("photographer_id", photographerId)
    .maybeSingle();

  if (threadErr) {
    throw new Error(`fetchThreadDraftsSummary thread check: ${threadErr.message}`);
  }
  if (!threadRow) {
    return null;
  }

  const [countResult, idsResult] = await Promise.all([
    supabase
      .from("drafts")
      .select("id", { count: "exact", head: true })
      .eq("photographer_id", photographerId)
      .eq("thread_id", threadId)
      .eq("status", "pending_approval"),
    supabase
      .from("drafts")
      .select("id")
      .eq("photographer_id", photographerId)
      .eq("thread_id", threadId)
      .eq("status", "pending_approval")
      .order("created_at", { ascending: false })
      .limit(PENDING_DRAFT_ID_CAP),
  ]);

  if (countResult.error) {
    throw new Error(`fetchThreadDraftsSummary count: ${countResult.error.message}`);
  }
  if (idsResult.error) {
    throw new Error(`fetchThreadDraftsSummary ids: ${idsResult.error.message}`);
  }

  const pendingApprovalCount = countResult.count ?? 0;
  const pendingApprovalDraftIds = (idsResult.data ?? []).map((r) => r.id as string);

  return { pendingApprovalCount, pendingApprovalDraftIds };
}
