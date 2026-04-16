/**
 * Fetch raw attachment bytes from Gmail `users.messages.attachments.get`.
 */
import { fetchWithTimeout } from "../http/fetchWithTimeout.ts";
import { decodeBase64UrlToBytes } from "./gmailBase64.ts";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const GMAIL_HTTP_TIMEOUT_MS = 45_000;

export async function fetchGmailAttachmentBytes(
  accessToken: string,
  gmailMessageId: string,
  attachmentId: string,
): Promise<Uint8Array> {
  const u =
    `${GMAIL_BASE}/messages/${encodeURIComponent(gmailMessageId)}/attachments/${encodeURIComponent(attachmentId)}`;
  const res = await fetchWithTimeout(u, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs: GMAIL_HTTP_TIMEOUT_MS,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gmail attachments.get failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: string; size?: number };
  if (!json.data) {
    throw new Error("Gmail attachments.get: missing data");
  }
  return decodeBase64UrlToBytes(json.data);
}
