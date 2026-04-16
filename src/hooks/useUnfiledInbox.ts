/* Inbox bootstrap: batched reads via TanStack Query + URL/event invalidation. */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatAttachmentRow } from "../components/chat/ConversationFeed";
import { supabase } from "../lib/supabase";
import { fireDataChanged } from "../lib/events";
import { useAuth } from "../context/AuthContext";
import type { GmailImportRenderHtmlRefV1 } from "../lib/gmailImportMessageMetadata";
import {
  INBOX_LATEST_MESSAGE_SELECT_FULL,
  INBOX_LATEST_MESSAGE_SELECT_LEGACY,
  isMissingLatestProviderMessageIdPostgresError,
} from "../lib/inboxLatestViewSelect";
import { mapInboxLatestProjectionRow } from "../lib/inboxThreadProjection";
import type { GmailInboxModifyAction, GmailInboxModifyResult } from "../lib/gmailInboxModify";
import {
  optimisticConvertUnfiledThreadToInquiry,
  optimisticDeleteInboxThread,
  optimisticGmailInboxModify,
  optimisticLinkThreadToWedding,
} from "../lib/inboxOptimisticCache";
import type { ConvertUnfiledThreadToInquiryResult } from "../lib/inboxThreadLinking";
import { INBOX_SEARCH_QUERY_PARAM } from "../lib/inboxUrlInboxParams";
import { sanitizeInboxSearchForIlike } from "../lib/inboxSearchSanitize";

export type AiRoutingMeta = {
  suggested_wedding_id: string | null;
  confidence_score: number;
  reasoning: string;
  classified_intent: string;
};

export type UnfiledThread = {
  id: string;
  title: string;
  /** Inbox now shows all threads; `null` means still unfiled. */
  weddingId: string | null;
  last_activity_at: string;
  ai_routing_metadata: AiRoutingMeta | null;
  /** Short preview for list rows (first ~160 chars of latest message). */
  snippet: string;
  /** Full latest `messages.body` for thread detail / conversation pane (not list-truncated). */
  latestMessageBody: string;
  /** Sanitized HTML from Gmail import metadata when present. */
  latestMessageHtmlSanitized: string | null;
  /** G3: when HTML is in Storage, fetch via `fetchGmailImportHtmlForDisplay` if `latestMessageHtmlSanitized` is null. */
  gmailRenderHtmlRef: GmailImportRenderHtmlRefV1 | null;
  /** Latest canonical message id (for attachment joins). */
  latestMessageId: string | null;
  /** `message_attachments` for the latest message (e.g. Gmail import). */
  latestMessageAttachments: ChatAttachmentRow[];
  sender: string;
  /** Gmail `messages.get` id on latest message when materialized from Gmail. */
  latestProviderMessageId: string | null;
  /** Latest message has `metadata.gmail_import` (Gmail materialization). */
  hasGmailImport: boolean;
  /** `metadata.gmail_import.gmail_label_ids` when known (after Gmail modify or future import). */
  gmailLabelIds: string[] | null;
};

export type ActiveWedding = {
  id: string;
  couple_names: string;
};

export type InboxLatestProjectionQueryData = {
  threads: UnfiledThread[];
  providerMessageIdColumnUnavailable: boolean;
};

/**
 * When `listSearchQuery` is non-empty after sanitize, the fetch uses DB `ilike` OR on title / sender / body.
 * Empty string → same key as legacy (no third segment) for cache continuity.
 */
export function inboxLatestProjectionQueryKey(photographerId: string, listSearchQuery?: string) {
  const q = sanitizeInboxSearchForIlike(listSearchQuery ?? "");
  if (!q) return ["inbox", "latest-projection", photographerId] as const;
  return ["inbox", "latest-projection", photographerId, { q }] as const;
}

export function inboxActiveWeddingsQueryKey(photographerId: string) {
  return ["inbox", "active-weddings", photographerId] as const;
}

function inboxLatestProjectionBaseQuery(
  photographerId: string,
  selectColumns: string,
  sanitizedQ: string,
) {
  let q = supabase
    .from("v_threads_inbox_latest_message")
    .select(selectColumns)
    .eq("photographer_id", photographerId)
    .neq("kind", "other");
  if (sanitizedQ) {
    const pat = `%${sanitizedQ}%`;
    q = q.or(`title.ilike.${pat},latest_sender.ilike.${pat},latest_body.ilike.${pat}`);
  }
  return q.order("last_activity_at", { ascending: false }).limit(200);
}

async function fetchInboxLatestProjection(
  photographerId: string,
  listSearchQuery?: string,
): Promise<InboxLatestProjectionQueryData> {
  const sanitizedQ = sanitizeInboxSearchForIlike(listSearchQuery ?? "");
  let providerMessageIdColumnUnavailable = false;
  let r1 = await inboxLatestProjectionBaseQuery(
    photographerId,
    INBOX_LATEST_MESSAGE_SELECT_FULL,
    sanitizedQ,
  );

  if (r1.error && isMissingLatestProviderMessageIdPostgresError(r1.error)) {
    if (import.meta.env.DEV) {
      console.debug(
        "[Inbox] v_threads_inbox_latest_message missing latest_provider_message_id — retrying without column (apply migration 20260415120100_v_threads_inbox_latest_provider_message_id.sql)",
      );
    }
    providerMessageIdColumnUnavailable = true;
    r1 = await inboxLatestProjectionBaseQuery(photographerId, INBOX_LATEST_MESSAGE_SELECT_LEGACY, sanitizedQ);
  }

  if (r1.error) {
    console.error("useUnfiledInbox v_threads_inbox_latest_message:", r1.error.message, r1.error);
    throw new Error(
      `Inbox view (v_threads_inbox_latest_message): ${r1.error.message}${r1.error.code ? ` [${r1.error.code}]` : ""}`,
    );
  }

  const threads: UnfiledThread[] = (r1.data ?? []).map((row: Record<string, unknown>) =>
    mapInboxLatestProjectionRow(row),
  );

  return { threads, providerMessageIdColumnUnavailable };
}

