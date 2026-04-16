/** Gmail label ids persisted on `messages.metadata.gmail_import.gmail_label_ids` after modify / future imports. */
export function parseGmailLabelIdsFromLatestMetadata(metadata: unknown): string[] | null {
  if (!metadata || typeof metadata !== "object") return null;
  const gi = (metadata as Record<string, unknown>).gmail_import;
  if (!gi || typeof gi !== "object") return null;
  const ids = (gi as Record<string, unknown>).gmail_label_ids;
  if (!Array.isArray(ids)) return null;
  const out = ids.filter((x): x is string => typeof x === "string");
  return out.length > 0 ? out : [];
}

export function isGmailImportedLatestMessage(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  return !!(metadata as Record<string, unknown>).gmail_import;
}

/** Gmail system label ids used with `messages.modify` / cached `gmail_label_ids`. */
export const GMAIL_LABEL_STARRED = "STARRED";
export const GMAIL_LABEL_SENT = "SENT";
export const GMAIL_LABEL_DRAFT = "DRAFT";
export const GMAIL_LABEL_UNREAD = "UNREAD";

export function deriveStarredFromGmailLabelIds(labelIds: string[] | null): boolean | null {
  if (labelIds === null) return null;
  return labelIds.includes(GMAIL_LABEL_STARRED);
}

export function deriveUnreadFromGmailLabelIds(labelIds: string[] | null): boolean | null {
  if (labelIds === null) return null;
  return labelIds.includes(GMAIL_LABEL_UNREAD);
}
