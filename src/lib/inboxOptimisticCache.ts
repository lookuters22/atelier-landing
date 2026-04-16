import type { QueryClient } from "@tanstack/react-query";
import type { GmailInboxModifyAction, GmailInboxModifyResult } from "./gmailInboxModify";
import { invokeGmailInboxModify } from "./gmailInboxModify";
import { GMAIL_LABEL_STARRED, GMAIL_LABEL_UNREAD } from "./gmailInboxLabels";
import {
  convertUnfiledThreadToInquiry,
  deleteInboxThread,
  linkInboxThreadToWedding,
  type ConvertUnfiledThreadToInquiryResult,
  type DeleteInboxThreadResult,
  type LinkThreadToWeddingResult,
} from "./inboxThreadLinking";
import type { UnfiledThread } from "../hooks/useUnfiledInbox";

/** Matches `InboxLatestProjectionQueryData` cache entry. */
type InboxLatestProjectionCache = {
  threads: UnfiledThread[];
  providerMessageIdColumnUnavailable: boolean;
};

/** All list/search variants share this prefix — patches must update every matching query. */
function inboxLatestProjectionPrefix(photographerId: string) {
  return { queryKey: ["inbox", "latest-projection", photographerId] as const };
}

function cloneInboxData(data: InboxLatestProjectionCache | undefined): InboxLatestProjectionCache | undefined {
  return data ? structuredClone(data) : undefined;
}

/** Local optimistic Gmail label set derived from actions (matches API semantics for list UI). */
export function applyGmailActionToLabelIds(labelIds: string[] | null, action: GmailInboxModifyAction): string[] {
  const ids = new Set(labelIds ?? []);
  switch (action) {
    case "star":
      ids.add(GMAIL_LABEL_STARRED);
      break;
    case "unstar":
      ids.delete(GMAIL_LABEL_STARRED);
      break;
    case "mark_read":
      ids.delete(GMAIL_LABEL_UNREAD);
      break;
    case "mark_unread":
      ids.add(GMAIL_LABEL_UNREAD);
      break;
    default:
      break;
  }
  return [...ids];
}

function patchThreadGmailLabels(
  data: InboxLatestProjectionCache | undefined,
  threadId: string,
  gmailLabelIds: string[] | null,
): InboxLatestProjectionCache | undefined {
  if (!data) return data;
  return {
    ...data,
    threads: data.threads.map((t) => (t.id === threadId ? { ...t, gmailLabelIds } : t)),
  };
}

/**
 * Optimistic star/read/unread: patches inbox projection, reconciles with Gmail response, rolls back on failure.
 * On success, invalidates thread messages only so metadata-backed views can reconcile without full inbox refetch.
 */
export async function optimisticGmailInboxModify(
  queryClient: QueryClient,
  args: {
    photographerId: string;
    threadId: string;
    connectedAccountId: string;
    providerMessageId: string;
    action: GmailInboxModifyAction;
  },
): Promise<GmailInboxModifyResult> {
  const prefix = inboxLatestProjectionPrefix(args.photographerId);
  const previous = queryClient.getQueriesData<InboxLatestProjectionCache>(prefix);
  const snapshotPairs = previous.map(
    ([k, d]) => [k, cloneInboxData(d)] as const,
  );

  queryClient.setQueriesData<InboxLatestProjectionCache | undefined>(prefix, (old) =>
    patchThreadGmailLabels(
      old,
      args.threadId,
      applyGmailActionToLabelIds(
        old?.threads.find((t) => t.id === args.threadId)?.gmailLabelIds ?? null,
        args.action,
      ),
    ),
  );

  const result = await invokeGmailInboxModify({
    connectedAccountId: args.connectedAccountId,
    providerMessageId: args.providerMessageId,
    action: args.action,
  });

  if (result.ok) {
    queryClient.setQueriesData<InboxLatestProjectionCache | undefined>(prefix, (old) =>
      patchThreadGmailLabels(old, args.threadId, result.label_ids),
    );
    void queryClient.invalidateQueries({ queryKey: ["inbox", "thread-messages", args.threadId] });
    return result;
  }

  for (const [key, snap] of snapshotPairs) {
    queryClient.setQueryData(key, snap);
  }
  if (snapshotPairs.length === 0) {
    void queryClient.refetchQueries(prefix);
  }
  return result;
}

