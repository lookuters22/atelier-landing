/**
 * Full canonical `messages` history for Inbox thread detail (not list `latest*` projection only).
 */
/* eslint-disable react-hooks/set-state-in-effect -- html cache resets mirror prior fetch+hydration split */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ChatAttachmentRow, ChatMessage } from "../components/chat/ConversationFeed";
import { formatInboxMessageTime, mapInboxMessageAttachmentRows } from "../lib/inboxThreadMessageMap";
import { supabase } from "../lib/supabase";
import {
  fetchGmailImportHtmlForDisplay,
  parseGmailImportBodyHtmlSanitized,
  parseGmailImportRenderHtmlRef,
} from "../lib/gmailImportMessageMetadata";
import { tryExtractRenderableHtmlFromMessageRawPayload } from "../lib/gmailRenderPayload";

type MessageRow = {
  id: string;
  body: string;
  sender: string;
  direction: "in" | "out";
  sent_at: string;
  metadata: unknown;
  raw_payload: unknown | null;
  provider_message_id: string | null;
  message_attachments: ChatAttachmentRow[] | null;
};

export function inboxThreadMessagesQueryKey(threadId: string) {
  return ["inbox", "thread-messages", threadId] as const;
}

export async function fetchThreadMessagesForInbox(threadId: string): Promise<MessageRow[]> {
  const { data, error: qErr } = await supabase
    .from("messages")
    .select(
      "id, body, sender, direction, sent_at, metadata, raw_payload, provider_message_id, message_attachments ( id, source_url, storage_path, mime_type, metadata )",
    )
    .eq("thread_id", threadId)
    .order("sent_at", { ascending: true });

  if (qErr) {
    throw new Error(qErr.message);
  }
  return (data ?? []) as MessageRow[];
}

export function useThreadMessagesForInbox(threadId: string | null) {
  const [htmlByMessageId, setHtmlByMessageId] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: threadId ? inboxThreadMessagesQueryKey(threadId) : ["inbox", "thread-messages", "none"],
    queryFn: () => fetchThreadMessagesForInbox(threadId!),
    enabled: Boolean(threadId),
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);

  /** One decode per message per rows snapshot — same values used for display + storage-fetch skip. */
  const htmlFromRenderPayloadByMessageId = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const r of rows) {
      m[r.id] = tryExtractRenderableHtmlFromMessageRawPayload(r.raw_payload);
    }
    return m;
  }, [rows]);

  useEffect(() => {
    setHtmlByMessageId({});
    if (rows.length === 0) return;
    let cancelled = false;

    void (async () => {
      for (const r of rows) {
        if (cancelled) return;
        if (htmlFromRenderPayloadByMessageId[r.id]) continue;
        const inline = parseGmailImportBodyHtmlSanitized(r.metadata);
        if (inline) continue;
        const ref = parseGmailImportRenderHtmlRef(r.metadata);
        if (!ref) continue;
        const html = await fetchGmailImportHtmlForDisplay(supabase, ref);
        if (cancelled) return;
        if (html) {
          setHtmlByMessageId((prev) => (prev[r.id] ? prev : { ...prev, [r.id]: html }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rows, htmlFromRenderPayloadByMessageId]);

  const chatMessages: ChatMessage[] = useMemo(() => {
    return rows.map((r) => {
      const fromRenderPayload = htmlFromRenderPayloadByMessageId[r.id] ?? null;
      const inlineHtml = parseGmailImportBodyHtmlSanitized(r.metadata);
      const lazyHtml = htmlByMessageId[r.id];
      const bodyHtmlSanitized = fromRenderPayload ?? inlineHtml ?? lazyHtml ?? null;
      return {
        id: r.id,
        direction: r.direction,
        sender: r.sender || "Unknown",
        body: (r.body ?? "").trim() || "—",
        bodyHtmlSanitized,
        attachments: mapInboxMessageAttachmentRows(r.message_attachments),
        time: formatInboxMessageTime(r.sent_at),
      };
    });
  }, [rows, htmlByMessageId, htmlFromRenderPayloadByMessageId]);

  let latestProviderMessageId: string | null = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const pid = rows[i]?.provider_message_id;
    if (typeof pid === "string" && pid.trim().length > 0) {
      latestProviderMessageId = pid.trim();
      break;
    }
  }

  const loading = Boolean(threadId && q.isLoading);
  const error = q.error ? q.error.message : null;

  return { chatMessages, latestProviderMessageId, loading, error, refetch: q.refetch };
}
