/**
 * Inbox deep links: the browser URL (`threadId`, `draftId`, `action`, …) is the canonical selection
 * state after successful hydration. Only terminal failure paths strip params + session mirror.
 */

import type { InboxDeepLinkPayload } from "./inboxDeepLinkPersistence";
import { serializeInboxDeepLinkPayload } from "./inboxDeepLinkPersistence";

/** Stable idempotence key for a resolved deep-link payload (same idea as `PipelineUrlHydrator` processed signature). */
export function signatureForInboxDeepLinkPayload(p: InboxDeepLinkPayload): string {
  return serializeInboxDeepLinkPayload(p);
}

/**
 * When true, `InboxUrlHydrator` should not re-run `selectProject` / pending handoff / `selectThread`
 * for this payload — already applied (avoids collapsing timeline selection to `threads[0]` on rerenders).
 */
export function shouldSkipInboxHydrationApply(
  processedSignature: string | null,
  currentPayloadSignature: string,
): boolean {
  if (processedSignature === null) return false;
  return processedSignature === currentPayloadSignature;
}

/**
 * After handling `action=review_draft`, strip URL/session only on real failures — not on success.
 * Thread-backed drafts with no `wedding_id` still succeed (unfiled inbox); see `hasThreadBackedDraftHandoff`.
 */
export function shouldStripInboxUrlAfterDraftReviewHydration(args: {
  draftsFetchError: boolean;
  draftFound: boolean;
  hasUsableWeddingId: boolean;
  hasThreadBackedHandoff: boolean;
}): boolean {
  if (args.draftsFetchError) return true;
  if (!args.draftFound) return true;
  if (args.hasUsableWeddingId) return false;
  if (args.hasThreadBackedHandoff) return false;
  return true;
}

/** Unfiled `threadId` link: keep URL when the thread is found; strip when the id is stale / not in list. */
export function shouldStripInboxUrlAfterUnfiledThreadHydration(unfiledThreadMatched: boolean): boolean {
  return !unfiledThreadMatched;
}
