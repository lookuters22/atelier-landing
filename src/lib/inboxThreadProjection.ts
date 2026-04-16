import type { ChatAttachmentRow } from "../components/chat/ConversationFeed";
import type { AiRoutingMeta, UnfiledThread } from "../hooks/useUnfiledInbox";
import {
  parseGmailImportBodyHtmlSanitized,
  parseGmailImportRenderHtmlRef,
} from "./gmailImportMessageMetadata";
import { isGmailImportedLatestMessage, parseGmailLabelIdsFromLatestMetadata } from "./gmailInboxLabels";

/** Maps a row from `v_threads_inbox_latest_message` to `UnfiledThread` (G4 server-side latest message). */
export function mapInboxLatestProjectionRow(row: Record<string, unknown>): UnfiledThread {
  const meta = row.ai_routing_metadata as AiRoutingMeta | null;
  const fullBody = typeof row.latest_body === "string" ? row.latest_body : "";
  const latestMeta = row.latest_message_metadata;
  const htmlSanitized = parseGmailImportBodyHtmlSanitized(latestMeta);
  const gmailRenderHtmlRef = parseGmailImportRenderHtmlRef(latestMeta);
  const rawAtt = row.latest_attachments_json;
  const attachmentRows: ChatAttachmentRow[] = Array.isArray(rawAtt)
    ? rawAtt.map((a) => {
        const o = a as Record<string, unknown>;
        return {
          id: String(o.id ?? ""),
          source_url: String(o.source_url ?? ""),
          storage_path: o.storage_path != null ? String(o.storage_path) : null,
          mime_type: o.mime_type != null ? String(o.mime_type) : null,
          metadata:
            o.metadata && typeof o.metadata === "object" && o.metadata !== null
              ? (o.metadata as Record<string, unknown>)
              : null,
        };
      })
    : [];
  return {
    id: row.id as string,
    title: row.title as string,
    weddingId: row.wedding_id != null ? String(row.wedding_id) : null,
    last_activity_at: row.last_activity_at as string,
    ai_routing_metadata: meta,
    snippet: fullBody ? fullBody.slice(0, 160) : "",
    latestMessageBody: fullBody,
    latestMessageHtmlSanitized: htmlSanitized,
    gmailRenderHtmlRef,
    latestMessageId: row.latest_message_id != null ? String(row.latest_message_id) : null,
    latestMessageAttachments: attachmentRows,
    sender: row.latest_sender != null ? String(row.latest_sender) : "",
    latestProviderMessageId:
      row.latest_provider_message_id != null ? String(row.latest_provider_message_id) : null,
    hasGmailImport: isGmailImportedLatestMessage(latestMeta),
    gmailLabelIds: parseGmailLabelIdsFromLatestMetadata(latestMeta),
  };
}
