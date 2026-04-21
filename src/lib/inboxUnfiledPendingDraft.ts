import type { PendingDraft } from "../hooks/usePendingApprovals";

/**
 * Pick the pending draft to surface in unfiled Inbox thread detail.
 * Prefer `deepLinkDraftId` when it matches a draft on this thread (Today `review_draft` handoff).
 */
export function selectPendingDraftForInboxThread(
  drafts: readonly PendingDraft[],
  threadId: string,
  deepLinkDraftId: string | null | undefined,
): PendingDraft | undefined {
  const matches = drafts.filter((d) => d.thread_id === threadId);
  if (matches.length === 0) return undefined;
  const preferred = deepLinkDraftId?.trim();
  if (preferred) {
    const hit = matches.find((d) => d.id === preferred);
    if (hit) return hit;
  }
  return matches[0];
}
