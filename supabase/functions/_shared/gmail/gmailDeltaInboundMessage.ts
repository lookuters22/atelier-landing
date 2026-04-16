/**
 * Parse Gmail `users.messages.get?format=full` for delta inbound inserts + outbound skip (SENT).
 */
import { preferredCanonicalBody, type GmailPayloadPart } from "./gmailMessageBody.ts";
import { walkGmailPayloadForMaterialization } from "./gmailMimeAttachments.ts";
import type { GmailFullThreadMessage } from "./gmailThreads.ts";
import { buildGmailRoutingSignalsFromMessage } from "./gmailRoutingSignals.ts";
import { GMAIL_SENT_LABEL_ID } from "./gmailWatchHistory.ts";

function headerFromPayload(
  headers: { name?: string; value?: string }[] | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const h = headers.find((x) => (x.name ?? "").toLowerCase() === name.toLowerCase());
  return typeof h?.value === "string" ? h.value : null;
}

/** Gmail `internalDate` → ISO string for thread activity and message `sent_at`. */
export function sentAtIsoFromGmailMessage(msg: GmailFullThreadMessage): string {
  const internalMs = msg.internalDate ? Number(msg.internalDate) : NaN;
  return Number.isFinite(internalMs)
    ? new Date(internalMs).toISOString()
    : new Date().toISOString();
}

/** Subject header only (for `import_candidates.subject`); null if absent. */
export function emailSubjectFromGmailMessage(msg: GmailFullThreadMessage): string | null {
  const headers = msg.payload?.headers;
  const subj = headerFromPayload(headers, "Subject")?.trim() ?? "";
  return subj.length > 0 ? subj.slice(0, 500) : null;
}

/**
 * Canonical thread title: real Subject, else snippet, else a minimal placeholder.
 * (Avoid vague defaults like "New Email" — operators need readable thread rows.)
 */
export function threadTitleFromGmailMessage(msg: GmailFullThreadMessage): string {
  const subj = emailSubjectFromGmailMessage(msg);
  if (subj) return subj;
  const snip = typeof msg.snippet === "string" ? msg.snippet.trim() : "";
  if (snip.length > 0) return snip.slice(0, 500);
  return "(no subject)";
}

export function gmailMessageHasSentLabel(msg: GmailFullThreadMessage): boolean {
  const ids = msg.labelIds;
  if (!Array.isArray(ids)) return false;
  return ids.includes(GMAIL_SENT_LABEL_ID);
}

export type InboundFieldsFromGmailMessage = {
  body: string;
  sender: string;
  metadata: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
  sentAtIso: string;
};

function fallbackBody(snippet: string | undefined): string {
  const s = typeof snippet === "string" ? snippet.trim() : "";
  return s.length > 0 ? s : "[Gmail] (no body text)";
}

/**
 * Build DB row fields for an inbound `messages` insert from a full Gmail message.
 */
export function extractInboundFieldsFromGmailMessage(
  msg: GmailFullThreadMessage,
  gmailThreadId: string,
): InboundFieldsFromGmailMessage {
  const headers = msg.payload?.headers;
  const from = headerFromPayload(headers, "From") ?? "unknown";

  const sentAtIso = sentAtIsoFromGmailMessage(msg);

  const payload = msg.payload as GmailPayloadPart | undefined;
  const walked = walkGmailPayloadForMaterialization(payload);
  const canonical = preferredCanonicalBody(walked.plain, walked.html);
  const body = canonical.length > 0 ? canonical : fallbackBody(msg.snippet);

  const routing_signals = buildGmailRoutingSignalsFromMessage(msg);

  const metadata: Record<string, unknown> = {
    gmail_import: {
      gmail_message_id: msg.id,
      gmail_thread_id: gmailThreadId,
      outbound: false,
      delta_sync: true,
      gmail_label_ids: Array.isArray(msg.labelIds) ? msg.labelIds : [],
      routing_signals,
    },
  };

  const raw_payload: Record<string, unknown> = {
    gmail_message_id: msg.id,
    gmail_thread_id: gmailThreadId,
    snippet: msg.snippet ?? null,
  };

  return {
    body: body.slice(0, 500_000),
    sender: from.slice(0, 500),
    metadata,
    raw_payload,
    sentAtIso,
  };
}