export async function optimisticLinkThreadToWedding(
  queryClient: QueryClient,
  args: { photographerId: string; threadId: string; weddingId: string },
): Promise<LinkThreadToWeddingResult> {
  const prefix = inboxLatestProjectionPrefix(args.photographerId);
  const previous = queryClient.getQueriesData<InboxLatestProjectionCache>(prefix);
  const snapshotPairs = previous.map(([k, d]) => [k, cloneInboxData(d)] as const);

  queryClient.setQueriesData<InboxLatestProjectionCache | undefined>(prefix, (prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      threads: prev.threads.map((t) =>
        t.id === args.threadId ? { ...t, weddingId: args.weddingId, ai_routing_metadata: null } : t,
      ),
    };
  });

  const result = await linkInboxThreadToWedding({ threadId: args.threadId, weddingId: args.weddingId });

  if (!result.ok) {
    for (const [key, snap] of snapshotPairs) {
      queryClient.setQueryData(key, snap);
    }
    if (snapshotPairs.length === 0) void queryClient.refetchQueries(prefix);
    return result;
  }

  return result;
}

export async function optimisticDeleteInboxThread(
  queryClient: QueryClient,
  args: { photographerId: string; threadId: string },
): Promise<DeleteInboxThreadResult> {
  const prefix = inboxLatestProjectionPrefix(args.photographerId);
  const previous = queryClient.getQueriesData<InboxLatestProjectionCache>(prefix);
  const snapshotPairs = previous.map(([k, d]) => [k, cloneInboxData(d)] as const);

  queryClient.setQueriesData<InboxLatestProjectionCache | undefined>(prefix, (prev) => {
    if (!prev) return prev;
    return { ...prev, threads: prev.threads.filter((t) => t.id !== args.threadId) };
  });

  const result = await deleteInboxThread(args.threadId);

  if (!result.ok) {
    for (const [key, snap] of snapshotPairs) {
      queryClient.setQueryData(key, snap);
    }
    if (snapshotPairs.length === 0) void queryClient.refetchQueries(prefix);
    return result;
  }

  return result;
}

export async function optimisticConvertUnfiledThreadToInquiry(
  queryClient: QueryClient,
  args: {
    photographerId: string;
    threadId: string;
    coupleNames?: string;
    leadClientName?: string;
  },
): Promise<ConvertUnfiledThreadToInquiryResult> {
  const prefix = inboxLatestProjectionPrefix(args.photographerId);
  const previous = queryClient.getQueriesData<InboxLatestProjectionCache>(prefix);
  const snapshotPairs = previous.map(([k, d]) => [k, cloneInboxData(d)] as const);

  const result = await convertUnfiledThreadToInquiry({
    threadId: args.threadId,
    coupleNames: args.coupleNames,
    leadClientName: args.leadClientName,
  });

  if (!result.ok) {
    for (const [key, snap] of snapshotPairs) {
      queryClient.setQueryData(key, snap);
    }
    return result;
  }

  queryClient.setQueriesData<InboxLatestProjectionCache | undefined>(prefix, (old) => {
    if (!old) return old;
    return {
      ...old,
      threads: old.threads.map((t) =>
        t.id === args.threadId ? { ...t, weddingId: result.weddingId, ai_routing_metadata: null } : t,
      ),
    };
  });

  void queryClient.invalidateQueries({ queryKey: ["weddings", "by-photographer", args.photographerId] });
  void queryClient.invalidateQueries({ queryKey: ["inbox", "active-weddings", args.photographerId] });

  return result;
}
