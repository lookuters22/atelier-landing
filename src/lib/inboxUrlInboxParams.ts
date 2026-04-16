/** Inbox list search — URL source of truth (sidebar input, debounced writes). */
export const INBOX_SEARCH_QUERY_PARAM = "q";

const THREAD_DEEP_LINK_KEYS = ["threadId", "draftId", "action", "escalationId"] as const;

/** Removes thread/draft/escalation deep-link keys only; preserves `q` and other params. */
export function stripInboxThreadDeepLinkParams(searchParams: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  for (const k of THREAD_DEEP_LINK_KEYS) {
    next.delete(k);
  }
  return next;
}