async function fetchInboxActiveWeddings(photographerId: string): Promise<ActiveWedding[]> {
  const r2 = await supabase
    .from("weddings")
    .select("id, couple_names")
    .eq("photographer_id", photographerId)
    .neq("stage", "archived")
    .order("couple_names", { ascending: true })
    .limit(400);

  if (r2.error) {
    console.error("useUnfiledInbox weddings:", r2.error.message, r2.error);
    throw new Error(`Weddings: ${r2.error.message}${r2.error.code ? ` [${r2.error.code}]` : ""}`);
  }

  return (r2.data ?? []).map((w: Record<string, unknown>) => ({
    id: w.id as string,
    couple_names: w.couple_names as string,
  }));
}

export function useUnfiledInbox() {
  const { photographerId } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const listSearchQueryFromUrl = searchParams.get(INBOX_SEARCH_QUERY_PARAM) ?? "";

  const inboxQuery = useQuery({
    queryKey: photographerId
      ? inboxLatestProjectionQueryKey(photographerId, listSearchQueryFromUrl)
      : ["inbox", "latest-projection", "none"],
    queryFn: () => fetchInboxLatestProjection(photographerId!, listSearchQueryFromUrl),
    enabled: Boolean(photographerId),
  });

  const activeWeddingsQuery = useQuery({
    queryKey: photographerId ? inboxActiveWeddingsQueryKey(photographerId) : ["inbox", "active-weddings", "none"],
    queryFn: () => fetchInboxActiveWeddings(photographerId!),
    enabled: Boolean(photographerId),
  });

  const inboxThreads = useMemo(
    () => inboxQuery.data?.threads ?? [],
    [inboxQuery.data?.threads],
  );

  const unfiledThreads = useMemo(() => inboxThreads.filter((t) => t.weddingId === null), [inboxThreads]);

  const activeWeddings = useMemo(
    () => activeWeddingsQuery.data ?? [],
    [activeWeddingsQuery.data],
  );

  const isLoading = Boolean(
    photographerId && (inboxQuery.isLoading || activeWeddingsQuery.isLoading),
  );

  const loadError = useMemo(() => {
    const parts: string[] = [];
    if (inboxQuery.error) parts.push(inboxQuery.error.message);
    if (activeWeddingsQuery.error) parts.push(activeWeddingsQuery.error.message);
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [inboxQuery.error, activeWeddingsQuery.error]);

  const providerMessageIdColumnUnavailable = inboxQuery.data?.providerMessageIdColumnUnavailable ?? false;

  const refetch = useCallback(async () => {
    if (!photographerId) return;
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ["inbox", "latest-projection", photographerId] }),
      queryClient.refetchQueries({ queryKey: inboxActiveWeddingsQueryKey(photographerId) }),
    ]);
  }, [photographerId, queryClient]);

  const gmailInboxModify = useCallback(
    async (
      threadId: string,
      action: GmailInboxModifyAction,
      connectedAccountId: string | null,
      providerMessageId: string | null,
    ): Promise<GmailInboxModifyResult> => {
      if (!photographerId || !connectedAccountId || !providerMessageId?.trim()) {
        return { ok: false, error: "Gmail sync is not available for this thread." };
      }
      return optimisticGmailInboxModify(queryClient, {
        photographerId,
        threadId,
        connectedAccountId,
        providerMessageId: providerMessageId.trim(),
        action,
      });
    },
    [photographerId, queryClient],
  );

  async function linkThread(threadId: string, weddingId: string) {
    if (!photographerId) return;
    const result = await optimisticLinkThreadToWedding(queryClient, {
      photographerId,
      threadId,
      weddingId,
    });

    if (!result.ok) {
      console.error("linkThread error:", result.error);
      return;
    }

    fireDataChanged("inbox");
    fireDataChanged("weddings");
  }

  async function deleteThread(threadId: string) {
    if (!photographerId) return;
    const result = await optimisticDeleteInboxThread(queryClient, { photographerId, threadId });

    if (!result.ok) {
      console.error("deleteThread error:", result.error);
      return;
    }

    fireDataChanged("inbox");
  }

  const convertThreadToInquiry = useCallback(
    async (
      threadId: string,
      names?: { coupleNames: string; leadClientName: string },
    ): Promise<ConvertUnfiledThreadToInquiryResult> => {
      if (!photographerId) {
        return { ok: false, error: "Not signed in" };
      }
      const result = await optimisticConvertUnfiledThreadToInquiry(queryClient, {
        photographerId,
        threadId,
        coupleNames: names?.coupleNames,
        leadClientName: names?.leadClientName,
      });
      if (!result.ok) return result;
      fireDataChanged("inbox");
      fireDataChanged("weddings");
      return result;
    },
    [photographerId, queryClient],
  );

  return {
    inboxThreads,
    unfiledThreads,
    activeWeddings,
    isLoading,
    loadError,
    providerMessageIdColumnUnavailable,
    linkThread,
    deleteThread,
    gmailInboxModify,
    convertThreadToInquiry,
    refetch,
  };
}
