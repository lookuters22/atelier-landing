/**
 * Session mirror helpers (clear on failed/stale hydration). Deep-link **selection** is driven
 * only by live URL params — `/inbox` with no `threadId` must not reopen a prior thread/project.
 * Explicit links stay: `resolveInboxDeepLinkPayload` reads **search params only**.
 */
export const INBOX_DEEP_LINK_STORAGE_KEY = "atelier:inboxDeepLink:v1";

export type InboxDeepLinkPayload = {
  threadId: string;
  draftId: string | null;
  action: string | null;
};

export function payloadFromSearchParams(searchParams: URLSearchParams): InboxDeepLinkPayload | null {
  const threadId = searchParams.get("threadId");
  if (!threadId) return null;
  return {
    threadId,
    draftId: searchParams.get("draftId"),
    action: searchParams.get("action"),
  };
}

export function serializeInboxDeepLinkPayload(p: InboxDeepLinkPayload): string {
  return `${p.threadId}\u0000${p.draftId ?? ""}\u0000${p.action ?? ""}`;
}

export function readPersistedInboxDeepLink(): InboxDeepLinkPayload | null {
  try {
    const raw = sessionStorage.getItem(INBOX_DEEP_LINK_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as InboxDeepLinkPayload;
    if (typeof p?.threadId !== "string" || !p.threadId) return null;
    return {
      threadId: p.threadId,
      draftId: typeof p.draftId === "string" ? p.draftId : null,
      action: typeof p.action === "string" ? p.action : null,
    };
  } catch {
    return null;
  }
}

export function persistInboxDeepLinkPayload(p: InboxDeepLinkPayload): void {
  try {
    sessionStorage.setItem(INBOX_DEEP_LINK_STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage full or disabled */
  }
}

export function clearPersistedInboxDeepLink(): void {
  try {
    sessionStorage.removeItem(INBOX_DEEP_LINK_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Inbox deep-link payload from the current location only (no session restore on bare `/inbox`). */
export function resolveInboxDeepLinkPayload(
  searchParams: URLSearchParams,
): InboxDeepLinkPayload | null {
  return payloadFromSearchParams(searchParams);
}
