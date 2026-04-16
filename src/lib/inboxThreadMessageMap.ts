import type { ChatAttachmentRow } from "../components/chat/ConversationFeed";

/** Map PostgREST nested `message_attachments` rows to ConversationFeed chips. */
export function mapInboxMessageAttachmentRows(raw: unknown): ChatAttachmentRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => {
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
  });
}

export function formatInboxMessageTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
