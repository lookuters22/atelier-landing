/** User-visible copy when a draft deep link cannot be resolved (stale id, wrong tenant, or no longer pending). */
export const INBOX_UNRESOLVED_DRAFT_MESSAGE =
  "This draft could not be opened. It may no longer be pending approval, or it isn\u2019t available on your account.";

/**
 * Legacy copy for rare UI paths. `review_draft` hydration no longer treats null `wedding_id` as an
 * error when the draft is thread-backed (unfiled inbox); see `hasThreadBackedDraftHandoff`.
 */
export const INBOX_DRAFT_MISSING_WEDDING_MESSAGE =
  "This draft couldn\u2019t be opened: no wedding is linked for it. It may need data repair or may no longer be actionable here.";

/** Whether inbox may call `selectProject` for a draft deep link (non-empty wedding id). */
export function hasUsableDraftWeddingId(weddingId: string | undefined | null): boolean {
  return typeof weddingId === "string" && weddingId.trim().length > 0;
}

/**
 * Pending draft can be opened in unfiled Inbox when we have a thread id on the row or on the URL
 * (e.g. non-wedding inquiry drafts on threads with no `wedding_id`).
 */
export function hasThreadBackedDraftHandoff(
  draft: { thread_id?: string } | null | undefined,
  payloadThreadId: string | null | undefined,
): boolean {
  const fromDraft = draft?.thread_id?.trim() ?? "";
  if (fromDraft.length > 0) return true;
  const fromPayload = payloadThreadId?.trim() ?? "";
  return fromPayload.length > 0;
}

/**
 * After opening the correct wedding/project from a draft deep link, the target thread may be missing
 * from the loaded timeline (stale data, sync lag, or thread not yet filed to this wedding).
 */
export const INBOX_DRAFT_THREAD_NOT_ON_TIMELINE_MESSAGE =
  "The draft\u2019s conversation isn\u2019t on this project\u2019s timeline yet. You\u2019re still in the right project\u2014pick a thread from the list or check back when data syncs.";

export function isDraftReviewDeepLink(searchParams: URLSearchParams): boolean {
  return searchParams.get("action") === "review_draft" && Boolean(searchParams.get("threadId"));
}

export type PendingThreadHandoffResult =
  | { kind: "apply"; threadId: string }
  | { kind: "abandon_with_notice"; reason: "empty_timeline" | "missing_thread" };

/** Pure helper for inbox project timeline thread selection after draft deep link (testable). */
export function resolvePendingThreadHandoff(
  pendingThreadId: string | null,
  timelineThreadIds: readonly string[],
): PendingThreadHandoffResult | null {
  if (!pendingThreadId) return null;
  if (timelineThreadIds.length === 0) {
    return { kind: "abandon_with_notice", reason: "empty_timeline" };
  }
  if (!timelineThreadIds.includes(pendingThreadId)) {
    return { kind: "abandon_with_notice", reason: "missing_thread" };
  }
  return { kind: "apply", threadId: pendingThreadId };
}
