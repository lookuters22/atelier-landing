import { useEffect, useRef } from "react";
import type { InboxSelection } from "../components/modes/inbox/InboxModeContext";
import type { UnfiledThread } from "./useUnfiledInbox";
import type { GmailInboxModifyResult } from "../lib/gmailInboxModify";
import { deriveUnreadFromGmailLabelIds } from "../lib/gmailInboxLabels";

/**
 * When a thread becomes the active inbox selection (opened from list, keyboard, URL, scratch-send handoff),
 * mark it read in Gmail once, optimistically, if it is currently unread.
 * Guards: same thread id does not re-fire on projection/cache updates; only unread + syncable threads invoke modify.
 */
export function useInboxAutoMarkReadOnOpen(args: {
  selection: InboxSelection;
  inboxThreads: UnfiledThread[];
  photographerId: string | null;
  googleAccountId: string | null;
  gmailInboxModify: (
    threadId: string,
    action: "mark_read",
    connectedAccountId: string | null,
    providerMessageId: string | null,
  ) => Promise<GmailInboxModifyResult>;
}) {
  const lastOpenedThreadIdRef = useRef<string | null>(null);

  const threadId = args.selection.kind === "thread" ? args.selection.thread.id : null;
  const selectionThread = args.selection.kind === "thread" ? args.selection.thread : null;

  useEffect(() => {
    if (!threadId || !selectionThread) {
      lastOpenedThreadIdRef.current = null;
      return;
    }

    if (lastOpenedThreadIdRef.current === threadId) {
      return;
    }
    lastOpenedThreadIdRef.current = threadId;

    const thread = args.inboxThreads.find((t) => t.id === threadId) ?? selectionThread;
    const unread = deriveUnreadFromGmailLabelIds(thread.gmailLabelIds) ?? false;
    if (!unread) return;

    if (!args.photographerId || !args.googleAccountId?.trim()) return;
    if (!thread.hasGmailImport || !thread.latestProviderMessageId?.trim()) return;

    void args.gmailInboxModify(threadId, "mark_read", args.googleAccountId, thread.latestProviderMessageId);
  }, [
    threadId,
    selectionThread,
    args.inboxThreads,
    args.photographerId,
    args.googleAccountId,
    args.gmailInboxModify,
  ]);
}
